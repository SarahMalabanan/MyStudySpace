
/**
 * MyStudySpace - Check-In API Tests
 *
 * User Story: US-08 - Check In to a Reservation
 *
 * Tests API behavior using a simulated database.
 * No real MySQL records are created or modified.
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");

// Identify the modules used by the Check-In API.
const dbPath = require.resolve("../lib/db");
const apiPath = require.resolve("../api/reservations/checkin");

// Simulated database state.
let existingCheckIn = false;
let insertedCheckIn = false;

// A reservation used only in these tests.
const reservation = {
  reservation_id: 123,
  user_id: 10,
  status: "confirmed",
  start_time: new Date(Date.now() - 60 * 1000)
};

// Fake MySQL connection.
const fakeConnection = {
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},

  async query(sql) {
    if (sql.includes("FROM reservations")) {
      return [[reservation]];
    }

    if (sql.includes("FROM check_ins")) {
      return [
        existingCheckIn
          ? [{ check_in_id: 1 }]
          : []
      ];
    }

    if (sql.includes("INSERT INTO check_ins")) {
      insertedCheckIn = true;
      return [{ insertId: 456 }];
    }

    throw new Error("Unexpected SQL query");
  }
};

// Replace the database module with a fake pool.
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    async getConnection() {
      return fakeConnection;
    }
  }
};

// Load the API after replacing its database dependency.
const handler = require("../api/reservations/checkin");

// Create simulated HTTP request and response objects.
function createRequest(method, body = {}, user = null) {
  return { method, body, user };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},

    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    }
  };
}

// Test 1: Reject unsupported HTTP methods.
test("Rejects GET requests", async () => {
  const res = createResponse();

  await handler(createRequest("GET"), res);

  assert.equal(res.statusCode, 405);
});

// Test 2: Reject unauthenticated requests.
test("Rejects unauthenticated users", async () => {
  const res = createResponse();

  await handler(
    createRequest("POST", { reservation_id: 123 }),
    res
  );

  assert.equal(res.statusCode, 401);
});

// Test 3: Reject invalid reservation IDs.
test("Rejects invalid reservation IDs", async () => {
  const res = createResponse();

  await handler(
    createRequest(
      "POST",
      { reservation_id: -1 },
      { user_id: 10 }
    ),
    res
  );

  assert.equal(res.statusCode, 400);
});

// Test 4: Reject another user's reservation.
test("Rejects another student's reservation", async () => {
  const res = createResponse();

  await handler(
    createRequest(
      "POST",
      { reservation_id: 123 },
      { user_id: 99 }
    ),
    res
  );

  assert.equal(res.statusCode, 400);
});

// Test 5: Reject duplicate check-ins.
test("Rejects duplicate check-ins", async () => {
  existingCheckIn = true;

  const res = createResponse();

  await handler(
    createRequest(
      "POST",
      { reservation_id: 123 },
      { user_id: 10 }
    ),
    res
  );

  assert.equal(res.statusCode, 409);

  existingCheckIn = false;
});

// Test 6: Accept a valid check-in.
test("Accepts valid check-in", async () => {
  insertedCheckIn = false;

  const res = createResponse();

  await handler(
    createRequest(
      "POST",
      { reservation_id: 123 },
      { user_id: 10 }
    ),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(insertedCheckIn, true);
});
