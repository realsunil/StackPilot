import { navigate } from '../router.js'

export const renderHome = () => {
  document.getElementById('main').innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="badge"><span class="dot">●</span> Universal Deployment Platform</div>
        <h1>Ship any stack.<br><span class="grad-text">In one click.</span></h1>
        <p>Drop a ZIP or paste a GitHub URL. StackPilot detects your framework and launches it on the best platform — Vercel, Netlify or Render.</p>
        <div class="hero-cta">
          <button class="btn btn-primary" id="startBtn" style="font-size:1rem;padding:15px 32px">Start deploying →</button>
          <button class="btn btn-secondary" id="projectsBtn" style="font-size:1rem;padding:15px 28px">My projects</button>
        </div>
        <div class="hero-stats">
          <div><b>12+</b><span>frameworks</span></div>
          <div><b>4</b><span>platforms</span></div>
          <div><b>0</b><span>tokens to paste</span></div>
        </div>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <span class="float-chip c1">⚛ React</span>
        <span class="float-chip c2">▲ Vercel</span>
        <span class="float-chip c3">🐍 Python</span>
        <div class="term">
          <div class="term-bar"><i></i><i></i><i></i><span>stackpilot — deploy</span></div>
          <div class="term-body">
            <div class="t-cmd"><b>$</b> stackpilot deploy my-app.zip</div>
            <div class="t-ok">Uploaded my-app.zip (2.4 MB)</div>
            <div class="t-ok">Detected React + Vite</div>
            <div class="t-run">▸ Building<span class="t-bar"></span></div>
            <div class="t-ok">Deployed to Vercel</div>
            <div class="t-live">🚀 Live → <em>my-app.vercel.app</em><span class="cursor"></span></div>
          </div>
        </div>
      </div>
    </section>

    <div class="features">
      ${[
        ['🔍','Auto-Detect','Automatically identifies framework, language, and project type — no config files needed.'],
        ['🐙','GitHub Import','Paste any GitHub repo URL and deploy directly.'],
        ['🌐','Multi-Platform','Deploys to Vercel, Netlify, or Render automatically — on your own account.'],
        ['⚡','Instant Logs','Real-time deployment logs streamed live over WebSocket, so you always see what is happening.'],
      ].map(([icon,title,desc]) => `
        <div class="feature-card">
          <div class="feature-icon">${icon}</div>
          <h3>${title}</h3>
          <p>${desc}</p>
        </div>
      `).join('')}
    </div>

    <div class="supported">
      <h3>Supported frameworks &amp; languages</h3>
      <div class="tech-tags">
        ${['React','Next.js','Vue.js','Angular','Svelte','HTML/CSS/JS',
           'Node/Express','Python/Flask','Django','FastAPI','Go','Rust'
          ].map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>
  `
  document.getElementById('startBtn').onclick = () => navigate('/deploy')
  document.getElementById('projectsBtn').onclick = () => navigate('/projects')
}
