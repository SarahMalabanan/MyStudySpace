
/**
 * MyStudySpace - Check-In Validation Tests
 *
 * User Story: US-08 - Check In to a Reservation
 *
 * Tests the validation rules independently of MySQL.
 * No real accounts, reservations, or check-ins are created.
 */

const assert = require("node:assert/strict");
const { validateCheckIn } = require("../lib/checkInRules");

// Fixed example time for repeatable tests.
const startTime = new Date("2026-10-26T14:00:00Z");

// Example reservation used only in these tests.
const reservation = {
  reservation_id: 1,
  user_id: 10,
  status: "confirmed",
  start_time: startTime
};

const userId = 10;
const checkInMinutes = 10;

// Test 1: Valid check-in, five minutes after start.
assert.equal(
  validateCheckIn(
    reservation,
    userId,
    new Date("2026-10-26T14:05:00Z"),
    checkInMinutes
  ).valid,
  true
);

// Test 2: Reject check-in before reservation starts.
assert.equal(
  validateCheckIn(
    reservation,
    userId,
    new Date("2026-10-26T13:55:00Z"),
    checkInMinutes
  ).valid,
  false
);

// Test 3: Reject check-in after deadline.
assert.equal(
  validateCheckIn(
    reservation,
    userId,
    new Date("2026-10-26T14:11:00Z"),
    checkInMinutes
  ).valid,
  false
);

// Test 4: Reject another user's reservation.
assert.equal(
  validateCheckIn(
    reservation,
    99,
    new Date("2026-10-26T14:05:00Z"),
    checkInMinutes
  ).valid,
  false
);

// Test 5: Reject canceled reservations.
assert.equal(
  validateCheckIn(
    { ...reservation, status: "cancelled" },
    userId,
    new Date("2026-10-26T14:05:00Z"),
    checkInMinutes
  ).valid,
  false
);

// Test 6: Reject nonexistent reservations.
assert.equal(
  validateCheckIn(
    null,
    userId,
    new Date("2026-10-26T14:05:00Z"),
    checkInMinutes
  ).valid,
  false
);

// Test 7: Allow check-in exactly at the deadline.
assert.equal(
  validateCheckIn(
    reservation,
    userId,
    new Date("2026-10-26T14:10:00Z"),
    checkInMinutes
  ).valid,
  true
);

console.log("All 7 Check-In validation tests passed!");
