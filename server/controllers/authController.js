const User = require('../models/User');
const jwt = require('jsonwebtoken');

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

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.suspended) {
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
