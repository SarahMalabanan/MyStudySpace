const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACCESSORIES = [['whiteboard', 'Whiteboard'], ['tv', 'TV'], ['window', 'Window'], ['outlet', 'Outlet']];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let rooms = [];
let editing = null;
let photoDraft;   // undefined = keep the picture, null = remove the uploaded one, string = a new picture

function msg(text, kind) { $('admin-msg').textContent = text; $('admin-msg').className = 'msg ' + (kind || ''); }
function editMsg(text) { $('e-msg').className = 'msg error'; $('e-msg').textContent = text; }
const library = () => $('lib').value;

function fmtMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  const suffix = h >= 12 ? 'PM' : 'AM';
  const displayHour = ((h + 11) % 12) + 1;
  const displayMinute = String(m).padStart(2, '0');

  return `${displayHour}:${displayMinute}${suffix}`;
}

const hourOpts = (from, to, selected) => {
  const options = [];

  for (let minutes = from * 60; minutes <= to * 60; minutes += 10) {
    options.push(minutes);
  }

  // Include the existing database time even if it isn't on a 10-minute interval.
  if (selected !== null && selected !== undefined && !options.includes(selected)) {
    options.push(selected);
  }

  options.sort((a, b) => a - b);

  return options.map((minutes) =>
    `<option value="${minutes}" ${minutes === selected ? 'selected' : ''}>${fmtMinutes(minutes)}</option>`
  ).join('');
};

/* ---------- rooms ---------- */
function renderRooms() {
  const list = rooms.filter((r) => r.library === library());
  $('rooms-body').innerHTML = list.map((r) => {
    const off = r.status === 'inactive';
    const chips = ACCESSORIES.filter(([k]) => r[k]).map(([, label]) => `<span>${label}</span>`).join('') || '<span>None</span>';
    return `<tr>
      <td>${esc(r.room_code)}</td>
      <td>${esc(r.name)}</td>
      <td>${floorName(r.floor)}</td><td>${r.seats}</td>
      <td class="chips">${chips}</td>
      <td><span class="badge ${off ? 'off' : 'on'}">${off ? 'Unavailable' : 'Available'}</span></td>
      <td class="actions">
        <button type="button" class="btn secondary small" data-edit="${r.id}">Edit</button>
        <button type="button" class="btn secondary small" data-toggle="${r.id}">${off ? 'Make available' : 'Make unavailable'}</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">No rooms in this library.</td></tr>';
}

async function reloadRooms() {
  rooms = await adminGetRooms();

  // Update the Total Rooms card on the overview.
  $('total-rooms').textContent = rooms.length;

  renderRooms();
}

const roomPayload = (r, overrides = {}) => ({
  id: r.id, name: r.name, seats: r.seats, whiteboard: Boolean(r.whiteboard), tv: Boolean(r.tv),
  window: Boolean(r.window), outlet: Boolean(r.outlet), status: r.status, ...overrides,
});

function upcomingNote(result, status) {
  return status === 'inactive' && result.upcoming_reservations
    ? ` ${result.upcoming_reservations} upcoming reservation(s) for this room still stand.` : '';
}

async function toggleAvailability(id) {
  const r = rooms.find((x) => x.id === id);
  const status = r.status === 'inactive' ? 'active' : 'inactive';
  try {
    const result = await adminUpdateRoom(roomPayload(r, { status }));
    await reloadRooms();
    msg(`${r.name} is now ${status === 'active' ? 'available' : 'unavailable'}.${upcomingNote(result, status)}`, 'ok');
  } catch (err) { msg(err.message, 'error'); }
}

function showPhoto() {
  const shown = photoDraft === undefined ? editing.photo : photoDraft;
  $('e-preview').innerHTML = shown
    ? `<img class="photo" src="${esc(shown)}" alt="Room picture preview">`
    : '<div class="photo">No picture</div>';
}

function openEditor(id) {
  editing = rooms.find((r) => r.id === id);
  photoDraft = undefined;
  $('e-title').textContent = `Edit ${editing.name}`;
  $('e-name').value = editing.name;
  $('e-seats').value = editing.seats;
  ACCESSORIES.forEach(([k]) => { $('e-' + k).checked = Boolean(editing[k]); });
  $('e-status').value = editing.status === 'inactive' ? 'inactive' : 'active';
  $('e-photo').value = '';
  $('e-msg').textContent = '';
  showPhoto();
  $('room-dialog').showModal();
}

// Shrinks the chosen picture before upload (keeps it small and fast)
function resizeImage(file, maxWidth) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveRoom() {
  const name = $('e-name').value.trim();
  const seats = Number($('e-seats').value);
  if (!name) return editMsg('Enter a room name.');
  if (!Number.isInteger(seats) || seats < 1 || seats > 30) return editMsg('Seats must be a whole number from 1 to 30.');
  const patch = { name, seats, status: $('e-status').value };
  ACCESSORIES.forEach(([k]) => { patch[k] = $('e-' + k).checked; });
  $('e-save').disabled = true;
  try {
    const result = await adminUpdateRoom(roomPayload(editing, patch));
    if (photoDraft !== undefined) await adminSetPhoto(editing.id, photoDraft);
    $('room-dialog').close();
    await reloadRooms();
    msg(`Saved ${name}.${upcomingNote(result, patch.status)}`, 'ok');
  } catch (err) { editMsg(err.message); }
  $('e-save').disabled = false;
}

/* ---------- opening hours ---------- */
async function renderHours() {
  let data;
  try { data = await adminGetHours(library()); } catch (err) { return msg(err.message, 'error'); }
  $('weekly-body').innerHTML = data.weekly.map((d) => `<tr>
    <td>${DAYS[d.weekday]}</td>
    <td><label class="check"><input type="checkbox" data-d="${d.weekday}" data-f="closed" ${d.closed ? 'checked' : ''}> Closed</label></td>
    <td><select data-d="${d.weekday}" data-f="open" aria-label="${DAYS[d.weekday]} opens">${hourOpts(6, 14, d.open)}</select></td>
    <td><select data-d="${d.weekday}" data-f="close" aria-label="${DAYS[d.weekday]} closes">${hourOpts(12, 23, d.close)}</select></td>
  </tr>`).join('');
  $('special-body').innerHTML = data.exceptions.map((o) => `<tr>
    <td>${o.date}</td><td>${o.closed ? 'Closed' : `${fmtHour(o.open)} – ${fmtHour(o.close)}`}</td>
    <td>${esc(o.note || '')}</td>
    <td><button type="button" class="btn secondary small" data-remove="${o.date}">Remove</button></td></tr>`).join('')
    || '<tr><td colspan="4">No special days.</td></tr>';
}

async function saveWeekly() {
  const weekly = DAYS.map((_, i) => {
    const get = (f) => document.querySelector(`[data-d="${i}"][data-f="${f}"]`);
    return { closed: get('closed').checked, open: Number(get('open').value), close: Number(get('close').value) };
  });
  const bad = weekly.findIndex((d) => !d.closed && d.close <= d.open);
  if (bad >= 0) return msg(`${DAYS[bad]}: closing time must be after opening time.`, 'error');
  try { const r = await adminSaveWeekly(library(), weekly); msg(r.message, 'ok'); } catch (err) { msg(err.message, 'error'); }
}

async function addSpecial() {
  const date = $('sd-date').value;
  const closed = $('sd-closed').checked;
  const open = Number($('sd-open').value);
  const close = Number($('sd-close').value);
  if (!date) return msg('Pick a date for the special day.', 'error');
  if (date < today()) return msg('That date has already passed.', 'error');
  if (!closed && close <= open) return msg('Closing time must be after opening time.', 'error');
  try {
    await adminSaveSpecialDay({ library: library(), date, closed, open, close, note: $('sd-note').value.trim() });
    await renderHours();
    msg(`Saved ${date}.`, 'ok');
  } catch (err) { msg(err.message, 'error'); }
}

/* ---------- start ---------- */
function showTab(name) {
  const sections = [
    'overview',
    'hours',
    'rooms',
    'reservations',
    'staff',
    'settings'
  ];

  if (!sections.includes(name)) return;

  sections.forEach((tab) => {
    const section = document.getElementById(`tab-${tab}`);
    if (section) {
      section.hidden = tab !== name;
    }
  });

  document.querySelectorAll('[data-tab]').forEach((button) => {
    const selected = button.dataset.tab === name;
    button.setAttribute('aria-selected', String(selected));
  });
}

function deny(text, showLogin) {
  $('denied').hidden = false;
  $('denied-text').textContent = text;
  $('denied-login').href = window.LOGIN_URL;
  $('denied-login').hidden = !showLogin;
}

async function init() {
  const me = await whoAmI();
  if (!me) return deny('Log in with a staff account to manage rooms and opening hours.', true);
  if (me.role !== 'staff') return deny('This page is for library staff only.', false);

  $('admin').hidden = false;
  try { await reloadRooms(); }
  catch (err) { return msg(err.status === 403 ? 'Staff access only.' : 'Could not load rooms. Is the server running?', 'error'); }

  const libs = [...new Set(rooms.map((r) => r.library))];
  $('lib').innerHTML = libs.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
  $('lib').value = 'Nancy Thompson Learning Commons';
  $('lib').addEventListener('change', () => { renderRooms(); renderHours(); });
 document.querySelectorAll('.tabs').forEach((nav) => {
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });
});

  $('rooms-body').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const toggle = e.target.closest('[data-toggle]');
    if (edit) openEditor(Number(edit.dataset.edit));
    if (toggle) toggleAvailability(Number(toggle.dataset.toggle));
  });
  $('e-save').addEventListener('click', saveRoom);
  $('e-cancel').addEventListener('click', () => $('room-dialog').close());
  $('e-remove-photo').addEventListener('click', () => { photoDraft = null; showPhoto(); });
  $('e-photo').addEventListener('change', async () => {
    const file = $('e-photo').files[0];
    if (!file) return;
    try { photoDraft = await resizeImage(file, 1000); showPhoto(); }
    catch { editMsg('That file could not be read as a picture.'); }
  });

  $('save-weekly').addEventListener('click', saveWeekly);
  $('sd-date').min = today();
  $('sd-open').innerHTML = hourOpts(6, 14, 480);
  $('sd-close').innerHTML = hourOpts(12, 23, 1260);
  $('sd-add').addEventListener('click', addSpecial);
  $('special-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    try { await adminRemoveSpecialDay(library(), b.dataset.remove); await renderHours(); msg('Special day removed.', 'ok'); }
    catch (err) { msg(err.message, 'error'); }
  });

  // Staff account logout
$('admin-logout').addEventListener('click', async function () {
  const button = this;
  button.disabled = true;

  try {
    const response = await fetch('/api/accounts/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error('Logout failed.');
    }

    // Return to the homepage after logging out.
    window.location.replace('index.html');

  } catch (error) {
    msg('Could not log out. Please try again.', 'error');
    button.disabled = false;
  }
});


  renderRooms();
  renderHours();
  showTab('overview');
}
init();