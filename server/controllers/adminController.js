const User = require('../models/User');

// GET /api/admin/users
// Returns every user with their login activity, sorted so the
// most-recently-active users float to the top (never-logged-in last).
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('name email isAdmin plan lastLogin loginCount deployCount maxDeploys createdAt connections')
      .lean();

    const sorted = users.sort((a, b) => {
      if (!a.lastLogin && !b.lastLogin) return new Date(b.createdAt) - new Date(a.createdAt);
      if (!a.lastLogin) return 1;
      if (!b.lastLogin) return -1;
      return new Date(b.lastLogin) - new Date(a.lastLogin);
    });

    const stats = {
      total: sorted.length,
      loggedIn: sorted.filter(u => u.lastLogin).length,
      neverLoggedIn: sorted.filter(u => !u.lastLogin).length
    };

    res.json({ success: true, data: { users: sorted, stats } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
