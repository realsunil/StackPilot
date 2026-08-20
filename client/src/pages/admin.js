import { toast } from '../main.js'
import { api } from '../api.js'

let allUsers = []

export const renderAdmin = async () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:1000px;margin:40px auto;padding:0 20px 60px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
        <div>
          <h2>🛡️ Admin Panel</h2>
          <p style="color:var(--text2);margin-top:6px;font-size:0.92rem">Who's logged in, who hasn't — at a glance.</p>
        </div>
        <input id="userSearch" class="inp" placeholder="🔎 Search name or email…" style="max-width:240px;padding:9px 12px;font-size:0.85rem">
      </div>

      <div id="statCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px"></div>

      <div id="adminBody"></div>
    </div>
  `

  document.getElementById('adminBody').innerHTML = skeletonHtml()
  document.getElementById('userSearch').addEventListener('input', (e) => {
    renderTable(filterUsers(allUsers, e.target.value))
  })

  await load()
}

const load = async () => {
  try {
    const res = await api.getAdminUsers()
    allUsers = res.data.users
    renderStats(res.data.stats)
    renderTable(allUsers)
  } catch (err) {
    if (err.message === 'Admin access only') {
      document.getElementById('statCards').innerHTML = ''
      document.getElementById('adminBody').innerHTML = `
        <div style="text-align:center;padding:60px 20px;color:var(--text2)">
          <div style="font-size:2rem;margin-bottom:10px">🔒</div>
          <p>This section is for admins only.</p>
        </div>
      `
      return
    }
    toast.error(err.message || 'Could not load users')
    document.getElementById('adminBody').innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text2)">Failed to load. Try refreshing.</div>
    `
  }
}

const renderStats = (stats) => {
  const cards = [
    { label: 'Total users', value: stats.total, color: 'var(--cyan)' },
    { label: '✅ Have logged in', value: stats.loggedIn, color: 'var(--green)' },
    { label: '⏳ Never logged in', value: stats.neverLoggedIn, color: 'var(--amber)' }
  ]
  document.getElementById('statCards').innerHTML = cards.map(c => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:18px 20px">
      <div style="font-family:var(--mono);font-size:1.7rem;font-weight:600;color:${c.color}">${c.value}</div>
      <div style="color:var(--text2);font-size:0.8rem;margin-top:4px">${c.label}</div>
    </div>
  `).join('')
}

const filterUsers = (users, q) => {
  const term = q.trim().toLowerCase()
  if (!term) return users
  return users.filter(u => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
}

const renderTable = (users) => {
  const body = document.getElementById('adminBody')

  if (!users.length) {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text2)">No users match your search.</div>`
    return
  }

  body.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden">
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
          <thead>
            <tr style="border-bottom:1px solid var(--border);text-align:left">
              ${['User', 'Status', 'Last login', 'Logins', 'Plan', 'Joined'].map(h =>
                `<th style="padding:12px 16px;color:var(--text2);font-weight:500;font-size:0.75rem;letter-spacing:0.03em;text-transform:uppercase;white-space:nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${users.map(rowHtml).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
}

const rowHtml = (u) => {
  const loggedIn = !!u.lastLogin
  return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:12px 16px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <strong>${escapeHtml(u.name)}</strong>
          ${u.isAdmin ? `<span style="font-size:0.68rem;color:var(--purple);border:1px solid var(--purple);border-radius:4px;padding:1px 6px">ADMIN</span>` : ''}
        </div>
        <div style="color:var(--text2);font-size:0.78rem">${escapeHtml(u.email)}</div>
      </td>
      <td style="padding:12px 16px;white-space:nowrap">
        ${loggedIn
          ? `<span class="status-badge s-deployed" style="padding:2px 10px;font-size:0.72rem">✅ Logged in</span>`
          : `<span class="status-badge s-pending" style="padding:2px 10px;font-size:0.72rem">⏳ Never logged in</span>`}
      </td>
      <td style="padding:12px 16px;color:var(--text2);white-space:nowrap">${loggedIn ? timeAgo(u.lastLogin) : '—'}</td>
      <td style="padding:12px 16px;color:var(--text2);font-family:var(--mono)">${u.loginCount || 0}</td>
      <td style="padding:12px 16px;color:var(--text2)">${u.plan === 'pro' ? '⭐ Pro' : 'Free'}</td>
      <td style="padding:12px 16px;color:var(--text2);white-space:nowrap">${formatDate(u.createdAt)}</td>
    </tr>
  `
}

const skeletonHtml = () => `
  <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:40px;text-align:center;color:var(--text2)">
    Loading users…
  </div>
`

const formatDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const timeAgo = (d) => {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(d)
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
