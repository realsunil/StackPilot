import { api } from '../api.js'
import { navigate } from '../router.js'
import { toast } from '../main.js'

export const renderProjects = async () => {
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="projects-page">
      <div class="page-top">
        <h2>Your Projects</h2>
        <button class="btn btn-secondary btn-sm" id="refreshBtn">🔄 Refresh</button>
      </div>
      <div id="projContent">
        <div style="text-align:center;padding:60px">
          <div class="spinner" style="margin:0 auto"></div>
        </div>
      </div>
    </div>
  `
  document.getElementById('refreshBtn')?.addEventListener('click', loadProjects)
  await loadProjects()
}

const loadProjects = async () => {
  try {
    const res = await api.getProjects()
    const projects = res.data
    const el = document.getElementById('projContent')
    if (!el) return

    if (!projects.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📁</div>
          <h3>No projects yet</h3>
          <p>Deploy your first project to see it here</p>
          <button class="btn btn-primary" id="goDeployBtn"> Deploy Now</button>
        </div>
      `
      document.getElementById('goDeployBtn')?.addEventListener('click', () => navigate('/deploy'))
      return
    }

    el.innerHTML = `
      <div class="proj-grid">
        ${projects.map(p => `
          <div class="proj-card" data-id="${p.projectId}">
            <div class="proj-top">
              <div>
                <div class="proj-name">${p.name}</div>
                <div class="proj-date">${formatDate(p.createdAt)}</div>
              </div>
              <div class="proj-actions">
                <span class="status-badge s-${p.status}" style="font-size:0.75rem;padding:5px 10px">
                  ${p.status}
                </span>
                <button class="btn btn-danger btn-sm del-btn" data-id="${p.projectId}" 
                  style="padding:5px 8px">🗑️</button>
              </div>
            </div>
            <div class="proj-tags">
              ${p.detectedType && p.detectedType !== 'unknown' ? `<span class="tag">${p.detectedType}</span>` : ''}
              ${p.category && p.category !== 'unknown' ? `<span class="tag">${p.category}</span>` : ''}
              <span class="tag">${p.source}</span>
              ${p.deploymentPlatform && p.deploymentPlatform !== 'none' ? `<span class="tag">${p.deploymentPlatform}</span>` : ''}
            </div>
            ${p.deployedUrl ? `<div class="proj-url">🌐 ${p.deployedUrl}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `

    document.querySelectorAll('.proj-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.del-btn')) return
        navigate(`/projects/${card.dataset.id}`)
      })
    })

    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm('Delete this project?')) return
        try {
          await api.deleteProject(btn.dataset.id)
          toast.success('Project deleted')
          loadProjects()
        } catch {
          toast.error('Delete failed')
        }
      })
    })

  } catch {
    toast.error('Failed to load projects')
  }
}

export const renderProjectDetail = async (projectId) => {
  const main = document.getElementById('main')
  main.innerHTML = `
    <div class="proj-detail">
      <button class="btn btn-secondary btn-sm" id="backBtn" style="margin-bottom:20px">← Back</button>
      <div style="text-align:center;padding:60px">
        <div class="spinner" style="margin:0 auto"></div>
      </div>
    </div>
  `
  document.getElementById('backBtn')?.addEventListener('click', () => navigate('/projects'))

  try {
    const res = await api.getProject(projectId)
    const p = res.data

    main.innerHTML = `
      <div class="proj-detail">
        <button class="btn btn-secondary btn-sm" id="backBtn" style="margin-bottom:20px">← Back</button>
        
        <div class="detail-top">
          <div>
            <h1>${p.name}</h1>
            <small style="color:var(--muted)">ID: ${p.projectId}</small>
          </div>
          <span class="status-badge s-${p.status}">${p.status}</span>
        </div>

        <div class="info-grid">
          <div class="info-cell"><div class="lbl">Source</div>
            <div class="val">${p.source === 'github' ? '🐙 GitHub' : '📦 Upload'}</div></div>
          <div class="info-cell"><div class="lbl">Platform</div>
            <div class="val">${p.deploymentPlatform || 'Auto'}</div></div>
          <div class="info-cell"><div class="lbl">Framework</div>
            <div class="val">${p.metadata?.framework || p.detectedType || 'Unknown'}</div></div>
          <div class="info-cell"><div class="lbl">Category</div>
            <div class="val">${p.category || 'Unknown'}</div></div>
          ${p.metadata?.language ? `
            <div class="info-cell"><div class="lbl">Language</div>
              <div class="val">${p.metadata.language}</div></div>
          ` : ''}
          ${p.metadata?.packageManager ? `
            <div class="info-cell"><div class="lbl">Package Manager</div>
              <div class="val">${p.metadata.packageManager}</div></div>
          ` : ''}
        </div>

        ${p.deployedUrl ? `
          <div class="live-card" style="margin:20px 0;text-align:left">
            <h3>🌐 Live URL</h3>
            <a href="${p.deployedUrl}" target="_blank" class="live-url" style="text-decoration:none">
              ${p.deployedUrl} 🔗
            </a>
          </div>
        ` : ''}

        ${p.status === 'deployed' && ['vercel', 'netlify'].includes(p.deploymentPlatform) ? `
          <div class="live-card" style="margin:20px 0;text-align:left">
            <h3>🌍 Custom domain</h3>
            ${p.customDomain ? `
              <p style="margin:6px 0">
                <strong>${p.customDomain}</strong>
                <span class="status-badge s-${p.domainStatus === 'active' ? 'deployed' : p.domainStatus === 'error' ? 'failed' : 'pending'}" style="margin-left:8px;font-size:0.72rem;padding:2px 10px">${p.domainStatus}</span>
              </p>
              ${p.domainInstructions ? `<p style="color:var(--text2);font-size:0.85rem">${escapeHtml(p.domainInstructions)}</p>` : ''}
              <button class="btn btn-secondary btn-sm" id="removeDomainBtn" style="margin-top:8px">Remove domain</button>
            ` : `
              <p style="color:var(--text2);font-size:0.88rem;margin-bottom:10px">
                Point your own domain (e.g. www.mystartup.com) at this deployment.
              </p>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input class="inp" id="domainInput" placeholder="www.mystartup.com" style="flex:1 1 220px;min-width:0">
                <button class="btn btn-primary btn-sm" id="setDomainBtn">Attach domain</button>
              </div>
            `}
          </div>
        ` : ''}

        <div class="action-bar">
          <button class="btn btn-primary" id="redeployBtn">🔄 Redeploy</button>
          <button class="btn btn-danger" id="deleteBtn">🗑️ Delete</button>
        </div>

        ${p.logs?.length ? `
          <div class="logs-box">
            <div class="logs-head">
              <span>📟 Deployment Logs</span>
              <span class="logs-count">${p.logs.length} entries</span>
            </div>
            <div class="logs-body">
              ${p.logs.map(l => `
                <div class="log-line">
                  <span class="log-t">${formatTime(l.timestamp)}</span>
                  <span class="log-m ${l.type}">${l.message}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `

    document.getElementById('backBtn')?.addEventListener('click', () => navigate('/projects'))

    document.getElementById('redeployBtn')?.addEventListener('click', async () => {
      try {
        await api.startDeploy(projectId)
        toast.success('Redeployment started!')
        navigate('/deploy')
      } catch (err) {
        toast.error(err.message || 'Redeploy failed')
      }
    })

    document.getElementById('deleteBtn')?.addEventListener('click', async () => {
      if (!confirm('Delete this project?')) return
      try {
        await api.deleteProject(projectId)
        toast.success('Deleted!')
        navigate('/projects')
      } catch {
        toast.error('Delete failed')
      }
    })

    document.getElementById('setDomainBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('domainInput')
      const domain = input?.value?.trim()
      if (!domain) return toast.error('Enter a domain first')

      const btn = document.getElementById('setDomainBtn')
      btn.disabled = true
      btn.textContent = 'Attaching…'
      try {
        await api.setDomain(projectId, domain)
        toast.success('Domain attached! Update your DNS to finish.')
        renderProjectDetail(projectId)
      } catch (err) {
        toast.error(err.message || 'Could not attach domain')
        btn.disabled = false
        btn.textContent = 'Attach domain'
      }
    })

    document.getElementById('removeDomainBtn')?.addEventListener('click', async () => {
      if (!confirm('Remove this custom domain from StackPilot? (This does not delete it from Vercel/Netlify.)')) return
      try {
        await api.removeDomain(projectId)
        toast.success('Domain removed')
        renderProjectDetail(projectId)
      } catch (err) {
        toast.error(err.message || 'Could not remove domain')
      }
    })

    const lb = main.querySelector('.logs-body')
    if (lb) lb.scrollTop = lb.scrollHeight

  } catch {
    toast.error('Project not found')
    navigate('/projects')
  }
}

const formatDate = (d) => new Date(d).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric'
})

const formatTime = (ts) => {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
