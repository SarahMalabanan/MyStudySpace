/**
 * MyStudySpace - Who is logged in?
 *
 * Every reservation endpoint asks this ONE function. When real login exists,
 * only this file changes. Until then, development uses a test user from .env.
 */
function getCurrentUserId(req) {
  const fromAuth = req.user && req.user.user_id;
  if (Number.isSafeInteger(fromAuth) && fromAuth > 0) return fromAuth;

  // Development only (never active on a production deployment).
  if (process.env.VERCEL_ENV !== 'production') {
    const dev = Number(process.env.DEV_USER_ID);
    if (Number.isSafeInteger(dev) && dev > 0) return dev;
  }
  return null;
}

module.exports = { getCurrentUserId };