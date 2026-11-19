require("dotenv").config({ path: ".env.local" });

const pool = require("../../lib/db");
const { sendReminderNow } = require("../../lib/email");

// Safety net for reminders that were NOT scheduled at booking time
// (for example, if scheduling failed). Run it every 5 minutes with a
// scheduler (Vercel Cron on a paid plan, GitHub Actions, cron-job.org, ...).
module.exports = async (req, res) => {
  // Only let your scheduler call this endpoint.
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically.
  if (
    process.env.CRON_SECRET &&
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ success: false });
  }

  try {
    // Everything that starts within the next 30 minutes and has no reminder.
    // Using "up to 30 minutes" (not a narrow 25-35 minute window) means a
    // missed or late run still sends the reminder before the reservation.
    // reminder_email_id IS NULL skips reminders already scheduled in Resend.
    const [reservations] = await pool.query(`
      SELECT *
      FROM reservations
      WHERE status = 'confirmed'
        AND guest_email IS NOT NULL
        AND guest_email <> ''
        AND reminder_sent = FALSE
        AND reminder_email_id IS NULL
        AND start_time > NOW()
        AND start_time <= NOW() + INTERVAL 30 MINUTE
    `);

    let sent = 0;

    for (const reservation of reservations) {
      // Claim the row first so two overlapping runs can't both send it.
      const [claim] = await pool.query(
        `UPDATE reservations
         SET reminder_sent = TRUE
         WHERE reservation_id = ? AND reminder_sent = FALSE`,
        [reservation.reservation_id]
      );
      if (claim.affectedRows === 0) continue;

      try {
        await sendReminderNow(reservation);
        sent++;
      } catch (emailError) {
        console.error('Reminder failed:', reservation.reservation_id, emailError);

        // Release the claim so the next run retries.
        await pool.query(
          `UPDATE reservations
           SET reminder_sent = FALSE
           WHERE reservation_id = ?`,
          [reservation.reservation_id]
        );
      }
    }

    res.status(200).json({
      success: true,
      remindersSent: sent
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false
    });
  }
};