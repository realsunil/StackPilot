const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

class GitHubService {

  parseGitHubUrl(url) {
    // Supports: 
    // https://github.com/user/repo
    // https://github.com/user/repo.git
    // git@github.com:user/repo.git
    let cleanUrl = url.trim();
    
    const httpsMatch = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/\.\s]+)/);
    const sshMatch = cleanUrl.match(/git@github\.com:([^\/]+)\/([^\/\.\s]+)/);

    const match = httpsMatch || sshMatch;
    if (!match) {
      throw new Error('Invalid GitHub URL format');
    }

    return {
      owner: match[1],
      repo: match[2].replace('.git', ''),
      cloneUrl: `https://github.com/${match[1]}/${match[2].replace('.git', '')}.git`
    };
  }

  async cloneRepo(githubUrl, logger, userGithubToken) {
    const { owner, repo, cloneUrl } = this.parseGitHubUrl(githubUrl);
    const cloneDir = path.join(__dirname, '..', 'temp', `${repo}-${uuidv4().slice(0, 8)}`);

    await fs.ensureDir(cloneDir);
    await logger.info(`📥 Cloning repository: ${owner}/${repo}`);

    try {
      const git = simpleGit();

      const gitOptions = {
        '--depth': '1',  // Shallow clone for speed
        '--single-branch': null
      };

      // Only used for the user's own private repos - this platform never uses
      // its own GitHub account/token to clone anyone's code.
      let actualCloneUrl = cloneUrl;
      if (userGithubToken) {
        actualCloneUrl = cloneUrl.replace(
          'https://github.com/',
          `https://${userGithubToken}@github.com/`
        );
      }

      await git.clone(actualCloneUrl, cloneDir, gitOptions);
      await logger.success(`✅ Repository cloned successfully`);

      return {
        path: cloneDir,
        repoName: repo,
        owner
      };
    } catch (error) {
      await fs.remove(cloneDir).catch(() => {});
      // Strip any embedded token from the error message before it's logged/shown
      const safeMessage = this.sanitizeGitError(error.message, userGithubToken);
      await logger.error(`❌ Clone failed: ${safeMessage}`);
      throw new Error(`Failed to clone repository: ${safeMessage}`);
    }
  }

  sanitizeGitError(message, token) {
    if (!message) return 'Unknown error';
    let safe = message;
    if (token) safe = safe.split(token).join('***');
    // Also strip any generic user:token@github.com pattern just in case
    safe = safe.replace(/https:\/\/[^@\s]+@github\.com/g, 'https://github.com');
    return safe;
  }
}

module.exports = new GitHubService();