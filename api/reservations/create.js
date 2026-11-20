/**
 * MyStudySpace - Create Guest Reservation
 * Endpoint: POST /api/reservations/create
 */

require("dotenv").config({ path: ".env.local" });

const pool = require("../../lib/db");

// Email helpers (Resend): confirmation now, reminder 30 minutes before start.
const { sendConfirmationEmail, scheduleReminderEmail } = require("../../lib/email");

// Per-library, per-day operating hours (enforced here as well as in the browser).
const { getHoursForDate, isClosedAllDay, formatHour } = require("../../lib/libraryHours");

function sendResponse(res, status, data) {
  return res.status(status).json(data);
}

// Floor names shown in emails (same as the booking pages).
function floorName(floor) {
  const names = { 2: "Second Floor", 3: "Third Floor" };
  return names[floor] || `Floor ${floor}`;
}

function decimalToTime(value) {
  const hour = Math.floor(value);

  const minutes =
    value % 1 === 0.5
      ? "30"
      : "00";

  return `${String(hour).padStart(2, "0")}:${minutes}:00`;
}

function isValidTimeSlot(value) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 24 &&
    (Number.isInteger(value) || value % 1 === 0.5)
  );
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
        !isValidTimeSlot(startHour) ||
        !isValidTimeSlot(endHour) ||
        endHour <= startHour
      ) {
        return sendResponse(res, 400, {
          success: false,
          message: "Invalid date or time."
        });
      }

      const startTime =
  `${date} ${decimalToTime(startHour)}`;

const endTime =
  `${date} ${decimalToTime(endHour)}`;

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

  // Validate reservation hours (general rules).
  // The library-specific opening/closing hours are checked below, once we
  // know which library the room belongs to.
  const startHour = Number(start);
  const endHour = Number(end);

  if (
    !isValidTimeSlot(startHour) ||
    !isValidTimeSlot(endHour) ||
    startHour < 0 ||
    endHour > 24 ||
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
 let currentSlot = now.hour;

const currentMinutes = new Date().getMinutes();

if (currentMinutes > 0 && currentMinutes <= 30) {
  currentSlot += 0.5;
}
else if (currentMinutes > 30) {
  currentSlot += 1;
}

if (
  date === now.date &&
  startHour < currentSlot
) {
  return sendResponse(res, 400, {
    success: false,
    message:
      "You cannot reserve a time that has already passed."
  });
}

  const startTime =
    `${date} ${decimalToTime(startHour)}`;

  const endTime =
    `${date} ${decimalToTime(endHour)}`;

  let connection;
  let room;
  let result;
  let confirmationCode;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock the room so simultaneous bookings cannot overlap.
    // SELECT * so we also have the room's name, library and floor for the
    // operating-hours check and the emails.
    const [roomRows] = await connection.query(
      `SELECT *
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

    room = roomRows[0];

    // Enforce this library's operating hours for the selected day.
    const hours = getHoursForDate(date, room.library);

    if (isClosedAllDay(hours)) {
      await connection.rollback();
      return sendResponse(res, 400, {
        success: false,
        message: "The library is closed on that day."
      });
    }

    if (startHour < hours.open || endHour > hours.close) {
      await connection.rollback();
      return sendResponse(res, 400, {
        success: false,
        message: `Reservations must be within the library's hours on that day (${formatHour(hours.open)} – ${formatHour(hours.close)}).`
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
    confirmationCode = require("crypto")
      .randomBytes(6)
      .toString("hex")
      .toUpperCase();

    [result] = await connection.query(
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

    // The reservation is saved: free the database connection before the
    // (slower) email requests so it isn't held while we wait on Resend.
    connection.release();
    connection = null;

    // Emails: never let an email problem make the booking itself fail.
    if (guestEmail) {
      const reservation = {
        reservation_id: result.insertId,
        guest_name: guestName,
        guest_email: guestEmail,
        start_time: startTime,
        end_time: endTime,
        confirmation_code: confirmationCode
      };

      const details = {
        roomName: room.name || room.room_code || `Room ${roomId}`,
        location: `${room.library}, ${floorName(room.floor)}`
      };

      // 1) Confirmation, sent right away.
      try {
        await sendConfirmationEmail(reservation, details);
        console.log("Confirmation email sent for reservation", result.insertId);
      } catch (emailError) {
        console.error("Confirmation email failed:", emailError);
      }

      // 2) Reminder, scheduled with Resend for 30 minutes before the start.
      try {
        const reminderId = await scheduleReminderEmail(reservation, details);

        if (reminderId) {
          // Saved so the reminder can be cancelled if the reservation is.
          // Requires: ALTER TABLE reservations ADD COLUMN reminder_email_id VARCHAR(64) NULL;
          await pool.query(
            `UPDATE reservations
             SET reminder_email_id = ?
             WHERE reservation_id = ?`,
            [reminderId, result.insertId]
          );
        }
      } catch (reminderError) {
        console.error("Reminder scheduling failed:", reminderError);
      }
    }

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