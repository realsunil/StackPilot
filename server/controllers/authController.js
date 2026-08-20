const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Emails listed in ADMIN_EMAILS (.env, comma-separated) get auto-promoted
// to isAdmin on login, so you don't have to hand-edit the DB to get access
// to the admin panel. e.g. ADMIN_EMAILS=you@example.com,teacher@example.com
const isAdminEmail = (email) => {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email).toLowerCase());
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

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
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

    // Track login activity for the admin panel + auto-promote configured admins
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    if (isAdminEmail(user.email)) user.isAdmin = true;
    await user.save();

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        deployCount: user.deployCount,
        maxDeploys: user.maxDeploys,
        isAdmin: user.isAdmin,
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
