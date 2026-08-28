const mongoose = require('mongoose');

const deploymentLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  message: String,
  type: { type: String, enum: ['info', 'error', 'success', 'warning'], default: 'info' }
});

const projectSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  source: {
    type: String,
    enum: ['upload', 'github'],
    required: true
  },
  githubUrl: {
    type: String,
    default: null
  },
  detectedType: {
    type: String,
    enum: ['react', 'nextjs', 'vue', 'angular', 'svelte', 'html-css-js', 
           'node-express', 'python-flask', 'python-django', 'python-fastapi',
           'golang', 'rust', 'java-spring', 'unknown'],
    default: 'unknown'
  },
  category: {
    type: String,
    enum: ['frontend', 'backend', 'fullstack', 'static', 'unknown'],
    default: 'unknown'
  },
  deploymentPlatform: {
    type: String,
    enum: ['vercel', 'netlify', 'render', 'github-pages', 'auto', 'none'],
    default: 'auto'
  },
  status: {
    type: String,
    enum: ['pending', 'analyzing', 'deploying', 'deployed', 'failed', 'cancelled'],
    default: 'pending'
  },
  deployedUrl: {
    type: String,
    default: null
  },
  // The platform-side identifier needed to attach a custom domain later
  // (Vercel project name, or Netlify site id). Populated once a deploy
  // to that platform succeeds - see deploymentEngine.js.
  platformRef: {
    type: String,
    default: null
  },
  // Custom domain the user has pointed at this deployment (e.g. their
  // own "mystartup.com"), managed from the project detail page.
  customDomain: {
    type: String,
    default: null
  },
  domainStatus: {
    type: String,
    enum: ['none', 'pending', 'active', 'error'],
    default: 'none'
  },
  // DNS records the user needs to add at their registrar, returned by
  // the platform when the domain is added - shown verbatim in the UI.
  domainInstructions: {
    type: String,
    default: null
  },
  buildCommand: {
    type: String,
    default: null
  },
  startCommand: {
    type: String,
    default: null
  },
  outputDir: {
    type: String,
    default: null
  },
  envVars: {
    type: Map,
    of: String,
    default: {}
  },
  logs: [deploymentLogSchema],
  localPath: {
    type: String,
    default: null
  },
  metadata: {
    framework: String,
    language: String,
    packageManager: String,
    hasDockerfile: Boolean,
    hasBuildScript: Boolean,
    dependencies: [String],
    nodeVersion: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

projectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);
