
/**
 * MyStudySpace - Automatic No-Show Release
 *
 * Description:
 * Finds confirmed reservations that have passed
 * the 10-minute check-in window without a check-in.
 *
 * The reservation is marked as a no-show.
 *
 * Endpoint: /api/cron/release-no-shows
 */

const pool = require("../../lib/db");

const NO_SHOW_MINUTES = 10;

function sendResponse(res, status, data) {
  return res.status(status).json(data);
}

module.exports = async function handler(req, res) {

  // 1. Allow scheduled GET requests and POST requests.
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");

    return sendResponse(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  }

  // 2. Protect the scheduled endpoint.
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;

  if (!cronSecret) {
    return sendResponse(res, 500, {
      success: false,
      message: "Cron security is not configured."
    });
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return sendResponse(res, 401, {
      success: false,
      message: "Unauthorized."
    });
  }

  let connection;
  let releasedCount = 0;
  const releasedReservations = [];

  try {
    // 3. Get a connection from MySQL.
    connection = await pool.getConnection();

    // 4. Find reservations whose 10-minute window expired.
    const [reservations] = await connection.query(
      `SELECT reservation_id
       FROM reservations
       WHERE status = 'confirmed'
         AND start_time < DATE_SUB(
           NOW(),
           INTERVAL ? MINUTE
         )`,
      [NO_SHOW_MINUTES]
    );

    // 5. Process each potentially missed reservation.
    for (const item of reservations) {

      await connection.beginTransaction();

      try {
        // Lock the reservation before updating it.
        const [rows] = await connection.query(
          `SELECT reservation_id, status, start_time
           FROM reservations
           WHERE reservation_id = ?
           FOR UPDATE`,
          [item.reservation_id]
        );

        const reservation = rows[0];

        // Confirm it is still eligible.
        if (
          !reservation ||
          reservation.status !== "confirmed"
        ) {
          await connection.rollback();
          continue;
        }

        // Recheck the deadline using database time.
        const [deadlineRows] = await connection.query(
          `SELECT
             start_time < DATE_SUB(
               NOW(),
               INTERVAL ? MINUTE
             ) AS expired
           FROM reservations
           WHERE reservation_id = ?`,
          [NO_SHOW_MINUTES, item.reservation_id]
        );

        if (!deadlineRows[0]?.expired) {
          await connection.rollback();
          continue;
        }

        // Check whether the student checked in.
        const [checkIns] = await connection.query(
          `SELECT check_in_id
           FROM check_ins
           WHERE reservation_id = ?
           LIMIT 1`,
          [item.reservation_id]
        );

        if (checkIns.length > 0) {
          await connection.rollback();
          continue;
        }

        // Mark the reservation as a no-show.
        await connection.query(
          `UPDATE reservations
           SET status = 'no_show'
           WHERE reservation_id = ?
             AND status = 'confirmed'`,
          [item.reservation_id]
        );

        await connection.commit();

        releasedCount++;

        releasedReservations.push(item.reservation_id);

      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    // 6. Return the results.
    return sendResponse(res, 200, {
      success: true,
      message: "No-show reservations processed.",
      released_count: releasedCount,
      reservation_ids: releasedReservations
    });

  } catch (error) {
    console.error("No-show release failed:", error.code);

    return sendResponse(res, 500, {
      success: false,
      message: "Unable to process no-show reservations."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
};
