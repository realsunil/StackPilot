// Decides WHAT gets deployed WHERE, before anything is created on any
// platform. Pure functions (no network, no DB) so every rule is easy to
// test and a bad combination fails up front instead of half-way through.
//
//   stack:       'auto' | 'frontend' | 'backend' | 'fullstack'
//   platform:    'auto' | 'vercel' | 'netlify' | 'render'  (user's pick)
//   useDatabase: attach the user's connected MongoDB to the backend
//
// Returns { stack, mode: 'single'|'split', useDatabase, targets[], summary }.
// Targets are in deploy order - the backend always goes first, so the
// frontend can be built knowing the backend's URL.

const FRONTEND_PLATFORMS = ['vercel', 'netlify'];

class PlanError extends Error {}
exports.PlanError = PlanError;

// Env var names injected for the database. Most Node/Mongoose apps read
// MONGODB_URI or MONGO_URI; Prisma-style apps read DATABASE_URL.
exports.dbEnv = (uri) => ({ MONGODB_URI: uri, MONGO_URI: uri, DATABASE_URL: uri });

// Env var names a frontend build can read to find its backend. Set to the
// backend's base URL (no trailing slash, no /api suffix).
exports.apiEnv = (url) => {
  const base = String(url).replace(/\/+$/, '');
  return { VITE_API_URL: base, REACT_APP_API_URL: base, VUE_APP_API_URL: base, NEXT_PUBLIC_API_URL: base };
};

const dirLabel = (d) => (d ? ` (${d}/)` : '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

exports.planDeployment = ({ stack = 'auto', platform = 'auto', useDatabase = false, analysis, githubUrl = null }) => {
  if (!analysis) throw new PlanError('Project analysis is missing.');

  const layout = analysis.layout || null;
  const bothSides = !!(layout && layout.frontendDir && layout.backendDir);
  const cat = analysis.category;
  const needsGithub = (what) =>
    new PlanError(`${what} runs on Render, and Render deploys from a GitHub repository. Use the "GitHub Import" tab (a ZIP upload can't be used for this).`);

  const make = (effStack, mode, targets) => {
    const parts = targets.map(t => `${cap(t.role)}${dirLabel(t.dir)} → ${t.platform === 'auto' ? 'Vercel or Netlify' : cap(t.platform)}`);
    if (useDatabase) parts.push('Database → your MongoDB');
    return { stack: effStack, mode, useDatabase, targets, summary: parts.join(' · ') };
  };

  // --- 'auto': keep the classic behaviour unless we find a client/ + server/ layout
  let eff = stack;
  if (stack === 'auto') {
    if (bothSides) {
      eff = 'fullstack';
    } else {
      if (useDatabase && !['backend', 'fullstack'].includes(cat)) {
        throw new PlanError('A database can only be attached to a project that has a backend. This one looks like a frontend/static site - choose "Backend" or "Full-stack", or turn the database off.');
      }
      const dir = layout ? (layout.frontendDir || layout.backendDir) : '';
      const resolved = platform === 'auto' ? analysis.recommendedPlatform : platform;
      const role = cat === 'backend' ? 'backend' : cat === 'fullstack' ? 'app' : 'frontend';
      if (useDatabase && !['render', 'vercel'].includes(resolved)) {
        throw new PlanError(`A database can't be attached when deploying to ${cap(resolved)}. Use Render (backend) or Vercel (Next.js full-stack).`);
      }
      if (useDatabase && resolved === 'vercel' && cat !== 'fullstack') {
        throw new PlanError('On Vercel a database can only be attached to a full-stack app (e.g. Next.js). Deploy your backend to Render instead.');
      }
      if (role === 'backend' && resolved === 'render' && !githubUrl) {
        // same message the Render service gives - raised early so nothing is half-created
        throw needsGithub('Your backend');
      }
      return make('auto', 'single', [{ role, dir, platform: resolved, injectDb: !!useDatabase, linkBackend: false }]);
    }
  }

  // --- frontend only
  if (eff === 'frontend') {
    if (useDatabase) {
      throw new PlanError('A database can\'t be attached to a frontend-only deploy: the connection string would end up inside the public browser code. Choose "Backend" or "Full-stack".');
    }
    if (platform === 'render') {
      throw new PlanError('Render hosts backends. For a frontend choose Vercel, Netlify or Auto.');
    }
    let dir;
    if (layout && layout.frontendDir) dir = layout.frontendDir;
    else if (!layout && ['frontend', 'static', 'fullstack'].includes(cat)) dir = '';
    else throw new PlanError('No frontend found in this project. Pick "Backend", or check that your frontend has a package.json (or an index.html).');
    return make('frontend', 'single', [{ role: 'frontend', dir, platform: FRONTEND_PLATFORMS.includes(platform) ? platform : 'auto', injectDb: false, linkBackend: false }]);
  }

  // --- backend only
  if (eff === 'backend') {
    if (platform === 'vercel' || platform === 'netlify') {
      throw new PlanError(`${cap(platform)} can't run a backend server here. Backends are deployed on Render.`);
    }
    let dir;
    if (layout && layout.backendDir) dir = layout.backendDir;
    else if (!layout && cat === 'backend') dir = '';
    else throw new PlanError('No backend found in this project. Pick "Frontend", or check that your backend has a package.json with a start script (or requirements.txt / go.mod).');
    if (!githubUrl) throw needsGithub('A backend');
    return make('backend', 'single', [{ role: 'backend', dir, platform: 'render', injectDb: !!useDatabase, linkBackend: false }]);
  }

  // --- full-stack
  if (eff === 'fullstack') {
    if (platform === 'netlify' || platform === 'render') {
      throw new PlanError('Full-stack deploys use Vercel for the frontend and Render for the backend. Leave the platform on Auto.');
    }

    if (bothSides) {
      if (!githubUrl) throw needsGithub('The backend of a full-stack project');
      return make('fullstack', 'split', [
        { role: 'backend', dir: layout.backendDir, platform: 'render', injectDb: !!useDatabase, linkBackend: false },
        { role: 'frontend', dir: layout.frontendDir, platform: 'vercel', injectDb: false, linkBackend: true }
      ]);
    }
    if (layout) {
      const side = layout.frontendDir ? `a frontend (${layout.frontendDir}/)` : `a backend (${layout.backendDir}/)`;
      throw new PlanError(`Full-stack needs both a frontend and a backend folder, but only ${side} was found. Use the "${layout.frontendDir ? 'Frontend' : 'Backend'}" option instead.`);
    }
    if (cat === 'fullstack') {
      // e.g. Next.js: one app that is frontend + backend together
      return make('fullstack', 'single', [{ role: 'app', dir: '', platform: 'vercel', injectDb: !!useDatabase, linkBackend: false }]);
    }
    if (cat === 'backend') {
      // one server that serves its own pages
      if (!githubUrl) throw needsGithub('Your server');
      return make('fullstack', 'single', [{ role: 'backend', dir: '', platform: 'render', injectDb: !!useDatabase, linkBackend: false }]);
    }
    throw new PlanError('Couldn\'t find both a frontend and a backend. Full-stack expects folders like client/ + server/ (or frontend/ + backend/), or a Next.js app. Try the "Frontend" or "Backend" option.');
  }

  throw new PlanError(`Unknown deploy type "${stack}".`);
};
