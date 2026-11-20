
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

async function requireStaff(req, res) {
  try {
    const cookie = (req.headers.cookie || '')
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith('mystudyspace_session='));

    if (!cookie || !process.env.SESSION_SECRET) {
      res.status(401).json({ error: 'Please log in first.' });
      return false;
    }

    const token = decodeURIComponent(
      cookie.slice('mystudyspace_session='.length)
    );

    const session = jwt.verify(token, process.env.SESSION_SECRET, {
      algorithms: ['HS256']
    });

    const [users] = await pool.query(
      'SELECT role FROM users WHERE user_id = ? LIMIT 1',
      [session.userId]
    );

    if (!users.length) {
      res.status(401).json({ error: 'Account not found.' });
      return false;
    }

    if (users[0].role !== 'staff') {
      res.status(403).json({ error: 'Staff access only.' });
      return false;
    }

    return true;
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return false;
  }
}

function validLibrary(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Convert a database TIME value (HH:MM:SS) to decimal hours.
function timeToHour(value) {
  if (!value) return null;

  const parts = String(value).split(':');
  return Number(parts[0]) * 60 + Number(parts[1] || 0);
}

// Convert decimal hours to a MySQL TIME value.
function hourToTime(value) {
  const totalMinutes = Math.round(Number(value) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function validHours(open, close) {
  return Number.isFinite(Number(open)) &&
    Number.isFinite(Number(close)) &&
    Number(open) >= 0 &&
    Number(close) <= 24 &&
    Number(close) > Number(open);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'PUT', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!(await requireStaff(req, res))) return;

  // GET: Load the weekly schedule and special-date exceptions.
  if (req.method === 'GET') {
    const library = req.query.library;

    if (!validLibrary(library)) {
      return res.status(400).json({ error: 'Select a library.' });
    }

    try {
      const [weeklyRows] = await pool.query(
        `SELECT day_of_week, open_time, close_time, is_closed
         FROM library_hours
         WHERE library = ? AND effective_date IS NULL`,
        [library]
      );


      const [specialRows] = await pool.query(
        `SELECT
           DATE_FORMAT(effective_date, '%Y-%m-%d') AS date,
           open_time,
           close_time,
           is_closed
         FROM library_hours
         WHERE library = ? AND effective_date IS NOT NULL
         ORDER BY effective_date`,
        [library]
      );

      const weekly = DAYS.map((day, weekday) => {
        const row = weeklyRows.find(r => r.day_of_week === day);

        return {
          weekday,
          closed: row ? Number(row.is_closed) === 1 : true,
          open: row ? timeToHour(row.open_time) : 8,
          close: row ? timeToHour(row.close_time) : 21
        };
      });

      const exceptions = specialRows.map(row => ({
        date: row.date,
        closed: Number(row.is_closed) === 1,
        open: timeToHour(row.open_time),
        close: timeToHour(row.close_time),
        note: ''
      }));

      return res.status(200).json({ weekly, exceptions });
    } catch (error) {
      console.error('Admin hours loading error:', error);
      return res.status(500).json({ error: 'Could not load library hours.' });
    }
  }

  // PUT: Replace the weekly schedule for this library.
  if (req.method === 'PUT') {
    const { library, weekly } = req.body || {};

    if (
      !validLibrary(library) ||
      !Array.isArray(weekly) ||
      weekly.length !== 7
    ) {
      return res.status(400).json({ error: 'Invalid weekly schedule.' });
    }

    for (const day of weekly) {
      if (
        typeof day.closed !== 'boolean' ||
        (!day.closed && !validHours(day.open, day.close))
      ) {
        return res.status(400).json({ error: 'Invalid opening or closing time.' });
      }
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      await connection.query(
        'DELETE FROM library_hours WHERE library = ? AND effective_date IS NULL',
        [library]
      );

      for (let i = 0; i < 7; i++) {
        const day = weekly[i];

        await connection.query(
          `INSERT INTO library_hours
           (library, day_of_week, open_time, close_time, is_closed, effective_date)
           VALUES (?, ?, ?, ?, ?, NULL)`,
          [
            library,
            DAYS[i],
            day.closed ? null : hourToTime(day.open),
            day.closed ? null : hourToTime(day.close),
            day.closed ? 1 : 0
          ]
        );
      }

      await connection.commit();

      return res.status(200).json({
        success: true,
        message: 'Weekly hours saved successfully.'
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Admin weekly hours update error:', error);
      return res.status(500).json({ error: 'Could not save weekly hours.' });
    } finally {
      if (connection) connection.release();
    }
  }

  // POST: Add or replace a special-date schedule.
  if (req.method === 'POST') {
    const { library, date, closed, open, close } = req.body || {};

    if (
      !validLibrary(library) ||
      !validDate(date) ||
      typeof closed !== 'boolean' ||
      (!closed && !validHours(open, close))
    ) {
      return res.status(400).json({ error: 'Invalid special-day information.' });
    }

    const weekday = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      await connection.query(
        'DELETE FROM library_hours WHERE library = ? AND effective_date = ?',
        [library, date]
      );

      await connection.query(
        `INSERT INTO library_hours
         (library, day_of_week, open_time, close_time, is_closed, effective_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          library,
          weekday,
          closed ? null : hourToTime(open),
          closed ? null : hourToTime(close),
          closed ? 1 : 0,
          date
        ]
      );

      await connection.commit();

      return res.status(200).json({
        success: true,
        message: 'Special hours saved successfully.'
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Admin special hours update error:', error);
      return res.status(500).json({ error: 'Could not save special hours.' });
    } finally {
      if (connection) connection.release();
    }
  }

  // DELETE: Remove a special-date override.
  if (req.method === 'DELETE') {
    const { library, date } = req.query;

    if (!validLibrary(library) || !validDate(date)) {
      return res.status(400).json({ error: 'Invalid library or date.' });
    }

    try {
      const [result] = await pool.query(
        'DELETE FROM library_hours WHERE library = ? AND effective_date = ?',
        [library, date]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Special day not found.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Special day removed successfully.'
      });
    } catch (error) {
      console.error('Admin special day removal error:', error);
      return res.status(500).json({ error: 'Could not remove special day.' });
    }
  }
};
