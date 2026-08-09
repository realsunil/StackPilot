const DeploymentEngine = require('../services/deploymentEngine');
const Project = require('../models/Project');
const User = require('../models/User');
const analyzerService = require('../services/analyzerService');

// @desc    Start deployment
// @route   POST /api/deploy/:projectId
exports.startDeploy = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (project.status === 'deploying' || project.status === 'analyzing') {
      const stuckForMs = Date.now() - new Date(project.updatedAt).getTime();
      const TEN_MINUTES = 10 * 60 * 1000;
      if (stuckForMs < TEN_MINUTES) {
        return res.status(400).json({ success: false, message: 'Deployment already in progress' });
      }
      // It's been stuck for 10+ minutes with no status update - almost
      // certainly an old/crashed attempt, not a real in-progress deploy.
      // Let the user retry instead of being permanently blocked.
      project.status = 'failed';
      await project.save();
    }

    // Override platform if provided
    if (req.body.platform) {
      project.deploymentPlatform = req.body.platform;
      await project.save();
    }

    // Every deployment runs on the user's own connected platform accounts -
    // never on this server's own accounts.
    const userTokens = req.user.tokens || {};
    // Vercel: by default the API writes to the token owner's PERSONAL
    // account, even if the user connected from inside a team. Without
    // passing the team back explicitly, deploys silently go to a
    // different place than the dashboard the user is looking at (same
    // class of bug fixed for Netlify above) - so we carry it through.
    userTokens.vercelTeamId = req.user.connections?.vercel?.teamId || null;
    const platform = req.body.platform || project.deploymentPlatform;
    if (platform !== 'auto' && !userTokens[platform]) {
      return res.status(400).json({
        success: false,
        message: `No ${platform} token found for your account. Add it in Settings first.`
      });
    }

    // Start deployment asynchronously
    const io = req.app.get('io');
    const engine = new DeploymentEngine(io);

    // NOTE: usage is now counted when a deploy actually finishes (see
    // deploymentEngine.js), not here at request time - otherwise a bug,
    // timeout, or network hiccup that fails before ever reaching the
    // platform still burns one of the user's limited free deploys.

    // Don't await - let it run in background
    engine.startDeployment(req.params.projectId, userTokens).catch(err => {
      console.error('Deployment error:', err);
    });

    res.json({
      success: true,
      message: 'Deployment started',
      data: {
        projectId: project.projectId,
        status: 'deploying',
        platform: project.deploymentPlatform
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Analyze project (without deploying)
// @route   GET /api/deploy/:projectId/analyze
exports.analyzeProject = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });

    if (!project || !project.localPath) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const analysis = await analyzerService.analyzeProject(project.localPath);

    // Update project with analysis
    project.detectedType = analysis.detectedType;
    project.category = analysis.category;
    project.metadata = {
      framework: analysis.framework,
      language: analysis.language,
      packageManager: analysis.packageManager,
      hasDockerfile: analysis.hasDockerfile,
      hasBuildScript: analysis.hasBuildScript,
      dependencies: analysis.dependencies.slice(0, 50),
      nodeVersion: analysis.nodeVersion
    };
    await project.save();

    res.json({
      success: true,
      data: {
        ...analysis,
        projectId: project.projectId,
        projectName: project.name
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get deployment logs
// @route   GET /api/deploy/:projectId/logs
exports.getDeployLogs = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id })
      .select('projectId name status logs deployedUrl deploymentPlatform');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};