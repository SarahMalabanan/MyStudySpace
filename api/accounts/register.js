
/*
 * MyStudySpace - Account Registration
 *
 * SPRINT 2 REGISTRATION FLOW:
 *
 * 1. Validate the user's registration information.
 * 2. Check that the email address is not already registered.
 * 3. Hash the password using bcrypt.
 * 4. Save the new account in the existing MySQL users table.
 * 5. Return a success response.
 *
 * Users must log in separately after registration.
 * This endpoint does not create a JWT or login session.
 */

const bcrypt = require('bcryptjs');
const pool = require('../../lib/db');

// Create a new registered MyStudySpace account.
module.exports = async (req, res) => {

  // Only allow POST requests for account registration.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');

    return res.status(405).json({
      error: 'Method not allowed.'
    });
  }

  // Read the registration information from the request.
  const { firstName, lastName, email, password } = req.body || {};

  /*
   * STEP 1: VALIDATE INPUT TYPES
   *
   * All registration fields must contain strings.
   */
  if (
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string'
  ) {
    return res.status(400).json({
      error: 'Please complete all registration fields.'
    });
  }

  // Remove unnecessary spaces and normalize the email.
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  const cleanEmail = email.trim().toLowerCase();

  /*
   * STEP 2: VALIDATE REQUIRED FIELDS
   *
   * Names, email, and password cannot be empty.
   */
  if (
    !cleanFirstName ||
    !cleanLastName ||
    !cleanEmail ||
    !password
  ) {
    return res.status(400).json({
      error: 'Please complete all registration fields.'
    });
  }

  /*
   * STEP 3: VALIDATE NAME LENGTH
   *
   * Match the existing users table and registration form.
   */
  const fullName = `${cleanFirstName} ${cleanLastName}`;

  if (
    cleanFirstName.length > 50 ||
    cleanLastName.length > 50 ||
    fullName.length > 100
  ) {
    return res.status(400).json({
      error: 'First and last names must be 50 characters or fewer.'
    });
  }

  /*
   * STEP 4: VALIDATE EMAIL
   *
   * Check the email format and maximum length.
   * The database also enforces email uniqueness.
   */
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    !emailPattern.test(cleanEmail) ||
    cleanEmail.length > 255
  ) {
    return res.status(400).json({
      error: 'Please enter a valid email address.'
    });
  }

  /*
   * STEP 5: VALIDATE PASSWORD
   *
   * Require at least 8 characters.
   *
   * bcrypt uses a maximum of 72 UTF-8 bytes.
   * Reject longer passwords to avoid truncation.
   */
  const passwordBytes = Buffer.byteLength(password, 'utf8');

  if (
    password.length < 8 ||
    passwordBytes > 72
  ) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and no more than 72 bytes.'
    });
  }

  try {
    /*
     * STEP 6: HASH THE PASSWORD
     *
     * bcrypt converts the password into a secure hash.
     * The original password is never stored in MySQL.
     */
    const passwordHash = await bcrypt.hash(password, 12);

    /*
     * STEP 7: CREATE THE ACCOUNT
     *
     * Insert the new user into the existing users table.
     *
     * Parameterized queries help prevent SQL injection.
     * The default role remains 'student'.
     */
    const [result] = await pool.query(
      `INSERT INTO users
       (full_name, first_name, last_name, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'student')`,
      [
        fullName,
        cleanFirstName,
        cleanLastName,
        cleanEmail,
        passwordHash
      ]
    );

    /*
     * STEP 8: CONFIRM REGISTRATION
     *
     * Registration creates the account but does not log
     * the user in.
     *
     * No JWT or authentication cookie is created here.
     * The frontend redirects to login.html.
     */
    return res.status(201).json({
      message: 'Account created successfully. Please log in.',
      userId: result.insertId,
      firstName: cleanFirstName
    });

  } catch (error) {
    /*
     * DUPLICATE EMAIL PROTECTION
     *
     * MySQL returns ER_DUP_ENTRY when a unique email
     * address already exists.
     */
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'Email already registered.'
      });
    }

    // Log server errors without exposing private account data.
    console.error(
      'Registration failed:',
      error.code || error.message
    );

    return res.status(500).json({
      error: 'Could not create account.'
    });
  }
};
