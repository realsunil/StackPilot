const axios = require('axios');

class RenderService {
  constructor() {
    this.baseUrl = 'https://api.render.com/v1';
  }

  async deploy(projectPath, projectName, analysis, githubUrl, logger, apiKey) {
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
      // Create a web service on Render
      await logger.info('📝 Creating Render service...');

      const servicePayload = {
        type: 'web_service',
        name: `stackpilot-${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`,
        repo: githubUrl,
        autoDeploy: 'yes',
        branch: 'main',
        plan: 'free',
        runtime: this.getRuntime(analysis),
        buildCommand: analysis.buildCommand || '',
        startCommand: analysis.startCommand || 'npm start',
        envVars: []
      };

      if (analysis.language === 'python') {
        servicePayload.runtime = 'python';
      }

      const response = await axios.post(
        `${this.baseUrl}/services`,
        { service: servicePayload },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const service = response.data.service;
      const serviceUrl = `https://${service.slug}.onrender.com`;

      await logger.success(`✅ Render service created!`);
      await logger.success(`🌐 URL: ${serviceUrl}`);
      await logger.info('⏳ First deployment may take a few minutes...');

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

  getRuntime(analysis) {
    switch (analysis.language) {
      case 'python': return 'python';
      case 'go': return 'go';
      case 'rust': return 'rust';
      default: return 'node';
    }
  }
}

module.exports = new RenderService();