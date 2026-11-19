
/**
 * MyStudySpace - Cancel Reservation API
 *
 * Description:
 * Allows an authenticated student to cancel
 * their own confirmed reservation.
 *
 * Endpoint: POST /api/reservations/cancel
 */

const pool = require("../../lib/db");

function sendResponse(res, status, data) {
  return res.status(status).json(data);
}

module.exports = async function handler(req, res) {

  // 1. Only allow POST requests.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendResponse(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  }

  // 2. Verify the logged-in user.
  const userId = req.user?.user_id;

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return sendResponse(res, 401, {
      success: false,
      message: "Authentication required."
    });
  }

  // 3. Validate reservation ID.
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
    // 4. Connect to MySQL.
    connection = await pool.getConnection();

    await connection.beginTransaction();

    // 5. Find and lock the reservation.
    const [rows] = await connection.query(
      `SELECT reservation_id, user_id, status
       FROM reservations
       WHERE reservation_id = ?
       FOR UPDATE`,
      [reservationId]
    );

    const reservation = rows[0];

    if (!reservation) {
      await connection.rollback();

      return sendResponse(res, 404, {
        success: false,
        message: "Reservation not found."
      });
    }

    // 6. Make sure the reservation belongs to this user.
    if (Number(reservation.user_id) !== userId) {
      await connection.rollback();

      return sendResponse(res, 403, {
        success: false,
        message: "You cannot cancel someone else's reservation."
      });
    }

    // 7. Only confirmed reservations can be cancelled.
    if (reservation.status !== "confirmed") {
      await connection.rollback();

      return sendResponse(res, 400, {
        success: false,
        message: "This reservation cannot be cancelled."
      });
    }

    // 8. Update reservation status.
    await connection.query(
      `UPDATE reservations
       SET status = 'cancelled'
       WHERE reservation_id = ?`,
      [reservationId]
    );

    await connection.commit();

    // 9. Return success.
    return sendResponse(res, 200, {
      success: true,
      message: "Reservation successfully cancelled.",
      reservation_id: reservationId,
      status: "cancelled"
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Cancellation rollback failed.");
      }
    }

    console.error("Reservation cancellation failed:", error.code);

    return sendResponse(res, 500, {
      success: false,
      message: "Unable to cancel reservation."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};
