
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// I use the login cookie to identify the current user.
function getUserId(req) {
  const cookie = (req.headers.cookie || '')
    .split('; ')
    .find(item => item.startsWith('mystudyspace_session='));

  if (!cookie || !process.env.SESSION_SECRET) {
    return null;
  }

  try {
    const token = cookie.slice('mystudyspace_session='.length);

    const session = jwt.verify(
      token,
      process.env.SESSION_SECRET,
      { algorithms: ['HS256'] }
    );

    return session.userId;
  } catch (error) {
    return null;
  }
}

// Registered users can save, view, and remove favorite rooms.
module.exports = async (req, res) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      error: 'Please log in to manage favorite rooms.'
    });
  }

  try {
    // Show rooms saved by the logged-in user.
    if (req.method === 'GET') {
      const [rows] = await pool.query(
        `SELECT r.room_id AS id,
                r.room_code,
                r.floor,
                r.library
         FROM favorite_rooms f
         JOIN rooms r ON f.room_id = r.room_id
         WHERE f.user_id = ?
         ORDER BY r.floor, r.room_code`,
        [userId]
      );

      return res.status(200).json(rows);
    }

    // Save a room without creating duplicates.
    if (req.method === 'POST') {
      const roomId = Number(req.body?.roomId);

      if (!Number.isSafeInteger(roomId) || roomId <= 0) {
        return res.status(400).json({
          error: 'Invalid room ID.'
        });
      }

      await pool.query(
        `INSERT INTO favorite_rooms (user_id, room_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE room_id = room_id`,
        [userId, roomId]
      );

      return res.status(200).json({
        message: 'Room saved successfully.'
      });
    }

    // Remove a room from the user's favorites.
    if (req.method === 'DELETE') {
      const roomId = Number(req.body?.roomId);

      if (!Number.isSafeInteger(roomId) || roomId <= 0) {
        return res.status(400).json({
          error: 'Invalid room ID.'
        });
      }

      await pool.query(
        `DELETE FROM favorite_rooms
         WHERE user_id = ? AND room_id = ?`,
        [userId, roomId]
      );

      return res.status(200).json({
        message: 'Room removed from favorites.'
      });
    }

    return res.status(405).json({
      error: 'Method not allowed.'
    });

  } catch (error) {
    console.error('Favorites API error:', error.code);

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({
        error: 'Room not found.'
      });
    }

    return res.status(500).json({
      error: 'Could not manage favorite rooms.'
    });
  }
};
