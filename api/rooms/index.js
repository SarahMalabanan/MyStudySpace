const pool = require('../../lib/db');

// GET /api/rooms  ->  list of active rooms, using the names the frontend expects
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT room_id AS id,
              room_code,
              library,
              name,
              CAST(floor AS UNSIGNED) AS floor,
              seats,
              whiteboard,
              has_window AS window,
              outlet
       FROM rooms
       WHERE status = 'active'
       ORDER BY library, floor, room_code`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load rooms' });
  }
};