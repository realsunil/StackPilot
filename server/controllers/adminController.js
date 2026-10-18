const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Project = require('../models/Project');
const LoginLog = require('../models/LoginLog');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Constant-time password comparison (hashes first so lengths always match).
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// @desc    Hidden admin gate: exchange the admin password for a 2h token
// @route   POST /api/admin/unlock
// The password lives ONLY in the ADMIN_PANEL_PASSWORD env var on your server
// (Render) - it is never in the code or the GitHub repo.
exports.unlock = (req, res) => {
  const expected = process.env.ADMIN_PANEL_PASSWORD;
  if (!expected) {
    return res.status(503).json({ success: false, message: 'Admin password is not configured on the server (ADMIN_PANEL_PASSWORD).' });
  }
  const { password } = req.body || {};
  if (typeof password !== 'string' || !safeEqual(password, expected)) {
    return res.status(401).json({ success: false, message: 'Wrong password' });
  }
  const token = jwt.sign({ purpose: 'admin-panel' }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.json({ success: true, data: { token, expiresInMinutes: 120 } });
};

// @desc    Login / register history (who logged in with which email)
// @route   GET /api/admin/logins?search=&status=success|failed&page=1&limit=30
exports.listLogins = async (req, res) => {
  try {
    const { search = '', status = '', page = 1, limit = 30 } = req.query;
    const query = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ email: rx }, { name: rx }, { ip: rx }];
    }
    if (status === 'success') query.success = true;
    if (status === 'failed') query.success = false;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));

    const [logs, total] = await Promise.all([
      LoginLog.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
      LoginLog.countDocuments(query)
    ]);

    res.json({ success: true, data: { logs, total, page: pageNum, pages: Math.ceil(total / limitNum) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// A user counts as "online" if they've made an authenticated request
// (see middleware/auth.js's lastActiveAt heartbeat) in the last 5 minutes.
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const withOnline = (user) => {
  const obj = user.toObject ? user.toObject() : user;
  const isOnline = !!obj.lastActiveAt && (Date.now() - new Date(obj.lastActiveAt).getTime()) < ONLINE_WINDOW_MS;
  return { ...obj, isOnline };
};

// @desc    List all users (admin)
// @route   GET /api/admin/users
exports.listUsers = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25 } = req.query;
    const query = search
      ? { $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { email: { $regex: escapeRegex(search), $options: 'i' } }
        ] }
      : {};

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        users: users.map(withOnline),
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get overall stats for the admin dashboard
// @route   GET /api/admin/stats
exports.getStats = async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - ONLINE_WINDOW_MS);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, onlineUsers, totalProjects, deployedProjects, adminCount, loginsToday] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: fiveMinAgo } }),
      Project.countDocuments(),
      Project.countDocuments({ status: 'deployed' }),
      User.countDocuments({ role: 'admin' }),
      LoginLog.countDocuments({ success: true, method: 'login', createdAt: { $gte: dayAgo } })
    ]);

    res.json({
      success: true,
      data: { totalUsers, onlineUsers, totalProjects, deployedProjects, adminCount, loginsToday }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a user (role / plan / limits / suspension)
// @route   PATCH /api/admin/users/:id
exports.updateUser = async (req, res) => {
  try {
    const { role, plan, maxDeploys, suspended } = req.body;

    if (req.user && req.params.id === String(req.user._id) && (role === 'user' || suspended === true)) {
      return res.status(400).json({ success: false, message: "You can't demote or suspend your own account." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (role !== undefined) user.role = role;
    if (plan !== undefined) user.plan = plan;
    if (maxDeploys !== undefined) user.maxDeploys = maxDeploys;
    if (suspended !== undefined) user.suspended = suspended;

    await user.save();
    const safe = await User.findById(user._id).select('-password');
    res.json({ success: true, data: withOnline(safe) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a user and their projects
// @route   DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    if (req.user && req.params.id === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You can't delete your own account." });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await Project.deleteMany({ user: user._id });
    await user.deleteOne();

    res.json({ success: true, message: 'User and their projects deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
