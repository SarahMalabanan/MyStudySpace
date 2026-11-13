
const $ = (id) => document.getElementById(id);

let room;

async function init() {
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

    // Use the date and start time passed from the room-selection page.
    $('date').min = today();
$('date').max = maxBookingDate();

const requestedDate = params.get('date') || today();

$('date').value = requestedDate;

// If the requested date is outside the allowed range, default to today.
if (
  requestedDate < today() ||
  requestedDate > maxBookingDate()
) {
  $('date').value = today();
}

    $('start').innerHTML = hourOptions(8, 20, false);
    $('end').innerHTML = hourOptions(9, 21, false);

    const selectedStart = Number(params.get('start')) || 13;
    $('start').value = selectedStart;
    $('end').value = Math.min(selectedStart + 1, 21);

    ['date', 'start', 'end'].forEach((id) => {
      $(id).addEventListener('change', update);
    });

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
  $('close-confirmation').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}


let availabilityCheckId = 0;

async function update() {
  if (!room) return;

  const requestId = ++availabilityCheckId;

  const start = Number($('start').value);
  const end = Number($('end').value);
  const date = $('date').value;

  let error = '';

  if (!date) {
    error = 'Please select a date.';
  } else if (end <= start) {
    error = 'End time must be after start time.';
  } else if (end - start > 2) {
    error = 'Reservations are limited to 2 hours.';
  }

  $('s-room').textContent = room.name || room.room_code;
  $('s-date').textContent = date;
  $('s-time').textContent = `${fmtHour(start)} – ${fmtHour(end)}`;
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
    `${fmtHour(Number(reservation.start_time.split(' ')[1].slice(0, 2)))} – ${
      fmtHour(Number(reservation.end_time.split(' ')[1].slice(0, 2)))
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
$('confirm').disabled = true;

showConfirmation(reservation);

    console.log('Reservation created:', reservation);

  } catch (error) {
    $('msg').textContent = error.message;
    $('msg').className = 'msg error';
  }
}


init();
