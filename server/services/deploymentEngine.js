const vercelService = require('./vercelService');
const netlifyService = require('./netlifyService');
const renderService = require('./renderService');
const analyzerService = require('./analyzerService');
const Project = require('../models/Project');
const User = require('../models/User');
const Logger = require('../utils/logger');

class DeploymentEngine {

  constructor(io) {
    this.io = io;
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
          status: 'deployed'
        });
      }

      return result;

    } catch (error) {
      project.status = 'failed';
      await project.save().catch(() => {}); // don't let a DB hiccup mask the real error

      await logger.error(`💀 Deployment failed: ${error.message}`);

      if (this.io) {
        this.io.to(projectId).emit('deployment-failed', {
          error: error.message
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
    await logger.info(`🎯 Recommended Platform: ${analysis.recommendedPlatform}`);

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

    // Step 2: Choose platform
    const platform = project.deploymentPlatform === 'auto'
      ? analysis.recommendedPlatform
      : project.deploymentPlatform;

    project.deploymentPlatform = platform;
    project.status = 'deploying';
    await project.save();

    await logger.info(`🚀 Deploying to ${platform.toUpperCase()}...`);

    // Step 3: Deploy
    let result;

    switch (platform) {
      case 'vercel':
        result = await vercelService.deploy(
          project.localPath, project.name, analysis, logger,
          userTokens.vercel, userTokens.vercelTeamId
        );
        break;

      case 'netlify':
        result = await netlifyService.deploy(
          project.localPath, project.name, analysis, logger,
          userTokens.netlify, userTokens.netlifyAccountSlug
        );
        break;

      case 'render':
        result = await renderService.deploy(
          project.localPath, project.name, analysis, project.githubUrl, logger,
          userTokens.render
        );
        break;

      default:
        // Fallback: try Vercel for frontend, Render for backend
        if (analysis.category === 'frontend' || analysis.category === 'static') {
          try {
            result = await vercelService.deploy(
              project.localPath, project.name, analysis, logger, userTokens.vercel, userTokens.vercelTeamId
            );
          } catch (vercelErr) {
            await logger.warning(`Vercel failed (${vercelErr.message}), trying Netlify...`);
            result = await netlifyService.deploy(
              project.localPath, project.name, analysis, logger, userTokens.netlify, userTokens.netlifyAccountSlug
            );
          }
        } else {
          result = await renderService.deploy(
            project.localPath, project.name, analysis, project.githubUrl, logger, userTokens.render
          );
        }
    }

    return result;
  }
}

module.exports = DeploymentEngine;
