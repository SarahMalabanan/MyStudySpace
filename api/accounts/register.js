
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// Creates a new account and signs the user in.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { firstName, lastName, email, password } = req.body || {};

  // Validate the information before saving it.
  if (
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !firstName.trim() ||
    !lastName.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    password.length < 8 ||
    firstName.trim().length > 50 ||
    lastName.trim().length > 50 ||
    (firstName.trim() + ' ' + lastName.trim()).length > 100 ||
    email.trim().length > 255
  ) {
    return res.status(400).json({
      error: 'Please enter valid information and a password of at least 8 characters.'
    });
  }

  // Do not register users without a session signing secret.
  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({
      error: 'Account registration is not configured.'
    });
  }

  try {
    // Hash the password before storing it.
    const passwordHash = await bcrypt.hash(password, 12);

    // Automatically save the account to MySQL.
    const [result] = await pool.query(
      `INSERT INTO users
       (full_name, first_name, last_name, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'student')`,
      [
        `${firstName.trim()} ${lastName.trim()}`,
        firstName.trim(),
        lastName.trim(),
        email.trim().toLowerCase(),
        passwordHash
      ]
    );

    // Create a signed session for the registered user.
    const token = jwt.sign(
      { userId: result.insertId, role: 'student' },
      process.env.SESSION_SECRET,
      { expiresIn: '2h', algorithm: 'HS256' }
    );

    // Store the session in an HTTP-only cookie.
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

    return res.status(201).json({
      message: 'Account created successfully',
      userId: result.insertId,
      firstName: firstName.trim()
    });

  } catch (error) {
    // Prevent duplicate email registrations.
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Email already registered'
      });
    }

    console.error('Registration failed:', error.code);

    return res.status(500).json({
      error: 'Could not create account'
    });
  }
};
