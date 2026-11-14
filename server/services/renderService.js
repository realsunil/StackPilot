const axios = require('axios');

class RenderService {
  constructor() {
    this.baseUrl = 'https://api.render.com/v1';
  }

  // options.rootDir  -> sub-folder of the repo to build (e.g. "server" in a client/+server/ repo)
  // options.envVars  -> { NAME: value } environment variables for the service
  async deploy(projectPath, projectName, analysis, githubUrl, logger, apiKey, options = {}) {
    if (!apiKey) {
      throw new Error('No Render API key found for your account. Add one in Settings before deploying.');
    }

    if (!githubUrl) {
      await logger.warning('⚠️ Render requires a GitHub repository URL');
      await logger.info('📌 Please push your code to GitHub and provide the repo URL');
      await logger.info('💡 Render deploys directly from GitHub repositories');
      throw new Error('Render deployment requires a GitHub repository. Please push your code to GitHub first.');
    }

    await logger.info('🟢 Starting Render deployment...');

    try {
      const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

      // Render requires an ownerId (the user's workspace) to create a service.
      await logger.info('👤 Looking up your Render workspace...');
      const ownersRes = await axios.get(`${this.baseUrl}/owners?limit=20`, { headers, timeout: 20000 });
      const owners = (ownersRes.data || []).map(o => o.owner || o).filter(o => o && o.id);
      if (!owners.length) throw new Error('No Render workspace found for this API key.');
      const ownerId = (owners.find(o => o.type === 'user') || owners[0]).id;

      await logger.info('📝 Creating Render service...');

      const repoUrl = String(githubUrl).trim().replace(/\.git$/, '').replace(/\/+$/, '');
      const branch = this.detectBranch(projectPath);
      const runtime = analysis.language === 'python' ? 'python' : this.getRuntime(analysis);
      const pm = analysis.packageManager || 'npm';
      const defaultBuild = runtime === 'python' ? 'pip install -r requirements.txt'
        : runtime === 'go' ? 'go build -o app .'
        : pm === 'yarn' ? 'yarn install' : pm === 'pnpm' ? 'pnpm install' : 'npm install';
      let buildCommand = analysis.buildCommand || defaultBuild;
      // "npm run build" alone would skip installing dependencies
      if (runtime === 'node' && analysis.buildCommand) buildCommand = `${defaultBuild} && ${analysis.buildCommand}`;
      const startCommand = analysis.startCommand || (runtime === 'go' ? './app' : 'npm start');

      const servicePayload = {
        type: 'web_service',
        name: `stackpilot-${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 60),
        ownerId,
        repo: repoUrl,
        branch,
        autoDeploy: 'yes',
        envVars: [],
        serviceDetails: {
          runtime,
          plan: 'free',
          region: 'oregon',
          healthCheckPath: '/',
          envSpecificDetails: { buildCommand, startCommand }
        }
      };

      if (options.rootDir) {
        servicePayload.rootDir = options.rootDir;
        await logger.info(`📂 Building from the "${options.rootDir}" folder of the repo`);
      }

      // Environment variables. Only the NAMES are ever logged, never values.
      const envEntries = Object.entries(options.envVars || {});
      if (envEntries.length) {
        servicePayload.envVars = envEntries.map(([key, value]) => ({ key, value }));
        await logger.info(`🔐 Setting environment variables: ${envEntries.map(([k]) => k).join(', ')}`);
      }

      const response = await axios.post(`${this.baseUrl}/services`, servicePayload, { headers, timeout: 30000 });

      const service = response.data.service || response.data;
      const serviceUrl = service.serviceDetails?.url || `https://${service.slug}.onrender.com`;
      const deployId = response.data.deployId || null;

      await logger.success(`✅ Render service created!`);
      await logger.info('⏳ Building on Render (free plan: usually 2-5 minutes)...');

      await this.waitForLive(service.id, deployId, headers, logger);
      await this.waitForHttp(serviceUrl, logger);
      await logger.success(`🌐 URL: ${serviceUrl}`);

      return {
        url: serviceUrl,
        serviceId: service.id,
        platform: 'render'
      };

    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      await logger.error(`❌ Render deployment failed: ${errorMsg}`);
      throw new Error(`Render deployment failed: ${errorMsg}`);
    }
  }

  // Reads the checked-out branch from the cloned repo (falls back to main).
  detectBranch(projectPath) {
    try {
      const head = require('fs').readFileSync(require('path').join(projectPath, '.git', 'HEAD'), 'utf-8');
      const m = head.match(/ref: refs\/heads\/(.+)/);
      if (m) return m[1].trim();
    } catch (_) {}
    return 'main';
  }

  // Polls Render until the deploy is live (or clearly failed).
  async waitForLive(serviceId, deployId, headers, logger) {
    const FAIL = ['build_failed', 'update_failed', 'canceled', 'pre_deploy_failed'];
    const started = Date.now();
    let last = '';
    while (Date.now() - started < 9 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 8000));
      try {
        const r = await axios.get(`${this.baseUrl}/services/${serviceId}/deploys?limit=1`, { headers, timeout: 15000 });
        const d = (r.data?.[0]?.deploy) || r.data?.[0];
        const status = d?.status;
        if (status && status !== last) { last = status; await logger.info(`Render status: ${status}`); }
        if (status === 'live') return;
        if (FAIL.includes(status)) throw new Error(`Render build failed (${status}). Open the service's Logs on Render to see why.`);
      } catch (e) {
        if (/Render build failed/.test(e.message)) throw e;
        if (e.response?.status === 401 || e.response?.status === 403) throw new Error('Render rejected the API key. Reconnect Render from the Dashboard.');
      }
    }
    await logger.warning('⚠️ Render is still building - the URL will work once it finishes.');
  }

  // Free Render services answer slowly right after going live - wait for a real response.
  async waitForHttp(url, logger) {
    for (let i = 0; i < 15; i++) {
      try {
        const r = await axios.get(url, { timeout: 15000, validateStatus: () => true });
        if (r.status < 500) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 4000));
    }
    await logger.warning('⚠️ Service is live but slow to respond (free plan cold start) - give it a minute.');
  }

  getRuntime(analysis) {
    switch (analysis.language) {
      case 'python': return 'python';
      case 'go': return 'go';
      case 'rust': return 'rust';
      default: return 'node';
    }
  }

  // Deletes a Render service. 404 = already gone.
  async deleteService(serviceId, apiKey) {
    if (!apiKey) throw new Error('Render isn\'t connected, so the live service can\'t be deleted.');
    try {
      await axios.delete(`${this.baseUrl}/services/${encodeURIComponent(serviceId)}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 30000
      });
      return { alreadyGone: false };
    } catch (error) {
      if (error.response?.status === 404) return { alreadyGone: true };
      const msg = error.response?.data?.message || error.message;
      throw new Error(`Render: ${msg}`);
    }
  }
}

module.exports = new RenderService();
