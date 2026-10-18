const User = require('../models/User');
const jwt = require('jsonwebtoken');
const LoginLog = require('../models/LoginLog');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../utils/mailer');

// Records every login/register attempt for the Admin Panel's "Login history"
// tab. Fire-and-forget: a logging failure must never break a real login.
const logAttempt = (req, data) => {
  LoginLog.create({
    ip: req.ip || '',
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ...data
  }).catch(() => {});
};

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ADMIN_EMAILS is a comma-separated list of emails set in your host's
// environment variables (e.g. Vercel → Project → Environment Variables),
// case-insensitive, e.g. ADMIN_EMAILS=you@example.com,cofounder@example.com
// Anyone whose email is on this list is auto-promoted to admin every time
// they log in or register - this is the primary way to grant admin on a
// site that's already live with existing users.
const getAdminEmailAllowlist = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

const isAllowlistedAdmin = (email) =>
  getAdminEmailAllowlist().includes(String(email).toLowerCase());

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be 6+ chars' });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Two independent ways to become admin, so there's always a way in:
    // 1. Your email is listed in the ADMIN_EMAILS env var (preferred -
    //    works on an already-live site with existing users).
    // 2. You're the very first account ever created on an empty database.
    const isFirstUser = (await User.estimatedDocumentCount()) === 0;
    const shouldBeAdmin = isAllowlistedAdmin(email) || isFirstUser;

    const user = await User.create({
      name, email, password,
      role: shouldBeAdmin ? 'admin' : 'user'
    });

    logAttempt(req, { user: user._id, email: user.email, name: user.name, method: 'register', success: true });

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }
    const cleanEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email });
    if (!user) {
      logAttempt(req, { email: cleanEmail, success: false, reason: 'user_not_found' });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!(await user.matchPassword(password))) {
      logAttempt(req, { user: user._id, email: user.email, name: user.name, success: false, reason: 'invalid_password' });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.suspended) {
      logAttempt(req, { user: user._id, email: user.email, name: user.name, success: false, reason: 'suspended' });
      return res.status(403).json({ success: false, message: 'This account has been suspended.' });
    }

    // Re-check the allowlist on every login. This means adding an email
    // to ADMIN_EMAILS on Vercel grants admin the next time that person
    // logs in - no DB edit, no redeploy needed for that step. It only
    // ever promotes (never demotes) via this path - removing an email
    // from the list does not auto-revoke; use the admin panel for that.
    if (isAllowlistedAdmin(user.email) && user.role !== 'admin') {
      user.role = 'admin';
    }

    user.lastLoginAt = new Date();
    user.lastActiveAt = new Date();
    await user.save();

    logAttempt(req, { user: user._id, email: user.email, name: user.name, method: 'login', success: true });

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        deployCount: user.deployCount,
        maxDeploys: user.maxDeploys,
        token: generateToken(user._id)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMe = async (req, res) => {
  res.json({ success: true, data: req.user });
};

exports.updateTokens = async (req, res) => {
  try {
    const { vercel, netlify, render, github } = req.body;
    
    const user = await User.findById(req.user._id);
    if (vercel !== undefined) user.tokens.vercel = vercel;
    if (netlify !== undefined) user.tokens.netlify = netlify;
    if (render !== undefined) user.tokens.render = render;
    if (github !== undefined) user.tokens.github = github;
    
    await user.save();
    res.json({ success: true, message: 'Tokens updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------
const RESET_MINUTES = 30;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

// @desc    Email a password-reset link
// @route   POST /api/auth/forgot-password
// Always answers the same way whether or not the email exists, so this
// can't be used to find out who has an account.
exports.forgotPassword = async (req, res) => {
  const generic = {
    success: true,
    message: 'If an account exists for that email, a reset link has been sent.'
  };
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = hashToken(rawToken);
      user.resetPasswordExpires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
      await user.save();

      const base = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
      const resetUrl = `${base}/reset-password/${rawToken}`;

      // Not awaited: the response time must not reveal whether the account
      // exists. A mail failure is logged, never shown to the requester.
      sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl, minutes: RESET_MINUTES })
        .catch(err => console.error('[mailer] Failed to send reset email:', err.message));
    }
    res.json(generic);
  } catch (error) {
    console.error('forgotPassword error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};

// @desc    Set a new password using the emailed token
// @route   POST /api/auth/reset-password/:token
exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be 6+ chars' });
    }

    const user = await User.findOne({
      resetPasswordToken: hashToken(String(req.params.token)),
      resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    user.password = password; // hashed by the pre('save') hook
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null; // link works only once
    await user.save();

    res.json({ success: true, message: 'Password updated. You can log in now.' });
  } catch (error) {
    console.error('resetPassword error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};
