function fmtHour(h) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:00${suffix}`;
}
const FLOOR_NAMES = { 0: 'Ground Floor', 1: 'First Floor', 2: 'Second Floor', 3: 'Third Floor', 4: 'Fourth Floor', 5: 'Fifth Floor' };
function floorName(n) { return FLOOR_NAMES[n] || `Floor ${n}`; }
function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function maxBookingDate() {
  const max = new Date();
  max.setDate(max.getDate() + 14);

  const year = max.getFullYear();
  const month = String(max.getMonth() + 1).padStart(2, '0');
  const day = String(max.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function hourOptions(from, to, withRange) {
  let html = '';
  for (let h = from; h <= to; h++) {
    html += `<option value="${h}">${withRange ? fmtHour(h) + ' – ' + fmtHour(h + 1) : fmtHour(h)}</option>`;
  }
  return html;
}

function roomPhotoHtml(r) {
  if (!r.photo) {
    return '<div class="photo">No photo yet</div>';
  }

  const photoPath = r.photo.startsWith('/')
    ? r.photo
    : `/${r.photo}`;

  return `
    <img
      class="photo"
      src="${photoPath}"
      alt="Photo of ${r.name}"
      loading="lazy"
      onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
    >
    <div class="photo image-error" style="display:none;">
      Image could not be loaded
    </div>
  `;
}

// Accessories: Window and Outlet are always listed. Whiteboard and TV are listed
// for a library only if at least one of its rooms has them.
const FEATURES = [['whiteboard', 'Whiteboard'], ['tv', 'TV'], ['window', 'Window'], ['outlet', 'Outlet']];
function libraryFeatures(libraryRooms) {
  return FEATURES.filter(([k]) => k === 'window' || k === 'outlet' || libraryRooms.some((r) => r[k]));
}
function featureListHtml(r, feats) {
  return `<ul class="features">${feats.map(([k, label]) => `<li class="${r[k] ? '' : 'no'}">${label}</li>`).join('')}</ul>`;
}