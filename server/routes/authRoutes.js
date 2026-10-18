const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, login, getMe, updateTokens, forgotPassword, resetPassword } = require('../controllers/authController');
const {
  getStatus,
  vercelConnect,
  vercelCallback,
  netlifyConnect,
  netlifyCallback,
  connectRender,
  connectMongo,
  disconnect,
  logout
} = require('../controllers/connectionController');
const { protect } = require('../middleware/auth');

// Forgot-password: limited per IP so it can't be used to spam inboxes
// or to guess reset tokens.
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset requests. Try again in 15 minutes.' }
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotLimiter, forgotPassword);
router.post('/reset-password/:token', resetLimiter, resetPassword);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/tokens', protect, updateTokens);

// Connections dashboard
router.get('/connections', protect, getStatus);

// "Login with Vercel" / "Login with Netlify" - real OAuth redirects.
// These are hit as a full-page browser navigation (not fetch), so the
// user's JWT travels as a query param instead of an Authorization header.
router.get('/connect/vercel', vercelConnect);
router.get('/connect/vercel/callback', vercelCallback);
router.get('/connect/netlify', netlifyConnect);
router.get('/connect/netlify/callback', netlifyCallback);

// Render has no public OAuth - one-time API key connect instead.
router.post('/connect/render', protect, connectRender);

// MongoDB - paste a connection string (validated, then stored encrypted).
router.post('/connect/mongodb', protect, connectMongo);

router.delete('/connect/:provider', protect, disconnect);

module.exports = router;
