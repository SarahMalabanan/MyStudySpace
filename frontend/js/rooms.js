
const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const pickMode = new URLSearchParams(location.search).has('pick');

let rooms = [];
let applied = {};
let unavailableRoomIds = new Set();

const state = {
  library: null,
  floor: null,
  selected: null
};

// Account favorites
let favoriteRoomIds = new Set();
let favoritesLoaded = false;

// Library operating hours
const libraryHours = {
  union: {
    0: { open: 12, close: 23 },
    1: { open: 8, close: 23 },
    2: { open: 8, close: 23 },
    3: { open: 8, close: 23 },
    4: { open: 8, close: 23 },
    5: { open: 8, close: 20 },
    6: { open: 8, close: 16 }
  },

  jerseycity: {
    0: { open: 0, close: 0 },
    1: { open: 8, close: 20 },
    2: { open: 8, close: 20 },
    3: { open: 8, close: 20 },
    4: { open: 8, close: 20 },
    5: { open: 8, close: 18 },
    6: { open: 8, close: 16 }
  }
};

const LIBRARY_ALIASES = {
  nancythompson: 'union',
  guarini: 'jerseycity'
};

const DEFAULT_HOURS = { open: 8, close: 21 };
const DEFAULT_LIBRARY = 'Nancy Thompson Learning Commons';

let timesAvailable = true;

const floorsFor = (lib) =>
  [...new Set(
    rooms
      .filter((r) => r.library === lib)
      .map((r) => Number(r.floor))
  )].sort((a, b) => a - b);

const norm = (s) =>
  String(s).trim().toLowerCase().replace(/\s+/g, ' ');

function sameRoomId(a, b) {
  return a != null &&
    b != null &&
    String(a) === String(b);
}

function floorName(floor) {
  const names = {
    2: 'Second Floor',
    3: 'Third Floor'
  };

  return names[floor] || `Floor ${floor}`;
}

// Library operating hours helpers
function parseLocalDate(dateStr) {
  const [year, month, day] =
    String(dateStr).split('-').map(Number);

  return new Date(year, month - 1, day);
}

function resolveLibraryKey(library) {
  const normalized = String(library)
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (libraryHours[normalized]) {
    return normalized;
  }

  const alias = Object.keys(LIBRARY_ALIASES)
    .find((a) => normalized.includes(a));

  if (alias) {
    return LIBRARY_ALIASES[alias];
  }

  return Object.keys(libraryHours)
    .find((key) => normalized.includes(key)) || null;
}

function getLibraryHours(date, library) {
  if (!date) return null;

  const parsed = parseLocalDate(date);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const key = resolveLibraryKey(library);

  if (!key) {
    console.warn(
      `No operating hours configured for: ${library}`
    );
    return DEFAULT_HOURS;
  }

  return libraryHours[key][parsed.getDay()];
}

function isClosedAllDay(hours) {
  return !hours ||
    (hours.open === 0 && hours.close === 0);
}

function getEarliestStart(date, hours) {
  if (date === today()) {
    return Math.max(
      hours.open,
      new Date().getHours() + 1
    );
  }

  return hours.open;
}

function showTimeMessage(text) {
  let msg = $('time-msg');

  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'time-msg';
    msg.setAttribute('role', 'status');
    $('time').after(msg);
  }

  msg.textContent = text;
  msg.className = text ? 'msg error' : '';
}

// Floor plans
function planFor() {
  const key = Object.keys(FLOORPLANS)
    .find((k) => norm(k) === norm(state.library));

  return key
    ? FLOORPLANS[key][state.floor]
    : undefined;
}

// Search filters
function readFilters() {
  return {
    date: $('date').value,
    hour: Number($('time').value),
    floor: Number($('floor').value),
    whiteboard: $('f-whiteboard').checked,
    tv: $('f-tv').checked,
    window: $('f-window').checked,
    outlet: $('f-outlet').checked
  };
}

// Existing backend availability checks
function isAvailable(r) {
  return !unavailableRoomIds.has(Number(r.id))
    && (!applied.whiteboard || r.whiteboard)
    && (!applied.tv || r.tv)
    && (!applied.window || r.window)
    && (!applied.outlet || r.outlet);
}

async function updateAvailability() {
  if (!timesAvailable) {
    unavailableRoomIds = new Set(
      rooms.map((r) => Number(r.id))
    );

    render();
    return;
  }

  try {
    const roomIds = await getUnavailableRooms(
      applied.date,
      applied.hour,
      applied.hour + 1
    );

    unavailableRoomIds = new Set(
      roomIds.map(Number)
    );

    render();

  } catch (error) {
    console.error('Availability error:', error);

    $('map').textContent =
      'Could not check room availability. Please try again.';
  }
}

// Floor selection
function renderFloorSelect() {
  $('floor').innerHTML = floorsFor(state.library)
    .map((f) =>
      `<option value="${f}">${floorName(f)}</option>`
    ).join('');

  $('floor').value = state.floor;
}

function renderTabs() {
  $('tabs').innerHTML = floorsFor(state.library)
    .map((n) => `
      <button
        type="button"
        data-floor="${n}"
        class="${n === state.floor ? 'active' : ''}">
        ${floorName(n)}
      </button>
    `).join('');

  $('tabs').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.floor = Number(b.dataset.floor);
      $('floor').value = state.floor;
      state.selected = null;
      render();
    });
  });
}

function choose(r) {
  state.selected = r.id;
  render();
}

// Both library map implementations
function renderMap() {
  const map = $('map');
  map.innerHTML = '';

  const floorRooms = rooms.filter(
    (r) =>
      r.library === state.library &&
      Number(r.floor) === Number(state.floor)
  );

  // Frank J. Guarini Library room grid
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

      b.type = 'button';

      b.className = 'tile' +
        (ok ? '' : ' unavailable') +
        (sameRoomId(state.selected, r.id)
          ? ' selected'
          : '');

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

  // Nancy Thompson original SVG floor plan
  const plan = planFor();

  if (!plan) {
    map.textContent = 'No floor plan available.';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'plan';

  const img = document.createElement('img');
  img.src = plan.image;
  img.alt =
    `${state.library}, ${floorName(state.floor)} floor plan`;

  const svg = document.createElementNS(SVG_NS, 'svg');

  svg.setAttribute(
    'viewBox',
    `0 0 ${plan.width} ${plan.height}`
  );

  floorRooms.forEach((r) => {
    const s = plan.spots[r.room_code];

    if (!s) return;

    const ok = isAvailable(r);
    const isCircle = s.length === 3;

    const shape = document.createElementNS(
      SVG_NS,
      isCircle ? 'circle' : 'rect'
    );

    if (isCircle) {
      shape.setAttribute('cx', s[0]);
      shape.setAttribute('cy', s[1]);
      shape.setAttribute('r', s[2]);
    } else {
      shape.setAttribute('x', s[0]);
      shape.setAttribute('y', s[1]);
      shape.setAttribute('width', s[2]);
      shape.setAttribute('height', s[3]);
    }

    shape.setAttribute(
      'class',
      'spot ' +
      (sameRoomId(state.selected, r.id)
        ? 'selected'
        : ok ? 'available' : 'unavailable')
    );

    shape.setAttribute('role', 'button');

    shape.setAttribute(
      'aria-label',
      `${r.name}, ${ok ? 'available' : 'unavailable'}`
    );

    const tip = document.createElementNS(
      SVG_NS,
      'title'
    );

    tip.textContent =
      `${r.name} · ${r.seats} seats` +
      (ok ? '' : ' · unavailable');

    shape.appendChild(tip);

    if (ok) {
      shape.setAttribute('tabindex', '0');

      shape.addEventListener('click', () => choose(r));

      shape.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose(r);
        }
      });
    }

    svg.appendChild(shape);
  });

  if (pickMode) {
    enablePicker(svg, plan);
  }

  wrap.append(img, svg);
  map.appendChild(wrap);
}

// Floor-plan coordinate picker
function enablePicker(svg, plan) {
  let first = null;
  let out = $('pick-out');

  if (!out) {
    out = document.createElement('div');
    out.id = 'pick-out';
    $('map').after(out);
  }

  out.textContent =
    'Pick mode: click the top-left corner of a room, ' +
    'then the bottom-right.';

  svg.style.cursor = 'crosshair';

  svg.addEventListener('click', (e) => {
    const b = svg.getBoundingClientRect();

    const x = Math.round(
      ((e.clientX - b.left) / b.width) * plan.width
    );

    const y = Math.round(
      ((e.clientY - b.top) / b.height) * plan.height
    );

    if (!first) {
      first = { x, y };

      out.textContent =
        `First corner: ${x}, ${y}. ` +
        'Now click the opposite corner.';

    } else {
      const result = [
        Math.min(first.x, x),
        Math.min(first.y, y),
        Math.abs(x - first.x),
        Math.abs(y - first.y)
      ];

      out.textContent = JSON.stringify(result);
      first = null;
    }
  });
}

// Room features
function feature(label, has) {
  return `<li class="${has ? '' : 'no'}">${label}</li>`;
}

function libraryFeatures(libraryRooms) {
  const features = [];

  if (libraryRooms.some((r) => r.whiteboard)) {
    features.push(['whiteboard', 'Whiteboard']);
  }

  if (libraryRooms.some((r) => r.tv)) {
    features.push(['tv', 'TV']);
  }

  if (libraryRooms.some((r) => r.window)) {
    features.push(['window', 'Window']);
  }

  if (libraryRooms.some((r) => r.outlet)) {
    features.push(['outlet', 'Outlet']);
  }

  return features;
}

// Account favorites
async function loadFavorites() {
  favoritesLoaded = false;
  favoriteRoomIds.clear();
  updateFavoriteButton();

  try {
    const response = await fetch(
      '/api/accounts/favorites',
      {
        credentials: 'same-origin',
        cache: 'no-store'
      }
    );

    if (!response.ok) return;

    const favorites = await response.json();

    if (!Array.isArray(favorites)) {
      throw new Error('Invalid favorites response.');
    }

    favoriteRoomIds = new Set(
      favorites.map((room) => String(room.id))
    );

    favoritesLoaded = true;

  } catch (error) {
    console.error(
      'Could not load favorite rooms:',
      error
    );

  } finally {
    updateFavoriteButton();
  }
}

function updateFavoriteButton() {
  const button = $('favorite-room');

  if (!button) return;

  if (!favoritesLoaded || state.selected == null) {
    button.hidden = true;
    return;
  }

  const saved = favoriteRoomIds.has(
    String(state.selected)
  );

  button.hidden = false;
  button.textContent =
    saved ? '♥ Unsave' : '♡ Save Room';

  button.setAttribute(
    'aria-pressed',
    String(saved)
  );

  button.title = saved
    ? 'Remove this room from your favorites'
    : 'Save this room to your favorites';

  button.style.backgroundColor =
    saved ? 'var(--primary)' : '';

  button.style.color =
    saved ? 'white' : '';
}

// Room details and reservation navigation
function renderDetail() {
  const r = rooms.find(
    (x) => sameRoomId(x.id, state.selected)
  );

  if (!r) {
    $('detail').innerHTML =
      '<h2>Room details</h2>' +
      '<p class="empty">' +
      'Click an available room on the map ' +
      'to see its details.' +
      '</p>';

    return;
  }

  const available = isAvailable(r);

  $('detail').innerHTML = `
    <h2>${r.name}</h2>

    ${roomPhotoHtml(r)}

    <div>Seats ${r.seats}</div>

    ${featureListHtml(
      r,
      libraryFeatures(
        rooms.filter((x) => x.library === r.library)
      )
    )}

    <div>
      ${applied.date} · ${fmtHour(applied.hour)}
    </div>

    <div class="status">
      ${available ? 'Available' : 'Unavailable'}
    </div>

    <button
      class="btn"
      id="select-room"
      type="button"
      ${available ? '' : 'disabled'}>
      Select room
    </button>

    <button
      class="btn secondary"
      id="favorite-room"
      type="button"
      hidden
      aria-pressed="false">
      ♡ Save Room
    </button>
  `;

  // Preserve existing reservation route
  $('select-room').addEventListener('click', () => {
    if (!available) return;

    const params = new URLSearchParams({
      room: r.id,
      date: applied.date,
      start: applied.hour
    });

    location.href = `/reserve?${params.toString()}`;
  });

  // Save or unsave favorite room
  $('favorite-room').addEventListener(
    'click',
    async () => {
      if (!favoritesLoaded) return;

      const button = $('favorite-room');
      const roomId = String(r.id);

      const alreadySaved =
        favoriteRoomIds.has(roomId);

      button.disabled = true;

      try {
        const response = await fetch(
          '/api/accounts/favorites',
          {
            method: alreadySaved ? 'DELETE' : 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
              roomId: r.id
            })
          }
        );

        if (!response.ok) {
          let message =
            'Could not update favorite room.';

          try {
            const result = await response.json();
            message = result.error || message;
          } catch {
            // Keep default error message.
          }

          throw new Error(message);
        }

        if (alreadySaved) {
          favoriteRoomIds.delete(roomId);
        } else {
          favoriteRoomIds.add(roomId);
        }

        updateFavoriteButton();

      } catch (error) {
        alert(error.message);

      } finally {
        button.disabled = false;
      }
    }
  );

  updateFavoriteButton();
}

function render() {
  renderTabs();
  renderMap();
  renderDetail();
}

// Accessory filters
function renderFilters() {
  const keys = libraryFeatures(
    rooms.filter(
      (r) => r.library === state.library
    )
  ).map(([k]) => k);

  ['whiteboard', 'tv'].forEach((k) => {
    const show = keys.includes(k);

    $('row-' + k).hidden = !show;

    if (!show) {
      $('f-' + k).checked = false;
    }
  });
}

// Switch libraries
function setLibrary(lib) {
  state.library = lib;
  state.floor = floorsFor(lib)[0];
  state.selected = null;

  renderFloorSelect();
  renderFilters();
  updateTimeOptions();

  applied = readFilters();

  return updateAvailability();
}

// Update available reservation times
function updateTimeOptions(preferredHour) {
  if (!state.library) return;

  const date = $('date').value;
  const hours = getLibraryHours(
    date,
    state.library
  );

  if (
    isClosedAllDay(hours) ||
    getEarliestStart(date, hours) >= hours.close
  ) {
    timesAvailable = false;

    $('time').innerHTML =
      '<option value="">Closed</option>';

    $('time').disabled = true;
    $('search').disabled = true;

    showTimeMessage(
      !date
        ? 'Please select a date.'
        : isClosedAllDay(hours)
          ? 'The library is closed on this day.'
          : 'No reservation times remain today.'
    );

    return;
  }

  timesAvailable = true;
  $('time').disabled = false;
  $('search').disabled = false;

  showTimeMessage('');

  const earliestHour = getEarliestStart(
    date,
    hours
  );

  const lastHour = hours.close - 1;

  $('time').innerHTML = hourOptions(
    earliestHour,
    lastHour,
    false
  );

  const keep =
    Number.isFinite(preferredHour) &&
    preferredHour >= earliestHour &&
    preferredHour <= lastHour;

  $('time').value =
    keep ? preferredHour : earliestHour;

  if (!$('time').value) {
    $('time').selectedIndex = 0;
  }
}

// Open a saved room from Account Settings
async function openSavedRoom() {
  const viewRoomId =
    new URLSearchParams(location.search)
      .get('viewRoom');

  if (!viewRoomId) return;

  const savedRoom = rooms.find(
    (room) => sameRoomId(
      room.id,
      viewRoomId
    )
  );

  if (!savedRoom) {
    console.error(
      'Could not find saved room:',
      viewRoomId
    );
    return;
  }

  $('library').value = savedRoom.library;

  await setLibrary(savedRoom.library);

  state.floor = Number(savedRoom.floor);
  $('floor').value = String(savedRoom.floor);

  applied = readFilters();
  state.selected = savedRoom.id;

  render();

  requestAnimationFrame(() => {
    $('detail').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

// Initialize homepage
async function init() {
  try {
    rooms = await getRooms();
  } catch {
    $('map').textContent =
      'Could not load rooms. Is the server running?';
    return;
  }

  const libraries = [
    ...new Set(rooms.map((r) => r.library))
  ].sort(
    (a, b) =>
      (norm(b) === norm(DEFAULT_LIBRARY)) -
      (norm(a) === norm(DEFAULT_LIBRARY))
  );

  if (!libraries.length) {
    $('map').textContent = 'No rooms found.';
    return;
  }

  $('library').innerHTML = libraries
    .map(
      (l) => `<option value="${l}">${l}</option>`
    )
    .join('');

  $('library').addEventListener(
    'change',
    () => setLibrary($('library').value)
  );

  // Booking date restrictions
  $('date').min = today();
  $('date').max = maxBookingDate();
  $('date').value = today();

  // Update hours when date changes
  const onDateChange = () => {
    const wasAvailable = timesAvailable;

    updateTimeOptions();

    if (!timesAvailable || !wasAvailable) {
      applied = readFilters();
      updateAvailability();
    }
  };

  $('date').addEventListener(
    'change',
    onDateChange
  );

  $('date').addEventListener(
    'input',
    onDateChange
  );

  // Search rooms
  $('search').addEventListener('click', () => {
    updateTimeOptions(
      Number($('time').value)
    );

    if (!timesAvailable) return;

    applied = readFilters();
    state.floor = applied.floor;
    state.selected = null;

    updateAvailability();
  });

  // Default library
  const first =
    libraries.find(
      (l) => norm(l) === norm(DEFAULT_LIBRARY)
    ) || libraries[0];

  $('library').value = first;

  await setLibrary(first);

  // Open saved rooms
  await openSavedRoom();

  // Load account favorites
  await loadFavorites();
}

init().catch((error) => {
  console.error(error);

  $('map').textContent =
    `Something went wrong loading the page: ${error.message}`;
});
