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


async function getUnavailableRooms(date, start, end) {
  const params = new URLSearchParams({
    date: date,
    start: start,
    end: end
  });

  const res = await fetch(
    `/api/reservations/create?${params.toString()}`
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Could not check room availability.');
  }

  return data.room_ids;
}


async function createReservation(
  roomId,
  date,
  start,
  end,
  guestName,
  guestEmail,
  guestPhone
) {
  const res = await fetch('/api/reservations/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      room_id: roomId,
      date: date,
      start: start,
      end: end,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Could not create reservation.');
  }

  return data;
}

