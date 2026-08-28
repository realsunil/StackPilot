const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class VercelService {
  constructor() {
    this.baseUrl = 'https://api.vercel.com';
  }

  async deploy(projectPath, projectName, analysis, logger, token, teamId) {
    if (!token) {
      throw new Error('No Vercel token found for your account. Add one in Settings before deploying.');
    }

    // Vercel's API writes to the token owner's PERSONAL account unless a
    // team is explicitly specified via ?teamId=, even if the user's own
    // dashboard has a team selected - so the deploy "succeeds" but the
    // user never sees it where they're looking. Append it whenever we
    // know it (see deployController.js / connectionController.js).
    const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';

    await logger.info('🔷 Starting Vercel deployment...');

    try {
      // Step 1: Collect all files
      await logger.info('📦 Collecting project files...');
      const files = await this.collectFiles(projectPath);
      await logger.info(`Found ${files.length} files to upload`);

      // Step 2: Create deployment
      await logger.info('🚀 Creating Vercel deployment...');

      const deployPayload = {
        name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        files: files,
        projectSettings: {
          framework: this.getVercelFramework(analysis.detectedType),
        }
      };

      // Add build command if detected
      if (analysis.buildCommand) {
        deployPayload.projectSettings.buildCommand = analysis.buildCommand;
      }
      if (analysis.outputDir) {
        deployPayload.projectSettings.outputDirectory = analysis.outputDir;
      }

      const response = await axios.post(
        `${this.baseUrl}/v13/deployments${teamQuery}`,
        deployPayload,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 60000
        }
      );

      const deploymentUrl = `https://${response.data.url}`;
      await logger.success(`✅ Vercel deployment created!`);
      await logger.success(`🌐 URL: ${deploymentUrl}`);

      // Step 3: Wait for deployment to be ready
      await this.waitForDeployment(response.data.id, token, logger, teamId);

      return {
        url: deploymentUrl,
        deploymentId: response.data.id,
        // The Vercel PROJECT name (not the per-deploy hostname) - this is
        // what /v10/projects/{name}/domains needs to attach a custom
        // domain later, since Vercel auto-creates/reuses a project with
        // this name from deployPayload.name above.
        projectName: deployPayload.name,
        platform: 'vercel'
      };

    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      await logger.error(`❌ Vercel deployment failed: ${errorMsg}`);
      throw new Error(`Vercel deployment failed: ${errorMsg}`);
    }
  }

  async collectFiles(dirPath, basePath = dirPath) {
    const files = [];
    const items = await fs.readdir(dirPath);

    for (const item of items) {
      if (['node_modules', '.git', '.next', '__pycache__', 'venv', '.venv', '.env'].includes(item)) continue;

      const fullPath = path.join(dirPath, item);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        const subFiles = await this.collectFiles(fullPath, basePath);
        files.push(...subFiles);
      } else {
        const relativePath = path.relative(basePath, fullPath);
        const content = await fs.readFile(fullPath);
        files.push({
          file: relativePath,
          data: content.toString('base64'),
          encoding: 'base64'
        });
      }
    }

    return files;
  }

  async waitForDeployment(deploymentId, token, logger, teamId) {
    await logger.info('⏳ Waiting for deployment to be ready...');
    const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';

    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        const response = await axios.get(
          `${this.baseUrl}/v13/deployments/${deploymentId}${teamQuery}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 10000
          }
        );

        const state = response.data.readyState;
        if (i === 0 || i % 3 === 0) {
          await logger.info(`Build status: ${state} (checked ${i + 1}/40)...`);
        }

        if (state === 'READY') {
          await logger.success('🎉 Deployment is live!');
          return;
        }
        if (state === 'ERROR' || state === 'CANCELED') {
          throw new Error(`Deployment ${state === 'CANCELED' ? 'was canceled' : 'failed'} on Vercel`);
        }
      } catch (error) {
        if (error.message.includes('on Vercel')) throw error;
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new Error('Vercel rejected the request (invalid/expired token). Reconnect Vercel from the Dashboard.');
        }
        await logger.warning(`⚠️ Status check ${i + 1}/40 failed (${error.code || error.message}), retrying...`);
      }
    }

    await logger.warning('⚠️ Vercel is still building after 3+ minutes - it will likely finish shortly; check the deployment URL directly.');
  }

  // Attaches a custom domain (e.g. "www.mystartup.com") to an already-
  // deployed Vercel project. Returns the DNS record(s) the user needs to
  // add at their registrar so we can show them in the UI - Vercel domains
  // stay in a "pending" state until that DNS actually propagates.
  async addDomain(projectName, domain, token, teamId) {
    if (!token) throw new Error('No Vercel token found for your account.');
    const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';

    try {
      await axios.post(
        `${this.baseUrl}/v10/projects/${encodeURIComponent(projectName)}/domains${teamQuery}`,
        { name: domain },
        {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      // Fetch the DNS configuration Vercel expects for this domain.
      let instructions = `Add an A record for ${domain} pointing to 76.76.21.21 (or a CNAME to cname.vercel-dns.com for subdomains).`;
      try {
        const configRes = await axios.get(
          `${this.baseUrl}/v6/domains/${encodeURIComponent(domain)}/config${teamQuery}`,
          { headers: { 'Authorization': `Bearer ${token}` }, timeout: 10000 }
        );
        if (configRes.data?.misconfigured === false) {
          instructions = 'DNS already looks correctly configured for this domain.';
        }
      } catch (_) {
        // Non-fatal - fall back to the generic instructions above.
      }

      return { domain, status: 'pending', instructions };
    } catch (error) {
      const msg = error.response?.data?.error?.message || error.message;
      throw new Error(`Vercel rejected the domain: ${msg}`);
    }
  }

  getVercelFramework(type) {
    const map = {
      'react': 'create-react-app',
      'nextjs': 'nextjs',
      'vue': 'vue',
      'svelte': 'svelte',
      'angular': 'angular',
      'html-css-js': null,
    };
    return map[type] || null;
  }
}

module.exports = new VercelService();
