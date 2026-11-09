// Removes what a project put online (Netlify site / Vercel project / Render
// service) so deleting a project in StackPilot really frees the slot on the
// platform instead of leaving an orphaned live site behind.
const netlifyService = require('./netlifyService');
const vercelService = require('./vercelService');
const renderService = require('./renderService');

// Everything of this project that is live somewhere, de-duplicated.
exports.collectTargets = (project) => {
  const out = [];
  const seen = new Set();
  const add = (platform, ref, role, url) => {
    if (!['vercel', 'netlify', 'render'].includes(platform) || !ref) return;
    const key = `${platform}:${ref}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ platform, ref, role: role || 'app', url: url || null });
  };

  for (const sv of project.services || []) add(sv.platform, sv.ref, sv.role, sv.url);

  // Projects deployed before references were saved per service: Vercel and
  // Netlify kept a single reference on the project itself.
  if (['vercel', 'netlify'].includes(project.deploymentPlatform)) {
    add(project.deploymentPlatform, project.platformRef, 'app', project.deployedUrl);
  }
  return out;
};

// Deletes every target. Never throws: each result says whether it worked.
exports.removeDeployments = async (targets, tokens = {}, vercelTeamId = null) => {
  const results = [];
  for (const t of targets) {
    try {
      let r;
      if (t.platform === 'netlify') r = await netlifyService.deleteSite(t.ref, tokens.netlify);
      else if (t.platform === 'vercel') r = await vercelService.deleteProject(t.ref, tokens.vercel, vercelTeamId);
      else r = await renderService.deleteService(t.ref, tokens.render);
      results.push({ platform: t.platform, role: t.role, ref: t.ref, ok: true, alreadyGone: !!r.alreadyGone });
    } catch (err) {
      results.push({ platform: t.platform, role: t.role, ref: t.ref, ok: false, message: err.message });
    }
  }
  return results;
};
