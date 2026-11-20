
/*
 * MyStudySpace - Registered Account Login
 *
 * SPRINT 2 LOGIN FLOW:
 *
 * 1. Validate the submitted email and password.
 * 2. Find the registered account in MySQL.
 * 3. Verify the password using bcrypt.
 * 4. Create a signed JWT for the authenticated user.
 * 5. Store the JWT in an HttpOnly session cookie.
 * 6. Automatically expire the session after two hours.
 *
 * Users must log in after creating an account.
 * Guest Access is handled separately without JWT.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../lib/db');

// Keep the login session active for two hours.
const SESSION_DURATION = 2 * 60 * 60;

// Authenticate an existing registered account.
module.exports = async (req, res) => {

  /*
   * STEP 1: VALIDATE THE REQUEST METHOD
   *
   * Only POST requests can submit login credentials.
   */
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      error: 'Method not allowed.'
    });
  }

  // Read the submitted login credentials.
  const { email, password } = req.body || {};

  /*
   * STEP 2: VALIDATE REQUIRED FIELDS
   *
   * Both fields must be nonempty strings.
   */
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

  /*
   * STEP 3: VALIDATE EMAIL FORMAT
   *
   * Use the same basic email format as registration.
   */
  const normalizedEmail = email.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !emailPattern.test(normalizedEmail) ||
    normalizedEmail.length > 255
  ) {
    return res.status(400).json({
      error: 'Please enter a valid email address.'
    });
  }

  /*
   * STEP 4: CHECK SESSION CONFIGURATION
   *
   * SESSION_SECRET is required to sign JWT tokens.
   */
  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({
      error: 'Login is not configured.'
    });
  }

  try {
    /*
     * STEP 5: FIND THE REGISTERED ACCOUNT
     *
     * Use a parameterized SQL query to locate the account.
     * Email addresses are normalized to lowercase.
     */
    const [rows] = await pool.query(
      `SELECT
         user_id,
         first_name,
         email,
         password_hash,
         role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = rows[0];

    /*
     * STEP 6: VERIFY THE PASSWORD
     *
     * Compare the submitted password against its bcrypt
     * hash stored in the existing users table.
     *
     * Never compare or store plaintext passwords in MySQL.
     */
    const validPassword = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    // Use one error for an unknown email or incorrect password.
    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    /*
     * STEP 7: CREATE THE AUTHENTICATED SESSION
     *
     * JWT = JSON Web Token.
     *
     * The token contains the verified user ID and role.
     * It expires after two hours.
     */
    const token = jwt.sign(
      {
        userId: user.user_id,
        role: user.role
      },
      process.env.SESSION_SECRET,
      {
        expiresIn: SESSION_DURATION,
        algorithm: 'HS256'
      }
    );

    /*
     * STEP 8: CREATE THE SESSION COOKIE
     *
     * HttpOnly:
     * Prevents JavaScript from reading the JWT.
     *
     * SameSite=Lax:
     * Helps protect against cross-site requests.
     *
     * Path=/:
     * Makes the cookie available across MyStudySpace.
     *
     * Max-Age:
     * Expires the cookie after two hours.
     */
    const cookie = [
      `mystudyspace_session=${token}`,
      'HttpOnly',
      'Path=/',
      'SameSite=Lax',
      `Max-Age=${SESSION_DURATION}`
    ];

    /*
     * Require HTTPS for session cookies in production.
     * Keep local HTTP development working.
     */
    if (process.env.NODE_ENV === 'production') {
      cookie.push('Secure');
    }

    // Store the signed session token in the browser cookie.
    res.setHeader('Set-Cookie', cookie.join('; '));

    /*
     * STEP 9: CONFIRM SUCCESSFUL LOGIN
     *
     * Return only the information required by the frontend.
     * The JWT remains inside the HttpOnly cookie.
     */
    return res.status(200).json({
      message: 'Login successful',
      firstName: user.first_name,
      role: user.role
    });

  } catch (error) {
    // Log server errors without exposing private credentials.
    console.error(
      'Login failed:',
      error.code || error.message
    );

    return res.status(500).json({
      error: 'Could not log in.'
    });
  }
};
