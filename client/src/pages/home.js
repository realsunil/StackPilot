import { navigate } from '../router.js'

export const renderHome = () => {
  document.getElementById('main').innerHTML = `
    <section class="hero">
      <div class="badge"><span class="dot">●</span> Universal Deployment Platform</div>
      <h1>Upload. Detect.<br><span class="grad-text">Deploy Instantly.</span></h1>
      <p>Drop your ZIP or paste a GitHub URL. StackPilot auto-detects your stack and deploys to the best platform.</p>
      <button class="btn btn-primary" id="startBtn" style="font-size:1rem;padding:16px 36px">
         Start Deploying
      </button>
    </section>

    <div class="features">
      ${[
        ['🔍','Auto-Detect','Automatically identifies framework, language, and project type'],
        ['🐙','GitHub Import','Paste any GitHub repo URL and deploy directly'],
        ['🌐','Multi-Platform','Deploys to Vercel, Netlify, or Render automatically'],
        ['⚡','Instant Logs','Real-time deployment logs via WebSocket'],
      ].map(([icon,title,desc]) => `
        <div class="feature-card">
          <div class="feature-icon">${icon}</div>
          <h3>${title}</h3>
          <p>${desc}</p>
        </div>
      `).join('')}
    </div>

    <div class="supported">
      <h3>Supported Frameworks & Languages</h3>
      <div class="tech-tags">
        ${['React','Next.js','Vue.js','Angular','Svelte','HTML/CSS/JS',
           'Node/Express','Python/Flask','Django','FastAPI','Go','Rust'
          ].map(t => `<span class="tag">${t}</span>`).join('')}
      </div>
    </div>
  `
  document.getElementById('startBtn').onclick = () => navigate('/deploy')
}
