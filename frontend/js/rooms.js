const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const pickMode = new URLSearchParams(location.search).has('pick');
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
  return !isRangeBooked(r.id, applied.date, applied.hour, applied.hour + 1)
    && (!applied.whiteboard || r.whiteboard)
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

function choose(r) { state.selected = r.id; render(); }

function renderMap() {
  const map = $('map');
  map.innerHTML = '';
  const plan = FLOORPLANS[state.floor];
  const floorRooms = rooms.filter((r) => r.floor === state.floor);
  const spotFor = (r) => plan && plan.spots[r.room_code];

  if (plan) {
    const wrap = document.createElement('div');
    wrap.className = 'plan';
    const img = document.createElement('img');
    img.src = plan.image;
    img.alt = `${FLOOR_NAMES[state.floor]} floor plan`;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${plan.width} ${plan.height}`);

    floorRooms.filter(spotFor).forEach((r) => {
      const s = spotFor(r);
      const ok = isAvailable(r);
      const isCircle = s.length === 3;
      const rect = document.createElementNS(SVG_NS, isCircle ? 'circle' : 'rect');
      if (isCircle) {
        rect.setAttribute('cx', s[0]); rect.setAttribute('cy', s[1]); rect.setAttribute('r', s[2]);
      } else {
        rect.setAttribute('x', s[0]); rect.setAttribute('y', s[1]);
        rect.setAttribute('width', s[2]); rect.setAttribute('height', s[3]);
      }
      rect.setAttribute('class', 'spot ' + (state.selected === r.id ? 'selected' : ok ? 'available' : 'unavailable'));
      rect.setAttribute('role', 'button');
      rect.setAttribute('aria-label', `${r.name}, ${ok ? 'available' : 'unavailable'}`);
      const tip = document.createElementNS(SVG_NS, 'title');
      tip.textContent = `${r.name} · ${r.seats} seats${ok ? '' : ' · unavailable'}`;
      rect.appendChild(tip);
      if (ok) {
        rect.setAttribute('tabindex', '0');
        rect.addEventListener('click', () => choose(r));
        rect.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(r); } });
      }
      svg.appendChild(rect);
    });

    if (pickMode) enablePicker(svg, plan);
    wrap.append(img, svg);
    map.appendChild(wrap);
  }

  const others = floorRooms.filter((r) => !spotFor(r));
  if (others.length) {
    const box = document.createElement('div');
    box.className = 'others';
    box.innerHTML = '<h3>Other spaces on this floor</h3><div class="list"></div>';
    others.forEach((r) => {
      const ok = isAvailable(r);
      const b = document.createElement('button');
      b.className = 'tile' + (ok ? '' : ' unavailable') + (state.selected === r.id ? ' selected' : '');
      b.textContent = r.room_code;
      b.disabled = !ok;
      b.setAttribute('aria-label', `${r.name}, ${ok ? 'available' : 'unavailable'}`);
      b.addEventListener('click', () => choose(r));
      box.querySelector('.list').appendChild(b);
    });
    map.appendChild(box);
  }
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
  try { rooms = await getRooms(); }
  catch { $('map').textContent = 'Could not load rooms. Is the server running?'; return; }
  $('date').value = today();
  $('time').innerHTML = hourOptions(8, 20, true);
  $('time').value = 13;
  applied = readFilters();
  state.floor = applied.floor;
  $('search').addEventListener('click', () => {
    applied = readFilters();
    state.floor = applied.floor;
    state.selected = null;
    render();
  });
  render();
}
init();