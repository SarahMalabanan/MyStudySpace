
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
    $('date').value = params.get('date') || today();

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
}

function update() {
  if (!room) return;

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
  } else if (isRangeBooked(room.id, date, start, end)) {
    error = 'That time is unavailable. Please choose another time.';
  }

  $('s-room').textContent = room.name || room.room_code;
  $('s-date').textContent = date;
  $('s-time').textContent = `${fmtHour(start)} – ${fmtHour(end)}`;
  $('s-floor').textContent = `${room.library}, ${floorName(room.floor)}`;

  $('msg').textContent = error;
  $('msg').className = error ? 'msg error' : 'msg';
  $('confirm').disabled = Boolean(error);
}

async function confirmReservation() {
  const start = Number($('start').value);
  const end = Number($('end').value);
  const date = $('date').value;

  try {
    await createReservation(room.id, date, start, end);

    $('msg').textContent = 'Reservation confirmed!';
    $('msg').className = 'msg ok';
    $('confirm').disabled = true;
  } catch (error) {
    $('msg').textContent = 'That time is unavailable. Please choose another time.';
    $('msg').className = 'msg error';
    $('confirm').disabled = true;
  }
}

init();
