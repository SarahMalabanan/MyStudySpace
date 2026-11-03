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
  else if (isRangeBooked(room.id, $('date').value, start, end)) error = 'That time overlaps an existing reservation.';

  $('s-room').textContent = room.name;
  $('s-date').textContent = $('date').value;
  $('s-time').textContent = `${fmtHour(start)} – ${fmtHour(end)}`;
  $('s-floor').textContent = `${room.library}, ${floorName(room.floor)}`;
  $('msg').textContent = error;
  $('msg').className = 'msg error';
  $('confirm').disabled = Boolean(error);
}

async function init() {
  // The link from the map carries only the room id, date and start time.
  // Everything else (photo, seats, features, library...) is loaded fresh from the API.
  let all = [];
  try { all = await getRooms(); } catch { all = []; }
  room = all.find((r) => r.id === Number(params.get('room')));
  if (!room) {
    document.querySelector('main').innerHTML =
      '<section class="panel"><h2>Room not found</h2><p>We could not load that room.</p><a href="index.html">Back to Find a Room</a></section>';
    return;
  }

  $('room-info').innerHTML = `
    <h2>${room.name}</h2>
    ${roomPhotoHtml(room)}
    <div>Seats ${room.seats}</div>
    ${featureListHtml(room, libraryFeatures(all.filter((r) => r.library === room.library)))}
    <div>${room.library} · ${floorName(room.floor)}</div>
    ${room.description ? `<p>${room.description}</p>` : ''}`;

  const start = Number(params.get('start')) || 13;
  $('date').value = params.get('date') || today();
  $('start').innerHTML = hourOptions(8, 20, false);
  $('end').innerHTML = hourOptions(9, 21, false);
  $('start').value = start;
  $('end').value = start + 1;
  ['date', 'start', 'end'].forEach((id) => $(id).addEventListener('change', update));

  $('confirm').addEventListener('click', async () => {
    try {
      await createReservation(room.id, $('date').value, Number($('start').value), Number($('end').value));
      $('msg').textContent = 'Reservation confirmed.';
      $('msg').className = 'msg ok';
    } catch {
      $('msg').textContent = 'Sorry, that time was just taken.';
      $('msg').className = 'msg error';
    }
    $('confirm').disabled = true;
  });
  $('cancel').addEventListener('click', () => { location.href = 'index.html'; });
  update();
}
init();