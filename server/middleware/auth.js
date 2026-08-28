const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (req.user.suspended) {
      return res.status(403).json({ success: false, message: 'This account has been suspended.' });
    }

    // Fire-and-forget "last seen" heartbeat for the admin panel's online
    // indicator. Never awaited/blocking - a slow write here must not add
    // latency to every single request.
    User.findByIdAndUpdate(req.user._id, { lastActiveAt: new Date() }).catch(() => {});

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

// Admin-only routes. Must run AFTER protect.
exports.isAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// Deploy routes need the user's actual saved tokens, which are hidden
// (select: false) on every other route so they never leak to the client.
// This runs AFTER protect and re-fetches just the token fields.
exports.attachTokens = async (req, res, next) => {
  try {
    const withTokens = await User.findById(req.user._id).select(
      '+tokens.vercel +tokens.netlify +tokens.render +tokens.github +tokens.netlifyAccountSlug'
    );
    req.user.tokens = withTokens.tokens;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load connected accounts' });
  }
};

exports.checkDeployLimit = async (req, res, next) => {
  if (req.user.plan === 'free' && req.user.deployCount >= req.user.maxDeploys) {
    return res.status(403).json({
      success: false,
      message: `Free plan limit reached (${req.user.maxDeploys} deploys). Upgrade to Pro!`
    });
  }
  next();
};
