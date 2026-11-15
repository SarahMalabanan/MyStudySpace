
const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const pickMode = new URLSearchParams(location.search).has('pick');

let rooms = [];
let applied = {};

// I keep the saved room IDs separate from the room map data.
let favoriteRoomIds = new Set();
let favoritesLoaded = false;

const state = {
  library: null,
  floor: null,
  selected: null
};

const floorsFor = (lib) =>
  [...new Set(
    rooms.filter((r) => r.library === lib).map((r) => Number(r.floor))
  )].sort((a, b) => a - b);

const DEFAULT_LIBRARY = 'Nancy Thompson Learning Commons';

const norm = (s) =>
  String(s).trim().toLowerCase().replace(/\s+/g, ' ');

// I compare IDs as strings because the API may return numbers or strings.
function sameRoomId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function floorName(floor) {
  const names = {
    2: 'Second Floor',
    3: 'Third Floor'
  };

  return names[floor] || `Floor ${floor}`;
}

// Match the library name to its floor plan.
function planFor() {
  const key = Object.keys(FLOORPLANS)
    .find((k) => norm(k) === norm(state.library));

  return key ? FLOORPLANS[key][state.floor] : undefined;
}

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

function isAvailable(r) {
  return !isRangeBooked(r.id, applied.date, applied.hour, applied.hour + 1)
    && (!applied.whiteboard || r.whiteboard)
    && (!applied.tv || r.tv)
    && (!applied.window || r.window)
    && (!applied.outlet || r.outlet);
}

function renderFloorSelect() {
  $('floor').innerHTML = floorsFor(state.library)
    .map((f) => `<option value="${f}">${floorName(f)}</option>`)
    .join('');

  $('floor').value = state.floor;
}

function renderTabs() {
  $('tabs').innerHTML = floorsFor(state.library)
    .map((n) =>
      `<button data-floor="${n}" class="${n === state.floor ? 'active' : ''}">
        ${floorName(n)}
      </button>`
    ).join('');

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

function renderMap() {
  const map = $('map');
  map.innerHTML = '';

  const floorRooms = rooms.filter(
    (r) =>
      r.library === state.library &&
      Number(r.floor) === Number(state.floor)
  );

  // FRANK J. GUARINI LIBRARY: Keep the existing room grid.
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
        (sameRoomId(state.selected, r.id) ? ' selected' : '');

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

  // NANCY THOMPSON: Keep the original interactive floor-plan map.
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

    // Skip rooms without a mapped location.
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
      (sameRoomId(state.selected, r.id)
        ? 'selected'
        : ok ? 'available' : 'unavailable')
    );

    rect.setAttribute('role', 'button');

    rect.setAttribute(
      'aria-label',
      `${r.name}, ${ok ? 'available' : 'unavailable'}`
    );

    const tip = document.createElementNS(SVG_NS, 'title');

    tip.textContent =
      `${r.name} · ${r.seats} seats${ok ? '' : ' · unavailable'}`;

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

// Pick mode helps find room coordinates on the floor plan.
function enablePicker(svg, plan) {
  let first = null;
  let out = $('pick-out');

  if (!out) {
    out = document.createElement('div');
    out.id = 'pick-out';
    $('map').after(out);
  }

  out.textContent =
    'Pick mode: click the top-left corner of a room, then the bottom-right.';

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
        `First corner: ${x}, ${y}. Now click the opposite corner.`;
    } else {
      out.textContent = [
        Math.min(first.x, x),
        Math.min(first.y, y),
        Math.abs(x - first.x),
        Math.abs(y - first.y)
      ].join(', ');

      out.textContent = `[${out.textContent}]`;
      first = null;
    }
  });
}

function feature(label, has) {
  return `<li class="${has ? '' : 'no'}">${label}</li>`;
}

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

// FAVORITES: Load the current account's saved rooms from MySQL.
// The server identifies the account using its login session cookie.
// Guests cannot access the Favorites API.
async function loadFavorites() {
  favoritesLoaded = false;
  favoriteRoomIds.clear();
  updateFavoriteButton();

  try {
    const response = await fetch('/api/accounts/favorites', {
      credentials: 'same-origin',
      cache: 'no-store'
    });

    // A guest or expired session cannot manage saved rooms.
    if (!response.ok) {
      return;
    }

    const favorites = await response.json();

    if (!Array.isArray(favorites)) {
      throw new Error('Invalid favorites response.');
    }

    // A Set makes it easy to check whether a room is already saved.
    favoriteRoomIds = new Set(
      favorites.map(room => String(room.id))
    );

    favoritesLoaded = true;

  } catch (error) {
    console.error('Could not load favorite rooms:', error);

  } finally {
    // Update the button if room details are already displayed.
    updateFavoriteButton();
  }
}

// FAVORITES: Update the button whenever a room is selected.
// We read from the saved room IDs instead of assuming every room is new.
function updateFavoriteButton() {
  const button = $('favorite-room');

  if (!button) return;

  // Hide Favorites when there is no verified account connection.
  if (!favoritesLoaded) {
    button.hidden = true;
    return;
  }

  const saved = favoriteRoomIds.has(String(state.selected));

  button.hidden = false;
  button.textContent = saved ? '♥ Unsave' : '♡ Save Room';
  button.setAttribute('aria-pressed', String(saved));
  button.title = saved
    ? 'Remove this room from your favorites'
    : 'Save this room to your favorites';

  // Give an already saved room a subtle filled appearance.
  button.style.backgroundColor = saved ? 'var(--primary)' : '';
  button.style.color = saved ? 'white' : '';
}

// Display the selected room's details and reservation button.
function renderDetail() {
  const r = rooms.find(
    (x) => sameRoomId(x.id, state.selected)
  );

  if (!r) {
    $('detail').innerHTML =
      '<h2>Room details</h2>' +
      '<p class="empty">Click an available room on the map to see its details.</p>';

    return;
  }

  // Check availability before allowing a reservation.
  const available = isAvailable(r);

  $('detail').innerHTML = `
    <h2>${r.name}</h2>
    ${roomPhotoHtml(r)}
    <div>Seats ${r.seats}</div>
    ${featureListHtml(
      r,
      libraryFeatures(rooms.filter((x) => x.library === r.library))
    )}
    <div>${applied.date} · ${fmtHour(applied.hour)}</div>
    <div class="status">
      ${available ? 'Available' : 'Unavailable'}
    </div>

    <button class="btn" id="select-room" ${available ? '' : 'disabled'}>
      Select room
    </button>

    <button class="btn secondary" id="favorite-room"
            type="button" hidden aria-pressed="false">
      ♡ Save Room
    </button>
  `;

  // Keep the existing reservation button working.
  $('select-room').addEventListener('click', () => {
    if (!available) return;

    location.href =
      `reserve.html?room=${r.id}&date=${applied.date}&start=${applied.hour}`;
  });

  // FAVORITES: The same button can save or remove a favorite.
  // POST adds a room and DELETE removes it from favorite_rooms in MySQL.
  $('favorite-room').addEventListener('click', async () => {
    if (!favoritesLoaded) return;

    const button = $('favorite-room');
    const roomId = String(r.id);

    // Check its status before deciding which request to send.
    const alreadySaved = favoriteRoomIds.has(roomId);

    button.disabled = true;

    try {
      const response = await fetch('/api/accounts/favorites', {
        method: alreadySaved ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          roomId: r.id
        })
      });

      if (!response.ok) {
        let message = 'Could not update favorite room.';

        try {
          const result = await response.json();
          message = result.error || message;
        } catch (error) {
          // Keep the default message if the server returns no JSON.
        }

        throw new Error(message);
      }

      // Only update the saved IDs after MySQL confirms success.
      if (alreadySaved) {
        favoriteRoomIds.delete(roomId);
      } else {
        favoriteRoomIds.add(roomId);
      }

      // Switch between Save Room and Unsave without refreshing.
      updateFavoriteButton();

    } catch (error) {
      alert(error.message);

    } finally {
      button.disabled = false;
    }
  });

  // Show the correct heart status every time room details open.
  updateFavoriteButton();
}

function render() {
  renderTabs();
  renderMap();
  renderDetail();
}

// Show only the accessory filters available at the selected library.
function renderFilters() {
  const keys = libraryFeatures(
    rooms.filter((r) => r.library === state.library)
  ).map(([k]) => k);

  ['whiteboard', 'tv'].forEach((k) => {
    const show = keys.includes(k);

    $('row-' + k).hidden = !show;

    if (!show) {
      $('f-' + k).checked = false;
    }
  });
}

// Switch libraries while keeping the existing search filters.
function setLibrary(lib) {
  state.library = lib;
  state.floor = floorsFor(lib)[0];
  state.selected = null;

  renderFloorSelect();
  renderFilters();

  applied = readFilters();

  render();
}

// Open a favorite room using the room ID sent from Account Settings.
function openSavedRoom() {
  const viewRoomId =
    new URLSearchParams(location.search).get('viewRoom');

  if (!viewRoomId) return;

  const savedRoom = rooms.find(
    (room) => sameRoomId(room.id, viewRoomId)
  );

  if (!savedRoom) {
    console.error('Could not find saved room:', viewRoomId);
    return;
  }

  // Switch to the library containing the saved room.
  $('library').value = savedRoom.library;
  setLibrary(savedRoom.library);

  // Select the saved room's floor.
  state.floor = Number(savedRoom.floor);
  $('floor').value = String(savedRoom.floor);

  // Keep the current search filters consistent with the floor.
  applied = readFilters();

  // Select the room using its ID from the Rooms API.
  state.selected = savedRoom.id;

  // Reuse the existing map and room details panel.
  render();

  // Automatically scroll to the selected room's details.
  requestAnimationFrame(() => {
    $('detail').scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

// Load rooms and set up the homepage.
async function init() {
  try {
    rooms = await getRooms();
  } catch {
    $('map').textContent =
      'Could not load rooms. Is the server running?';
    return;
  }

  const libraries = [...new Set(rooms.map((r) => r.library))]
    .sort((a, b) =>
      (norm(b) === norm(DEFAULT_LIBRARY)) -
      (norm(a) === norm(DEFAULT_LIBRARY))
    );

  if (!libraries.length) {
    $('map').textContent = 'No rooms found.';
    return;
  }

  $('library').innerHTML = libraries
    .map((l) => `<option value="${l}">${l}</option>`)
    .join('');

  $('library').addEventListener('change', () => {
    setLibrary($('library').value);
  });

  $('date').value = today();
  $('time').innerHTML = hourOptions(8, 20, true);
  $('time').value = 13;

  $('search').addEventListener('click', () => {
    applied = readFilters();
    state.floor = applied.floor;
    state.selected = null;
    render();
  });

  const first =
    libraries.find((l) => norm(l) === norm(DEFAULT_LIBRARY)) ||
    libraries[0];

  $('library').value = first;
  setLibrary(first);

  // Keep the working Account Settings View shortcut.
  openSavedRoom();

  // Load favorites after the room map is initialized.
  // This also updates the heart if a saved room was opened directly.
  await loadFavorites();
}

init().catch((e) => {
  console.error(e);

  $('map').textContent =
    `Something went wrong loading the page: ${e.message}`;
});
