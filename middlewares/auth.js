/**
 * Authentication and role-based route middleware.
 * centralizes session checks used by admin and student routes.
 */

/**
 * Redirect to login when the user is not authenticated.
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/auth/login?error=Please login to continue.');
}

/**
 * Create a middleware that requires a specific user role.
 * @param {string} role
 */
function requireRole(role) {
  return function (req, res, next) {
    if (req.session && req.session.userId && req.session.role === role) {
      return next();
    }
    return res.redirect('/auth/login?error=Unauthorized access.');
  };
}

/**
 * Middleware for admin-only routes.
 */
const requireAdmin = requireRole('admin');

/**
 * Middleware for student-only routes.
 */
const requireStudent = requireRole('student');

module.exports = {
  requireLogin,
  requireAdmin,
  requireStudent,
  requireRole
};
