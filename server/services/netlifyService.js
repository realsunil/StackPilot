const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

class NetlifyService {
  constructor() {
    this.baseUrl = 'https://api.netlify.com/api/v1';
  }

  async deploy(projectPath, projectName, analysis, logger, token, accountSlug) {
    if (!token) {
      throw new Error('No Netlify token found for your account. Add one in Settings before deploying.');
    }

    await logger.info('🔶 Starting Netlify deployment...');

    try {
      // Self-heal for accounts connected before we started storing the
      // slug at connect time (see User.js) - look it up now rather than
      // silently falling back to Netlify's own "default team" guess.
      if (!accountSlug) {
        accountSlug = await this.lookupPersonalAccountSlug(token);
      }

      // Step 1: Create site
      await logger.info('📝 Creating Netlify site...');
      const site = await this.createSite(projectName, token, accountSlug);
      await logger.info(`✅ Site created: ${site.name}`);
      await logger.info(`🌐 Site URL will be: https://${site.name}.netlify.app`);

      // Step 2: Determine deploy directory
      let deployDir = projectPath;
      if (analysis.outputDir && analysis.outputDir !== '.') {
        const outputPath = path.join(projectPath, analysis.outputDir);
        if (await fs.pathExists(outputPath)) {
          deployDir = outputPath;
          await logger.info(`📂 Using build directory: ${analysis.outputDir}`);
        }
      }

      // Step 3: Create zip
      await logger.info('📦 Packaging files...');
      const zipPath = path.join(projectPath, '..', `deploy-${Date.now()}.zip`);
      await this.createDeployZip(deployDir, zipPath);

      const zipStats = await fs.stat(zipPath);
      await logger.info(`📦 Package size: ${(zipStats.size / 1024).toFixed(2)} KB`);

      // Step 4: Deploy
      await logger.info('🚀 Uploading to Netlify...');
      const zipBuffer = await fs.readFile(zipPath);

      const deployResponse = await axios.post(
        `${this.baseUrl}/sites/${site.id}/deploys`,
        zipBuffer,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/zip'
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 60000
        }
      );

      // Cleanup zip
      await fs.remove(zipPath);

      await logger.info('⏳ Waiting for site to be ready...');
      
      // Wait for deployment to be ready (poll)
      const finalUrl = await this.waitForDeploy(site.id, deployResponse.data.id, token, logger);

      // Use site's default URL (most reliable)
      const deployedUrl = finalUrl || site.ssl_url || site.url || `https://${site.name}.netlify.app`;

      await logger.success(`✅ Netlify deployment complete!`);
      await logger.success(`🌐 Live URL: ${deployedUrl}`);

      return {
        url: deployedUrl,
        deploymentId: deployResponse.data.id,
        siteId: site.id,
        platform: 'netlify'
      };
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      await logger.error(`❌ Netlify deployment failed: ${errorMsg}`);
      throw new Error(`Netlify deployment failed: ${errorMsg}`);
    }
  }

  // Attaches a custom domain to an already-deployed Netlify site as its
  // primary custom_domain. Netlify serves the site over that domain as
  // soon as the user's DNS (a CNAME to <site>.netlify.app, or Netlify's
  // load-balancer IP for an apex domain) points at it - there's no
  // separate "verify" step to poll like Vercel has.
  async addDomain(siteId, domain, token) {
    if (!token) throw new Error('No Netlify token found for your account.');
    try {
      await axios.patch(
        `${this.baseUrl}/sites/${siteId}`,
        { custom_domain: domain },
        {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      return {
        domain,
        status: 'pending',
        instructions: `Point ${domain} at Netlify: add a CNAME record to your-site.netlify.app for a subdomain, or an A record to 75.2.60.5 for an apex domain, then wait for DNS to propagate.`
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Netlify rejected the domain: ${msg}`);
    }
  }

  async lookupPersonalAccountSlug(token) {
    try {
      const response = await axios.get(`${this.baseUrl}/accounts`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 10000
      });
      const personal = response.data.find(a => a.type === 'PERSONAL') || response.data[0];
      return personal?.slug || null;
    } catch (_) {
      // Non-fatal - deployment still proceeds against Netlify's default.
      return null;
    }
  }

  async createSite(projectName, token, accountSlug) {
    // Generate a unique site name
    const cleanName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    
    const uniqueSuffix = Date.now().toString(36).slice(-6);
    const siteName = `stackpilot-${cleanName}-${uniqueSuffix}`;

    // Explicitly target the user's own Netlify team when we know it -
    // otherwise Netlify silently picks a "default" account that may not
    // match what the user sees in their dashboard, making the new site
    // look like it was never created.
    const url = accountSlug
      ? `${this.baseUrl}/${accountSlug}/sites`
      : `${this.baseUrl}/sites`;

    const response = await axios.post(
      url,
      { name: siteName },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );
    
    return response.data;
  }

  async waitForDeploy(siteId, deployId, token, logger, maxAttempts = 40) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const response = await axios.get(
          `${this.baseUrl}/sites/${siteId}/deploys/${deployId}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 10000
          }
        );

        const state = response.data.state;

        if (state === 'ready') {
          await logger.success('🎉 Deployment is live!');
          return response.data.ssl_url || response.data.url || response.data.deploy_ssl_url;
        }

        if (state === 'error') {
          const reason = response.data.error_message || 'Netlify reported a build/deploy error';
          throw new Error(reason);
        }

        // Log status on the first check and then every ~9s so the UI never looks frozen
        if (i === 0 || i % 3 === 0) {
          await logger.info(`⏳ Status: ${state} (checked ${i + 1}/${maxAttempts})...`);
        }
      } catch (error) {
        if (error.message && error.message !== 'Netlify reported a build/deploy error' &&
            error.response === undefined && error.code !== 'ECONNABORTED') {
          throw error; // real Netlify-reported error - stop polling
        }
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new Error('Netlify rejected the request (invalid/expired token). Reconnect Netlify from the Dashboard.');
        }
        // Otherwise: a transient network hiccup or timeout on THIS poll only -
        // log it and keep polling instead of hanging silently forever.
        await logger.warning(`⚠️ Status check ${i + 1}/${maxAttempts} failed (${error.code || error.message}), retrying...`);
      }
    }

    await logger.warning('⚠️ Netlify is still processing the deploy after 2 minutes - it will likely finish shortly; check the site URL directly.');
    return null;
  }

  async createDeployZip(dirPath, zipPath) {
    const zip = new AdmZip();

    const addFilesToZip = async (currentPath, basePath) => {
      const items = await fs.readdir(currentPath);
      for (const item of items) {
        if (['node_modules', '.git', '__pycache__', '.env', '.DS_Store'].includes(item)) continue;

        const fullPath = path.join(currentPath, item);
        const stat = await fs.stat(fullPath);
        const relativePath = path.relative(basePath, currentPath);

        if (stat.isDirectory()) {
          await addFilesToZip(fullPath, basePath);
        } else {
          zip.addLocalFile(fullPath, relativePath === '.' ? '' : relativePath);
        }
      }
    };

    await addFilesToZip(dirPath, dirPath);
    zip.writeZip(zipPath);
  }
}

module.exports = new NetlifyService();
