const vercelService = require('./vercelService');
const netlifyService = require('./netlifyService');
const renderService = require('./renderService');
const analyzerService = require('./analyzerService');
const Project = require('../models/Project');
const User = require('../models/User');
const Logger = require('../utils/logger');
const path = require('path');
const { planDeployment, dbEnv, apiEnv } = require('./stackPlanner');
const { makeRedactor } = require('../utils/redact');
const { decrypt } = require('../utils/crypto');

const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

class DeploymentEngine {

  constructor(io) {
    this.io = io;
    // Replaced with a real redactor once we hold secrets (see doDeploy).
    this.redact = (t) => t;
  }

  async startDeployment(projectId, userTokens = {}) {
    const project = await Project.findOne({ projectId }).populate('user');
    if (!project) throw new Error('Project not found');

    const logger = new Logger(projectId, this.io);

    try {
      const result = await this.runDeployment(project, userTokens, logger);

      project.status = 'deployed';
      project.deployedUrl = result.url;
      project.deploymentPlatform = result.platform;
      // Needed later to attach a custom domain without redeploying.
      project.platformRef = result.projectName || result.siteId || null;
      project.services = result.services || [{ role: 'app', platform: result.platform, url: result.url, dir: '' }];
      await project.save();

      // Only count real, completed deploys against the free-tier limit -
      // counting at request time (the old behavior) meant a bug or
      // timeout that failed before ever reaching the platform still
      // burned one of the user's 10 free deploys.
      if (project.user?.plan === 'free') {
        await User.findByIdAndUpdate(project.user._id, { $inc: { deployCount: 1 } }).catch(() => {});
      }

      await logger.success(`🎉 Deployment Complete!`);
      await logger.success(`🌐 Live at: ${result.url}`);

      if (this.io) {
        this.io.to(projectId).emit('deployment-complete', {
          url: result.url,
          platform: result.platform,
          services: project.services,
          status: 'deployed'
        });
      }

      return result;

    } catch (error) {
      project.status = 'failed';
      await project.save().catch(() => {}); // don't let a DB hiccup mask the real error

      const safeMessage = this.redact(error.message);
      await logger.error(`💀 Deployment failed: ${safeMessage}`);

      if (this.io) {
        this.io.to(projectId).emit('deployment-failed', {
          error: safeMessage
        });
      }

      throw error;
    }
  }

  // Whole deploy is capped at 8 minutes total. Without this, a hang in ANY
  // single awaited step (network call, DB write, third-party API) could
  // freeze the UI at "deploying..." forever with no error ever surfacing.
  async runDeployment(project, userTokens, logger) {
    let result;
    await Promise.race([
      (async () => { result = await this.doDeploy(project, userTokens, logger); })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(
          'Deployment timed out after 8 minutes - the platform may still finish it in the background, but StackPilot stopped waiting.'
        )), 8 * 60 * 1000)
      )
    ]);
    return result;
  }

  async doDeploy(project, userTokens, logger) {
    // Update status
    project.status = 'analyzing';
    await project.save();

    await logger.info('🔍 Starting project analysis...');

    // Step 1: Analyze
    const analysis = await analyzerService.analyzeProject(project.localPath);

    await logger.success(`📋 Detected: ${analysis.framework || analysis.detectedType}`);
    await logger.info(`📂 Category: ${analysis.category}`);
    await logger.info(`🔧 Language: ${analysis.language}`);
    if (analysis.buildCommand) await logger.info(`🏗️ Build: ${analysis.buildCommand}`);
    if (analysis.startCommand) await logger.info(`▶️ Start: ${analysis.startCommand}`);
    if (analysis.layout) {
      if (analysis.layout.frontendDir) await logger.info(`🎨 Frontend folder: ${analysis.layout.frontendDir}/ (${analysis.layout.frontendFramework})`);
      if (analysis.layout.backendDir) await logger.info(`⚙️ Backend folder: ${analysis.layout.backendDir}/ (${analysis.layout.backendFramework})`);
    }
    await logger.info(`🎯 Recommended Platform: ${analysis.recommendedPlatform}`);
    if (analysis.usesMongo && !project.useDatabase) {
      await logger.info('💡 This project uses MongoDB. Turn on "Connect my MongoDB" on the Deploy page to pass your connection string to the backend automatically.');
    }

    // Update project with analysis
    project.detectedType = analysis.detectedType;
    project.category = analysis.category;
    project.buildCommand = analysis.buildCommand;
    project.startCommand = analysis.startCommand;
    project.outputDir = analysis.outputDir;
    project.metadata = {
      framework: analysis.framework,
      language: analysis.language,
      packageManager: analysis.packageManager,
      hasDockerfile: analysis.hasDockerfile,
      hasBuildScript: analysis.hasBuildScript,
      dependencies: analysis.dependencies.slice(0, 50),
      nodeVersion: analysis.nodeVersion
    };

    // Step 2: Decide what goes where. Bad combinations fail HERE, before
    // anything has been created on any platform.
    const plan = planDeployment({
      stack: project.stack || 'auto',
      platform: project.deploymentPlatform || 'auto',
      useDatabase: !!project.useDatabase,
      analysis,
      githubUrl: project.githubUrl
    });
    await logger.info(`🧭 Plan: ${plan.summary}`);

    // Every platform we are about to use needs the user's connected account.
    for (const t of plan.targets) {
      if (['vercel', 'netlify', 'render'].includes(t.platform) && !userTokens[t.platform]) {
        throw new Error(`${cap(t.platform)} isn't connected to your account. Connect it from the Dashboard first.`);
      }
    }

    // The user's MongoDB connection string (stored encrypted). It is only
    // ever handed to the backend's environment - never to a frontend build -
    // and is scrubbed from every log line and error message.
    let dbUri = null;
    if (plan.useDatabase) {
      if (!userTokens.mongodb) {
        throw new Error('MongoDB isn\'t connected to your account. Connect it from the Dashboard first.');
      }
      try {
        dbUri = decrypt(userTokens.mongodb);
      } catch (_) {
        throw new Error('Could not read your saved MongoDB connection. Please reconnect MongoDB from the Dashboard.');
      }
      this.redact = makeRedactor([dbUri]);
      const baseLog = logger.log.bind(logger);
      logger.log = (message, type) => baseLog(this.redact(message), type);
      await logger.info('🗄️ Database: your connected MongoDB will be passed to the backend as MONGODB_URI (also MONGO_URI and DATABASE_URL).');
    }

    const mainTarget = plan.targets.find(t => t.role === 'frontend') || plan.targets[0];
    if (['vercel', 'netlify', 'render'].includes(mainTarget.platform)) {
      project.deploymentPlatform = mainTarget.platform;
    }
    project.status = 'deploying';
    await project.save();

    // Step 3: Deploy (backend first, so a frontend can be built against its URL)
    const ctx = { project, analysis, userTokens, logger, dbUri, plan, backendUrl: null };
    const services = [];
    let main = null;

    for (const target of plan.targets) {
      let r;
      try {
        r = await this.deployTarget(target, ctx);
      } catch (err) {
        if (services.length) {
          const done = services.map(sv => `${sv.role}: ${sv.url}`).join(', ');
          throw new Error(`${this.redact(err.message)} (already live: ${done})`);
        }
        throw err;
      }
      services.push({ role: target.role, platform: r.platform, url: r.url, dir: target.dir || '' });
      if (target.role === 'backend') ctx.backendUrl = r.url;
      if (target === mainTarget) main = r;

      project.services = services;
      await project.save();
    }

    if (plan.mode === 'split') {
      await logger.info(`🔗 Frontend was built with VITE_API_URL / REACT_APP_API_URL / VUE_APP_API_URL / NEXT_PUBLIC_API_URL = ${ctx.backendUrl}`);
      await logger.info(`ℹ️ If your backend limits CORS, allow the frontend origin: ${main.url}`);
    }
    if (plan.useDatabase) {
      await logger.info('ℹ️ In MongoDB Atlas → Network Access, allow 0.0.0.0/0 so the deployed backend can reach your cluster (Render has no fixed IP).');
    }

    return { ...main, services };
  }

  // Deploys ONE piece (a whole project, or just its client/ or server/ folder).
  async deployTarget(t, ctx) {
    const { project, analysis, userTokens, logger, plan } = ctx;

    const targetPath = t.dir ? path.join(project.localPath, t.dir) : project.localPath;
    const tAnalysis = t.dir
      ? await analyzerService.analyzeProject(targetPath, { skipLayout: true })
      : analysis;

    let platform = t.platform;
    if (platform === 'auto') {
      platform = tAnalysis.recommendedPlatform;
      if (t.role === 'frontend' && !['vercel', 'netlify'].includes(platform)) platform = 'vercel';
    }

    // In a split deploy the backend gets its own name so the two don't clash.
    const name = plan.mode === 'split' && t.role === 'backend' ? `${project.name}-api` : project.name;

    await logger.info(`🚀 Deploying ${t.role}${t.dir ? ` (${t.dir}/)` : ''} to ${platform.toUpperCase()}...`);

    const dbVars = t.injectDb ? dbEnv(ctx.dbUri) : null;

    switch (platform) {
      case 'vercel': {
        const options = {};
        if (dbVars) options.env = dbVars;
        if (t.linkBackend) {
          options.buildEnv = apiEnv(ctx.backendUrl);
          await logger.info(`🔗 Frontend will be built to call your backend at ${ctx.backendUrl}`);
        }
        return vercelService.deploy(
          targetPath, name, tAnalysis, logger,
          userTokens.vercel, userTokens.vercelTeamId, options
        );
      }

      case 'netlify':
        return netlifyService.deploy(
          targetPath, name, tAnalysis, logger,
          userTokens.netlify, userTokens.netlifyAccountSlug
        );

      case 'render':
        return renderService.deploy(
          project.localPath, name, tAnalysis, project.githubUrl, logger,
          userTokens.render,
          { rootDir: t.dir || undefined, envVars: dbVars || undefined }
        );

      default:
        // Fallback: try Vercel for frontend, Render for backend
        if (tAnalysis.category === 'frontend' || tAnalysis.category === 'static') {
          try {
            return await vercelService.deploy(
              targetPath, name, tAnalysis, logger, userTokens.vercel, userTokens.vercelTeamId
            );
          } catch (vercelErr) {
            await logger.warning(`Vercel failed (${vercelErr.message}), trying Netlify...`);
            return await netlifyService.deploy(
              targetPath, name, tAnalysis, logger, userTokens.netlify, userTokens.netlifyAccountSlug
            );
          }
        }
        return renderService.deploy(
          project.localPath, name, tAnalysis, project.githubUrl, logger, userTokens.render
        );
    }
  }
}

module.exports = DeploymentEngine;
