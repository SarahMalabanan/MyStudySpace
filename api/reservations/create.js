
/**
 * MyStudySpace - Create Guest Reservation
 * Endpoint: POST /api/reservations/create
 */

const pool = require("../../lib/db");

function sendResponse(res, status, data) {
  return res.status(status).json(data);
}

// Get the current date and hour in the library's local timezone.
function getLocalDateTime() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour)
  };
}


module.exports = async function handler(req, res) {

  // GET: Check which rooms are already reserved.
  if (req.method === "GET") {
    try {
      const { date, start, end } = req.query;

      const startHour = Number(start);
      const endHour = Number(end);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
        !Number.isInteger(startHour) ||
        !Number.isInteger(endHour) ||
        startHour < 0 ||
        endHour > 24 ||
        endHour <= startHour
      ) {
        return sendResponse(res, 400, {
          success: false,
          message: "Invalid date or time."
        });
      }

      const startTime =
        `${date} ${String(startHour).padStart(2, "0")}:00:00`;

      const endTime =
        `${date} ${String(endHour).padStart(2, "0")}:00:00`;

      const [rows] = await pool.query(
        `SELECT DISTINCT room_id
         FROM reservations
         WHERE status = 'confirmed'
           AND start_time < ?
           AND end_time > ?`,
        [endTime, startTime]
      );

      return sendResponse(res, 200, {
        success: true,
        room_ids: rows.map(row => Number(row.room_id))
      });

    } catch (error) {
      console.error("Availability lookup failed:", error);

      return sendResponse(res, 500, {
        success: false,
        message: "Unable to check room availability."
      });
    }
  }

  // POST: Create a reservation (existing functionality).
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendResponse(res, 405, {
      success: false,
      message: "Method not allowed."
    });
  }

  const {
    date,
    start,
    end,
    guest_name,
    guest_email,
    guest_phone
  } = req.body || {};

  const roomId = Number(req.body?.room_id);

const guestName = String(guest_name || '').trim();
const guestEmail = String(guest_email || '').trim();
const guestPhone = String(guest_phone || '').trim();

// Validate guest information.
if (!guestName || guestName.length > 100) {
  return sendResponse(res, 400, {
    success: false,
    message: "Please provide your name."
  });
}

if (!guestEmail && !guestPhone) {
  return sendResponse(res, 400, {
    success: false,
    message: "Please provide an email address or phone number."
  });
}

if (guestEmail && (
  guestEmail.length > 255 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)
)) {
  return sendResponse(res, 400, {
    success: false,
    message: "Please provide a valid email address."
  });
}

if (guestPhone && !/^\+?[0-9\s().-]{7,30}$/.test(guestPhone)) {
  return sendResponse(res, 400, {
    success: false,
    message: "Please provide a valid phone number."
  });
}

  // Validate room ID.
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    return sendResponse(res, 400, {
      success: false,
      message: "A valid room ID is required."
    });
  }

  // Validate date format and actual calendar date.
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return sendResponse(res, 400, {
      success: false,
      message: "A valid reservation date is required."
    });
  }

  const [year, month, day] = date.split("-").map(Number);
  const checkDate = new Date(Date.UTC(year, month - 1, day));

  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return sendResponse(res, 400, {
      success: false,
      message: "Invalid reservation date."
    });
  }

  // Validate reservation hours.
  const startHour = Number(start);
  const endHour = Number(end);

  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 8 ||
    endHour > 21 ||
    endHour <= startHour ||
    endHour - startHour > 2
  ) {
    return sendResponse(res, 400, {
      success: false,
      message: "Invalid reservation time. Reservations must be between 1 and 2 hours."
    });
  }

  // Enforce the two-week advance booking policy.
  const now = getLocalDateTime();

  const todayDate = new Date(`${now.date}T00:00:00Z`);
  const reservationDate = new Date(`${date}T00:00:00Z`);
  const daysAhead = Math.round(
    (reservationDate - todayDate) / 86400000
  );

  if (daysAhead < 0 || daysAhead > 14) {
    return sendResponse(res, 400, {
      success: false,
      message: "Reservations must be made within the next two weeks."
    });
  }

  // Do not allow reservations for hours that have already started.
  if (date === now.date && startHour <= now.hour) {
    return sendResponse(res, 400, {
      success: false,
      message: "You cannot reserve a time that has already started."
    });
  }

  const startTime =
    `${date} ${String(startHour).padStart(2, "0")}:00:00`;

  const endTime =
    `${date} ${String(endHour).padStart(2, "0")}:00:00`;

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock the room so simultaneous bookings cannot overlap.
    const [roomRows] = await connection.query(
      `SELECT room_id
       FROM rooms
       WHERE room_id = ?
       FOR UPDATE`,
      [roomId]
    );

    if (!roomRows.length) {
      await connection.rollback();
      return sendResponse(res, 404, {
        success: false,
        message: "Room not found."
      });
    }

    // Check for overlapping confirmed reservations.
    const [existing] = await connection.query(
      `SELECT reservation_id
       FROM reservations
       WHERE room_id = ?
         AND status = 'confirmed'
         AND start_time < ?
         AND end_time > ?
       LIMIT 1`,
      [roomId, endTime, startTime]
    );

    if (existing.length) {
      await connection.rollback();
      return sendResponse(res, 409, {
        success: false,
        message: "That room is already reserved for the selected time."
      });
    }

    // Save the guest reservation. No account is required.
    const confirmationCode = require("crypto")
  .randomBytes(6)
  .toString("hex")
  .toUpperCase();

const [result] = await connection.query(
  `INSERT INTO reservations
     (user_id, guest_name, guest_email, guest_phone,
      room_id, start_time, end_time, status, confirmation_code)
   VALUES
     (NULL, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
  [
    guestName,
    guestEmail || null,
    guestPhone || null,
    roomId,
    startTime,
    endTime,
    confirmationCode
  ]
);

    await connection.commit();

    return sendResponse(res, 201, {
  success: true,
  message: "Reservation successfully created.",
  reservation_id: result.insertId,
  confirmation_code: confirmationCode,
  guest_name: guestName,
  guest_email: guestEmail || null,
  guest_phone: guestPhone || null,
  room_id: roomId,
  start_time: startTime,
  end_time: endTime,
  status: "confirmed"
});

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Reservation rollback failed.");
      }
    }

    console.error("Guest reservation failed:", error.code);

    return sendResponse(res, 500, {
      success: false,
      message: "Unable to create reservation."
    });

  } finally {
    if (connection) connection.release();
  }
};
