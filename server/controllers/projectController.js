const Project = require('../models/Project');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs-extra');
const { extractZip, getDirectoryTree } = require('../utils/fileUtils');
const githubService = require('../services/githubService');
const Logger = require('../utils/logger');

// @desc    Upload project as ZIP
// @route   POST /api/projects/upload
exports.uploadProject = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const projectId = uuidv4().slice(0, 12);
    const projectName = req.body.name || path.parse(req.file.originalname).name;
    const extractPath = path.join(__dirname, '..', 'temp', projectId);

    // Extract ZIP
    await extractZip(req.file.path, extractPath);

    // Remove uploaded zip
    await fs.remove(req.file.path);

    // Create project in DB
    const project = await Project.create({
      user: req.user._id,
      projectId,
      name: projectName,
      source: 'upload',
      localPath: extractPath,
      deploymentPlatform: req.body.platform || 'auto',
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      data: {
        projectId: project.projectId,
        name: project.name,
        status: project.status,
        message: 'Project uploaded successfully. Ready for deployment.'
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Import from GitHub
// @route   POST /api/projects/github
exports.importFromGitHub = async (req, res) => {
  try {
    const { githubUrl, name, platform } = req.body;

    if (!githubUrl) {
      return res.status(400).json({ success: false, message: 'GitHub URL is required' });
    }

    const projectId = uuidv4().slice(0, 12);
    const logger = new Logger(projectId, req.app.get('io'));

    // Create project entry first
    const project = await Project.create({
      user: req.user._id,
      projectId,
      name: name || githubUrl.split('/').pop().replace('.git', ''),
      source: 'github',
      githubUrl,
      deploymentPlatform: platform || 'auto',
      status: 'pending'
    });

    // Clone repo (uses the user's own GitHub token if they've saved one, for private repos)
    const cloneResult = await githubService.cloneRepo(githubUrl, logger, req.user.tokens?.github);
    project.localPath = cloneResult.path;
    project.name = name || cloneResult.repoName;
    await project.save();

    res.status(201).json({
      success: true,
      data: {
        projectId: project.projectId,
        name: project.name,
        status: project.status,
        message: 'Repository cloned successfully. Ready for deployment.'
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all projects
// @route   GET /api/projects
exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ user: req.user._id })
      .select('-logs -localPath')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:projectId
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:projectId
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Cleanup local files
    if (project.localPath) {
      await fs.remove(project.localPath).catch(() => {});
    }

    await project.deleteOne();

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get project file tree
// @route   GET /api/projects/:projectId/tree
exports.getProjectTree = async (req, res) => {
  try {
    const project = await Project.findOne({ projectId: req.params.projectId, user: req.user._id });

    if (!project || !project.localPath) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const tree = await getDirectoryTree(project.localPath, 3);
    res.json({ success: true, data: tree });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};