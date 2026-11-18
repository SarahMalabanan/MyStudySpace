
const $ = (id) => document.getElementById(id);

// MOCKTEST: Keep the selected room and reservation workflow.
let room = null;
let availabilityCheckId = 0;

// DOED: Prevent duplicate submissions.
let submitting = false;
let reservationConfirmed = false;

// Logged-in account information.
// If currentUser is null, the visitor is a guest.
let currentUser = null;

// Display reservation messages.
function showMessage(message, isError = false) {
  $('msg').textContent = message;
  $('msg').className = isError ? 'msg error' : 'msg ok';
}

// DOED: Validate that the date exists on the calendar.
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// DOED: Prevent reservations in the past.
function reservationIsPast(date, startHour) {
  if (!validDate(date) || !Number.isInteger(startHour)) {
    return true;
  }

  const [year, month, day] = date.split('-').map(Number);

  const start = new Date(
    year,
    month - 1,
    day,
    startHour,
    0,
    0
  );

  return start <= new Date();
}

// Check whether the visitor is logged in.
async function loadCurrentUser() {
  try {
    const response = await fetch('/api/accounts/recognizeduser', {
      method: 'GET',
      credentials: 'same-origin'
    });

    // A 401 response means the visitor is a guest.
    if (!response.ok) {
      currentUser = null;
      return;
    }

    currentUser = await response.json();

    // Show the logged-in user's information.
    $('guest-fields').hidden = true;
    $('account-info').hidden = false;

    $('account-name').textContent =
      `${currentUser.first_name} ${currentUser.last_name}`;

    $('account-email').textContent = currentUser.email;

  } catch (error) {
    console.error('Could not check login status:', error);

    // If the account check fails, do not assume the visitor
    // is authenticated. Keep the guest workflow available.
    currentUser = null;
  }
}

// MOCKTEST: Display the room selected from the homepage.
function displayRoom() {
  $('room-info').innerHTML = `
    <h2>${room.name || room.room_code}</h2>
    ${roomPhotoHtml(room)}
    <div>Seats: ${room.seats}</div>

    <ul class="features">
      ${room.whiteboard ? '<li>Whiteboard</li>' : ''}
      ${room.tv ? '<li>TV</li>' : ''}
      ${room.window ? '<li>Window</li>' : ''}
      ${room.outlet ? '<li>Outlet</li>' : ''}
    </ul>

    <div>${room.library}, ${floorName(room.floor)}</div>
  `;
}

// MOCKTEST: Check real availability before enabling confirmation.
async function update() {
  if (!room) return;

  const requestId = ++availabilityCheckId;

  const start = Number($('start').value);
  const end = Number($('end').value);
  const date = $('date').value;

  let error = '';

  // Update the reservation summary.
  $('s-room').textContent = room.name || room.room_code;
  $('s-date').textContent = date;
  $('s-time').textContent =
    `${fmtHour(start)} – ${fmtHour(end)}`;
  $('s-floor').textContent =
    `${room.library}, ${floorName(room.floor)}`;

  // Prevent changes after successful confirmation.
  if (reservationConfirmed) {
    $('confirm').disabled = true;
    return;
  }

  if (!validDate(date)) {
    error = 'Please select a valid reservation date.';
  } else if (
    date < today() ||
    date > maxBookingDate()
  ) {
    error = 'Please select a date within the booking period.';
  } else if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 8 ||
    start > 20 ||
    end > 21
  ) {
    error = 'Please select a valid reservation time.';
  } else if (reservationIsPast(date, start)) {
    error = 'Please select a future reservation time.';
  } else if (end <= start) {
    error = 'End time must be after start time.';
  } else if (end - start > 2) {
    error = 'Reservations are limited to 2 hours.';
  }

  if (error) {
    showMessage(error, true);
    $('confirm').disabled = true;
    return;
  }

  // Do not allow submission while checking availability.
  $('confirm').disabled = true;
  $('msg').textContent = 'Checking availability...';
  $('msg').className = 'msg';

  try {
    const unavailableRooms = await getUnavailableRooms(
      date,
      start,
      end
    );

    // Ignore outdated requests when the user changes the time.
    if (requestId !== availabilityCheckId) return;

    const unavailable = unavailableRooms.some(
      id => String(id) === String(room.id)
    );

    if (unavailable) {
      showMessage(
        'That time is unavailable. Please choose another time.',
        true
      );
      $('confirm').disabled = true;
      return;
    }

    if (submitting) {
      $('confirm').disabled = true;
      return;
    }

    $('msg').textContent = '';
    $('msg').className = 'msg';
    $('confirm').disabled = false;

  } catch (error) {
    if (requestId !== availabilityCheckId) return;

    console.error('Availability check failed:', error);

    showMessage(
      'Could not check availability. Please try again.',
      true
    );

    $('confirm').disabled = true;
  }
}

// MOCKTEST: Preserve the reservation confirmation popup.
function showConfirmation(reservation) {
  $('c-code').textContent =
    reservation.confirmation_code || 'Not provided';

  $('c-name').textContent = currentUser
    ? `${currentUser.first_name} ${currentUser.last_name}`
    : reservation.guest_name || $('guest-name').value.trim();

  $('c-room').textContent = room.name || room.room_code;

  const startTime = String(reservation.start_time || '');
  const endTime = String(reservation.end_time || '');

  $('c-date').textContent =
    startTime.split(' ')[0] || $('date').value;

  if (startTime.includes(' ') && endTime.includes(' ')) {
    $('c-time').textContent =
      `${fmtHour(Number(startTime.split(' ')[1].slice(0, 2)))} – ${
        fmtHour(Number(endTime.split(' ')[1].slice(0, 2)))
      }`;
  } else {
    $('c-time').textContent =
      `${fmtHour(Number($('start').value))} – ${
        fmtHour(Number($('end').value))
      }`;
  }

  // Account reservations display the account email.
  // Guest reservations display the submitted contact information.
  $('c-email').textContent = currentUser
    ? currentUser.email
    : reservation.guest_email ||
      $('guest-email').value.trim() ||
      'Not provided';

  $('c-phone').textContent = currentUser
    ? 'Not provided'
    : reservation.guest_phone ||
      $('guest-phone').value.trim() ||
      'Not provided';

  $('confirmation-email-row').hidden = false;
  $('confirmation-phone-row').hidden = false;

  $('confirmation-modal').hidden = false;
}

// MOCKTEST: Keep guest reservation submission through createReservation().
// DOED: Add duplicate-submission protection.
async function confirmReservation() {
  if (!room || submitting || reservationConfirmed) return;

  if ($('confirm').disabled) return;

  const start = Number($('start').value);
  const end = Number($('end').value);
  const date = $('date').value;

  // Only collect guest information if the visitor is not logged in.
  const guestName = currentUser
    ? ''
    : $('guest-name').value.trim();

  const guestEmail = currentUser
    ? ''
    : $('guest-email').value.trim();

  const guestPhone = currentUser
    ? ''
    : $('guest-phone').value.trim();

  // Validate guest information only for guest reservations.
  if (!currentUser) {
    if (!guestName) {
      showMessage('Please enter your full name.', true);
      return;
    }

    if (!guestEmail && !guestPhone) {
      showMessage(
        'Please enter an email address or phone number.',
        true
      );
      return;
    }
  }

  submitting = true;
  $('confirm').disabled = true;
  $('confirm').textContent = 'Confirming...';

  showMessage('Saving your reservation...');

  try {
    let reservation;

    if (currentUser) {
      // ACCOUNT RESERVATION
      // The backend gets the user ID from the verified session cookie.
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          roomId: room.id,
          date: date,
          startHour: start,
          endHour: end
        })
      });

      const result = await response.json();

      if (!response.ok) {
  throw new Error(
    result.message || result.error || 'Could not save your reservation.'
  );
}

      reservation = {
        ...result,
        guest_name:
          `${currentUser.first_name} ${currentUser.last_name}`,
        guest_email: currentUser.email,
        guest_phone: ''
      };

    } else {
      // GUEST RESERVATION
      // Keep using the existing createReservation() function.
      reservation = await createReservation(
        room.id,
        date,
        start,
        end,
        guestName,
        guestEmail,
        guestPhone
      );
    }

    reservationConfirmed = true;

    showMessage('Reservation successfully saved!');

    $('confirm').textContent = 'Reservation Confirmed';
    $('confirm').disabled = true;

    // Prevent editing after a successful reservation.
    $('date').disabled = true;
    $('start').disabled = true;
    $('end').disabled = true;

    showConfirmation(reservation);

    console.log('Reservation created:', reservation);

  } catch (error) {
    console.error('Reservation failed:', error);

    showMessage(
      error.message || 'Could not confirm your reservation.',
      true
    );

    $('confirm').textContent = 'Confirm reservation';

  } finally {
    submitting = false;

    if (!reservationConfirmed) {
      update();
    }
  }
}

// MOCKTEST: Preserve the original page initialization.
async function init() {
  $('confirm').disabled = true;

  // Keep the existing confirmation popup close button.
  const closeButton = $('close-confirmation');

  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  try {
  // Determine whether the visitor is logged in before
  // displaying the reservation form.
  await loadCurrentUser();

  const params = new URLSearchParams(location.search);
    const roomId = params.get('room');

    if (!roomId) {
      $('room-info').innerHTML =
        '<p>No room was selected. Please go back and select a room.</p>';
      return;
    }

    // MOCKTEST: Keep the getRoom() API instead of replacing it.
    room = await getRoom(roomId);

    if (!room) {
      $('room-info').innerHTML =
        '<p>Room not found. Please go back and select another room.</p>';
      return;
    }

    displayRoom();

    // MOCKTEST: Keep date restrictions.
    $('date').min = today();
    $('date').max = maxBookingDate();

    const requestedDate = params.get('date') || today();

    $('date').value =
      validDate(requestedDate) &&
      requestedDate >= today() &&
      requestedDate <= maxBookingDate()
        ? requestedDate
        : today();

    // MOCKTEST: Preserve existing time dropdowns.
    $('start').innerHTML = hourOptions(8, 20, false);
    $('end').innerHTML = hourOptions(9, 21, false);

    const requestedStart = Number(params.get('start'));

    const selectedStart =
      Number.isInteger(requestedStart) &&
      requestedStart >= 8 &&
      requestedStart <= 20
        ? requestedStart
        : 13;

    $('start').value = String(selectedStart);
    $('end').value = String(Math.min(selectedStart + 1, 21));

    ['date', 'start', 'end'].forEach((id) => {
      $(id).addEventListener('change', update);
    });

    $('confirm').addEventListener('click', confirmReservation);

    $('cancel').addEventListener('click', () => {
      location.href = 'index.html';
    });

    update();

  } catch (error) {
    console.error('Could not load reservation page:', error);

    $('room-info').innerHTML =
      '<p>Could not load the selected room. Please try again.</p>';

    $('confirm').disabled = true;
  }
}

init();
