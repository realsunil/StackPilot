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
  quickInfo: null
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

      <div style="margin-bottom:18px">
        <label style="font-size:0.88rem;font-weight:600;color:var(--text2);display:block;margin-bottom:10px">
          Deployment Platform
        </label>
        <div class="platform-grid">
          ${platforms.map(p => `
            <div class="plat ${state.platform===p.id?'selected':''}" data-plat="${p.id}">
              <div class="plat-icon">${p.icon}</div>
              <div class="plat-name">${p.name}</div>
              <div class="plat-desc">${p.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="deployBtn" 
        style="padding:17px;font-size:1rem" 
        ${isDeployDisabled() ? 'disabled' : ''}>
         Deploy Now
      </button>
    </div>
  `
  attachFormEvents()
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
      analysis: null, quickInfo: null
    }
    renderDeployForm()
  })

  document.querySelector('.live-url')?.addEventListener('click', () => {
    navigator.clipboard.writeText(state.deployedUrl)
    toast.success('URL copied!')
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
    return `
      <div class="live-card">
        <h3>🎉 Deployment Successful!</h3>
        <p>Your project is live on ${state.platform || 'cloud'}</p>
        <div class="live-url" title="Click to copy">
          ${state.deployedUrl} 📋
        </div>
        <a href="${state.deployedUrl}" target="_blank">
          <button class="btn btn-primary">🌐 Visit Site</button>
        </a>
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
        <h3>Deploying to ${state.platform || 'cloud'}...</h3>
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

  document.querySelectorAll('.plat').forEach(el => {
    el.addEventListener('click', () => {
      state.platform = el.dataset.plat
      document.querySelectorAll('.plat').forEach(p => p.classList.remove('selected'))
      el.classList.add('selected')
    })
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
      fd.append('platform', state.platform)
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
        platform: state.platform
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
    await api.startDeploy(state.projectId, state.platform)
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
