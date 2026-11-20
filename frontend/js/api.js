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
    credentials: 'same-origin',
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
    throw new Error(
      data.message ||
      data.error ||
      'Could not save your reservation.'
    );
  }

  return data;
}


async function whoAmI() {
  const res = await fetch('/api/accounts/recognizeduser', {
    credentials: 'same-origin',
    cache: 'no-store'
  });

  if (res.status === 401) return null;

  if (!res.ok) {
    throw new Error('Could not verify your account.');
  }

  return res.json();
}

async function adminGetRooms() {
  const res = await fetch('/api/admin/rooms', {
    credentials: 'same-origin',
    cache: 'no-store'
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Could not load rooms.');
  }

  return data;
}

async function adminUpdateRoom(room) {
  const res = await fetch('/api/admin/rooms', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(room)
  });

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || 'Could not update room.');
    error.status = res.status;
    throw error;
  }

  return data;
}

// ---- Library Hours ----


// ---- Library Hours ----

async function adminGetHours(libraryName) {
  const params = new URLSearchParams({ library: libraryName });

  const res = await fetch(`/api/admin/hours?${params.toString().replace(/\+/g, '%20')}`, {
    credentials: 'same-origin',
    cache: 'no-store'
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Could not load library hours.');
  }

  return data;
}

async function adminSaveWeekly(libraryName, weekly) {
  const res = await fetch('/api/admin/hours', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ library: libraryName, weekly })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Could not save weekly hours.');
  }

  return data;
}

async function adminSaveSpecialDay(specialDay) {
  const res = await fetch('/api/admin/hours', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(specialDay)
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Could not save special hours.');
  }

  return data;
}

async function adminRemoveSpecialDay(libraryName, date) {
  const params = new URLSearchParams({
    library: libraryName,
    date
  });

  const res = await fetch(`/api/admin/hours?${params.toString()}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Could not remove special day.');
  }

  return data;
}
