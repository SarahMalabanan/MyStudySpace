const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const pickMode = new URLSearchParams(location.search).has('pick');
let rooms = [];
let applied = {};
const state = { library: null, floor: null, selected: null };

const floorsFor = (lib) =>
  [...new Set(rooms.filter((r) => r.library === lib).map((r) => r.floor))].sort((a, b) => a - b);
const DEFAULT_LIBRARY = 'Nancy Thompson Learning Commons';
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

function floorName(floor) {
  const names = {
    2: 'Second Floor',
    3: 'Third Floor',
  };

  return names[floor] || `Floor ${floor}`;
}


// Match the library name to a floor plan ignoring extra spaces and capital letters
function planFor() {
  const key = Object.keys(FLOORPLANS).find((k) => norm(k) === norm(state.library));
  return key ? FLOORPLANS[key][state.floor] : undefined;
}

function readFilters() {
  return {
    date: $('date').value, hour: Number($('time').value), floor: Number($('floor').value),
    whiteboard: $('f-whiteboard').checked, tv: $('f-tv').checked, window: $('f-window').checked, outlet: $('f-outlet').checked,
  };
}

function isAvailable(r) {
  return !isRangeBooked(r.id, applied.date, applied.hour, applied.hour + 1)
    && (!applied.whiteboard || r.whiteboard)
    && (!applied.tv || r.tv)
    && (!applied.window || r.window)
    && (!applied.outlet || r.outlet);
}

function renderFloorSelect() {
  $('floor').innerHTML = floorsFor(state.library)
    .map((f) => `<option value="${f}">${floorName(f)}</option>`).join('');
  $('floor').value = state.floor;
}

function renderTabs() {
  $('tabs').innerHTML = floorsFor(state.library).map((n) =>
    `<button data-floor="${n}" class="${n === state.floor ? 'active' : ''}">${floorName(n)}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.floor = Number(b.dataset.floor);
    $('floor').value = state.floor;
    state.selected = null;
    render();
  }));
}

function choose(r) { state.selected = r.id; render(); }
function renderMap() {
  const map = $('map');
  map.innerHTML = '';

  const floorRooms = rooms.filter(
    (r) => r.library === state.library && r.floor === state.floor
  );

  // FRANK J. GUARINI LIBRARY: Show rooms as a grid
  if (norm(state.library) !== norm(DEFAULT_LIBRARY)) {
    if (!floorRooms.length) {
      map.textContent = 'No rooms on this floor.';
      return;
    }

    const box = document.createElement('div');
    box.className = 'others solo';

    const grid = document.createElement('div');
    grid.className = 'list';

    floorRooms.forEach((r) => {
      const ok = isAvailable(r);

      const b = document.createElement('button');
      b.className = 'tile' +
        (ok ? '' : ' unavailable') +
        (state.selected === r.id ? ' selected' : '');

      b.innerHTML = `
        <span>${r.room_code}</span>
        <small>${r.seats} seats</small>
      `;

      b.disabled = !ok;
      b.setAttribute(
        'aria-label',
        `${r.name}, ${ok ? 'available' : 'unavailable'}`
      );

      b.addEventListener('click', () => choose(r));

      grid.appendChild(b);
    });

    box.appendChild(grid);
    map.appendChild(box);
    return;
  }

  // NANCY THOMPSON: Keep the original floor-plan map
  const plan = planFor();

  if (!plan) {
    map.textContent = 'No floor plan available.';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'plan';

  const img = document.createElement('img');
  img.src = plan.image;
  img.alt = `${state.library}, ${floorName(state.floor)} floor plan`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${plan.width} ${plan.height}`);

  floorRooms.forEach((r) => {
    const s = plan.spots[r.room_code];

    // Skip rooms without a mapped location
    if (!s) return;

    const ok = isAvailable(r);
    const isCircle = s.length === 3;

    const rect = document.createElementNS(
      SVG_NS,
      isCircle ? 'circle' : 'rect'
    );

    if (isCircle) {
      rect.setAttribute('cx', s[0]);
      rect.setAttribute('cy', s[1]);
      rect.setAttribute('r', s[2]);
    } else {
      rect.setAttribute('x', s[0]);
      rect.setAttribute('y', s[1]);
      rect.setAttribute('width', s[2]);
      rect.setAttribute('height', s[3]);
    }

    rect.setAttribute(
      'class',
      'spot ' +
      (state.selected === r.id
        ? 'selected'
        : ok ? 'available' : 'unavailable')
    );

    rect.setAttribute('role', 'button');
    rect.setAttribute('aria-label',
      `${r.name}, ${ok ? 'available' : 'unavailable'}`
    );

    const tip = document.createElementNS(SVG_NS, 'title');
    tip.textContent = `${r.name} · ${r.seats} seats${ok ? '' : ' · unavailable'}`;
    rect.appendChild(tip);

    if (ok) {
      rect.setAttribute('tabindex', '0');
      rect.addEventListener('click', () => choose(r));

      rect.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose(r);
        }
      });
    }

    svg.appendChild(rect);
  });

  if (pickMode) enablePicker(svg, plan);

  wrap.append(img, svg);
  map.appendChild(wrap);
}

// Add ?pick to the URL, then click two opposite corners of a room to get its [x, y, w, h]
function enablePicker(svg, plan) {
  let first = null;
  let out = $('pick-out');
  if (!out) { out = document.createElement('div'); out.id = 'pick-out'; $('map').after(out); }
  out.textContent = 'Pick mode: click the top-left corner of a room, then the bottom-right.';
  svg.style.cursor = 'crosshair';
  svg.addEventListener('click', (e) => {
    const b = svg.getBoundingClientRect();
    const x = Math.round(((e.clientX - b.left) / b.width) * plan.width);
    const y = Math.round(((e.clientY - b.top) / b.height) * plan.height);
    if (!first) { first = { x, y }; out.textContent = `First corner: ${x}, ${y}. Now click the opposite corner.`; }
    else {
      out.textContent = `[${Math.min(first.x, x)}, ${Math.min(first.y, y)}, ${Math.abs(x - first.x)}, ${Math.abs(y - first.y)}]`;
      first = null;
    }
  });
}

function feature(label, has) { return `<li class="${has ? '' : 'no'}">${label}</li>`; }

function libraryFeatures(libraryRooms) {
  const features = [];

  if (libraryRooms.some(r => r.whiteboard)) {
    features.push(['whiteboard', 'Whiteboard']);
  }

  if (libraryRooms.some(r => r.tv)) {
    features.push(['tv', 'TV']);
  }

  if (libraryRooms.some(r => r.window)) {
    features.push(['window', 'Window']);
  }

  if (libraryRooms.some(r => r.outlet)) {
    features.push(['outlet', 'Outlet']);
  }

  return features;
}

function renderDetail() {
  const r = rooms.find((x) => x.id === state.selected);
  if (!r) {
    $('detail').innerHTML = '<h2>Room details</h2><p class="empty">Click an available room on the map to see its details.</p>';
    return;
  }
  $('detail').innerHTML = `
    <h2>${r.name}</h2>
    ${roomPhotoHtml(r)}
    <div>Seats ${r.seats}</div>
    ${featureListHtml(r, libraryFeatures(rooms.filter((x) => x.library === r.library)))}
    <div>${applied.date} · ${fmtHour(applied.hour)}</div>
    <div class="status">Available</div>
    <button class="btn" id="select-room">Select room</button>`;
  $('select-room').addEventListener('click', () => {
    location.href = `reserve.html?room=${r.id}&date=${applied.date}&start=${applied.hour}`;
  });
}

function render() { renderTabs(); renderMap(); renderDetail(); }

// Show only the accessory filters this library has (e.g. TV instead of Whiteboard)
function renderFilters() {
  const keys = libraryFeatures(rooms.filter((r) => r.library === state.library)).map(([k]) => k);
  ['whiteboard', 'tv'].forEach((k) => {
    const show = keys.includes(k);
    $('row-' + k).hidden = !show;
    if (!show) $('f-' + k).checked = false;
  });
}

// Switch libraries: rebuild the floor list, keep date/time/accessory filters
function setLibrary(lib) {
  state.library = lib;
  state.floor = floorsFor(lib)[0];
  state.selected = null;
  renderFloorSelect();
  renderFilters();
  applied = readFilters();
  render();
}

async function init() {
  try { rooms = await getRooms(); }
  catch { $('map').textContent = 'Could not load rooms. Is the server running?'; return; }

  const libraries = [...new Set(rooms.map((r) => r.library))]
    .sort((a, b) => (norm(b) === norm(DEFAULT_LIBRARY)) - (norm(a) === norm(DEFAULT_LIBRARY)));
  if (!libraries.length) { $('map').textContent = 'No rooms found.'; return; }
  $('library').innerHTML = libraries.map((l) => `<option value="${l}">${l}</option>`).join('');
  $('library').addEventListener('change', () => setLibrary($('library').value));

  $('date').value = today();
  $('time').innerHTML = hourOptions(8, 20, true);
  $('time').value = 13;
  $('search').addEventListener('click', () => {
    applied = readFilters();
    state.floor = applied.floor;
    state.selected = null;
    render();
  });

  const first = libraries.find((l) => norm(l) === norm(DEFAULT_LIBRARY)) || libraries[0];
  $('library').value = first;
  setLibrary(first);
}
init().catch((e) => {
  console.error(e);
  $('map').textContent = `Something went wrong loading the page: ${e.message}`;
});