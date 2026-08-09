const analyzerService = require('../services/analyzerService');

// @desc    Quick analyze a GitHub repo without cloning fully
// @route   POST /api/analyze/quick
exports.quickAnalyze = async (req, res) => {
  try {
    const { githubUrl } = req.body;

    if (!githubUrl) {
      return res.status(400).json({ success: false, message: 'GitHub URL required' });
    }

    // Parse the URL to extract info
    const match = githubUrl.match(/github\.com\/([^\/]+)\/([^\/\.\s]+)/);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Invalid GitHub URL' });
    }

    const [, owner, repo] = match;

    // Use GitHub API to check files. If the user has saved their own GitHub
    // token, use it for a higher rate limit - otherwise this works fine
    // unauthenticated for public repos.
    const axios = require('axios');
    const userGithubToken = req.user?.tokens?.github;
    const headers = userGithubToken
      ? { Authorization: `token ${userGithubToken}` }
      : {};

    const repoResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers }
    );

    const contentsResponse = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents`,
      { headers }
    );

    const files = contentsResponse.data.map(f => f.name);
    const language = repoResponse.data.language;

    let quickAnalysis = {
      repoName: repo,
      owner,
      language: language?.toLowerCase(),
      stars: repoResponse.data.stargazers_count,
      files: files,
      suggestions: {}
    };

    // Quick detection
    if (files.includes('package.json')) {
      try {
        const pkgResponse = await axios.get(
          `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`,
          { headers }
        );
        const pkg = pkgResponse.data;
        const deps = Object.keys(pkg.dependencies || {});

        if (deps.includes('next')) {
          quickAnalysis.suggestions = { type: 'nextjs', platform: 'vercel', category: 'fullstack' };
        } else if (deps.includes('react')) {
          quickAnalysis.suggestions = { type: 'react', platform: 'vercel', category: 'frontend' };
        } else if (deps.includes('vue')) {
          quickAnalysis.suggestions = { type: 'vue', platform: 'vercel', category: 'frontend' };
        } else if (deps.includes('express')) {
          quickAnalysis.suggestions = { type: 'node-express', platform: 'render', category: 'backend' };
        }
      } catch {}
    } else if (files.includes('requirements.txt')) {
      quickAnalysis.suggestions = { type: 'python', platform: 'render', category: 'backend' };
    } else if (files.includes('index.html')) {
      quickAnalysis.suggestions = { type: 'static', platform: 'netlify', category: 'static' };
    }

    res.json({ success: true, data: quickAnalysis });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};