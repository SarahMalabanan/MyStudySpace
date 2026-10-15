const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
let room;

function update() {
  const start = Number($('start').value);
  const end = Number($('end').value);
  const hours = end - start;
  let error = '';
  if (hours <= 0) error = 'End time must be after start time.';
  else if (hours > 2) error = 'Reservations are limited to 2 hours.';
  else if (room.booked.includes(start)) error = 'That start time is already booked.';

  $('s-room').textContent = room.name;
  $('s-date').textContent = $('date').value;
  $('s-time').textContent = `${fmtHour(start)} – ${fmtHour(end)}`;
  $('s-floor').textContent = FLOOR_NAMES[room.floor];
  $('msg').textContent = error;
  $('msg').className = 'msg error';
  $('confirm').disabled = Boolean(error);
}

async function init() {
  room = (await getRoom(params.get('room'))) || MOCK_ROOMS[0];
  const f = (label, has) => `<li class="${has ? '' : 'no'}">${label}</li>`;
  $('room-info').innerHTML = `
    <h2>${room.name}</h2>
    <div class="photo">Room photo</div>
    <div>Seats ${room.seats}</div>
    <ul class="features">${f('Whiteboard', room.whiteboard)}${f('Window', room.window)}${f('Outlet', room.outlet)}</ul>
    <div>${FLOOR_NAMES[room.floor]}</div>`;

  const start = Number(params.get('start')) || 13;
  $('date').value = params.get('date') || today();
  $('start').innerHTML = hourOptions(8, 20, false);
  $('end').innerHTML = hourOptions(9, 21, false);
  $('start').value = start;
  $('end').value = start + 1;
  ['date', 'start', 'end'].forEach((id) => $(id).addEventListener('change', update));

  $('confirm').addEventListener('click', () => {
    // Later: POST to /api/reservations
    $('msg').textContent = 'Reservation confirmed (demo only, nothing is saved yet).';
    $('msg').className = 'msg ok';
    $('confirm').disabled = true;
  });
  $('cancel').addEventListener('click', () => { location.href = 'index.html'; });
  update();
}
init();