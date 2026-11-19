const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const pickMode = new URLSearchParams(location.search).has('pick');
let rooms = [];
let applied = {};
let unavailableRoomIds = new Set();
const state = { library: null, floor: null, selected: null };

// Operating hours for each library building, keyed by a short name.
// Day keys follow JavaScript's getDay(): 0 = Sunday ... 6 = Saturday.
// Hours use 24-hour time. { open: 0, close: 0 } means closed all day.
// NOTE: keep this table identical to the one in reserve.js.
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

// Maps the library names stored in the database to the keys above.
// Keys are lowercase letters only (spaces and punctuation removed); a library
// name that CONTAINS the key matches, e.g. "Frank J. Guarini Library".
const LIBRARY_ALIASES = {
  nancythompson: 'union',     // Nancy Thompson Learning Commons
  guarini: 'jerseycity',      // Frank J. Guarini Library
};

// Hours used ONLY when a library name matches nothing above.
const DEFAULT_HOURS = { open: 8, close: 21 };

// True when the selected date/library has bookable times.
// When false, the time list is disabled and every room shows as unavailable.
let timesAvailable = true;

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

// Operating hours helpers

/**
 * Parse a 'YYYY-MM-DD' string as a LOCAL date.
 * new Date('2026-11-18') is parsed as UTC, which gives the previous day in
 * US time zones and would pick the wrong day's operating hours.
 */
function parseLocalDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Map a database library name to a key of libraryHours (or null). */
function resolveLibraryKey(library) {
  // Lowercase and strip spaces/punctuation:
  // "Frank J. Guarini Library" -> "frankjguarinilibrary"
  const normalized = String(library).toLowerCase().replace(/[^a-z]/g, '');

  if (libraryHours[normalized]) return normalized;

  // A name that contains an alias (or a key) matches that library.
  const alias = Object.keys(LIBRARY_ALIASES).find((a) => normalized.includes(a));
  if (alias) return LIBRARY_ALIASES[alias];

  return Object.keys(libraryHours).find((key) => normalized.includes(key)) || null;
}

/** Operating hours { open, close } for a library on a date (null if no valid date). */
function getLibraryHours(date, library) {
  if (!date) return null;

  const parsed = parseLocalDate(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const key = resolveLibraryKey(library);

  if (!key) {
    console.warn(
      `No operating hours configured for library: "${library}". Using default hours.`
    );
    return DEFAULT_HOURS;
  }

  return libraryHours[key][parsed.getDay()];
}

/** True if the library does not open at all on this day. */
function isClosedAllDay(hours) {
  return !hours || (hours.open === 0 && hours.close === 0);
}

/**
 * First hour that can be booked on a date:
 * the opening hour, or the next full hour if the date is today.
 */
function getEarliestStart(date, hours) {
  if (date === today()) {
    return Math.max(hours.open, new Date().getHours() + 1);
  }
  return hours.open;
}

/** Show (or clear) a message under the time dropdown. */
function showTimeMessage(text) {
  let msg = $('time-msg');

  // Create the message element if the page doesn't have one.
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'time-msg';
    msg.setAttribute('role', 'status');
    $('time').after(msg);
  }

  msg.textContent = text;
  msg.className = text ? 'msg error' : '';
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
  return !unavailableRoomIds.has(Number(r.id))
    && (!applied.whiteboard || r.whiteboard)
    && (!applied.tv || r.tv)
    && (!applied.window || r.window)
    && (!applied.outlet || r.outlet);
}

async function updateAvailability() {
  // Library closed (or nothing left today): no room can be booked.
  if (!timesAvailable) {
    unavailableRoomIds = new Set(rooms.map((r) => Number(r.id)));
    render();
    return;
  }

  try {
    const roomIds = await getUnavailableRooms(
      applied.date,
      applied.hour,
      applied.hour + 1
    );

    unavailableRoomIds = new Set(roomIds.map(Number));

    render();

  } catch (error) {
    console.error('Availability error:', error);
    $('map').textContent = 'Could not check room availability. Please try again.';
  }
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
  const params = new URLSearchParams({
    room: r.id,
    date: applied.date,
    start: applied.hour
  });

  location.href = `/reserve?${params.toString()}`;
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

// Switch libraries: rebuild the floor list and the time list (each library has its own hours), keep date/accessory filters
function setLibrary(lib) {
  state.library = lib;
  state.floor = floorsFor(lib)[0];
  state.selected = null;
  renderFloorSelect();
  renderFilters();

  // Must run BEFORE readFilters() so the new library's hours are used.
  updateTimeOptions();

  applied = readFilters();
  updateAvailability();
}

/**
 * Rebuild the time dropdown for the selected date AND selected library.
 * - Only hours inside that day's operating hours are offered
 *   (the last start is one hour before closing, since a slot is 1 hour).
 * - On today's date, hours that already passed are removed.
 * - On a closed day the dropdown is disabled and searching is blocked.
 * preferredHour (optional) is kept if it is still allowed; otherwise the
 * earliest available hour is selected.
 */
function updateTimeOptions(preferredHour) {
  if (!state.library) return;

  const date = $('date').value;
  const hours = getLibraryHours(date, state.library);

  // Closed all day, no valid date, or no hours left today.
  if (isClosedAllDay(hours) || getEarliestStart(date, hours) >= hours.close) {
    timesAvailable = false;
    $('time').innerHTML = '<option value="">Closed</option>';
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

  const earliestHour = getEarliestStart(date, hours);
  const lastHour = hours.close - 1; // a 1-hour slot must end by closing

  $('time').innerHTML = hourOptions(earliestHour, lastHour, false);

  const keep =
    Number.isFinite(preferredHour) &&
    preferredHour >= earliestHour &&
    preferredHour <= lastHour;

  $('time').value = keep ? preferredHour : earliestHour;

  // Safety net: never leave the dropdown blank.
  if (!$('time').value) $('time').selectedIndex = 0;
}

async function init() {
  try { rooms = await getRooms(); }
  catch { $('map').textContent = 'Could not load rooms. Is the server running?'; return; }

  const libraries = [...new Set(rooms.map((r) => r.library))]
    .sort((a, b) => (norm(b) === norm(DEFAULT_LIBRARY)) - (norm(a) === norm(DEFAULT_LIBRARY)));
  if (!libraries.length) { $('map').textContent = 'No rooms found.'; return; }
  $('library').innerHTML = libraries.map((l) => `<option value="${l}">${l}</option>`).join('');
  $('library').addEventListener('change', () => setLibrary($('library').value));

  $('date').min = today();
  $('date').max = maxBookingDate();
  $('date').value = today();

  // Each date has its own hours: rebuild the times when the date changes.
  // 'input' is also listened to because some browsers fire it before 'change'.
  const onDateChange = () => {
    const wasAvailable = timesAvailable;
    updateTimeOptions();
    // Closed days block every room right away, and coming back to an open
    // day clears that blocked state. (Normal searches still use the button.)
    if (!timesAvailable || !wasAvailable) {
      applied = readFilters();
      updateAvailability();
    }
  };
  $('date').addEventListener('change', onDateChange);
  $('date').addEventListener('input', onDateChange);

  $('search').addEventListener('click', () => {
    // Refresh the list first: the page may have been open long enough for
    // the selected hour to pass. The current choice is kept if still valid.
    updateTimeOptions(Number($('time').value));
    if (!timesAvailable) return;

    applied = readFilters();
    state.floor = applied.floor;
    state.selected = null;
    updateAvailability();
  });

  const first = libraries.find((l) => norm(l) === norm(DEFAULT_LIBRARY)) || libraries[0];
  $('library').value = first;

  // setLibrary() builds the time list for this library and the chosen date.
  setLibrary(first);
}
init().catch((e) => {
  console.error(e);
  $('map').textContent = `Something went wrong loading the page: ${e.message}`;
});