const Project = require('../models/Project');

// If the DB write behind a log call ever hangs (dead connection, Atlas
// hiccup, etc.), we must NOT let it freeze the whole deployment - the
// emit + console line still happen, and we give up on persisting that
// one log line after 8s instead of hanging indefinitely.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('DB write timed out')), ms))
  ]);

class Logger {
  constructor(projectId, io) {
    this.projectId = projectId;
    this.io = io;
  }

  async log(message, type = 'info') {
    const logEntry = {
      timestamp: new Date(),
      message,
      type
    };

    // Emit + console immediately - these must never be blocked by a slow DB
    if (this.io) {
      this.io.to(this.projectId).emit('deployment-log', logEntry);
    }
    const colors = {
      info: '\x1b[36m',
      error: '\x1b[31m',
      success: '\x1b[32m',
      warning: '\x1b[33m'
    };
    console.log(`${colors[type]}[${type.toUpperCase()}] [${this.projectId}] ${message}\x1b[0m`);

    // Persist to DB, but never let a hung write stall the deployment itself
    try {
      await withTimeout(
        Project.findOneAndUpdate(
          { projectId: this.projectId },
          { $push: { logs: logEntry } }
        ),
        8000
      );
    } catch (err) {
      console.error(`⚠️  Failed to save log to DB (continuing anyway): ${err.message}`);
    }
  }

  async info(message) { await this.log(message, 'info'); }
  async error(message) { await this.log(message, 'error'); }
  async success(message) { await this.log(message, 'success'); }
  async warning(message) { await this.log(message, 'warning'); }
}

module.exports = Logger;