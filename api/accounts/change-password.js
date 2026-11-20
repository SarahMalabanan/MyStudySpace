
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../../lib/db');

// MyStudySpace - Change Password API
//
// This endpoint allows registered users to change their passwords
// without requiring email confirmation.
//
// The user must be logged in and provide their current password.
// The new password is hashed before being saved in MySQL.
//
// This file only updates account passwords. It does not modify
// reservations, notifications, or other Sprint 2 functionality.

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  // Only allow POST requests for password changes.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      error: 'Method not allowed.'
    });
  }

  // STEP 1: Verify the user's existing login session.
  const sessionCookie = (req.headers.cookie || '')
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith('mystudyspace_session='));

  if (!sessionCookie || !process.env.SESSION_SECRET) {
    return res.status(401).json({
      error: 'Please log in to change your password.'
    });
  }

  let userId;

  try {
    const token = decodeURIComponent(
      sessionCookie.slice('mystudyspace_session='.length)
    );

    // Use the same JWT settings as recognizeduser.js.
    const session = jwt.verify(
      token,
      process.env.SESSION_SECRET,
      { algorithms: ['HS256'] }
    );

    userId = Number(session.userId);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      throw new Error('Invalid account ID');
    }

  } catch (error) {
    return res.status(401).json({
      error: 'Your session has expired. Please log in again.'
    });
  }

  // STEP 2: Read the password information from Account Settings.
  const {
    currentPassword,
    newPassword,
    confirmPassword
  } = req.body || {};

  // Make sure all three fields contain valid text.
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    typeof confirmPassword !== 'string' ||
    !currentPassword ||
    !newPassword ||
    !confirmPassword
  ) {
    return res.status(400).json({
      error: 'Please complete all password fields.'
    });
  }

  // Require a password between 8 and 72 UTF-8 bytes.
  // bcrypt has a 72-byte input limit, not a 72-character limit.
  if (
    newPassword.length < 8 ||
    Buffer.byteLength(newPassword, 'utf8') > 72
  ) {
    return res.status(400).json({
      error: 'Your new password must be at least 8 characters and no more than 72 bytes.'
    });
  }

  // Confirm that both new password fields match.
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      error: 'Your new passwords do not match.'
    });
  }

  try {
    // STEP 3: Retrieve the current password hash from MySQL.
    // Only the authenticated account can be updated.
    const [rows] = await pool.query(
      `
      SELECT user_id, password_hash
      FROM users
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: 'Account not found.'
      });
    }

    const storedHash = rows[0].password_hash;

    // STEP 4: Verify the current password.
    const currentPasswordMatches = await bcrypt.compare(
      currentPassword,
      storedHash
    );

    if (!currentPasswordMatches) {
      return res.status(400).json({
        error: 'Your current password is incorrect.'
      });
    }

    // Prevent the user from selecting their existing password again.
    const samePassword = await bcrypt.compare(
      newPassword,
      storedHash
    );

    if (samePassword) {
      return res.status(400).json({
        error: 'Your new password must be different from your current password.'
      });
    }

    // STEP 5: Hash the new password before storing it.
    // Plain-text passwords are never saved in the database.
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // STEP 6: Update the password in the existing users table.
    // Checking the old hash prevents overwriting another
    // password change that happened at the same time.
    const [result] = await pool.query(
      `
      UPDATE users
      SET password_hash = ?
      WHERE user_id = ?
        AND password_hash = ?
      `,
      [newPasswordHash, userId, storedHash]
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        error: 'Your password was updated elsewhere. Please try again.'
      });
    }

    // STEP 7: Confirm success without returning password information.
    return res.status(200).json({
      message: 'Password changed successfully!'
    });

  } catch (error) {
    console.error('Change password error:', error);

    return res.status(500).json({
      error: 'Could not change your password. Please try again.'
    });
  }
};
