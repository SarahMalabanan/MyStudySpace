
/**
 * MyStudySpace - Reservation Check-In API
 *
 * User Story: US-08 - Check In to a Reservation
 * Sprint: 1
 *
 * Endpoint: POST /api/reservations/checkin
 *
 * Description:
 * Allows an authenticated student to check in to an
 * existing study room reservation.
 *
 * Responsibilities:
 * 1. Accept POST requests only.
 * 2. Verify authenticated student identity.
 * 3. Validate the reservation ID.
 * 4. Verify reservation ownership and status.
 * 5. Enforce the configured check-in time window.
 * 6. Prevent duplicate check-ins.
 * 7. Save successful check-ins to MySQL.
 * 8. Return appropriate success or error responses.
 *
 * Authentication:
 * Requires req.user.user_id to be established by
 * trusted authentication middleware.
 *
 * Database:
 * Uses the shared MySQL connection from lib/db.js.
 */

const pool = require("../../lib/db");
const { validateCheckIn } = require("../../lib/checkInRules");

/**
 * Sends a standardized JSON response.
 *
 * @param {Object} res - HTTP response object.
 * @param {number} status - HTTP status code.
 * @param {Object} data - Response data.
 */
function sendResponse(res, status, data) {
  return res.status(status).json(data);
}

/**
 * Retrieves the authenticated student's ID.
 *
 * The ID must come from verified server-side
 * authentication, never from the request body.
 *
 * @param {Object} req - HTTP request object.
 * @returns {number|null} Authenticated user ID.
 */
function getAuthenticatedUserId(req) {
  const userId = req.user?.user_id;

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

/**
 * Reads the configured check-in window.
 *
 * @returns {number|null} Valid number of minutes.
 */
function getCheckInMinutes() {
  const rawValue = process.env.CHECK_IN_MINUTES;

  if (
    typeof rawValue !== "string" ||
    !/^[1-9]\d*$/.test(rawValue)
  ) {
    return null;
  }

  const minutes = Number(rawValue);

  return Number.isSafeInteger(minutes) ? minutes : null;
}

/**
 * Processes a reservation check-in request.
 *
 * Uses a MySQL transaction and row-level locking
 * to protect the reservation during check-in.
 *
 * @param {Object} req - HTTP request object.
 * @param {Object} res - HTTP response object.
 */
module.exports = async function handler(req, res) {

  // STEP 1: Allow POST requests only.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendResponse(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  }

  // STEP 2: Verify the authenticated student.
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendResponse(res, 401, {
      success: false,
      message: "Authentication required."
    });
  }

  // STEP 3: Validate the submitted reservation ID.
  const reservationId = req.body?.reservation_id;

  if (
    !Number.isSafeInteger(reservationId) ||
    reservationId <= 0
  ) {
    return sendResponse(res, 400, {
      success: false,
      message: "A valid reservation ID is required."
    });
  }

  // STEP 4: Validate check-in configuration.
  const checkInMinutes = getCheckInMinutes();

  if (checkInMinutes === null) {
    console.error("Invalid CHECK_IN_MINUTES configuration.");

    return sendResponse(res, 500, {
      success: false,
      message: "Check-in is temporarily unavailable."
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    // STEP 5: Obtain a database connection.
    connection = await pool.getConnection();

    // Start a transaction.
    await connection.beginTransaction();
    transactionStarted = true;

    // STEP 6: Lock and retrieve the reservation.
    const [reservations] = await connection.query(
      `SELECT
         reservation_id,
         user_id,
         status,
         start_time
       FROM reservations
       WHERE reservation_id = ?
       FOR UPDATE`,
      [reservationId]
    );

    const reservation = reservations[0];

    // STEP 7: Validate reservation eligibility.
    const validation = validateCheckIn(
      reservation,
      userId,
      new Date(),
      checkInMinutes
    );

    if (!validation.valid) {
      await connection.rollback();
      transactionStarted = false;

      return sendResponse(res, 400, {
        success: false,
        message: validation.message
      });
    }

    // STEP 8: Check whether a check-in already exists.
    const [existingCheckIns] = await connection.query(
      `SELECT check_in_id
       FROM check_ins
       WHERE reservation_id = ?`,
      [reservationId]
    );

    if (existingCheckIns.length > 0) {
      await connection.rollback();
      transactionStarted = false;

      return sendResponse(res, 409, {
        success: false,
        message: "Reservation already checked in."
      });
    }

    // STEP 9: Insert the successful check-in.
    // NOW() uses the database session's current time.
    const [result] = await connection.query(
      `INSERT INTO check_ins
         (reservation_id, checked_in_at)
       VALUES (?, NOW())`,
      [reservationId]
    );

    // STEP 10: Commit the transaction.
    await connection.commit();
    transactionStarted = false;

    // STEP 11: Return successful check-in response.
    return sendResponse(res, 201, {
      success: true,
      message: "Successfully checked in.",
      check_in_id: result.insertId,
      reservation_id: reservationId
    });

  } catch (error) {

    // Roll back any unfinished transaction.
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Check-in rollback failed:",
          rollbackError.code
        );
      }
    }

    // Handle duplicate check-ins from the unique constraint.
    if (error.code === "ER_DUP_ENTRY") {
      return sendResponse(res, 409, {
        success: false,
        message: "Reservation already checked in."
      });
    }

    // Log technical errors on the server only.
    console.error(
      "Check-in operation failed:",
      error.code || error.message
    );

    // Do not expose internal database details to users.
    return sendResponse(res, 500, {
      success: false,
      message: "Unable to complete check-in."
    });

  } finally {

    // Return the connection to the MySQL pool.
    if (connection) {
      connection.release();
    }
  }
};
