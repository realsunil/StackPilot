const DeploymentEngine = require('../services/deploymentEngine');
const Project = require('../models/Project');
const User = require('../models/User');
const analyzerService = require('../services/analyzerService');
const vercelService = require('../services/vercelService');
const netlifyService = require('../services/netlifyService');

const STACKS = ['auto', 'frontend', 'backend', 'fullstack'];

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

    // ---- What is being deployed (frontend / backend / full-stack / auto) + database ----
    const stack = req.body.stack === undefined ? 'auto' : String(req.body.stack);
    if (!STACKS.includes(stack)) {
      return res.status(400).json({ success: false, message: `Unknown deploy type "${stack}". Use one of: ${STACKS.join(', ')}.` });
    }
    const useDatabase = req.body.useDatabase === true || req.body.useDatabase === 'true';
    const requestedPlatform = req.body.platform || project.deploymentPlatform;

    if (stack === 'frontend' && requestedPlatform === 'render') {
      return res.status(400).json({ success: false, message: 'Render hosts backends. For a frontend choose Vercel, Netlify or Auto.' });
    }
    if (stack === 'backend' && ['vercel', 'netlify'].includes(requestedPlatform)) {
      return res.status(400).json({ success: false, message: `${requestedPlatform} can't run a backend server here. Backends are deployed on Render.` });
    }
    if (stack === 'fullstack' && ['netlify', 'render'].includes(requestedPlatform)) {
      return res.status(400).json({ success: false, message: 'Full-stack deploys use Vercel for the frontend and Render for the backend. Leave the platform on Auto.' });
    }
    if (useDatabase && stack === 'frontend') {
      return res.status(400).json({ success: false, message: 'A database can\'t be attached to a frontend-only deploy (the connection string would end up in the public browser code). Choose Backend or Full-stack.' });
    }
    if (useDatabase && !(req.user.connections?.mongodb?.connected && req.user.tokens?.mongodb)) {
      return res.status(400).json({ success: false, message: 'Connect your MongoDB from the Dashboard first, then turn the database option on.' });
    }
    if (stack === 'backend' && !project.githubUrl) {
      return res.status(400).json({ success: false, message: 'Backends run on Render, which deploys from GitHub. Use the GitHub Import tab for a backend.' });
    }

    project.stack = stack;
    project.useDatabase = useDatabase;

    // Override platform if provided
    if (req.body.platform) {
      project.deploymentPlatform = req.body.platform;
    }
    await project.save();

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
        platform: project.deploymentPlatform,
        stack: project.stack,
        useDatabase: project.useDatabase
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
      .select('projectId name status logs deployedUrl deploymentPlatform services stack useDatabase');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Attach a custom domain (e.g. "www.mystartup.com") to an
//          already-deployed project, on whichever platform it was
//          deployed to. Requires attachTokens (route wires it up).
// @route   POST /api/deploy/:projectId/domain
exports.setDomain = async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain)) {
      return res.status(400).json({ success: false, message: 'Enter a valid domain, e.g. www.mysite.com' });
    }

    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    if (project.status !== 'deployed' || !project.platformRef) {
      return res.status(400).json({ success: false, message: 'Deploy this project first, then attach a domain.' });
    }

    const tokens = req.user.tokens || {};
    let result;

    if (project.deploymentPlatform === 'vercel') {
      const teamId = req.user.connections?.vercel?.teamId || null;
      result = await vercelService.addDomain(project.platformRef, domain, tokens.vercel, teamId);
    } else if (project.deploymentPlatform === 'netlify') {
      result = await netlifyService.addDomain(project.platformRef, domain, tokens.netlify);
    } else {
      return res.status(400).json({
        success: false,
        message: `Custom domains aren't supported yet for ${project.deploymentPlatform}.`
      });
    }

    project.customDomain = domain;
    project.domainStatus = result.status;
    project.domainInstructions = result.instructions;
    await project.save();

    res.json({ success: true, data: project });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc    Remove the custom domain from a project (StackPilot-side only;
//          doesn't delete the domain from the platform, just stops
//          showing/tracking it here).
// @route   DELETE /api/deploy/:projectId/domain
exports.removeDomain = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    project.customDomain = null;
    project.domainStatus = 'none';
    project.domainInstructions = null;
    await project.save();
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
