const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../middleware/auth');
const { listUsers, getStats, updateUser, deleteUser } = require('../controllers/adminController');

// Every route here requires a valid login AND role === 'admin'.
router.use(protect, isAdmin);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

module.exports = router;
