const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// If this user's email is listed in ADMIN_EMAILS (.env), promote them to
// role: 'admin' the moment they log in/register. Comma-separated, case
// insensitive. Does nothing if ADMIN_EMAILS is empty/unset.
const syncAdminRole = async (user) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const shouldBeAdmin = adminEmails.includes(user.email.toLowerCase());

  if (shouldBeAdmin && user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
  }
};

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

    const user = await User.create({ name, email, password });
    await syncAdminRole(user);

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

    await syncAdminRole(user);

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        role: user.role,
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
