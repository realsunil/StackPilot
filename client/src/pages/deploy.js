import { api } from '../api.js'
import { connectSocket, disconnectSocket } from '../socket.js'
import { toast } from '../main.js'

let state = {
  tab: 'upload',
  file: null,
  githubUrl: '',
  name: '',
  platform: 'auto',
  status: 'idle',
  projectId: null,
  logs: [],
  deployedUrl: null,
  analysis: null,
  quickInfo: null,
  stack: 'auto',          // what is being deployed: auto | frontend | backend | fullstack
  useDb: false,           // attach the user's connected MongoDB
  mongo: { loaded: false, connected: false, name: null },
  services: []            // what went live (a full-stack deploy has two)
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const cap = (v) => String(v || '').charAt(0).toUpperCase() + String(v || '').slice(1)

const stacks = [
  { id: 'auto', icon: '🤖', name: 'Auto-detect', desc: 'We figure it out' },
  { id: 'frontend', icon: '🎨', name: 'Frontend', desc: 'React, Vue, static' },
  { id: 'backend', icon: '⚙️', name: 'Backend', desc: 'Node, Python, Go' },
  { id: 'fullstack', icon: '🧩', name: 'Full-stack', desc: 'Frontend + backend' }
]

const stackHint = () => {
  const upload = state.tab === 'upload'
  switch (state.stack) {
    case 'frontend':
      return 'Deploys only the frontend (the client/ folder, if your project has one).'
    case 'backend':
      return upload
        ? '⚠️ Backends run on Render, which deploys from GitHub. Switch to the <b>GitHub Import</b> tab.'
        : 'Deploys only the backend (the server/ folder, if your project has one) on Render.'
    case 'fullstack':
      return 'Backend goes to <b>Render</b> first, then the frontend to <b>Vercel</b>, built to call that backend. '
        + 'Needs client/ + server/ folders (or a Next.js app).'
        + (upload ? ' ⚠️ A client/ + server/ project needs the <b>GitHub Import</b> tab (a ZIP only works for Next.js).' : '')
    default:
      return 'We look inside your project. A client/ + server/ layout is deployed as full-stack automatically.'
  }
}

// The platform that actually gets sent to the server for the chosen deploy type.
const platformToSend = () => {
  if (state.stack === 'backend') return 'render'
  if (state.stack === 'fullstack') return 'auto'
  if (state.stack === 'frontend' && state.platform === 'render') return 'auto'
  return state.platform
}

const platforms = [
  { id: 'auto', icon: '🤖', name: 'Auto', desc: 'Best match' },
  { id: 'vercel', icon: '▲', name: 'Vercel', desc: 'Frontend' },
  { id: 'netlify', icon: '◆', name: 'Netlify', desc: 'Static' },
  { id: 'render', icon: '🟢', name: 'Render', desc: 'Backend' }
]

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
      <p>Upload a ZIP or import from GitHub — we handle the rest</p>
    </div>

    <div class="deploy-box">
      <div class="tabs">
        <button class="tab ${state.tab==='upload'?'active':''}" id="tabUpload">📦 Upload ZIP</button>
        <button class="tab ${state.tab==='github'?'active':''}" id="tabGithub">🐙 GitHub Import</button>
      </div>

      <div id="tabContent">${state.tab==='upload' ? uploadUI() : githubUI()}</div>

      <div class="input-grp" style="margin-top:20px">
        <label>Project Name (optional)</label>
        <input class="inp" id="projName" placeholder="my-awesome-project" value="${state.name}">
      </div>

      <div style="margin-bottom:14px">
        <label style="font-size:0.88rem;font-weight:600;color:var(--text2);display:block;margin-bottom:10px">
          What are you deploying?
        </label>
        <div class="platform-grid" id="stackGrid">
          ${stacks.map(x => `
            <div class="plat ${state.stack===x.id?'selected':''}" data-stack="${x.id}" role="button" tabindex="0">
              <div class="plat-icon">${x.icon}</div>
              <div class="plat-name">${x.name}</div>
              <div class="plat-desc">${x.desc}</div>
            </div>
          `).join('')}
        </div>
        <p id="stackHint" style="color:var(--text2);font-size:0.82rem;margin-top:-4px">${stackHint()}</p>
      </div>

      ${dbCard()}

      ${platformSection()}

      <button class="btn btn-primary btn-full" id="deployBtn" 
        style="padding:17px;font-size:1rem" 
        ${isDeployDisabled() ? 'disabled' : ''}>
         Deploy Now
      </button>
    </div>
  `
  attachFormEvents()
  if (!state.mongo.loaded) loadMongoStatus()
}

const dbCard = () => {
  const m = state.mongo
  const blocked = state.stack === 'frontend'
  const disabled = !m.connected || blocked
  const checked = state.useDb && !disabled
  let sub
  if (!m.loaded) sub = 'Checking your MongoDB connection…'
  else if (!m.connected) sub = 'MongoDB isn\'t connected yet. <a href="/dashboard" data-link>Connect it in your Dashboard →</a>'
  else if (blocked) sub = 'Not available for frontend-only deploys: a database password must never end up in browser code.'
  else if (checked) sub = `Using <b>${esc(m.name || 'your MongoDB')}</b>. It is passed to your backend as <code>MONGODB_URI</code> (also <code>MONGO_URI</code> and <code>DATABASE_URL</code>). In Atlas → Network Access, allow 0.0.0.0/0.`
  else sub = `Pass your connected MongoDB${m.name ? ' (' + esc(m.name) + ')' : ''} to the deployed backend.`

  return `
    <label id="dbCard" style="display:flex;gap:12px;align-items:flex-start;padding:14px 16px;margin-bottom:18px;background:var(--card);border:1px solid ${checked ? 'var(--accent-hover)' : 'var(--border)'};border-radius:var(--r);${disabled ? 'opacity:0.75;' : 'cursor:pointer;'}">
      <input type="checkbox" id="useDb" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="margin-top:4px;width:17px;height:17px;accent-color:var(--accent);flex-shrink:0">
      <div style="min-width:0">
        <div style="font-weight:600;font-size:0.92rem">🗄️ Database <span style="font-weight:400;color:var(--muted);font-size:0.8rem">· MongoDB</span></div>
        <div style="color:var(--text2);font-size:0.82rem;margin-top:3px;line-height:1.5">${sub}</div>
      </div>
    </label>
  `
}

// Backends always run on Render and full-stack uses Vercel + Render, so the
// platform picker only makes sense for "Auto-detect" and "Frontend".
const platformSection = () => {
  if (state.stack === 'backend') {
    return `<div class="quick-info" style="margin-bottom:18px"><h4>Platform</h4><p style="font-size:0.9rem">🟢 <b>Render</b> — backends are deployed on Render.</p></div>`
  }
  if (state.stack === 'fullstack') {
    return `<div class="quick-info" style="margin-bottom:18px"><h4>Platforms</h4><p style="font-size:0.9rem">⚙️ Backend → 🟢 <b>Render</b> &nbsp;·&nbsp; 🎨 Frontend → ▲ <b>Vercel</b></p></div>`
  }
  const list = state.stack === 'frontend' ? platforms.filter(p => p.id !== 'render') : platforms
  return `
    <div style="margin-bottom:18px">
      <label style="font-size:0.88rem;font-weight:600;color:var(--text2);display:block;margin-bottom:10px">
        Deployment Platform
      </label>
      <div class="platform-grid">
        ${list.map(p => `
          <div class="plat ${state.platform===p.id?'selected':''}" data-plat="${p.id}">
            <div class="plat-icon">${p.icon}</div>
            <div class="plat-name">${p.name}</div>
            <div class="plat-desc">${p.desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

const loadMongoStatus = async () => {
  state.mongo.loaded = true
  try {
    const r = await api.getConnections()
    const m = r.data?.mongodb
    state.mongo = { loaded: true, connected: !!m?.connected, name: m?.accountName || null }
  } catch (_) {
    state.mongo = { loaded: true, connected: false, name: null }
  }
  if (state.status === 'idle' && document.getElementById('dbCard')) renderDeployForm()
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
    <div class="input-grp">
      <label>🐙 GitHub Repository URL</label>
      <div class="inp-row">
        <input class="inp" id="ghUrl" placeholder="https://github.com/username/repo" 
          value="${state.githubUrl}">
        <button class="btn btn-secondary" id="scanBtn">🔍 Scan</button>
      </div>
    </div>
    ${state.quickInfo ? quickInfoUI() : ''}
  </div>
`

const quickInfoUI = () => {
  const q = state.quickInfo
  return `
    <div class="quick-info">
      <h4>📋 ${q.repoName} by ${q.owner}</h4>
      <div class="qi-grid">
        <div class="qi-item"><div class="qi-label">Language</div>
          <div class="qi-val blue">${q.language || 'Unknown'}</div></div>
        <div class="qi-item"><div class="qi-label">Stars</div>
          <div class="qi-val">${q.stars || 0} ⭐</div></div>
        ${q.suggestions?.type ? `
          <div class="qi-item"><div class="qi-label">Detected</div>
            <div class="qi-val green">${q.suggestions.type}</div></div>
          <div class="qi-item"><div class="qi-label">Platform</div>
            <div class="qi-val orange">${q.suggestions.platform}</div></div>
        ` : ''}
      </div>
    </div>
  `
}

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
      tab: 'upload', file: null, githubUrl: '', name: '', platform: 'auto',
      status: 'idle', projectId: null, logs: [], deployedUrl: null,
      analysis: null, quickInfo: null,
      stack: 'auto', useDb: false, mongo: state.mongo, services: []
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
        <p>Your project is live on ${esc(state.platform || 'cloud')}</p>
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
        <h3>${state.stack === 'fullstack' ? 'Deploying backend, then frontend...' : `Deploying to ${esc(state.stack === 'backend' ? 'render' : (state.platform === 'auto' ? 'the best platform' : state.platform) || 'cloud')}...`}</h3>
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

const attachFormEvents = () => {
  document.getElementById('tabUpload')?.addEventListener('click', () => {
    state.tab = 'upload'
    renderDeployForm()
  })
  document.getElementById('tabGithub')?.addEventListener('click', () => {
    state.tab = 'github'
    renderDeployForm()
  })

  document.querySelectorAll('.plat[data-plat]').forEach(el => {
    el.addEventListener('click', () => {
      state.platform = el.dataset.plat
      document.querySelectorAll('.plat[data-plat]').forEach(p => p.classList.remove('selected'))
      el.classList.add('selected')
    })
  })

  // "What are you deploying?" cards
  const pickStack = (id) => {
    state.stack = id
    if (id === 'frontend' && state.platform === 'render') state.platform = 'auto'
    if (id === 'frontend') state.useDb = false   // a frontend can never hold DB credentials
    renderDeployForm()
  }
  document.querySelectorAll('.plat[data-stack]').forEach(el => {
    el.addEventListener('click', () => pickStack(el.dataset.stack))
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickStack(el.dataset.stack) } })
  })

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
  }

  document.getElementById('ghUrl')?.addEventListener('input', (e) => {
    state.githubUrl = e.target.value
    updateDeployBtn()
  })
  document.getElementById('scanBtn')?.addEventListener('click', handleQuickAnalyze)

  document.getElementById('projName')?.addEventListener('input', (e) => {
    state.name = e.target.value
    updateDeployBtn()
  })

  document.getElementById('deployBtn')?.addEventListener('click', handleDeploy)
}

const handleFileSelect = (file) => {
  state.file = file
  document.getElementById('tabContent').innerHTML = uploadUI()

  const dropZone = document.getElementById('dropZone')
  const fileInput = document.getElementById('fileInput')
  dropZone?.addEventListener('click', () => fileInput?.click())
  fileInput?.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0])
  })

  updateDeployBtn()
}

const handleQuickAnalyze = async () => {
  const url = document.getElementById('ghUrl')?.value?.trim()
  if (!url) { toast.error('Enter a GitHub URL first'); return }
  state.githubUrl = url

  const btn = document.getElementById('scanBtn')
  if (btn) { btn.textContent = '⏳'; btn.disabled = true }

  try {
    const res = await api.quickAnalyze(url)
    state.quickInfo = res.data
    document.getElementById('tabContent').innerHTML = githubUI()
    attachGithubEvents()
    toast.success('Repository scanned!')
  } catch (err) {
    toast.error(err.message || 'Scan failed')
  } finally {
    const btn2 = document.getElementById('scanBtn')
    if (btn2) { btn2.textContent = '🔍 Scan'; btn2.disabled = false }
  }
}

const attachGithubEvents = () => {
  document.getElementById('ghUrl')?.addEventListener('input', (e) => {
    state.githubUrl = e.target.value
    updateDeployBtn()
  })
  document.getElementById('scanBtn')?.addEventListener('click', handleQuickAnalyze)
}

const handleDeploy = async () => {
  // Check the choices BEFORE uploading anything, so a bad combination is
  // explained right here instead of failing after the upload.
  if (state.stack === 'backend' && state.tab === 'upload') {
    toast.error('Backends run on Render, which deploys from GitHub. Use the GitHub Import tab.')
    return
  }
  if (state.useDb && state.stack === 'frontend') {
    toast.error('A database can\'t be attached to a frontend-only deploy.')
    return
  }
  if (state.useDb && !state.mongo.connected) {
    toast.error('Connect MongoDB in your Dashboard first, or turn the database option off.')
    return
  }

  const btn = document.getElementById('deployBtn')
  if (btn) { btn.innerHTML = '<span class="spinner spinner-sm spin"></span> Processing...'; btn.disabled = true }

  state.name = document.getElementById('projName')?.value?.trim() || state.name

  let t1, t2, t3
  try {
    let projectData

    if (state.tab === 'upload') {
      if (!state.file) { toast.error('Select a file first'); return }
      t1 = toast.loading('Uploading project...')
      const fd = new FormData()
      fd.append('project', state.file)
      fd.append('name', state.name || state.file.name.replace(/\.(zip|tar\.gz)$/, ''))
      fd.append('platform', platformToSend())
      const r = await api.uploadProject(fd)
      t1.dismiss()
      projectData = r.data
      toast.success('Project uploaded!')
    } else {
      if (!state.githubUrl) { toast.error('Enter GitHub URL'); return }
      t1 = toast.loading('Cloning repository...')
      const r = await api.importGitHub({
        githubUrl: state.githubUrl,
        name: state.name || undefined,
        platform: platformToSend()
      })
      t1.dismiss()
      projectData = r.data
      toast.success('Repository cloned!')
    }

    state.projectId = projectData.projectId
    state.name = projectData.name

    state.status = 'analyzing'
    renderDeployStatus()
    t2 = toast.loading('Analyzing...')
    const analysisRes = await api.analyzeProject(state.projectId)
    state.analysis = analysisRes.data
    t2.dismiss()
    toast.success('Analysis complete!')

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
    await api.startDeploy(state.projectId, platformToSend(), { stack: state.stack, useDatabase: state.useDb })
    t3.dismiss()

  } catch (err) {
    t1?.dismiss(); t2?.dismiss(); t3?.dismiss()
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

const isDeployDisabled = () => {
  if (state.tab === 'upload') return !state.file
  return !state.githubUrl.trim()
}

const formatSize = (b) => {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}

const formatTime = (ts) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
