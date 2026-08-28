const User = require('../models/User');
const Project = require('../models/Project');

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
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
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
    const [totalUsers, onlineUsers, totalProjects, deployedProjects, adminCount] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveAt: { $gte: fiveMinAgo } }),
      Project.countDocuments(),
      Project.countDocuments({ status: 'deployed' }),
      User.countDocuments({ role: 'admin' })
    ]);

    res.json({
      success: true,
      data: { totalUsers, onlineUsers, totalProjects, deployedProjects, adminCount }
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

    if (req.params.id === String(req.user._id) && (role === 'user' || suspended === true)) {
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
    if (req.params.id === String(req.user._id)) {
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
