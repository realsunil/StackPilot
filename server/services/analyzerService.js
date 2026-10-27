const fs = require('fs-extra');
const path = require('path');

class AnalyzerService {
  
  // opts.skipLayout: used when analysing a sub-folder (client/, server/) so we
  // never go looking for a monorepo layout INSIDE a folder we already picked.
  async analyzeProject(projectPath, opts = {}) {
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
      usesMongo: false,
      layout: null,
      recommendedPlatform: 'vercel'
    };

    try {
      const files = await this.getAllFiles(projectPath);
      const fileNames = files.map(f => path.basename(f));
      const relativeFiles = files.map(f => path.relative(projectPath, f));

      // Check for Dockerfile
      analysis.hasDockerfile = fileNames.includes('Dockerfile') || fileNames.includes('dockerfile');

      // Monorepo check: no manifest at the top level, but a client/ and/or
      // server/ folder underneath (the classic full-stack layout). Without
      // this, such a project was mis-detected as a plain static site just
      // because client/index.html exists somewhere inside it.
      if (!opts.skipLayout &&
          !(await this.hasRootManifest(projectPath)) &&
          !relativeFiles.includes('index.html')) {
        const found = await this.detectLayout(projectPath);
        if (found.frontend || found.backend) {
          return this.applyLayout(analysis, found);
        }
      }

      // Detect by config files
      if (await this.fileExists(projectPath, 'package.json')) {
        const pkg = await this.readJSON(projectPath, 'package.json');
        analysis.language = 'javascript';
        analysis.dependencies = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        const allDeps = [...analysis.dependencies, ...devDeps];
        analysis.usesMongo = allDeps.includes('mongoose') || allDeps.includes('mongodb');

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
        // Plain Vite app (no UI framework) - still a frontend
        else if (allDeps.includes('vite')) {
          analysis.detectedType = 'vite';
          analysis.category = 'frontend';
          analysis.framework = 'Vite';
          analysis.buildCommand = `${analysis.packageManager === 'yarn' ? 'yarn' : 'npm run'} build`;
          analysis.startCommand = null;
          analysis.outputDir = 'dist';
          analysis.recommendedPlatform = 'vercel';
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

        analysis.usesMongo = /pymongo|mongoengine|motor/i.test(requirements);

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

  async hasRootManifest(projectPath) {
    for (const f of ['package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml', 'go.mod']) {
      if (await this.fileExists(projectPath, f)) return true;
    }
    return false;
  }

  // Looks for client/ + server/ style sub-folders and analyses each one.
  // A folder only counts if it really looks like that kind of app.
  async detectLayout(projectPath) {
    const FRONTEND_DIRS = ['client', 'frontend', 'web', 'ui'];
    const BACKEND_DIRS = ['server', 'backend', 'api'];
    const found = { frontend: null, backend: null };

    const isDir = async (p) => (await fs.pathExists(p)) && (await fs.stat(p)).isDirectory();

    for (const dir of FRONTEND_DIRS) {
      const p = path.join(projectPath, dir);
      if (!(await isDir(p))) continue;
      const a = await this.analyzeProject(p, { skipLayout: true });
      if (['frontend', 'static', 'fullstack'].includes(a.category)) {
        found.frontend = { dir, analysis: a };
        break;
      }
    }
    for (const dir of BACKEND_DIRS) {
      const p = path.join(projectPath, dir);
      if (!(await isDir(p))) continue;
      const a = await this.analyzeProject(p, { skipLayout: true });
      if (a.category === 'backend') {
        found.backend = { dir, analysis: a };
        break;
      }
    }
    return found;
  }

  // Turns the folders found by detectLayout into one top-level analysis.
  // analysis.layout tells the deploy engine WHICH folders to deploy.
  applyLayout(analysis, found) {
    const f = found.frontend, b = found.backend;
    analysis.layout = {
      frontendDir: f ? f.dir : null,
      backendDir: b ? b.dir : null,
      frontendFramework: f ? f.analysis.framework : null,
      backendFramework: b ? b.analysis.framework : null
    };

    if (f && b) {
      analysis.detectedType = 'monorepo';
      analysis.category = 'fullstack';
      analysis.framework = `Full-stack (${f.analysis.framework} + ${b.analysis.framework})`;
      analysis.language = b.analysis.language;
      analysis.packageManager = b.analysis.packageManager;
      analysis.usesMongo = b.analysis.usesMongo;
      analysis.recommendedPlatform = 'vercel + render';
      return analysis;
    }

    // Only one side found: describe the project as that folder.
    const only = (f || b).analysis;
    for (const k of ['detectedType', 'category', 'framework', 'language', 'packageManager',
                     'buildCommand', 'startCommand', 'outputDir', 'hasDockerfile', 'hasBuildScript',
                     'dependencies', 'nodeVersion', 'usesMongo', 'recommendedPlatform']) {
      analysis[k] = only[k];
    }
    return analysis;
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
