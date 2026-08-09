const express = require('express');
const router = express.Router();
const { register, login, getMe, updateTokens } = require('../controllers/authController');
const {
  getStatus,
  vercelConnect,
  vercelCallback,
  netlifyConnect,
  netlifyCallback,
  connectRender,
  disconnect,
  logout
} = require('../controllers/connectionController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
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

router.delete('/connect/:provider', protect, disconnect);

module.exports = router;
