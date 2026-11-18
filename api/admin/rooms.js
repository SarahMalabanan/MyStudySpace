
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// Verify that the logged-in user is a staff member.
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

    // Check the current role directly from the database.
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

// Admin Rooms API
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!(await requireStaff(req, res))) return;

  // GET: Retrieve all rooms, including inactive rooms.
  if (req.method === 'GET') {
    try {
      const [rooms] = await pool.query(`
        SELECT
          room_id AS id,
          room_code,
          library,
          name,
          CAST(floor AS UNSIGNED) AS floor,
          seats,
          whiteboard,
          has_tv AS tv,
          has_window AS window,
          outlet,
          status,
          photo_url AS photo
        FROM rooms
        ORDER BY library, floor, room_code
      `);

      return res.status(200).json(rooms);

    } catch (error) {
      console.error('Admin room loading error:', error);
      return res.status(500).json({
        error: 'Could not load rooms.'
      });
    }
  }

  // PATCH: Update an existing room.
  const {
    id,
    name,
    seats,
    whiteboard,
    tv,
    window,
    outlet,
    status
  } = req.body || {};

  const roomId = Number(id);
  const seatCount = Number(seats);

  if (
    !Number.isSafeInteger(roomId) ||
    roomId <= 0 ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 100 ||
    !Number.isInteger(seatCount) ||
    seatCount < 1 ||
    seatCount > 30 ||
    !['active', 'inactive'].includes(status) ||
    ![whiteboard, tv, window, outlet].every(
      value => typeof value === 'boolean' ||
               value === 0 ||
               value === 1
    )
  ) {
    return res.status(400).json({
      error: 'Invalid room information.'
    });
  }

  try {
    const [result] = await pool.query(
      `
      UPDATE rooms
      SET
        name = ?,
        seats = ?,
        whiteboard = ?,
        has_tv = ?,
        has_window = ?,
        outlet = ?,
        status = ?
      WHERE room_id = ?
      `,
      [
        name.trim(),
        seatCount,
        Number(whiteboard),
        Number(tv),
        Number(window),
        Number(outlet),
        status,
        roomId
      ]
    );

    if (result.affectedRows === 0) {
      const [existing] = await pool.query(
        'SELECT room_id FROM rooms WHERE room_id = ?',
        [roomId]
      );

      if (!existing.length) {
        return res.status(404).json({
          error: 'Room not found.'
        });
      }
    }

    // Count future confirmed reservations if the room is disabled.
    let upcomingReservations = 0;

    if (status === 'inactive') {
      const [rows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM reservations
        WHERE room_id = ?
          AND status = 'confirmed'
          AND end_time > NOW()
        `,
        [roomId]
      );

      upcomingReservations = Number(rows[0].total);
    }

    return res.status(200).json({
      success: true,
      message: 'Room updated successfully.',
      upcoming_reservations: upcomingReservations
    });

  } catch (error) {
    console.error('Admin room update error:', error);
    return res.status(500).json({
      error: 'Could not update room.'
    });
  }
};
