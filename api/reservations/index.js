
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// MyStudySpace - Reservations API
//
// GET: Returns reservation history for the logged-in account.
// POST: Creates a reservation for the logged-in account.
//
// The API uses the existing MySQL tables and verifies the user's
// session before reading or creating account reservations.

// Read and verify the session cookie created during login.
function getUserId(req) {
  try {
    const cookie = (req.headers.cookie || '')
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith('mystudyspace_session='));

    if (!cookie || !process.env.SESSION_SECRET) {
      return null;
    }

    const token = decodeURIComponent(
      cookie.slice('mystudyspace_session='.length)
    );

    const session = jwt.verify(token, process.env.SESSION_SECRET, {
      algorithms: ['HS256']
    });

    const userId = Number(session.userId);

    return Number.isSafeInteger(userId) && userId > 0
      ? userId
      : null;

  } catch {
    return null;
  }
}

// Check that the submitted date exists on the calendar.
function validDate(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const checked = new Date(Date.UTC(year, month - 1, day));

  return checked.getUTCFullYear() === year &&
    checked.getUTCMonth() === month - 1 &&
    checked.getUTCDate() === day;
}

// Convert the reservation date and hour into MySQL DATETIME format.
function mysqlDateTime(date, hour) {
  return `${date} ${String(hour).padStart(2, '0')}:00:00`;
}

// Determine the weekday without relying on the server's local timezone.
function weekdayFor(date) {
  const [year, month, day] = date.split('-').map(Number);

  const weekday = new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();

  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ][weekday];
}

// Convert a MySQL TIME value into minutes after midnight.
function timeInMinutes(value) {
  if (value == null) return null;

  const parts = String(value).split(':');

  if (parts.length < 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (!Number.isInteger(hours) ||
      !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

// Return a consistent error response.
function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

// Main handler for account reservations.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');

    return sendError(res, 405, 'Method not allowed.');
  }

  // Never trust a user ID supplied by the browser.
  const userId = getUserId(req);

  if (!userId) {
    return sendError(
      res,
      401,
      'Please log in to access your reservations.'
    );
  }

  // GET: Retrieve only reservations belonging to this account.
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.query(
        `
        SELECT
          r.reservation_id,
          r.room_id,
          rm.name AS room_name,
          rm.room_code,
          rm.library,
          rm.floor,
          DATE_FORMAT(r.start_time, '%Y-%m-%d %H:%i:%s')
            AS start_time,
          DATE_FORMAT(r.end_time, '%Y-%m-%d %H:%i:%s')
            AS end_time,
          r.status,
          r.confirmation_code
        FROM reservations r
        INNER JOIN rooms rm
          ON r.room_id = rm.room_id
        WHERE r.user_id = ?
        ORDER BY r.start_time DESC
        `,
        [userId]
      );

      return res.status(200).json(rows);

    } catch (error) {
      console.error('Reservation history error:', error);

      return sendError(
        res,
        500,
        'Could not load reservation history.'
      );
    }
  }

  // POST: Validate and save a new account reservation.
  const { roomId, date, startHour, endHour } = req.body || {};

  const selectedRoomId = Number(roomId);
  const start = Number(startHour);
  const end = Number(endHour);

  // Validate submitted values before querying MySQL.
  if (
    !Number.isSafeInteger(selectedRoomId) ||
    selectedRoomId <= 0 ||
    !validDate(date) ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 8 ||
    end > 21 ||
    end <= start ||
    end - start > 2
  ) {
    return sendError(
      res,
      400,
      'Please select a valid room, date, and time.'
    );
  }

  const startTime = mysqlDateTime(date, start);
  const endTime = mysqlDateTime(date, end);
  const weekday = weekdayFor(date);

  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    // Lock the selected room while checking availability.
    // Other reservations using this same locking approach
    // must wait until the transaction finishes.
    const [roomRows] = await connection.query(
      `
      SELECT room_id, library, status
      FROM rooms
      WHERE room_id = ?
      FOR UPDATE
      `,
      [selectedRoomId]
    );

    if (!roomRows.length) {
      return sendError(res, 404, 'Room not found.');
    }

    const selectedRoom = roomRows[0];

    // Inactive rooms cannot be reserved.
    if (selectedRoom.status !== 'active') {
      return sendError(
        res,
        409,
        'This room is not currently available.'
      );
    }

    // Reject reservations whose starting time has passed.
    // The database clock must use the library's local timezone.
    const [clockRows] = await connection.query(
      `
      SELECT
        NOW() AS current_time,
        ? <= NOW() AS is_past
      `,
      [startTime]
    );

    if (Number(clockRows[0].is_past) === 1) {
      return sendError(
        res,
        400,
        'Please select a future reservation time.'
      );
    }

    // Retrieve the applicable library schedule.
    // An exact-date entry takes priority over a regular
    // weekly entry when both are present.
    const [hoursRows] = await connection.query(
      `
      SELECT
        open_time,
        close_time,
        is_closed,
        effective_date
      FROM library_hours
      WHERE day_of_week = ?
        AND (
          effective_date IS NULL
          OR effective_date = ?
        )
      ORDER BY
        CASE
          WHEN effective_date = ? THEN 0
          ELSE 1
        END,
        hours_id DESC
      LIMIT 1
      `,
      [weekday, date, date]
    );

    // Missing hours must not automatically allow a booking.
    if (!hoursRows.length) {
      return sendError(
        res,
        409,
        'Library hours are unavailable for this date.'
      );
    }

    const schedule = hoursRows[0];

    if (Number(schedule.is_closed) === 1) {
      return sendError(
        res,
        409,
        'The library is closed on this date.'
      );
    }

    const opening = timeInMinutes(schedule.open_time);
    const closing = timeInMinutes(schedule.close_time);

    // Confirm that the full reservation fits within open hours.
    if (
      opening === null ||
      closing === null ||
      start * 60 < opening ||
      end * 60 > closing
    ) {
      return sendError(
        res,
        409,
        'Please select a time within library operating hours.'
      );
    }

    // Check whether the room is blocked by an administrator.
    const [unavailable] = await connection.query(
      `
      SELECT unavailability_id
      FROM room_unavailability
      WHERE room_id = ?
        AND start_time < ?
        AND end_time > ?
      LIMIT 1
      `,
      [selectedRoomId, endTime, startTime]
    );

    if (unavailable.length) {
      return sendError(
        res,
        409,
        'This room is unavailable during the selected time.'
      );
    }

    // Check for overlapping confirmed reservations.
    // Cancelled, completed, and no-show reservations do not
    // block a new reservation in this implementation.
    const [conflicts] = await connection.query(
      `
      SELECT reservation_id
      FROM reservations
      WHERE room_id = ?
        AND status = 'confirmed'
        AND start_time < ?
        AND end_time > ?
      LIMIT 1
      `,
      [selectedRoomId, endTime, startTime]
    );

    if (conflicts.length) {
      return sendError(
        res,
        409,
        'This room is already reserved at that time.'
      );
    }

    // Save the reservation using the verified account ID.
    const [result] = await connection.query(
      `
      INSERT INTO reservations (
        user_id,
        room_id,
        start_time,
        end_time,
        status
      )
      VALUES (?, ?, ?, ?, 'confirmed')
      `,
      [userId, selectedRoomId, startTime, endTime]
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(201).json({
      message: 'Reservation confirmed.',
      reservationId: result.insertId
    });

  } catch (error) {
    console.error('Reservation creation error:', error);

    return sendError(
      res,
      500,
      'Could not create reservation.'
    );

  } finally {
    // Roll back unsuccessful transactions and release the connection.
    if (connection) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (error) {
          console.error('Reservation rollback error:', error);
        }
      }

      connection.release();
    }
  }
};
