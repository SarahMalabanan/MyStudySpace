const $ = (id) => document.getElementById(id);

// Use the original mock room data instead of the database API.
let room;

function update() {
  const start = Number($('start').value);
  const end = Number($('end').value);
  const hours = end - start;

  let error = '';

  if (hours <= 0) {
    error = 'End time must be after start time.';
  } else if (hours > 2) {
    error = 'Reservations are limited to 2 hours.';
  } else if (
    room.booked &&
    room.booked.some((hour) => hour >= start && hour < end)
  ) {
    error = 'That time is unavailable. Please choose another time.';
  }

  $('s-room').textContent = room.name;
  $('s-date').textContent = $('date').value;
  $('s-time').textContent = `${fmtHour(start)} – ${fmtHour(end)}`;
  $('s-floor').textContent = `Nancy Thompson Learning Commons, ${floorName(room.floor)}`;

  $('msg').textContent = error;
  $('msg').className = 'msg error';
  $('confirm').disabled = Boolean(error);
}

function init() {
  // Use the same mock room every time, regardless of which room was clicked.
  room = MOCK_ROOMS1[0];

$('room-info').innerHTML = `
  <h2>${room.name}</h2>
  ${roomPhotoHtml(room)}
  <div>Seats ${room.seats}</div>
    <ul class="features">
      <li>Whiteboard</li>
      <li>Outlet</li>
    </ul>
    <div>Nancy Thompson Learning Commons · ${floorName(room.floor)}</div>
  `;

  $('date').value = today();
  $('start').innerHTML = hourOptions(8, 20, false);
  $('end').innerHTML = hourOptions(9, 21, false);

  $('start').value = 13;
  $('end').value = 14;

  ['date', 'start', 'end'].forEach((id) => {
    $(id).addEventListener('change', update);
  });

  $('confirm').addEventListener('click', () => {
    $('msg').textContent = 'Mock reservation confirmed!';
    $('msg').className = 'msg ok';
    $('confirm').disabled = true;
  });

  $('cancel').addEventListener('click', () => {
    location.href = 'index.html';
  });

  update();
}

init();