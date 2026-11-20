// Operating hours for each library building, keyed by the library name
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

// Hours used ONLY when a room's library name matches no entry above.
const DEFAULT_HOURS = { open: 8, close: 21 };

// Maps the library names stored in the database to the keys above.
// Keys are lowercase letters only (spaces and punctuation removed); a library
// name that CONTAINS the key matches, e.g. "Frank J. Guarini Library".
const LIBRARY_ALIASES = {
  nancythompson: 'union',     // Nancy Thompson Learning Commons
  guarini: 'jerseycity',      // Frank J. Guarini Library
};

// Maximum length of a single reservation, in hours.
const MAX_DURATION = 2;

const $ = (id) => document.getElementById(id);

let room;

// Parse a 'YYYY-MM-DD' string as a LOCAL date.
function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Return the operating hours { open, close } of a library for a given date.
 * Returns null if the date is missing/invalid.
 */
function getLibraryHours(date, library) {
  if (!date) return null;

  const parsed = parseLocalDate(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const day = parsed.getDay();

  const libraryKey = resolveLibraryKey(library);

  if (!libraryKey) {
    // The library name from the database matches none of the configured
    // buildings. Use default hours so the user can still book, and log the
    // exact name so it can be added to libraryHours (or LIBRARY_ALIASES).
    console.warn(
      `No operating hours configured for library: "${library}". ` +
      `Known libraries: ${Object.keys(libraryHours).join(', ')}. Using default hours.`
    );
    return DEFAULT_HOURS;
  }

  return libraryHours[libraryKey][day];
}

/**
 * Map the library name stored in the database to a key of libraryHours.
 * Handles "Union", "Jersey City", "jersey city library", "Union Library", etc.
 * Returns null if no configured library matches.
 */
function resolveLibraryKey(library) {
  // Lowercase and strip spaces/punctuation: "Jersey City Library" -> "jerseycitylibrary"
  const normalized = String(library)
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (libraryHours[normalized]) return normalized;

  // A name that contains an alias matches that library.
  const alias = Object.keys(LIBRARY_ALIASES).find((a) => normalized.includes(a));
  if (alias) return LIBRARY_ALIASES[alias];

  // Then "name contains key" (e.g. "unionlibrary" contains "union").
  return (
    Object.keys(libraryHours).find((key) => normalized.includes(key)) || null
  );
}

/** True if the library does not open at all on this day. */
function isClosedAllDay(hours) {
  return !hours || (hours.open === 0 && hours.close === 0);
}

/**
 * Enable or disable the start/end dropdowns.
 * They are disabled when the library is closed (or nothing is left today),
 * so the user cannot pick a time for that day at all.
 */
function setTimeControlsEnabled(enabled) {
  $('start').disabled = !enabled;
  $('end').disabled = !enabled;
}

/**
 * Optional helper text under the date field, e.g. "Open 8 AM – 11 PM".
 * Only runs if an element with id="hours-note" exists in the HTML.
 */
function showHoursNote(hours) {
  const note = $('hours-note');
  if (!note) return;

  note.textContent = !hours
    ? 'Hours unavailable'
    : !resolveLibraryKey(room.library)
    ? `Default hours (library "${room.library}" not recognized)`
    : isClosedAllDay(hours)
    ? 'Closed on this day'
    : `Open ${fmtHour(hours.open)} – ${fmtHour(hours.close)}`;
}

/**
 * First hour that can be booked on the given date.
 * - Future dates: the library's opening hour.
 * - Today: the next full hour after now (so past times can't be chosen).
 */
function timeOptions(start, end){
  let html = '';

  for (let time = start; time <= end; time += 0.5){
    html += `<option value="${time}">${formatTime(time)}</option>`;
  }
  return html;
}

function formatTime(time) {
  const hour = Math.floor(time);

  const minutes =
    time % 1 === 0.5
      ? '30'
      : '00';

  const displayHour =
    hour % 12 || 12;

  const suffix =
    hour >= 12 ? 'PM' : 'AM';

  return `${displayHour}:${minutes} ${suffix}`;
}

function getEarliestStart(date, hours) {
  if (date !== today()) {
    return hours.open;
  }

  const now = new Date();

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  let nextSlot;

  if (currentMinute === 0) {
    nextSlot = currentHour;
  } else if (currentMinute <= 30) {
    nextSlot = currentHour + 0.5;
  } else {
    nextSlot = currentHour + 1;
  }

  return Math.max(hours.open, nextSlot);
}

/**if (currentMinute === 0) {
  earliestStart = currentHour;
}
else if (currentMinute <= 30) {
  earliestStart = currentHour + 0.5;
}
else {
  earliestStart = currentHour + 1;
}*/


/**
 * Validate a selection and return an error message,
 * or an empty string if the reservation is allowed.
 * Used both for live feedback (update) and right before saving (confirm),
 * so the same rules apply in both places.
 */
function validateSelection(date, start, end) {
  if (!date) return 'Please select a date.';

  // The date input's min/max can be bypassed by typing, so check here too.
  if (date < today()) return 'You cannot book a date that has already passed.';
  if (date > maxBookingDate()) return 'That date is too far in advance.';

  const hours = getLibraryHours(date, room.library);

  // Library name didn't match any configured building.
  if (!hours) return 'Operating hours are not available for this library.';

  if (isClosedAllDay(hours)) return 'The library is closed on this day.';

  // Today: nothing left to book after the last start hour.
  if (getEarliestStart(date, hours) >= hours.close) {
    return date === today()
      ? 'No reservation times remain today.'
      : 'The library is closed on this day.';
  }

  if (Number.isNaN(start) || Number.isNaN(end) || !$('start').value || !$('end').value) {
    return 'Please select a start and end time.';
  }

  if (end <= start) return 'End time must be after start time.';
  if (end - start > MAX_DURATION) return `Reservations are limited to ${MAX_DURATION} hours.`;

  // Must be inside this day's operating hours for this library.
  if (start < hours.open) return 'Library is closed at that time.';
  if (end > hours.close) return 'Reservation exceeds operating hours.';

  // Time that has already passed (today only).
  if (date === today() && start < getEarliestStart(date, hours)) {
    return 'This start time has already passed.';
  }

  return '';
}

/**
 * Rebuild the start-time dropdown for the selected date.
 * Only hours inside the library's operating hours (and not in the past)
 * are offered. The selected start defaults to the earliest hour available
 * that day, unless a still-valid preferredStart is given.
 */
function updateTimeOptions(preferredStart) {
  if (!room) return;

  const date = $('date').value;
  const hours = getLibraryHours(date, room.library);

  // A start time is only kept when one is passed in (e.g. the time chosen on
  // the room-selection page when the page first loads). On every date change
  // nothing is passed, so the start time resets to THAT day's first available
  // hour for this library (its opening hour, or the next hour if it is today).
  const previousStart = Number.isFinite(preferredStart)
    ? preferredStart
    : NaN;

  // Show this day's hours next to the date (if the page has a place for it).
  showHoursNote(hours);

  // Library closed all day, or no times left today:
  // empty AND disable the dropdowns so no time can be picked.
  // (The message itself is shown by update() through validateSelection.)
  if (
    isClosedAllDay(hours) ||
    getEarliestStart(date, hours) >= hours.close
  ) {
    $('start').innerHTML = '<option value="">Closed</option>';
    $('end').innerHTML = '<option value="">Closed</option>';
    setTimeControlsEnabled(false);
    return;
  }

  // Open day: make sure the dropdowns are usable again
  // (they may have been disabled by a previously selected closed day).
  setTimeControlsEnabled(true);

  const earliestStart = getEarliestStart(date, hours);
  const latestStart = hours.close - 1; // last 1-hour slot must end at closing

  // The list is rebuilt from scratch for the selected day, so each day
  // only offers the hours that library is open (and not already passed).
  $('start').innerHTML = timeOptions(
    earliestStart,
    latestStart,
    
  );

  // Use the preferred start if it is allowed that day, otherwise the earliest.
  const validPrevious =
    previousStart >= earliestStart && previousStart <= latestStart;
  $('start').value = validPrevious ? previousStart : earliestStart;
  // Safety net: if the browser did not accept the value, pick the first option.
  if (!$('start').value) $('start').selectedIndex = 0;

  updateEndOptions();
}

/**
 * Rebuild the end-time dropdown based on the chosen start time.
 * End is at most MAX_DURATION hours after start and never after closing.
 */
function updateEndOptions() {
  if (!room) return;

  const date = $('date').value;
  const hours = getLibraryHours(
    date,
    room.library
  );

  const start = Number($('start').value);

  if (
    isClosedAllDay(hours) ||
    !$('start').value ||
    Number.isNaN(start)
  ) {
    $('end').innerHTML =
      '<option value="">Closed</option>';

    $('end').disabled = true;
    return;
  }

  const options = [];

  // 1-hour reservation
  const endOneHour = start + 1;

  if (endOneHour <= hours.close) {
    options.push(endOneHour);
  }

  // 2-hour reservation
  const endTwoHours = start + 2;

  if (endTwoHours <= hours.close) {
    options.push(endTwoHours);
  }

  if (options.length === 0) {
    $('end').innerHTML =
      '<option value="">No valid end time</option>';

    $('end').disabled = true;
    return;
  }

  $('end').disabled = false;

  $('end').innerHTML = options
    .map(
      (time) =>
        `<option value="${time}">
          ${formatTime(time)}
        </option>`
    )
    .join('');

  $('end').value = options[0];
}

async function init() {
  // Close button on the confirmation modal.
  // Registered first so it works even if loading the room fails.
  $('close-confirmation').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  try {
    // Read the selected room ID from the URL.
    const params = new URLSearchParams(location.search);
    const roomId = params.get('room');

    if (!roomId) {
      $('room-info').innerHTML = '<p>No room was selected. Please go back and select a room.</p>';
      $('confirm').disabled = true;
      return;
    }

    // Get the selected room from the database API.
    room = await getRoom(roomId);

    // Check BEFORE using room.library (it would throw if room is missing).
    if (!room) {
      $('room-info').innerHTML = '<p>Room not found. Please go back and select another room.</p>';
      $('confirm').disabled = true;
      return;
    }

    // Display the selected room.
    $('room-info').innerHTML = `
      <h2>${room.name || room.room_code}</h2>
      ${roomPhotoHtml(room)}
      <div>Seats: ${room.seats}</div>
      <ul class="features">
        ${room.whiteboard ? '<li>Whiteboard</li>' : ''}
        ${room.tv ? '<li>TV</li>' : ''}
        ${room.window ? '<li>Window</li>' : ''}
        ${room.outlet ? '<li>Outlet</li>' : ''}
      </ul>
      <div>${room.library}, ${floorName(room.floor)}</div>
    `;

    // Limit the date picker to the allowed booking range.
    $('date').min = today();
    $('date').max = maxBookingDate();

    // Use the date and start time passed from the room-selection page.
    const requestedDate = params.get('date') || today();

    // If the requested date is outside the allowed range, default to today.
    $('date').value =
      requestedDate < today() || requestedDate > maxBookingDate()
        ? today()
        : requestedDate;

    // Build the time options for that date. The requested start is used only
    // if it is still valid (not passed, inside operating hours); otherwise
    // the earliest available hour is selected automatically.
    const requestedStart = Number(params.get('start')) || 13;
    updateTimeOptions(requestedStart);

    // Re-build options and re-validate whenever the user changes something.
    // Every time the date changes, rebuild the start/end options so they
    // match THAT day's operating hours for this library. 'input' is also
    // listened to because some browsers fire it before 'change' on date fields.
    const onDateChange = () => {
      updateTimeOptions(); // resets start to the new day's first available hour
      update();            // re-validate and show closed/unavailable messages
    };
    $('date').addEventListener('change', onDateChange);
    $('date').addEventListener('input', onDateChange);

    $('start').addEventListener('change', () => {
      updateEndOptions();
      update();
    });

    $('end').addEventListener('change', update);

    $('confirm').addEventListener('click', confirmReservation);

    $('cancel').addEventListener('click', () => {
      location.href = 'index.html';
    });

    update();

  } catch (error) {
    console.error(error);
    $('room-info').innerHTML = '<p>Could not load the selected room. Please try again.</p>';
    $('confirm').disabled = true;
  }
}


// Used to ignore outdated availability responses if the user changes the
// selection again while a request is still running.
let availabilityCheckId = 0;

async function update() {
  if (!room) return;

  const requestId = ++availabilityCheckId;

  const start = Number($('start').value);
  const end = Number($('end').value);
  const date = $('date').value;

  // Run all rule checks (past time, operating hours, 2-hour limit, ...).
  let error = validateSelection(date, start, end);

  // Update the summary panel. Show a dash if no valid time is selected.
  const hasTimes = $('start').value && $('end').value;
  $('s-room').textContent = room.name || room.room_code;
  $('s-date').textContent = date;
  $('s-time').textContent = hasTimes
    ? `${formatTime(start)} – ${formatTime(end)}`
    : '—';
  $('s-floor').textContent = `${room.library}, ${floorName(room.floor)}`;

  if (error) {
    $('msg').textContent = error;
    $('msg').className = 'msg error';
    $('confirm').disabled = true;
    return;
  }

  // Check availability using the database.
  $('msg').textContent = 'Checking availability...';
  $('msg').className = 'msg';
  $('confirm').disabled = true;

  try {
    const unavailableRooms = await getUnavailableRooms(
      date,
      start,
      end
    );

    // Ignore older requests if the user changed the time again.
    if (requestId !== availabilityCheckId) return;

    if (unavailableRooms.includes(Number(room.id))) {
      error = 'That time is unavailable. Please choose another time.';
    }

    $('msg').textContent = error;
    $('msg').className = error ? 'msg error' : 'msg';
    $('confirm').disabled = Boolean(error);

  } catch (err) {
    if (requestId !== availabilityCheckId) return;

    $('msg').textContent = 'Could not check availability. Please try again.';
    $('msg').className = 'msg error';
    $('confirm').disabled = true;

    console.error(err);
  }
}


function showConfirmation(reservation) {
  $('c-code').textContent = reservation.confirmation_code;
  $('c-name').textContent = reservation.guest_name;
  $('c-room').textContent = room.name || room.room_code;
  $('c-date').textContent = reservation.start_time.split(' ')[0];
  $('c-time').textContent =
    `${formatTime(Number(reservation.start_time.split(' ')[1].slice(0, 2)))} – ${
      formatTime(Number(reservation.end_time.split(' ')[1].slice(0, 2)))
    }`;
  $('c-email').textContent = reservation.guest_email || 'Not provided';
  $('c-phone').textContent = reservation.guest_phone || 'Not provided';

  $('confirmation-modal').hidden = false;
}


async function confirmReservation() {
  const start = Number($('start').value);
  const end = Number($('end').value);
  const date = $('date').value;

  const guestName = $('guest-name').value.trim();
  const guestEmail = $('guest-email').value.trim();
  const guestPhone = $('guest-phone').value.trim();

  // Re-validate right before saving. The page may have been open for a while,
  // so the selected hour could have passed since it was chosen.
  const selectionError = validateSelection(date, start, end);
  if (selectionError) {
    $('msg').textContent = selectionError;
    $('msg').className = 'msg error';
    $('confirm').disabled = true;
    // Refresh the dropdowns so expired hours disappear.
    updateTimeOptions();
    return;
  }

  // Validate guest information.
  if (!guestName) {
    $('msg').textContent = 'Please enter your full name.';
    $('msg').className = 'msg error';
    return;
  }

  if (!guestEmail && !guestPhone) {
    $('msg').textContent = 'Please enter an email address or phone number.';
    $('msg').className = 'msg error';
    return;
  }

  // Prevent double submissions while the request is running.
  $('confirm').disabled = true;

  try {
    const reservation = await createReservation(
      room.id,
      date,
      start,
      end,
      guestName,
      guestEmail,
      guestPhone
    );

    $('msg').textContent = 'Reservation successfully saved!';
    $('msg').className = 'msg ok';

    showConfirmation(reservation);

    console.log('Reservation created:', reservation);

  } catch (error) {
    $('msg').textContent = error.message;
    $('msg').className = 'msg error';
    $('confirm').disabled = false; // let the user try again
  }
}
init();