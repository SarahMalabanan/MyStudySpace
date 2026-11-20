
const reservationContainer =
  document.getElementById('reservation-details');

const messageContainer =
  document.getElementById('reservation-message');

let reservations = [];

// Convert MySQL DATETIME into a JavaScript Date.
function parseDateTime(value) {
  return new Date(String(value).replace(' ', 'T'));
}

// Format reservation date.
function formatDate(value) {
  return parseDateTime(value).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format reservation time.
function formatTime(value) {
  return parseDateTime(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Display messages to the student.
function showMessage(message, type = '') {
  messageContainer.textContent = message;
  messageContainer.className = type;
}

// Escape database values before inserting them into HTML.
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[character]);
}

// Determine whether the reservation has started.
function canCheckIn(reservation) {
  const startTime = parseDateTime(reservation.start_time);

  return Date.now() >= startTime.getTime();
}

// Create an individual reservation card.
function createReservationCard(reservation) {

  const checkedIn = Boolean(reservation.check_in_id);
  const checkInAvailable = canCheckIn(reservation);

  const roomName = escapeHTML(
    reservation.room_name ||
    reservation.room_code ||
    `Room ${reservation.room_id}`
  );

  const library = escapeHTML(reservation.library || '');
  const floor = escapeHTML(reservation.floor || '');

  let checkInButton;

  if (checkedIn) {
    checkInButton = `
      <button class="reservation-btn checked-in-btn"
              disabled>
        Checked In
      </button>
    `;
  } else if (checkInAvailable) {
    checkInButton = `
      <button class="reservation-btn checkin-btn"
              data-action="checkin"
              data-id="${Number(reservation.reservation_id)}">
        Check In
      </button>
    `;
  } else {
    checkInButton = `
      <button class="reservation-btn checkin-btn"
              disabled>
        Check In
      </button>
    `;
  }

  return `
    <article class="reservation-card">

      <div class="reservation-card-header">

        <div>
          <h2>${roomName}</h2>
          <p class="reservation-library">
            ${library}
            ${floor ? ` · ${floor} Floor` : ''}
          </p>
        </div>

        <span class="reservation-status">
          ${checkedIn ? 'Checked In' : 'Confirmed'}
        </span>

      </div>

      <div class="reservation-information">

        <div class="reservation-detail">
          <span class="detail-label">Date</span>
          <span>${escapeHTML(formatDate(reservation.start_time))}</span>
        </div>

        <div class="reservation-detail">
          <span class="detail-label">Time</span>
          <span>
            ${escapeHTML(formatTime(reservation.start_time))}
            –
            ${escapeHTML(formatTime(reservation.end_time))}
          </span>
        </div>

        <div class="reservation-detail">
          <span class="detail-label">Confirmation Code</span>
          <span>${escapeHTML(reservation.confirmation_code || 'N/A')}</span>
        </div>

      </div>

      <div class="reservation-actions">

        <button class="reservation-btn cancel-btn"
                data-action="cancel"
                data-id="${Number(reservation.reservation_id)}">
          Cancel Reservation
        </button>

        ${checkInButton}

      </div>

    </article>
  `;
}

// Display all upcoming reservations.
function displayReservations() {

  if (!reservations.length) {
    reservationContainer.innerHTML = `
      <div class="empty-reservations">
        <h2>No Upcoming Reservations</h2>
        <p>
          You currently don't have any upcoming reservations.
        </p>
        <a href="index.html" class="find-room-link">
          Find a Room
        </a>
      </div>
    `;

    return;
  }

  reservationContainer.innerHTML = `
    <div class="reservation-list">
      ${reservations.map(createReservationCard).join('')}
    </div>
  `;
}

// Retrieve reservations belonging to the logged-in student.
async function loadReservations() {

  reservationContainer.innerHTML =
    '<p>Loading your reservations...</p>';

  try {

    const response = await fetch('/api/reservations', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Unable to load your reservations.'
      );
    }

    reservations = data;

    displayReservations();

  } catch (error) {

    reservationContainer.innerHTML = '';

    showMessage(error.message, 'error');

  }
}

// Cancel an individual reservation.
async function cancelReservation(reservationId) {

  const confirmed = window.confirm(
    'Are you sure you want to cancel this reservation?'
  );

  if (!confirmed) return;

  try {

    const response = await fetch('/api/reservations/cancel', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reservation_id: reservationId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || 'Unable to cancel reservation.'
      );
    }

    showMessage(
      'Your reservation was successfully cancelled.',
      'success'
    );

    await loadReservations();

  } catch (error) {

    showMessage(error.message, 'error');

  }
}

// Check in to an individual reservation.
async function checkInReservation(reservationId) {

  const reservation = reservations.find(
    item => Number(item.reservation_id) === reservationId
  );

  if (!reservation) return;

  if (!canCheckIn(reservation)) {
    showMessage(
      'You can only check in once your reservation begins.',
      'error'
    );

    return;
  }

  try {

    const response = await fetch('/api/reservations/checkin', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reservation_id: reservationId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || 'Unable to check in.'
      );
    }

    showMessage(
      'You have successfully checked in!',
      'success'
    );

    await loadReservations();

  } catch (error) {

    showMessage(error.message, 'error');

  }
}

// Handle button clicks for individual reservations.
reservationContainer.addEventListener('click', event => {

  const button = event.target.closest('[data-action]');

  if (!button || button.disabled) return;

  const reservationId = Number(button.dataset.id);

  if (!Number.isSafeInteger(reservationId) ||
      reservationId <= 0) {
    return;
  }

  const action = button.dataset.action;

  if (action === 'cancel') {
    cancelReservation(reservationId);
  }

  if (action === 'checkin') {
    checkInReservation(reservationId);
  }

});

// Update check-in button availability as reservations start.
setInterval(() => {
  displayReservations();
}, 30000);

// Load reservations when the page opens.
loadReservations();
