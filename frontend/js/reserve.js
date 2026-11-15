
const $ = (id) => document.getElementById(id);

// MyStudySpace - Study Room Reservations
//
// This page receives the selected room, date, and start time
// from the homepage. Room information comes from the Rooms API,
// while confirmed reservations are stored in MySQL.
//
// The Reservations API identifies registered users through
// their login session cookie. We do not send a user ID here.

let room = null;
let submitting = false;
let reservationConfirmed = false;

// Display a message underneath the reservation summary.
function showMessage(message, isError = false) {
  $('msg').textContent = message;
  $('msg').className = isError ? 'msg error' : 'msg ok';
}

// Check whether a date is a real calendar date.
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Check whether the selected reservation is in the past.
function reservationIsPast(date, startHour) {
  const [year, month, day] = date.split('-').map(Number);

  const start = new Date(
    year,
    month - 1,
    day,
    startHour,
    0,
    0
  );

  return start <= new Date();
}

// Check the reservation information and update the summary.
function update() {
  if (!room) return;

  const date = $('date').value;
  const start = Number($('start').value);
  const end = Number($('end').value);
  const hours = end - start;

  let error = '';

  if (!validDate(date)) {
    error = 'Please select a valid reservation date.';
  } else if (reservationIsPast(date, start)) {
    error = 'Please select a future reservation time.';
  } else if (hours <= 0) {
    error = 'End time must be after start time.';
  } else if (hours > 2) {
    error = 'Reservations are limited to 2 hours.';
  }

  // Keep the selected room and reservation details visible.
  $('s-room').textContent = room.name;
  $('s-date').textContent = date;
  $('s-time').textContent =
    `${fmtHour(start)} – ${fmtHour(end)}`;

  $('s-floor').textContent =
    `${room.library}, ${floorName(room.floor)}`;

  if (reservationConfirmed) {
    $('confirm').disabled = true;
    return;
  }

  showMessage(error, Boolean(error));

  // Do not allow submission while the request is processing.
  $('confirm').disabled = Boolean(error) || submitting;
}

// Display the room selected on the homepage.
function displayRoom() {
  $('room-info').innerHTML = `
    <h2>${room.name}</h2>
    ${roomPhotoHtml(room)}
    <div>Seats ${room.seats}</div>
    ${featureListHtml(room, [
      ['whiteboard', 'Whiteboard'],
      ['tv', 'TV'],
      ['window', 'Window'],
      ['outlet', 'Outlet']
    ])}
    <div>${room.library} · ${floorName(room.floor)}</div>
  `;
}

// Send a reservation request to the existing MySQL API.
async function confirmReservation() {
  if (!room || submitting || reservationConfirmed) return;

  update();

  if ($('confirm').disabled) return;

  submitting = true;
  $('confirm').disabled = true;
  $('confirm').textContent = 'Confirming...';

  showMessage('Saving your reservation...');

  try {
    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        roomId: room.id,
        date: $('date').value,
        startHour: Number($('start').value),
        endHour: Number($('end').value)
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || 'Could not confirm your reservation.'
      );
    }

    // The reservation is confirmed only after MySQL saves it.
    reservationConfirmed = true;

    showMessage(
      `Reservation confirmed! Reservation #${result.reservationId}`
    );

    $('confirm').textContent = 'Reservation Confirmed';
    $('confirm').disabled = true;

    // Prevent changes to a reservation that was already submitted.
    $('date').disabled = true;
    $('start').disabled = true;
    $('end').disabled = true;

  } catch (error) {
    showMessage(error.message, true);

    $('confirm').textContent = 'Confirm reservation';

  } finally {
    submitting = false;

    if (!reservationConfirmed) {
      update();
    }
  }
}

// Load the selected room and initialize the reservation form.
async function init() {
  const params = new URLSearchParams(window.location.search);

  const selectedRoomId = params.get('room');
  const selectedDate = params.get('date');
  const selectedStart = params.get('start');

  $('confirm').disabled = true;

  try {
    // Load real study rooms instead of MOCK_ROOMS1.
    const rooms = await getRooms();

    // Find the room using the ID passed from the homepage.
    room = rooms.find(
      item => String(item.id) === String(selectedRoomId)
    );

    if (!room) {
      showMessage(
        'Could not find the selected room. Please return to the homepage.',
        true
      );
      return;
    }

    displayRoom();

    // Set up the existing date and time controls.
    $('date').value =
      validDate(selectedDate) ? selectedDate : today();

    $('date').min = today();

    $('start').innerHTML = hourOptions(8, 20, false);
    $('end').innerHTML = hourOptions(9, 21, false);

    const startHour = Number(selectedStart);

    // Preserve the time selected on the homepage when valid.
    const initialStart =
      Number.isInteger(startHour) &&
      startHour >= 8 &&
      startHour <= 20
        ? startHour
        : 13;

    $('start').value = String(initialStart);
    $('end').value = String(initialStart + 1);

    // Update the summary whenever the user changes the booking.
    ['date', 'start', 'end'].forEach(id => {
      $(id).addEventListener('change', update);
    });

    $('confirm').addEventListener('click', confirmReservation);

    $('cancel').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    update();

  } catch (error) {
    console.error('Could not load reservation page:', error);

    showMessage(
      'Could not load room information. Please try again.',
      true
    );
  }
}

init();
