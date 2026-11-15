
/*
 * Logs users out of MyStudySpace by clearing
 * their login session cookie.
 */

module.exports = async (req, res) => {
  // Only allow logout requests.
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  // Clear the login session cookie.
  const cookie = [
    'mystudyspace_session=',
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (process.env.NODE_ENV === 'production') {
    cookie.push('Secure');
  }

  res.setHeader('Set-Cookie', cookie.join('; '));

  return res.status(200).json({
    message: 'Logged out successfully'
  });
};
