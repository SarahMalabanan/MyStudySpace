
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// Checks whether a user is currently logged in.
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the session cookie created during login.
  const token = req.headers.cookie
    ?.split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith('mystudyspace_session='))
    ?.slice('mystudyspace_session='.length);

  if (!token || !process.env.SESSION_SECRET) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    // Verify that the user's session is still valid.
    const session = jwt.verify(token, process.env.SESSION_SECRET, {
      algorithms: ['HS256']
    });

    // Get the logged-in user's information from MySQL.
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, role
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [session.userId]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Account not found' });
    }

    // Return the user's information without their password.
    return res.status(200).json(rows[0]);

  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};
