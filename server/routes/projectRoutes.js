const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { protect, attachTokens } = require('../middleware/auth');

const {
  uploadProject,
  importFromGitHub,
  getProjects,
  getProject,
  deleteProject,
  getProjectTree
} = require('../controllers/projectController');

router.post('/upload', protect, upload.single('project'), uploadProject);
// Needs attachTokens - without it req.user.tokens.github is always
// missing (tokens are select:false by default), so private repo clones
// silently fall back to no auth and fail even when GitHub is connected.
router.post('/github', protect, attachTokens, importFromGitHub);
router.get('/', protect, getProjects);
router.get('/:projectId', protect, getProject);
router.delete('/:projectId', protect, deleteProject);
router.get('/:projectId/tree', protect, getProjectTree);

module.exports = router;