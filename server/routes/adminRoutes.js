const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { adminAccess } = require('../middleware/auth');
const { unlock, listUsers, listLogins, getStats, updateUser, deleteUser } = require('../controllers/adminController');

// Password gate: max 8 wrong tries per 15 min per IP (stops brute-forcing).
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});
router.post('/unlock', unlockLimiter, unlock);

// Everything below needs the admin-panel token OR an admin login.
router.use(adminAccess);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.get('/logins', listLogins);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

module.exports = router;
