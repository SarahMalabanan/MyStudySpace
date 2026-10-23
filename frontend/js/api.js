// Swap these for fetch('/api/...') once the backend exists.
// ---- Rooms: now loaded from the real API ----
async function getRooms() {
  const res = await fetch('/api/rooms');
  if (!res.ok) throw new Error('Could not load rooms');
  return res.json();
}

async function getRoom(id) {
  const rooms = await getRooms();
  return rooms.find((r) => r.id === Number(id));
}

// ---- Reservations: still saved in this browser until the reservations API exists ----
const STORE_KEY = 'mystudyspace_reservations';

function loadReservations() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}

function isRangeBooked(roomId, date, start, end) {
  return loadReservations().some(
    (r) => r.roomId === roomId && r.date === date && start < r.end && end > r.start
  );
}

async function createReservation(roomId, date, start, end) {
  if (isRangeBooked(roomId, date, start, end)) throw new Error('Already booked');
  const list = loadReservations();
  list.push({ id: Date.now(), roomId, date, start, end });
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

function clearReservations() { localStorage.removeItem(STORE_KEY); }