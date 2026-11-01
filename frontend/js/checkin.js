
/**
 * MyStudySpace - Frontend Reservation Check-In
 *
 * User Story: US-08 - Check In to a Reservation
 * Sprint: 1
 *
 * Description:
 * Handles the frontend check-in process for students
 * who have an existing study room reservation.
 *
 * Responsibilities:
 * 1. Receive reservation information from the application.
 * 2. Display reservation details.
 * 3. Enable the Check In button for confirmed reservations.
 * 4. Send check-in requests to the backend API.
 * 5. Display success and error messages.
 * 6. Prevent duplicate button clicks during processing.
 *
 * Important:
 * - No student IDs or reservations are hard-coded.
 * - The backend verifies authentication and eligibility.
 * - MySQL is accessed only through the backend.
 * - The frontend does not decide final check-in eligibility.
 */

/**
 * Sends a check-in request to the MyStudySpace backend.
 *
 * @param {number} reservationId - Existing reservation ID.
 * @returns {Promise<Object>} Backend response.
 * @throws {Error} When the request is unsuccessful.
 */
async function checkInReservation(reservationId) {

  // Validate the reservation ID before making a request.
  if (
    !Number.isSafeInteger(reservationId) ||
    reservationId <= 0
  ) {
    throw new Error("Invalid reservation ID.");
  }

  // Send the check-in request to the backend API.
  const response = await fetch("/api/reservations/checkin", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    // Include same-origin authentication cookies.
    credentials: "same-origin",

    body: JSON.stringify({
      reservation_id: reservationId
    })
  });

  // Attempt to read the backend response as JSON.
  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      "Unable to read the server response."
    );
  }

  // Handle unsuccessful API responses.
  if (!response.ok || result.success !== true) {
    throw new Error(
      result.message || "Unable to complete check-in."
    );
  }

  // Return the successful response.
  return result;
}

/**
 * Initializes the Check In button and reservation details.
 *
 * This function receives reservation information from
 * the application. The production page must retrieve
 * that information from a trusted backend API.
 *
 * @param {Object|null} reservation
 *   Reservation information retrieved from the backend.
 */
function initializeCheckIn(reservation) {

  // Locate the required HTML elements.
  const button = document.getElementById("check-in-button");
  const details = document.getElementById("reservation-details");
  const message = document.getElementById("check-in-message");

  // Stop if the page is missing required elements.
  if (!button || !details || !message) {
    console.error(
      "MyStudySpace: Check-in interface elements are missing."
    );
    return;
  }

  // Reset the interface before displaying a reservation.
  button.disabled = true;
  button.textContent = "Check In";
  message.textContent = "";
  details.textContent = "";

  // Validate the supplied reservation.
  if (
    !reservation ||
    !Number.isSafeInteger(reservation.reservation_id) ||
    reservation.reservation_id <= 0
  ) {
    details.textContent =
      "No reservation available for check-in.";
    return;
  }

  // Display reservation information.
  // textContent prevents HTML injection.
  details.textContent =
    `Reservation #${reservation.reservation_id}`;

  // Prevent attempts on reservations already checked in.
  if (reservation.checked_in === true) {
    button.textContent = "Checked In";
    message.textContent =
      "You have already checked in to this reservation.";
    return;
  }

  // Only confirmed reservations may attempt check-in.
  // The backend independently checks the allowed time window.
  if (reservation.status !== "confirmed") {
    message.textContent =
      "This reservation is not available for check-in.";
    return;
  }

  // Enable the button for a confirmed reservation.
  button.disabled = false;

  // Assign the click handler for the current reservation.
  // Using onclick avoids accumulating duplicate listeners
  // when the interface is initialized more than once.
  button.onclick = async function () {

    // Prevent repeated requests while processing.
    button.disabled = true;
    message.textContent = "Processing check-in...";

    try {

      // Request check-in through the backend API.
      const result = await checkInReservation(
        reservation.reservation_id
      );

      // Update the interface after a successful response.
      button.textContent = "Checked In";
      message.textContent =
        result.message || "Successfully checked in.";

      // Keep the button disabled after success.
      button.disabled = true;

    } catch (error) {

      // Display the error returned by the backend.
      message.textContent =
        error.message || "Check-in failed.";

      // Allow another attempt only when appropriate.
      // A later API request must still pass backend validation.
      button.disabled = false;
    }
  };
}
