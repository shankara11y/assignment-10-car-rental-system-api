const { supabase } = require('../config/supabase');

/**
 * Middleware to authenticate requests using Supabase JWT Access Tokens.
 * Expects 'Authorization: Bearer <access_token>'
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Missing or invalid Authorization header format. Expected "Bearer <token>"',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Token is missing',
      });
    }

    // Verify token with Supabase Auth
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid or expired token',
        error: error ? error.message : 'User not found',
      });
    }

    // Attach authenticated user to request
    req.user = data.user;
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
      error: err.message,
    });
  }
};

module.exports = authMiddleware;
