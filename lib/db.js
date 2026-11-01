
/**
 * MyStudySpace - Shared MySQL Database Connection
 *
 * Connects the JavaScript backend to the MySQL database
 * using environment variables.
 *
 * Supports:
 * - Room availability
 * - Reservations
 * - Reservation check-ins
 * - Other database-driven features
 *
 * Database credentials are never hard-coded.
 */

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Optional SSL support from Sarah's branch.
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: true }
    : undefined,

  // Connection pool settings.
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

module.exports = pool;
