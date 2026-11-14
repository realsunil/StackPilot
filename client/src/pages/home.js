import { navigate } from '../router.js'
import { initHomeFx } from '../fx.js'

export const renderHome = () => {
  document.getElementById('main').innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="badge"><span class="dot">●</span> Universal Deployment Platform</div>
        <h1>Ship any stack.<br><span class="grad-text" id="type">In one click.</span><span class="caret"></span></h1>
        <p>Drop a ZIP or paste a GitHub URL. StackPilot detects your framework and launches it on the best platform — Vercel, Netlify or Render.</p>
        <div class="hero-cta">
          <button class="btn btn-primary" id="startBtn" style="font-size:1rem;padding:15px 32px">Start deploying →</button>
          <button class="btn btn-secondary" id="projectsBtn" style="font-size:1rem;padding:15px 28px">My projects</button>
        </div>
      </div>

      <div class="stage" id="stage" aria-hidden="true">
        <div class="stack" id="stack">
          <div class="layer"><small>Deploy</small><b>Vercel</b></div>
          <div class="layer"><small>Build</small><b>npm run build</b></div>
          <div class="layer"><small>Detect</small><b>React + Vite</b></div>
          <div class="layer"><small>Upload</small><b>my-app.zip</b></div>
        </div>
      </div>
    </section>

    <div class="supported">
      <h3>Supported frameworks &amp; languages</h3>
      <div class="marquee" aria-hidden="true"><div class="track" id="track"></div></div>
      <ul class="sr-only">
        ${['React','Next.js','Vue.js','Angular','Svelte','HTML/CSS/JS',
           'Node/Express','Python/Flask','Django','FastAPI','Go','Rust'
          ].map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>

    <section class="sec rv">
      <h2>Everything you need to ship</h2>
      <p class="lead">Upload, detect, deploy — no config required.</p>
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
    </section>

    <section class="sec rv">
      <h2>Your flight plan</h2>
      <p class="lead">Three steps from ZIP to live.</p>
      <div class="path" id="path">
        <div class="line"></div><div class="plane">✈️</div>
        <div class="node"><em>1</em><h3>Upload</h3><p>Drop a ZIP or paste a GitHub URL.</p></div>
        <div class="node"><em>2</em><h3>Detect</h3><p>We identify your framework and language.</p></div>
        <div class="node"><em>3</em><h3>Deploy</h3><p>Launched on Vercel, Netlify or Render.</p></div>
      </div>
    </section>

    <section class="sec rv">
      <div class="stats">
        <div><b data-n="12" data-s="+">0</b><span>frameworks</span></div>
        <div><b data-n="4" data-s="">0</b><span>platforms</span></div>
        <div><b data-n="0" data-s="">0</b><span>tokens to paste</span></div>
      </div>
    </section>

    <section class="sec rv">
      <h2>Watch a deploy happen</h2>
      <p class="lead">Upload, detect, build, live.</p>
      <div class="term" aria-hidden="true">
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
    </section>

    <div class="final rv">
      <h2>Ready for takeoff?</h2>
      <p class="lead">Ship your first stack in minutes.</p>
      <div class="hero-cta">
        <button class="btn btn-primary" id="finalBtn" style="font-size:1rem;padding:15px 32px">Start deploying →</button>
      </div>
    </div>
  `
  document.getElementById('startBtn').onclick = () => navigate('/deploy')
  document.getElementById('projectsBtn').onclick = () => navigate('/projects')
  document.getElementById('finalBtn').onclick = () => navigate('/deploy')
  initHomeFx()
}
