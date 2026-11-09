import { api } from '../api.js'
import { connectSocket, disconnectSocket } from '../socket.js'
import { toast } from '../main.js'

let state = {
  tab: 'upload',          // where the project comes from: 'upload' (ZIP) or 'github' (link)
  source: 'upload',       // same, but fixed at the moment the project was analysed
  file: null,
  githubUrl: '',
  name: '',
  status: 'idle',         // idle | analyzing | deploying | deployed | failed
  projectId: null,
  logs: [],
  deployedUrl: null,
  analysis: null,         // what we detected
  prepared: false,        // project uploaded + analysed, ready to deploy
  preparing: false,
  useDb: false,           // attach the user's connected MongoDB (auto-set from the analysis)
  mongo: { loaded: false, connected: false, name: null },
  services: []            // what went live (a full-stack deploy has two)
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const cap = (v) => String(v || '').charAt(0).toUpperCase() + String(v || '').slice(1)

export const renderDeploy = () => {
  if (state.status !== 'idle') {
    renderDeployStatus()
    return
  }
  renderDeployForm()
}

const renderDeployForm = () => {
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="page-header">
      <h2>Deploy Your Project</h2>
      <p>Drop a ZIP or paste a GitHub link — we detect what it is and pick the platform for you</p>
    </div>

    <div class="deploy-box">
      <div class="input-grp">
        <label>Project Name (optional — set it before you drop the project)</label>
        <input class="inp" id="projName" placeholder="my-awesome-project" value="${esc(state.name)}">
      </div>

      <div class="tabs">
        <button class="tab ${state.tab==='upload'?'active':''}" id="tabUpload">📦 Upload ZIP</button>
        <button class="tab ${state.tab==='github'?'active':''}" id="tabGithub">🐙 GitHub Link</button>
      </div>

      <div id="tabContent">${state.tab==='upload' ? uploadUI() : githubUI()}</div>

      ${state.preparing ? `
        <div class="loading-state" style="margin-top:18px">
          <div class="spinner"></div>
          <h3>Analyzing your project…</h3>
          <p>Detecting frontend, backend and database</p>
        </div>` : ''}
      ${state.prepared ? detectCard() : ''}

      <button class="btn btn-primary btn-full" id="deployBtn"
        style="padding:17px;font-size:1rem;margin-top:18px"
        ${isDeployDisabled() ? 'disabled' : ''}>
        🚀 Deploy
      </button>
    </div>
  `
  attachFormEvents()
  if (!state.mongo.loaded) loadMongoStatus()
}

// ---- what the analysis tells us -------------------------------------------
const bothSides = (a) => !!(a.layout && a.layout.frontendDir && a.layout.backendDir)

// frontend | backend | fullstack
const kindOf = (a) => {
  if (bothSides(a) || a.category === 'fullstack') return 'fullstack'
  if (a.category === 'backend') return 'backend'
  return 'frontend'
}
const KINDS = {
  frontend:  ['🎨', 'Frontend'],
  backend:   ['⚙️', 'Backend'],
  fullstack: ['🧩', 'Full-stack (frontend + backend)']
}

// Mirrors the server's automatic choice: backends -> Render, frontends -> the
// platform that fits them (Vercel for apps that need a build, Netlify for plain static).
const targetText = (a) => {
  if (bothSides(a)) return '⚙️ Backend → 🟢 Render · 🎨 Frontend → ▲ Vercel'
  if (kindOf(a) === 'backend') return '🟢 Render'
  return a.recommendedPlatform === 'netlify' ? '◆ Netlify' : '▲ Vercel'
}

// A backend (own server, or a client/+server/ project) runs on Render, and
// Render can only deploy from GitHub - so a ZIP can't be used for those.
const deployBlocker = () => {
  if (!state.prepared || !state.analysis) return 'Drop a ZIP or paste a GitHub link first.'
  const a = state.analysis
  const needsRender = bothSides(a) || a.category === 'backend'
  if (needsRender && state.source === 'upload') {
    return 'The backend runs on Render, which deploys from GitHub. Push this project to GitHub and paste the link instead of uploading a ZIP.'
  }
  return null
}

const detectCard = () => {
  const a = state.analysis
  const kind = kindOf(a)
  const [icon, label] = KINDS[kind]
  const blocker = deployBlocker()
  const hasBackend = kind !== 'frontend'
  const m = state.mongo
  const detected = !!a.usesMongo

  let dbRow
  if (!hasBackend) {
    dbRow = `
      <div class="a-item" style="grid-column:span 3">
        <div class="a-label">Database</div>
        <div class="a-val" style="font-size:0.85rem">🗄️ Not needed — this is a frontend project.</div>
      </div>`
  } else {
    const disabled = !m.connected
    const checked = state.useDb && !disabled
    let sub
    if (!m.loaded) sub = 'Checking your MongoDB connection…'
    else if (!m.connected) sub = `${detected ? 'Your code uses MongoDB. ' : ''}MongoDB isn't connected yet. <a href="/dashboard" data-link>Connect it in your Dashboard →</a>`
    else if (checked) sub = `Your connected MongoDB${m.name ? ' (' + esc(m.name) + ')' : ''} is passed to the backend as <code>MONGODB_URI</code> (also <code>MONGO_URI</code>, <code>DATABASE_URL</code>). In Atlas → Network Access, allow 0.0.0.0/0.`
    else sub = detected ? 'Your code uses MongoDB, but the database is turned off.' : 'Turn this on to pass your MongoDB to the backend anyway.'

    dbRow = `
      <label id="dbCard" class="a-item" style="grid-column:span 3;display:flex;gap:12px;align-items:flex-start;${disabled ? 'opacity:0.8;' : 'cursor:pointer;'}">
        <input type="checkbox" id="useDb" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="margin-top:4px;width:17px;height:17px;accent-color:var(--accent);flex-shrink:0">
        <div style="min-width:0">
          <div class="a-label" style="margin-bottom:2px">Database · ${detected ? 'MongoDB detected in your code' : 'none detected'}</div>
          <div style="color:var(--text2);font-size:0.82rem;line-height:1.5">${sub}</div>
        </div>
      </label>`
  }

  return `
    <div class="analysis-card" id="detectCard" style="margin-top:18px">
      <h4>✨ Detected automatically</h4>
      <div class="analysis-grid">
        <div class="a-item"><div class="a-label">Type</div><div class="a-val c-green">${icon} ${label}</div></div>
        <div class="a-item"><div class="a-label">Framework</div><div class="a-val c-blue">${esc(a.framework || a.detectedType)}</div></div>
        <div class="a-item"><div class="a-label">Will deploy to</div><div class="a-val c-orange" style="font-size:0.85rem">${targetText(a)}</div></div>
        ${a.layout ? `
          <div class="a-item" style="grid-column:span 3">
            <div class="a-label">Project layout</div>
            <div class="a-val" style="font-size:0.85rem">
              ${a.layout.frontendDir ? `🎨 Frontend: <b>${esc(a.layout.frontendDir)}/</b> (${esc(a.layout.frontendFramework)})` : ''}
              ${a.layout.frontendDir && a.layout.backendDir ? ' &nbsp;·&nbsp; ' : ''}
              ${a.layout.backendDir ? `⚙️ Backend: <b>${esc(a.layout.backendDir)}/</b> (${esc(a.layout.backendFramework)})` : ''}
            </div>
          </div>` : ''}
        ${dbRow}
      </div>
      ${blocker ? `<p style="margin-top:14px;color:var(--amber);font-size:0.86rem">⚠️ ${blocker}</p>` : ''}
    </div>
  `
}

// Asked once and remembered, so "is MongoDB connected?" is known before we decide.
let mongoPromise = null
const loadMongoStatus = () => {
  if (!mongoPromise) {
    mongoPromise = (async () => {
      try {
        const r = await api.getConnections()
        const m = r.data?.mongodb
        state.mongo = { loaded: true, connected: !!m?.connected, name: m?.accountName || null }
      } catch (_) {
        state.mongo = { loaded: true, connected: false, name: null }
      }
      if (state.status === 'idle' && !state.preparing && document.getElementById('tabContent')) renderDeployForm()
    })()
  }
  return mongoPromise
}

const uploadUI = () => `
  <div class="upload-zone ${state.file ? 'has-file' : ''}" id="dropZone">
    <div class="upload-icon">${state.file ? '✅' : '📁'}</div>
    <h3>${state.file ? state.file.name : 'Drag & Drop your project ZIP'}</h3>
    <p>${state.file ? formatSize(state.file.size) : 'or click to browse files'}</p>
    <div class="fmt-tags">
      <span class="fmt-tag">.zip</span>
      <span class="fmt-tag">.tar.gz</span>
      <span class="fmt-tag">Max 100MB</span>
    </div>
    <input type="file" id="fileInput" accept=".zip,.tar.gz" style="display:none">
  </div>
`

const githubUI = () => `
  <div class="github-box">
    <div class="input-grp" style="margin-bottom:0">
      <label>🐙 GitHub Repository Link</label>
      <div class="inp-row">
        <input class="inp" id="ghUrl" placeholder="https://github.com/username/repo"
          value="${esc(state.githubUrl)}">
        <button class="btn btn-secondary" id="scanBtn" ${state.preparing ? 'disabled' : ''}>🔍 Detect</button>
      </div>
    </div>
  </div>
`

const renderDeployStatus = () => {
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="deploy-status-page">
      <div class="status-top">
        <div>
          <h2>${state.name || 'Project'}</h2>
          <small>ID: ${state.projectId || '...'}</small>
        </div>
        ${statusBadge(state.status)}
      </div>

      ${state.analysis ? analysisCard() : ''}
      ${statusCard()}
      ${state.logs.length > 0 ? logsUI() : ''}
      
      ${(state.status === 'deployed' || state.status === 'failed') ? `
        <div style="text-align:center;margin-top:28px">
          <button class="btn btn-secondary" id="newDeployBtn">
             Deploy Another Project
          </button>
        </div>
      ` : ''}
    </div>
  `

  const lb = document.querySelector('.logs-body')
  if (lb) lb.scrollTop = lb.scrollHeight

  document.getElementById('newDeployBtn')?.addEventListener('click', () => {
    disconnectSocket()
    state = {
      tab: 'upload', file: null, githubUrl: '', name: '', source: 'upload',
      status: 'idle', projectId: null, logs: [], deployedUrl: null,
      analysis: null, prepared: false, preparing: false,
      useDb: false, mongo: state.mongo, services: []
    }
    renderDeployForm()
  })

  document.querySelectorAll('.live-url').forEach(el => {
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.url || state.deployedUrl)
      toast.success('URL copied!')
    })
  })
}

const statusBadge = (s) => {
  const map = {
    pending: 's-pending', analyzing: 's-analyzing',
    deploying: 's-deploying', deployed: 's-deployed', failed: 's-failed'
  }
  const spin = (s === 'analyzing' || s === 'deploying') 
    ? '<span class="spinner spinner-sm spin" style="border-top-color:currentColor"></span>' : ''
  return `<span class="status-badge ${map[s] || ''}">${spin} ${s}</span>`
}

const analysisCard = () => {
  const a = state.analysis
  return `
    <div class="analysis-card">
      <h4>🔍 Project Analysis</h4>
      <div class="analysis-grid">
        <div class="a-item"><div class="a-label">Framework</div>
          <div class="a-val c-green">${a.framework || a.detectedType || 'Unknown'}</div></div>
        <div class="a-item"><div class="a-label">Language</div>
          <div class="a-val c-blue">${a.language || 'Unknown'}</div></div>
        <div class="a-item"><div class="a-label">Platform</div>
          <div class="a-val c-orange">${a.recommendedPlatform || 'Auto'}</div></div>
        ${a.layout ? `
          <div class="a-item" style="grid-column:span 3">
            <div class="a-label">Project layout</div>
            <div class="a-val" style="font-size:0.85rem">
              ${a.layout.frontendDir ? `🎨 Frontend: <b>${esc(a.layout.frontendDir)}/</b> (${esc(a.layout.frontendFramework)})` : ''}
              ${a.layout.frontendDir && a.layout.backendDir ? ' &nbsp;·&nbsp; ' : ''}
              ${a.layout.backendDir ? `⚙️ Backend: <b>${esc(a.layout.backendDir)}/</b> (${esc(a.layout.backendFramework)})` : ''}
            </div>
          </div>` : ''}
        ${a.usesMongo ? `
          <div class="a-item" style="grid-column:span 3">
            <div class="a-label">Database</div>
            <div class="a-val" style="font-size:0.85rem">🗄️ Uses MongoDB${state.useDb ? ' — your connected database will be attached' : ' — turn on the Database option to attach yours'}</div>
          </div>` : ''}
        ${a.buildCommand ? `
          <div class="a-item" style="grid-column:span 3">
            <div class="a-label">Build Command</div>
            <div class="a-val" style="font-family:var(--mono);font-size:0.82rem">${a.buildCommand}</div>
          </div>` : ''}
      </div>
    </div>
  `
}

const statusCard = () => {
  if (state.status === 'deployed') {
    if (state.services.length > 1) {
      const icon = { frontend: '🎨', backend: '⚙️', app: '🧩' }
      return `
        <div class="live-card">
          <h3>🎉 Deployment Successful!</h3>
          <p>Your full-stack project is live.</p>
          ${state.services.map(sv => `
            <div style="margin:14px 0 4px;font-size:0.8rem;color:var(--text2)">${icon[sv.role] || '🌐'} ${cap(sv.role)} · ${cap(sv.platform)}</div>
            <div class="live-url" data-url="${esc(sv.url)}" title="Click to copy">${esc(sv.url)} 📋</div>
            <div><a href="${esc(sv.url)}" target="_blank" rel="noopener"><button class="btn ${sv.role === 'frontend' ? 'btn-primary' : 'btn-secondary'} btn-sm">🌐 Open ${sv.role}</button></a></div>
          `).join('')}
          ${state.useDb ? '<p style="margin-top:16px;font-size:0.82rem">🗄️ Your MongoDB was attached to the backend.</p>' : ''}
        </div>
      `
    }
    return `
      <div class="live-card">
        <h3>🎉 Deployment Successful!</h3>
        <p>Your project is live on ${esc(cap(state.services[0]?.platform || 'the cloud'))}</p>
        <div class="live-url" data-url="${esc(state.deployedUrl)}" title="Click to copy">
          ${esc(state.deployedUrl)} 📋
        </div>
        <a href="${esc(state.deployedUrl)}" target="_blank" rel="noopener">
          <button class="btn btn-primary">🌐 Visit Site</button>
        </a>
        ${state.useDb ? '<p style="margin-top:14px;font-size:0.82rem">🗄️ Your MongoDB was attached to the backend.</p>' : ''}
      </div>
    `
  }
  if (state.status === 'failed') {
    return `
      <div class="failed-card">
        <h3>❌ Deployment Failed</h3>
        <p>Check the logs below for error details</p>
      </div>
    `
  }
  if (state.status === 'analyzing') {
    return `
      <div class="loading-state">
        <div class="spinner"></div>
        <h3>Analyzing your project...</h3>
        <p>Detecting framework, language, and best deployment strategy</p>
      </div>
    `
  }
  if (state.status === 'deploying') {
    return `
      <div class="loading-state">
        <div class="spinner" style="border-top-color:var(--blue)"></div>
        <h3>${state.analysis && bothSides(state.analysis) ? 'Deploying backend, then frontend...' : 'Deploying your project...'}</h3>
        <p>This may take a few minutes. Watch the live logs below.</p>
      </div>
    `
  }
  return ''
}

const logsUI = () => `
  <div class="logs-box">
    <div class="logs-head">
      <span>📟 Live Deployment Logs</span>
      <span class="logs-count">${state.logs.length} entries</span>
    </div>
    <div class="logs-body">
      ${state.logs.map(l => `
        <div class="log-line">
          <span class="log-t">${formatTime(l.timestamp)}</span>
          <span class="log-m ${l.type}">${l.message}</span>
        </div>
      `).join('')}
    </div>
  </div>
`

const resetPrepared = () => {
  state.prepared = false
  state.preparing = false
  state.projectId = null
  state.analysis = null
  state.useDb = false
}

const GITHUB_RE = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+/i

const attachFormEvents = () => {
  document.getElementById('tabUpload')?.addEventListener('click', () => {
    if (state.tab !== 'upload') { state.tab = 'upload'; resetPrepared() }
    renderDeployForm()
  })
  document.getElementById('tabGithub')?.addEventListener('click', () => {
    if (state.tab !== 'github') { state.tab = 'github'; resetPrepared() }
    renderDeployForm()
  })

  // Database switch (only exists when a backend was detected)
  document.getElementById('useDb')?.addEventListener('change', (e) => {
    state.useDb = e.target.checked
    renderDeployForm()
  })

  if (state.tab === 'upload') {
    const dropZone = document.getElementById('dropZone')
    const fileInput = document.getElementById('fileInput')

    dropZone?.addEventListener('click', () => fileInput?.click())
    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropZone.classList.add('dragover')
    })
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'))
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault()
      dropZone.classList.remove('dragover')
      const f = e.dataTransfer.files[0]
      if (f) handleFileSelect(f)
    })
    fileInput?.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFileSelect(e.target.files[0])
    })
  } else {
    const gh = document.getElementById('ghUrl')
    gh?.addEventListener('input', (e) => {
      state.githubUrl = e.target.value
      // the link changed, so the earlier detection no longer applies
      if (state.prepared) {
        resetPrepared()
        document.getElementById('detectCard')?.remove()
        updateDeployBtn()
      }
    })
    gh?.addEventListener('paste', () => {
      setTimeout(() => {
        state.githubUrl = gh.value.trim()
        if (GITHUB_RE.test(state.githubUrl)) prepare()
      }, 0)
    })
    gh?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); prepare() } })
    document.getElementById('scanBtn')?.addEventListener('click', prepare)
  }

  document.getElementById('projName')?.addEventListener('input', (e) => {
    state.name = e.target.value
  })

  document.getElementById('deployBtn')?.addEventListener('click', handleDeploy)
}

const handleFileSelect = (file) => {
  state.file = file
  prepare()
}

// Step 1: as soon as a ZIP is dropped / a link is pasted, upload (or clone) it
// and analyse it, so we can show what it is BEFORE anything is deployed.
const prepare = async () => {
  if (state.preparing) return
  const src = state.tab

  if (src === 'upload' && !state.file) { toast.error('Select a ZIP first'); return }
  if (src === 'github') {
    const url = (document.getElementById('ghUrl')?.value || state.githubUrl || '').trim()
    if (!GITHUB_RE.test(url)) { toast.error('Paste a valid GitHub repository link'); return }
    state.githubUrl = url
  }

  state.name = document.getElementById('projName')?.value?.trim() || state.name
  resetPrepared()
  state.preparing = true
  state.source = src
  renderDeployForm()

  try {
    let data
    if (src === 'upload') {
      const fd = new FormData()
      fd.append('project', state.file)
      fd.append('name', state.name || state.file.name.replace(/\.(zip|tar\.gz)$/, ''))
      fd.append('platform', 'auto')
      data = (await api.uploadProject(fd)).data
    } else {
      data = (await api.importGitHub({
        githubUrl: state.githubUrl,
        name: state.name || undefined,
        platform: 'auto'
      })).data
    }
    state.projectId = data.projectId
    state.name = data.name

    state.analysis = (await api.analyzeProject(state.projectId)).data

    // Is the user's MongoDB connected? Needed to decide the database automatically.
    await loadMongoStatus()
    // Automatic: attach the database when the code uses MongoDB and a backend exists.
    state.useDb = !!(kindOf(state.analysis) !== 'frontend' && state.analysis.usesMongo && state.mongo.connected)
    state.prepared = true
  } catch (err) {
    toast.error(err.message || 'Could not analyze this project')
  } finally {
    state.preparing = false
    if (state.status === 'idle') renderDeployForm()
  }
}

// Step 2: deploy. Type and platform are chosen automatically on the server.
const handleDeploy = async () => {
  if (!state.prepared || !state.projectId) return
  const blocker = deployBlocker()
  if (blocker) { toast.error(blocker); return }
  if (state.useDb && !state.mongo.connected) {
    toast.error('Connect MongoDB in your Dashboard first, or turn the database off.')
    return
  }

  const btn = document.getElementById('deployBtn')
  if (btn) { btn.innerHTML = '<span class="spinner spinner-sm spin"></span> Starting...'; btn.disabled = true }

  let t3
  try {
    connectSocket(
      state.projectId,
      (log) => {
        state.logs.push(log)
        appendLog(log)
      },
      (data) => {
        state.status = 'deployed'
        state.deployedUrl = data.url
        state.services = data.services || []
        renderDeployStatus()
        toast.success('🎉 Deployed!')
      },
      () => {
        state.status = 'failed'
        renderDeployStatus()
        toast.error('Deployment failed')
      }
    )

    state.status = 'deploying'
    renderDeployStatus()
    t3 = toast.loading('Deploying...')
    await api.startDeploy(state.projectId, 'auto', { stack: 'auto', useDatabase: state.useDb })
    t3.dismiss()
  } catch (err) {
    t3?.dismiss()
    toast.error(err.message || 'Something went wrong')
    state.status = 'failed'
    renderDeployStatus()
  }
}

const appendLog = (log) => {
  const logsBody = document.querySelector('.logs-body')
  if (!logsBody) {
    renderDeployStatus()
    return
  }

  const cnt = document.querySelector('.logs-count')
  if (cnt) cnt.textContent = `${state.logs.length} entries`

  const div = document.createElement('div')
  div.className = 'log-line'
  div.innerHTML = `
    <span class="log-t">${formatTime(log.timestamp)}</span>
    <span class="log-m ${log.type}">${log.message}</span>
  `
  logsBody.appendChild(div)
  logsBody.scrollTop = logsBody.scrollHeight
}

const updateDeployBtn = () => {
  const btn = document.getElementById('deployBtn')
  if (btn) btn.disabled = isDeployDisabled()
}

const isDeployDisabled = () => state.preparing || !!deployBlocker()

const formatSize = (b) => {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}

const formatTime = (ts) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
