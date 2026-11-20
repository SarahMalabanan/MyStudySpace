// lib/libraryHours.js
// Operating hours for each library building, used by the API to enforce the
// same rules as the booking pages (the browser checks can be bypassed).
// Day keys follow JavaScript's getDay(): 0 = Sunday ... 6 = Saturday.
// Hours use 24-hour time. { open: 0, close: 0 } means closed all day.
// NOTE: keep this table identical to the one in rooms.js and reserve.js.
const libraryHours = {
  union: {
    0: { open: 12, close: 23 }, // Sunday
    1: { open: 8, close: 23 },  // Monday
    2: { open: 8, close: 23 },
    3: { open: 8, close: 23 },
    4: { open: 8, close: 23 },
    5: { open: 8, close: 20 },
    6: { open: 8, close: 16 },
  },

  jerseycity: {
    0: { open: 0, close: 0 },   // Sunday (closed)
    1: { open: 8, close: 20 },  // Monday
    2: { open: 8, close: 20 },
    3: { open: 8, close: 20 },
    4: { open: 8, close: 20 },
    5: { open: 8, close: 18 },
    6: { open: 8, close: 16 },
  },
};

// Maps the library names stored in the database to the keys above.
// Keys are lowercase letters only; a library name that CONTAINS the key matches.
const LIBRARY_ALIASES = {
  nancythompson: 'union',     // Nancy Thompson Learning Commons
  guarini: 'jerseycity',      // Frank J. Guarini Library
};

// Used only when a library name matches nothing above.
const DEFAULT_HOURS = { open: 8, close: 21 };

function resolveLibraryKey(library) {
  const normalized = String(library || '').toLowerCase().replace(/[^a-z]/g, '');

  if (libraryHours[normalized]) return normalized;

  const alias = Object.keys(LIBRARY_ALIASES).find((a) => normalized.includes(a));
  if (alias) return LIBRARY_ALIASES[alias];

  return Object.keys(libraryHours).find((key) => normalized.includes(key)) || null;
}

/**
 * Operating hours { open, close } for a library on a 'YYYY-MM-DD' date.
 * The weekday is calculated from the calendar date itself (UTC), so the
 * server's time zone can never shift it to the wrong day.
 */
function getHoursForDate(dateStr, library) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const key = resolveLibraryKey(library);
  if (!key) {
    console.warn(`No operating hours configured for library: "${library}". Using default hours.`);
    return DEFAULT_HOURS;
  }

  return libraryHours[key][weekday];
}

function isClosedAllDay(hours) {
  return !hours || (hours.open === 0 && hours.close === 0);
}

// 8 -> "8 AM", 23 -> "11 PM"
function formatHour(hour) {
  const suffix = hour >= 12 && hour < 24 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
}

module.exports = { getHoursForDate, isClosedAllDay, formatHour };