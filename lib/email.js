// lib/email.js
// Email helpers for reservations, built on Resend.
//
// Setup:
//   npm install resend luxon
//   .env.local:
//     RESEND_API_KEY=re_xxxxxxxx
//     EMAIL_FROM="MyStudySpace <reservations@yourdomain.com>"   (domain must be verified in Resend, if this moves to a real deployment)
//     LIBRARY_TIMEZONE=America/New_York
const { Resend } = require('resend');
const { DateTime } = require('luxon');

const resend = new Resend(process.env.RESEND_API_KEY);

// onboarding@resend.dev is for testing only: it can only deliver to the
// email address of your own Resend account. To email real users, verify
// your own domain at https://resend.com/domains and use an address on it.
const FROM = process.env.EMAIL_FROM || 'MyStudySpace <onboarding@resend.dev>';

// Reservation times are stored as plain local times (no time zone), so we
// need to say which time zone they belong to when converting to real moments.
const TIMEZONE = process.env.LIBRARY_TIMEZONE || 'America/New_York';

const REMINDER_MINUTES = 30;

// Resend can schedule emails at most 30 days ahead.
const MAX_SCHEDULE_DAYS = 29;

// Guest names are typed by users, so escape them before putting them in HTML.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convert a DB value ('2026-11-18 14:00:00' string or Date) to a Luxon
// DateTime in the library's time zone.
function toDateTime(value) {
  if (value instanceof Date) {
    // mysql2 returns Date objects unless dateStrings is on; its local
    // wall-clock fields are the stored time.
    return DateTime.fromObject(
      {
        year: value.getFullYear(),
        month: value.getMonth() + 1,
        day: value.getDate(),
        hour: value.getHours(),
        minute: value.getMinutes(),
      },
      { zone: TIMEZONE }
    );
  }

  const text = String(value);
  const sql = DateTime.fromSQL(text, { zone: TIMEZONE });
  return sql.isValid ? sql : DateTime.fromISO(text, { zone: TIMEZONE });
}

function whenText(reservation) {
  const start = toDateTime(reservation.start_time);
  const end = toDateTime(reservation.end_time);
  return `${start.toFormat('cccc, LLLL d')} &middot; ${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')}`;
}

// Shared layout for both emails.
// details (optional): { roomName, location } looked up by the caller.
function buildHtml({ heading, intro, reservation, details = {}, footerHtml = '' }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2>${escapeHtml(heading)}</h2>
      <p>Hello ${escapeHtml(reservation.guest_name)},</p>
      <p>${intro}</p>
      <table style="border-collapse: collapse;">
        ${details.roomName ? `<tr><td style="padding: 4px 12px 4px 0;"><strong>Room</strong></td><td>${escapeHtml(details.roomName)}</td></tr>` : ''}
        ${details.location ? `<tr><td style="padding: 4px 12px 4px 0;"><strong>Location</strong></td><td>${escapeHtml(details.location)}</td></tr>` : ''}
        <tr><td style="padding: 4px 12px 4px 0;"><strong>When</strong></td><td>${whenText(reservation)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Confirmation code</strong></td><td>${escapeHtml(reservation.confirmation_code)}</td></tr>
      </table>
      ${footerHtml}
    </div>
  `;
}

// Library rules shown in the confirmation email.
const RULES_HTML = `
  <p>Keep in mind the following library rules during your reservation:</p>
  <ul>
    <li>Reservations last up to 2 hours.</li>
    <li>Check in within 15 minutes of your start time, or the room is released.</li>
    <li>Keep noise low and leave the room clean.</li>
    <li>Do not leave your belongings unattended.</li>
    <li>Cancel ahead of time if your plans change.</li>
  </ul>
  <p>Please keep your confirmation code for reference.</p>
  <p>If you have any questions, contact the NTLC at learningcommons@kean.edu (908) 737-7100.</p>
`;

// Resend's SDK returns { data, error } instead of throwing, so check it.
async function send(payload) {
  const { data, error } = await resend.emails.send(payload);
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  return data; // { id }
}

/** Email sent right after the reservation is saved. */
async function sendConfirmationEmail(reservation, details) {
  if (!reservation.guest_email) return null;

  return send({
    from: FROM,
    to: reservation.guest_email,
    subject: 'MyStudySpace Reservation Confirmation',
    html: buildHtml({
      heading: 'Reservation Confirmed',
      intro: 'Your study room reservation has been confirmed.',
      reservation,
      details,
      footerHtml: RULES_HTML,
    }),
  });
}

/**
 * Schedule the reminder 30 minutes before the reservation starts.
 * Resend sends it at that time, so no cron job is needed.
 * Returns the scheduled email's id (save it so you can cancel it if the
 * reservation is cancelled), or null if nothing was scheduled.
 */
async function scheduleReminderEmail(reservation, details) {
  if (!reservation.guest_email) return null;

  const remindAt = toDateTime(reservation.start_time).minus({ minutes: REMINDER_MINUTES });
  const now = DateTime.now();

  // Reservation starts in under ~30 minutes: the confirmation email just
  // went out, so there is no "30 minutes before" moment left.
  if (remindAt <= now.plus({ minutes: 1 })) return null;

  // Too far ahead for Resend to schedule (the cron fallback will cover it).
  if (remindAt > now.plus({ days: MAX_SCHEDULE_DAYS })) return null;

  const data = await send({
    from: FROM,
    to: reservation.guest_email,
    subject: 'Reminder: your study room starts in 30 minutes',
    html: buildHtml({
      heading: 'Study room reminder',
      intro: 'Your reservation begins in about 30 minutes.',
      reservation,
      details,
    }),
    scheduledAt: remindAt.toUTC().toISO(), // ISO 8601 in UTC
  });

  return data.id;
}

/** Send the reminder immediately (used by the cron fallback). */
async function sendReminderNow(reservation, details) {
  return send({
    from: FROM,
    to: reservation.guest_email,
    subject: 'Reminder: your study room starts soon',
    html: buildHtml({
      heading: 'Study room reminder',
      intro: 'Your reservation begins in about 30 minutes.',
      reservation,
      details,
    }),
  });
}

module.exports = {
  sendConfirmationEmail,
  scheduleReminderEmail,
  sendReminderNow,
};