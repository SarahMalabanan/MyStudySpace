
/**
 * MyStudySpace - No-Show Validation Rules
 *
 * Description:
 * Determines whether a reservation qualifies
 * as a no-show.
 *
 * Rule:
 * Students have 10 minutes after their
 * reservation starts to check in.
 */

const NO_SHOW_MINUTES = 10;

function evaluateNoShow(
  reservation,
  hasCheckedIn,
  currentTime = new Date()
) {
  // 1. Make sure the reservation exists.
  if (!reservation) {
    return {
      isNoShow: false,
      message: "Reservation not found."
    };
  }

  // 2. Only confirmed reservations qualify.
  if (reservation.status !== "confirmed") {
    return {
      isNoShow: false,
      message: "Reservation is not confirmed."
    };
  }

  // 3. A student who checked in is not a no-show.
  if (hasCheckedIn) {
    return {
      isNoShow: false,
      message: "Student has already checked in."
    };
  }

  // 4. Validate reservation time.
  const startTime = new Date(reservation.start_time);
  const now = new Date(currentTime);

  if (
    Number.isNaN(startTime.getTime()) ||
    Number.isNaN(now.getTime())
  ) {
    return {
      isNoShow: false,
      message: "Invalid reservation time."
    };
  }

  // 5. Calculate the 10-minute deadline.
  const deadline = new Date(
    startTime.getTime() + NO_SHOW_MINUTES * 60 * 1000
  );

  // 6. Do not mark a reservation before the deadline.
  if (now <= deadline) {
    return {
      isNoShow: false,
      message: "Check-in window is still open."
    };
  }

  // 7. Reservation qualifies as a no-show.
  return {
    isNoShow: true,
    message: "Reservation qualifies as a no-show."
  };
}

module.exports = {
  evaluateNoShow,
  NO_SHOW_MINUTES
};
