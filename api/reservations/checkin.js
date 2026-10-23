
/**
 * MyStudySpace - Reservation Check-In API
 *
 * User Story: US-08 - Check In to a Reservation
 * Sprint: 1
 *
 * Description:
 * Handles check-in requests for existing study room
 * reservations and saves valid check-ins to MySQL.
 *
 * Endpoint: POST /api/reservations/checkin
 *
 * Request body:
 * {
 *   "reservation_id": 123
 * }
 *
 * Important:
 * Authentication must be connected before this endpoint
 * is enabled for real users.
 */

const pool = require("../../lib/db");
const { validateCheckIn } = require("../../lib/checkInRules");

/**
 * Sends a JSON response to the client.
 *
 * @param {Object} res - HTTP response object.
 * @param {number} status - HTTP status code.
 * @param {Object} data - Response payload.
 */
function sendResponse(res, status, data) {
  return res.status(status).json(data);
}

/**
 * Retrieves the authenticated user ID.
 *
 * This function intentionally does NOT accept a user ID
 * from the request body or query parameters.
 *
 * The authentication middleware must establish req.user
 * from a verified server-side session or token.
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
 * Handles a student's reservation check-in.
 *
 * Uses a database transaction and row locking to protect
 * the reservation while validating and recording check-in.
 *
 * @param {Object} req - HTTP request.
 * @param {Object} res - HTTP response.
 */
module.exports = async function handler(req, res) {
  // Only POST requests are allowed.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendResponse(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  }

  // Verify the authenticated user.
  const userId = getAuthenticatedUserId(req);

  if (!userId) {
    return sendResponse(res, 401, {
      success: false,
      message: "Authentication required."
    });
  }

  // Validate the reservation ID submitted by the UI.
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

  let connection;

  try {
    // Obtain a connection from the MySQL connection pool.
    connection = await pool.getConnection();

    // Begin a transaction.
    await connection.beginTransaction();

    // Lock the reservation row during validation.
    const [reservations] = await connection.query(
      `SELECT reservation_id, user_id, status, start_time
       FROM reservations
       WHERE reservation_id = ?
       FOR UPDATE`,
      [reservationId]
    );

    const reservation = reservations[0];

    // Check whether this reservation is eligible.
    const validation = validateCheckIn(
      reservation,
      userId,
      new Date(),
      Number(process.env.CHECK_IN_MINUTES)
    );

    if (!validation.valid) {
      await connection.rollback();

      return sendResponse(res, 400, {
        success: false,
        message: validation.message
      });
    }

    // Check whether the reservation was already checked in.
    const [existingCheckIns] = await connection.query(
      `SELECT check_in_id
       FROM check_ins
       WHERE reservation_id = ?`,
      [reservationId]
    );

    if (existingCheckIns.length > 0) {
      await connection.rollback();

      return sendResponse(res, 409, {
        success: false,
        message: "Reservation already checked in."
      });
    }

    // Save the check-in using the database server's time.
    const [result] = await connection.query(
      `INSERT INTO check_ins
         (reservation_id, checked_in_at)
       VALUES (?, NOW())`,
      [reservationId]
    );

    // Commit the successful check-in.
    await connection.commit();

    return sendResponse(res, 201, {
      success: true,
      message: "Successfully checked in.",
      check_in_id: result.insertId,
      reservation_id: reservationId
    });

  } catch (error) {
    // Undo unfinished changes if an error occurs.
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Check-in rollback failed.");
      }
    }

    console.error("Check-in operation failed:", error.code);

    return sendResponse(res, 500, {
      success: false,
      message: "Unable to complete check-in."
    });

  } finally {
    // Return the database connection to the pool.
    if (connection) {
      connection.release();
    }
  }
};
