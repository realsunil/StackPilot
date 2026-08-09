const fs = require('fs-extra');
const path = require('path');

class AnalyzerService {
  
  async analyzeProject(projectPath) {
    const analysis = {
      detectedType: 'unknown',
      category: 'unknown',
      framework: null,
      language: null,
      packageManager: null,
      buildCommand: null,
      startCommand: null,
      outputDir: null,
      hasDockerfile: false,
      hasBuildScript: false,
      dependencies: [],
      nodeVersion: null,
      recommendedPlatform: 'vercel'
    };

    try {
      const files = await this.getAllFiles(projectPath);
      const fileNames = files.map(f => path.basename(f));
      const relativeFiles = files.map(f => path.relative(projectPath, f));

      // Check for Dockerfile
      analysis.hasDockerfile = fileNames.includes('Dockerfile') || fileNames.includes('dockerfile');

      // Detect by config files
      if (await this.fileExists(projectPath, 'package.json')) {
        const pkg = await this.readJSON(projectPath, 'package.json');
        analysis.language = 'javascript';
        analysis.dependencies = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        const allDeps = [...analysis.dependencies, ...devDeps];

        // Detect package manager
        if (await this.fileExists(projectPath, 'yarn.lock')) {
          analysis.packageManager = 'yarn';
        } else if (await this.fileExists(projectPath, 'pnpm-lock.yaml')) {
          analysis.packageManager = 'pnpm';
        } else {
          analysis.packageManager = 'npm';
        }

        // Node version
        if (pkg.engines && pkg.engines.node) {
          analysis.nodeVersion = pkg.engines.node;
        }

        // Build script check
        if (pkg.scripts && pkg.scripts.build) {
          analysis.hasBuildScript = true;
        }

        // --- FRAMEWORK DETECTION ---

        // Next.js
        if (allDeps.includes('next')) {
          analysis.detectedType = 'nextjs';
          analysis.category = 'fullstack';
          analysis.framework = 'Next.js';
          analysis.buildCommand = `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm run'} build`;
          analysis.startCommand = `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm'} start`;
          analysis.outputDir = '.next';
          analysis.recommendedPlatform = 'vercel';
        }
        // React (CRA or Vite)
        else if (allDeps.includes('react') && !allDeps.includes('next')) {
          analysis.detectedType = 'react';
          analysis.category = 'frontend';
          analysis.framework = allDeps.includes('vite') ? 'React + Vite' : 'React (CRA)';
          analysis.buildCommand = `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm run'} build`;
          analysis.startCommand = null;
          analysis.outputDir = allDeps.includes('vite') ? 'dist' : 'build';
          analysis.recommendedPlatform = 'vercel';
        }
        // Vue.js
        else if (allDeps.includes('vue')) {
          analysis.detectedType = 'vue';
          analysis.category = 'frontend';
          analysis.framework = allDeps.includes('nuxt') ? 'Nuxt.js' : 'Vue.js';
          analysis.buildCommand = `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm run'} build`;
          analysis.outputDir = 'dist';
          analysis.recommendedPlatform = 'vercel';
        }
        // Angular
        else if (allDeps.includes('@angular/core')) {
          analysis.detectedType = 'angular';
          analysis.category = 'frontend';
          analysis.framework = 'Angular';
          analysis.buildCommand = 'ng build --configuration production';
          analysis.outputDir = `dist/${pkg.name || 'app'}`;
          analysis.recommendedPlatform = 'netlify';
        }
        // Svelte
        else if (allDeps.includes('svelte')) {
          analysis.detectedType = 'svelte';
          analysis.category = 'frontend';
          analysis.framework = allDeps.includes('@sveltejs/kit') ? 'SvelteKit' : 'Svelte';
          analysis.buildCommand = `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm run'} build`;
          analysis.outputDir = allDeps.includes('@sveltejs/kit') ? '.svelte-kit' : 'public/build';
          analysis.recommendedPlatform = 'vercel';
        }
        // Express / Node backend
        else if (allDeps.includes('express') || allDeps.includes('fastify') || allDeps.includes('koa')) {
          analysis.detectedType = 'node-express';
          analysis.category = 'backend';
          analysis.framework = allDeps.includes('express') ? 'Express.js' : 
                              allDeps.includes('fastify') ? 'Fastify' : 'Koa';
          analysis.buildCommand = pkg.scripts?.build ? `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm run'} build` : null;
          analysis.startCommand = pkg.scripts?.start ? `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm'} start` : 'node server.js';
          analysis.recommendedPlatform = 'render';
        }
        // Generic Node.js
        else if (pkg.scripts && (pkg.scripts.start || pkg.main)) {
          analysis.detectedType = 'node-express';
          analysis.category = 'backend';
          analysis.framework = 'Node.js';
          analysis.startCommand = pkg.scripts?.start ? `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm'} start` : `node ${pkg.main || 'index.js'}`;
          analysis.recommendedPlatform = 'render';
        }
      }

      // Python projects
      else if (await this.fileExists(projectPath, 'requirements.txt') || 
               await this.fileExists(projectPath, 'Pipfile') ||
               await this.fileExists(projectPath, 'pyproject.toml')) {
        analysis.language = 'python';

        let requirements = '';
        if (await this.fileExists(projectPath, 'requirements.txt')) {
          requirements = await fs.readFile(path.join(projectPath, 'requirements.txt'), 'utf-8');
        }

        if (requirements.includes('django') || await this.fileExists(projectPath, 'manage.py')) {
          analysis.detectedType = 'python-django';
          analysis.category = 'backend';
          analysis.framework = 'Django';
          analysis.buildCommand = 'pip install -r requirements.txt';
          analysis.startCommand = 'python manage.py runserver 0.0.0.0:$PORT';
          analysis.recommendedPlatform = 'render';
        } else if (requirements.includes('flask')) {
          analysis.detectedType = 'python-flask';
          analysis.category = 'backend';
          analysis.framework = 'Flask';
          analysis.buildCommand = 'pip install -r requirements.txt';
          analysis.startCommand = 'python app.py';
          analysis.recommendedPlatform = 'render';
        } else if (requirements.includes('fastapi')) {
          analysis.detectedType = 'python-fastapi';
          analysis.category = 'backend';
          analysis.framework = 'FastAPI';
          analysis.buildCommand = 'pip install -r requirements.txt';
          analysis.startCommand = 'uvicorn main:app --host 0.0.0.0 --port $PORT';
          analysis.recommendedPlatform = 'render';
        }
      }

      // Go projects
      else if (await this.fileExists(projectPath, 'go.mod')) {
        analysis.detectedType = 'golang';
        analysis.category = 'backend';
        analysis.language = 'go';
        analysis.framework = 'Go';
        analysis.buildCommand = 'go build -o app .';
        analysis.startCommand = './app';
        analysis.recommendedPlatform = 'render';
      }

      // Static HTML/CSS/JS
      else if (fileNames.includes('index.html')) {
        analysis.detectedType = 'html-css-js';
        analysis.category = 'static';
        analysis.framework = 'Static HTML/CSS/JS';
        analysis.language = 'html';
        analysis.outputDir = '.';
        analysis.recommendedPlatform = 'netlify';
      }

      return analysis;

    } catch (error) {
      console.error('Analysis error:', error);
      return analysis;
    }
  }

  async fileExists(basePath, fileName) {
    return fs.pathExists(path.join(basePath, fileName));
  }

  async readJSON(basePath, fileName) {
    try {
      return await fs.readJSON(path.join(basePath, fileName));
    } catch {
      return {};
    }
  }

  async getAllFiles(dirPath, arrayOfFiles = []) {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      if (['node_modules', '.git', '__pycache__', 'venv', '.venv'].includes(file)) continue;

      const fullPath = path.join(dirPath, file);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        arrayOfFiles = await this.getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    }

    return arrayOfFiles;
  }
}

module.exports = new AnalyzerService();