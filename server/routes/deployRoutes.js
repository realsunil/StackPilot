const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect, checkDeployLimit, attachTokens } = require('../middleware/auth');

const {
  startDeploy,
  analyzeProject,
  getDeployLogs,
  setDomain,
  removeDomain
} = require('../controllers/deployController');
const { quickAnalyze } = require('../controllers/analyzerController');

// Only rate-limits STARTING a deployment (abuse prevention). This must
// never apply to /analyze or /logs - those are read/status routes that
// the frontend polls every 2s while a deploy is running, and if they
// shared this budget a running deploy would lock itself out of being
// able to report its own completion (looks "stuck" even after success).
const deployStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Deploy limit reached, try again in 1 hour'
});

router.post('/:projectId', deployStartLimiter, protect, attachTokens, checkDeployLimit, startDeploy);
router.get('/:projectId/analyze', protect, analyzeProject);
router.get('/:projectId/logs', protect, getDeployLogs);
router.post('/analyze/quick', protect, quickAnalyze);

// Custom domain management - needs the user's real platform tokens
// (attachTokens), same as starting a deploy does.
router.post('/:projectId/domain', protect, attachTokens, setDomain);
router.delete('/:projectId/domain', protect, removeDomain);

module.exports = router;
