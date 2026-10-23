const $ = (id) => document.getElementById(id);
let rooms = [];
let applied = {};
const state = { floor: 2, selected: null };

function readFilters() {
  return {
    date: $('date').value, hour: Number($('time').value), floor: Number($('floor').value),
    whiteboard: $('f-whiteboard').checked, window: $('f-window').checked, outlet: $('f-outlet').checked,
  };
}

function isAvailable(r) {
  return (!applied.whiteboard || r.whiteboard)
    && (!applied.window || r.window)
    && (!applied.outlet || r.outlet);
}

function renderTabs() {
  $('tabs').innerHTML = Object.entries(FLOOR_NAMES).map(([n, name]) =>
    `<button data-floor="${n}" class="${Number(n) === state.floor ? 'active' : ''}">${name}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.floor = Number(b.dataset.floor);
    $('floor').value = state.floor;
    state.selected = null;
    render();
  }));
}

function renderMap() {
  const map = $('map');
  map.innerHTML = '';
  rooms.filter((r) => r.floor === state.floor).forEach((r) => {
    const tile = document.createElement('button');
    const ok = isAvailable(r);
    tile.className = 'tile' + (ok ? '' : ' unavailable') + (state.selected === r.id ? ' selected' : '');
    tile.textContent = r.room_code;
    tile.disabled = !ok;
    tile.setAttribute('aria-label', `${r.name}, ${ok ? 'available' : 'unavailable'}`);
    tile.addEventListener('click', () => { state.selected = r.id; render(); });
    map.appendChild(tile);
  });
}

function feature(label, has) { return `<li class="${has ? '' : 'no'}">${label}</li>`; }

function renderDetail() {
  const r = rooms.find((x) => x.id === state.selected);
  if (!r) {
    $('detail').innerHTML = '<h2>Room details</h2><p class="empty">Pick an available room on the map to see its details.</p>';
    return;
  }
  $('detail').innerHTML = `
    <h2>${r.name}</h2>
    <div class="photo">Room photo</div>
    <div>Seats ${r.seats}</div>
    <ul class="features">${feature('Whiteboard', r.whiteboard)}${feature('Window', r.window)}${feature('Outlet', r.outlet)}</ul>
    <div>${applied.date} · ${fmtHour(applied.hour)}</div>
    <div class="status">Available</div>
    <button class="btn" id="select-room">Select room</button>`;
  $('select-room').addEventListener('click', () => {
    location.href = `reserve.html?room=${r.id}&date=${applied.date}&start=${applied.hour}`;
  });
}

function render() { renderTabs(); renderMap(); renderDetail(); }

async function init() {
  try {
    rooms = await getRooms();

    $('date').value = today();

    $('time').innerHTML = hourOptions(8, 20, true);
    $('time').value = '13';

    applied = readFilters();
    state.floor = applied.floor;

    $('search').addEventListener('click', () => {
      applied = readFilters();
      state.floor = applied.floor;
      state.selected = null;
      render();
    });

    render();

  } catch (err) {
    console.error('Error loading rooms:', err);

    $('map').innerHTML = `
      <p class="empty">
        Could not load rooms. Please check your database connection.
      </p>
    `;

    $('detail').innerHTML = `
      <h2>Room details</h2>
      <p class="empty">Rooms could not be loaded.</p>
    `;
  }
}
init();