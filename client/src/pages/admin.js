import { toast } from '../main.js'
import { api } from '../api.js'

let currentSearch = ''
let currentPage = 1

export const renderAdmin = async () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:1080px;margin:40px auto;padding:0 20px 60px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:8px">
        <div>
          <h2>🛡️ Admin panel</h2>
          <p style="color:var(--text2);margin-top:6px;font-size:0.92rem">Manage users, see who's online, and adjust plans.</p>
        </div>
      </div>

      <div id="adminStats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:24px">
        ${statCard('...', 'Total users', 'totalUsers')}
        ${statCard('...', 'Online now', 'onlineUsers')}
        ${statCard('...', 'Projects', 'totalProjects')}
        ${statCard('...', 'Deployed', 'deployedProjects')}
        ${statCard('...', 'Admins', 'adminCount')}
      </div>

      <div style="display:flex;gap:10px;align-items:center;margin-top:28px;flex-wrap:wrap">
        <input class="inp" id="userSearch" placeholder="Search by name or email…" style="flex:1 1 240px;min-width:0">
        <button class="btn btn-secondary btn-sm" id="refreshBtn">🔄 Refresh</button>
      </div>

      <div style="overflow-x:auto;margin-top:16px;border:1px solid var(--border);border-radius:var(--rl)">
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem" id="userTable">
          <thead>
            <tr style="text-align:left;border-bottom:1px solid var(--border)">
              <th style="padding:12px 14px">Status</th>
              <th style="padding:12px 14px">Name</th>
              <th style="padding:12px 14px">Email</th>
              <th style="padding:12px 14px">Role</th>
              <th style="padding:12px 14px">Plan</th>
              <th style="padding:12px 14px">Deploys</th>
              <th style="padding:12px 14px">Last seen</th>
              <th style="padding:12px 14px">Actions</th>
            </tr>
          </thead>
          <tbody id="userRows">
            <tr><td colspan="8" style="padding:20px;color:var(--text2)">Loading…</td></tr>
          </tbody>
        </table>
      </div>

      <div id="pagination" style="display:flex;gap:8px;justify-content:center;margin-top:18px"></div>
    </div>
  `

  document.getElementById('refreshBtn').onclick = () => loadUsers()
  const searchInput = document.getElementById('userSearch')
  let debounce
  searchInput.oninput = () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      currentSearch = searchInput.value.trim()
      currentPage = 1
      loadUsers()
    }, 300)
  }

  await Promise.all([loadStats(), loadUsers()])
}

const statCard = (value, label, id) => `
  <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;text-align:center">
    <div id="stat-${id}" style="font-family:var(--display);font-size:1.5rem">${value}</div>
    <div style="color:var(--text2);font-size:0.76rem;margin-top:4px">${label}</div>
  </div>
`

const loadStats = async () => {
  try {
    const res = await api.adminStats()
    Object.entries(res.data).forEach(([key, val]) => {
      const el = document.getElementById(`stat-${key}`)
      if (el) el.textContent = val
    })
  } catch (err) {
    toast.error(err.message || 'Could not load stats')
  }
}

const loadUsers = async () => {
  const tbody = document.getElementById('userRows')
  tbody.innerHTML = `<tr><td colspan="8" style="padding:20px;color:var(--text2)">Loading…</td></tr>`

  try {
    const res = await api.adminListUsers({ search: currentSearch, page: currentPage, limit: 25 })
    const { users, page, pages } = res.data

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="padding:20px;color:var(--text2)">No users found.</td></tr>`
    } else {
      tbody.innerHTML = users.map(rowHtml).join('')
    }

    renderPagination(page, pages)
    wireRowActions()
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="padding:20px;color:var(--red)">${escapeHtml(err.message || 'Failed to load users')}</td></tr>`
  }
}

const rowHtml = (u) => {
  const lastSeen = u.lastActiveAt ? timeAgo(u.lastActiveAt) : 'never'
  return `
    <tr style="border-bottom:1px solid var(--border)" data-id="${u._id}">
      <td style="padding:10px 14px">
        <span title="${u.isOnline ? 'Online' : 'Offline'}" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${u.isOnline ? 'var(--green)' : 'var(--muted)'}"></span>
      </td>
      <td style="padding:10px 14px">${escapeHtml(u.name)}${u.suspended ? ' <span style=\"color:var(--red);font-size:0.72rem\">(suspended)</span>' : ''}</td>
      <td style="padding:10px 14px;color:var(--text2)">${escapeHtml(u.email)}</td>
      <td style="padding:10px 14px">
        <span class="status-badge ${u.role === 'admin' ? 's-deployed' : 's-pending'}" style="padding:2px 10px;font-size:0.72rem">${u.role}</span>
      </td>
      <td style="padding:10px 14px">${u.plan}</td>
      <td style="padding:10px 14px">${u.deployCount}/${u.maxDeploys}</td>
      <td style="padding:10px 14px;color:var(--text2);white-space:nowrap">${lastSeen}</td>
      <td style="padding:10px 14px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm act-role" data-role="${u.role === 'admin' ? 'user' : 'admin'}">
            ${u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
          </button>
          <button class="btn btn-secondary btn-sm act-suspend" data-suspend="${u.suspended ? 'false' : 'true'}">
            ${u.suspended ? 'Unsuspend' : 'Suspend'}
          </button>
          <button class="btn btn-danger btn-sm act-delete">Delete</button>
        </div>
      </td>
    </tr>
  `
}

const wireRowActions = () => {
  document.querySelectorAll('#userRows tr[data-id]').forEach(row => {
    const id = row.getAttribute('data-id')

    row.querySelector('.act-role').onclick = async (e) => {
      const role = e.target.getAttribute('data-role')
      try {
        await api.adminUpdateUser(id, { role })
        toast.success(`Role updated to ${role}`)
        await Promise.all([loadUsers(), loadStats()])
      } catch (err) {
        toast.error(err.message)
      }
    }

    row.querySelector('.act-suspend').onclick = async (e) => {
      const suspended = e.target.getAttribute('data-suspend') === 'true'
      try {
        await api.adminUpdateUser(id, { suspended })
        toast.success(suspended ? 'User suspended' : 'User unsuspended')
        await loadUsers()
      } catch (err) {
        toast.error(err.message)
      }
    }

    row.querySelector('.act-delete').onclick = async () => {
      if (!confirm('Delete this user and all their projects? This cannot be undone.')) return
      try {
        await api.adminDeleteUser(id)
        toast.success('User deleted')
        await Promise.all([loadUsers(), loadStats()])
      } catch (err) {
        toast.error(err.message)
      }
    }
  })
}

const renderPagination = (page, pages) => {
  const wrap = document.getElementById('pagination')
  if (pages <= 1) { wrap.innerHTML = ''; return }

  let html = ''
  for (let i = 1; i <= pages; i++) {
    html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-secondary'}" data-page="${i}">${i}</button>`
  }
  wrap.innerHTML = html

  wrap.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      currentPage = parseInt(btn.getAttribute('data-page'), 10)
      loadUsers()
    }
  })
}

const timeAgo = (dateStr) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
