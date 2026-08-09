import { navigate } from '../router.js'
import { toast } from '../main.js'
import { api, loginWithProvider } from '../api.js'

const PLATFORMS = [
  {
    id: 'vercel',
    icon: '▲',
    name: 'Vercel',
    oauth: true,
    color: '#fff',
    blurb: 'Deploy static sites, React, Next.js & more.'
  },
  {
    id: 'netlify',
    icon: '◆',
    name: 'Netlify',
    oauth: true,
    color: '#00c7b7',
    blurb: 'Deploy static sites, JAMstack apps & functions.'
  },
  {
    id: 'render',
    icon: '🟢',
    name: 'Render',
    oauth: false,
    color: '#46e3b7',
    blurb: 'Deploy backends & full-stack apps from GitHub.'
  }
]

export const renderDashboard = async () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:820px;margin:40px auto;padding:0 20px 60px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:8px">
        <div>
          <h2 id="dashTitle">👋 Dashboard</h2>
          <p style="color:var(--text2);margin-top:6px;font-size:0.92rem" id="dashSub">Loading your account…</p>
        </div>
        <button class="btn btn-secondary btn-sm" id="logoutBtn">🚪 Logout</button>
      </div>

      <div class="input-grp" style="margin-top:28px">
        <label style="font-size:1rem;color:var(--text)">🔌 Connected platforms</label>
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px">
          Connect once. Every deploy after that runs straight on your own account — no tokens to paste, nothing to remember.
        </p>
      </div>

      <div id="platformCards" style="display:flex;flex-direction:column;gap:14px"></div>
    </div>
  `

  document.getElementById('logoutBtn').onclick = async () => {
    try { await api.logout() } catch (_) { /* stateless JWT - fine either way */ }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    toast.success('Logged out')
    navigate('/login')
  }

  // Handle the redirect back from Vercel/Netlify's OAuth screen
  const params = new URLSearchParams(window.location.search)
  if (params.get('connected')) {
    toast.success(`${cap(params.get('connected'))} connected!`)
  }
  if (params.get('error')) {
    const err = params.get('error')
    toast.error(err.endsWith('_denied') ? 'Login was cancelled' : 'Could not connect. Try again.')
  }
  if (params.get('connected') || params.get('error')) {
    window.history.replaceState({}, '', '/dashboard')
  }

  await loadEverything()
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const loadEverything = async () => {
  try {
    const [me, conn] = await Promise.all([api.getMe(), api.getConnections()])
    const user = me.data
    localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user') || '{}'), ...user }))

    document.getElementById('dashTitle').textContent = `👋 Hey, ${user.name}`
    document.getElementById('dashSub').textContent =
      `${user.email} · ${user.plan === 'pro' ? '⭐ Pro plan' : `Free plan · ${user.deployCount}/${user.maxDeploys} deploys used`}`

    renderCards(conn.data || {})
  } catch (err) {
    toast.error(err.message || 'Could not load dashboard')
  }
}

const renderCards = (connections) => {
  const wrap = document.getElementById('platformCards')
  wrap.innerHTML = PLATFORMS.map(p => cardHtml(p, connections[p.id])).join('')

  PLATFORMS.forEach(p => {
    const loginBtn = document.getElementById(`login-${p.id}`)
    if (loginBtn) loginBtn.onclick = () => loginWithProvider(p.id)

    const disconnectBtn = document.getElementById(`disconnect-${p.id}`)
    if (disconnectBtn) disconnectBtn.onclick = () => handleDisconnect(p.id)

    const connectRenderBtn = document.getElementById('connectRenderBtn')
    if (connectRenderBtn) connectRenderBtn.onclick = handleConnectRender
  })
}

const cardHtml = (p, state) => {
  const connected = state?.connected
  return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:20px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="font-size:1.8rem;width:44px;text-align:center">${p.icon}</div>
      <div style="flex:1;min-width:200px">
        <div style="display:flex;align-items:center;gap:10px">
          <strong style="font-size:1.02rem">${p.name}</strong>
          ${connected
            ? `<span class="status-badge s-deployed" style="padding:2px 10px;font-size:0.72rem">✅ Connected${state.accountName ? ' · ' + escapeHtml(state.accountName) : ''}</span>`
            : `<span class="status-badge s-pending" style="padding:2px 10px;font-size:0.72rem">Not connected</span>`}
        </div>
        <p style="color:var(--text2);font-size:0.82rem;margin-top:4px">${p.blurb}</p>
        ${!p.oauth ? `
          <p style="color:var(--muted);font-size:0.74rem;margin-top:6px">
            Render doesn't offer a public login button (no OAuth) — paste your free API key once below.
          </p>
        ` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:stretch;min-width:180px">
        ${connected
          ? `<button class="btn btn-danger btn-sm" id="disconnect-${p.id}">Disconnect</button>`
          : (p.oauth
              ? `<button class="btn btn-primary btn-sm" id="login-${p.id}">${p.icon} Login with ${p.name}</button>`
              : `
                <div style="display:flex;gap:8px">
                  <input class="inp" id="renderKeyInput" placeholder="Render API key" style="padding:8px 10px;font-size:0.82rem">
                  <button class="btn btn-primary btn-sm" id="connectRenderBtn">Connect</button>
                </div>
                <a href="https://dashboard.render.com/u/settings#api-keys" target="_blank" rel="noopener" style="color:var(--blue);font-size:0.74rem">Get a free key →</a>
              `)
        }
      </div>
    </div>
  `
}

const handleDisconnect = async (provider) => {
  try {
    await api.disconnectProvider(provider)
    toast.success(`${cap(provider)} disconnected`)
    await loadEverything()
  } catch (err) {
    toast.error(err.message)
  }
}

const handleConnectRender = async () => {
  const input = document.getElementById('renderKeyInput')
  const apiKey = input?.value?.trim()
  if (!apiKey) return toast.error('Paste your Render API key first')

  const btn = document.getElementById('connectRenderBtn')
  btn.disabled = true
  btn.textContent = 'Connecting…'

  try {
    await api.connectRender(apiKey)
    toast.success('Render connected!')
    await loadEverything()
  } catch (err) {
    toast.error(err.message)
    btn.disabled = false
    btn.textContent = 'Connect'
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
