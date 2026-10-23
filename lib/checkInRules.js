
/**
 * MyStudySpace - Check-In Validation Rules
 *
 * User Story: US-08 - Check In to a Reservation
 * Sprint: 1
 *
 * Description:
 * Validates whether a student is eligible to check in
 * to an existing study room reservation.
 *
 * This module checks:
 * 1. The reservation exists.
 * 2. The reservation belongs to the current user.
 * 3. The reservation has a confirmed status.
 * 4. The check-in window has started.
 * 5. The check-in deadline has not passed.
 *
 * This module does NOT:
 * - Connect to the MySQL database.
 * - Save check-in records.
 * - Authenticate users.
 * - Process automatic no-shows.
 *
 * Database updates will be handled separately
 * by api/reservations/checkin.js.
 */

// Temporary default until the team confirms the final policy.
// The production backend should use an approved configuration value.
const DEFAULT_CHECK_IN_MINUTES = 10;

/**
 * Determines whether a user may check in to a reservation.
 *
 * @param {Object|null} reservation
 *   Reservation record retrieved from MySQL.
 *
 * @param {number} reservation.user_id
 *   ID of the student who owns the reservation.
 *
 * @param {string} reservation.status
 *   Current reservation status, such as "confirmed".
 *
 * @param {Date|string} reservation.start_time
 *   Scheduled reservation start date and time.
 *
 * @param {number} userId
 *   Authenticated user's ID, supplied by the backend.
 *
 * @param {Date} [currentTime=new Date()]
 *   Current time used to validate check-in eligibility.
 *
 * @param {number} [checkInMinutes=DEFAULT_CHECK_IN_MINUTES]
 *   Number of minutes allowed after the reservation starts.
 *
 * @returns {{valid: boolean, message: string}}
 *   Validation result and explanation.
 */
function validateCheckIn(
  reservation,
  userId,
  currentTime = new Date(),
  checkInMinutes = DEFAULT_CHECK_IN_MINUTES
) {
  // Check whether the requested reservation exists.
  if (!reservation) {
    return {
      valid: false,
      message: "Reservation not found."
    };
  }

  // Ensure the reservation belongs to the logged-in user.
  if (Number(reservation.user_id) !== Number(userId)) {
    return {
      valid: false,
      message: "This reservation does not belong to you."
    };
  }

  // Only confirmed reservations are eligible for check-in.
  if (reservation.status !== "confirmed") {
    return {
      valid: false,
      message: "This reservation is not active."
    };
  }

  // Convert reservation and current times into Date objects.
  const startTime = new Date(reservation.start_time);
  const now = new Date(currentTime);

  // Reject invalid date/time values.
  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(now.getTime())
  ) {
    return {
      valid: false,
      message: "Invalid reservation time."
    };
  }

  // Calculate the check-in deadline.
  const deadline = new Date(
    startTime.getTime() + checkInMinutes * 60 * 1000
  );

  // Prevent students from checking in before the start time.
  if (now < startTime) {
    return {
      valid: false,
      message: "Check-in is not open yet."
    };
  }

  // Prevent students from checking in after the deadline.
  if (now > deadline) {
    return {
      valid: false,
      message: "The check-in window has expired."
    };
  }

  // All validation checks passed.
  return {
    valid: true,
    message: "Check-in is allowed."
  };
}

// Export the function for use by the Check-In API.
module.exports = { validateCheckIn };
