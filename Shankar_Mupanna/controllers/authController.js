const { supabase } = require('../config/supabase');

/**
 * Register a new user with Supabase Auth
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || '',
        },
      },
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Login user with Supabase Auth & receive access token
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return res.status(401).json({
        success: false,
        message: error ? error.message : 'Invalid credentials',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      access_token: data.session.access_token,
      token_type: 'Bearer',
      expires_in: data.session.expires_in,
      user: data.user,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
};
