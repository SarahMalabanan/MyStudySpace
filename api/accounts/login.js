
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// Checks existing account credentials and creates a login session.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  // Make sure both login fields were provided.
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      error: 'Please enter your email and password.'
    });
  }

  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({
      error: 'Login is not configured.'
    });
  }

  try {
    // Find the account using its email address.
    const [rows] = await pool.query(
      `SELECT user_id, first_name, email, password_hash, role
       FROM users WHERE email = ? LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    // Compare the entered password with the stored hash.
    const validPassword = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    // Create a signed session for the logged-in user.
    const token = jwt.sign(
      { userId: user.user_id, role: user.role },
      process.env.SESSION_SECRET,
      { expiresIn: '2h', algorithm: 'HS256' }
    );

    const cookie = [
      `mystudyspace_session=${token}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      'Max-Age=7200'
    ];

    if (process.env.NODE_ENV === 'production') {
      cookie.push('Secure');
    }

    res.setHeader('Set-Cookie', cookie.join('; '));

    return res.status(200).json({
      message: 'Login successful',
      firstName: user.first_name
    });

  } catch (error) {
    console.error('Login failed:', error.code);

    return res.status(500).json({
      error: 'Could not log in.'
    });
  }
};
