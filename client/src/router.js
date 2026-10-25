import { renderHome } from './pages/home.js'
import { renderDeploy } from './pages/deploy.js'
import { renderProjects, renderProjectDetail } from './pages/projects.js'
import { renderLogin, renderRegister, renderForgotPassword, renderResetPassword } from './pages/auth.js'
import { renderDashboard } from './pages/dashboard.js'
import { renderAdmin } from './pages/admin.js'
import { openAdminGate } from './adminGate.js'

const routes = {
  '/': renderHome,
  '/deploy': renderDeploy,
  '/projects': renderProjects,
  '/login': renderLogin,
  '/register': renderRegister,
  '/forgot-password': renderForgotPassword,
  '/dashboard': renderDashboard,
  '/settings': renderDashboard, // old link, kept working
  '/admin': renderAdmin,
}

// Routes that require the user to be logged in
const protectedRoutes = ['/deploy', '/projects', '/dashboard', '/settings']

// /admin opens only with the password-gate token (or an admin login). This is
// a UI convenience only - every /api/admin/* call is also independently
// checked server-side, so this can never be the real security boundary.
const adminRoutes = ['/admin']

export const navigate = (path) => {
  window.history.pushState({}, '', path)
  render()
}

const render = () => {
  const path = window.location.pathname
  const token = localStorage.getItem('token')

  // Redirect to login if accessing a protected route without a token
  if (protectedRoutes.some(r => path.startsWith(r)) && !token) {
    window.history.replaceState({}, '', '/login')
    renderLogin()
    updateNav('/login')
    return
  }

  // Admin panel: needs the hidden-gate token or an admin login. Otherwise
  // go home and (silently) pop the password box.
  if (adminRoutes.some(r => path.startsWith(r))) {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const unlocked = !!sessionStorage.getItem('adminToken') || (token && user?.role === 'admin')
    if (!unlocked) {
      window.history.replaceState({}, '', '/')
      renderHome()
      updateNav('/')
      openAdminGate()
      return
    }
  }

  // Password reset link from the email: /reset-password/:token
  if (path.startsWith('/reset-password/') && path.split('/').length === 3) {
    renderResetPassword(decodeURIComponent(path.split('/')[2]))
    updateNav('/login')
    return
  }

  // Project detail route: /projects/:id
  if (path.startsWith('/projects/') && path.split('/').length === 3) {
    const id = path.split('/')[2]
    renderProjectDetail(id)
    updateNav('/projects')
    return
  }

  const fn = routes[path] || renderHome
  fn()
  updateNav(path)
}

// The 🛡️ Admin link is shown ONLY while an admin account is logged in.
// This runs on every page change (login, logout, navigation), so the link
// appears/disappears right away - it is not decided once at page load.
// (UI convenience only: every /api/admin/* route is also checked on the server.)
const syncAdminLink = () => {
  const nav = document.querySelector('.nav-links')
  if (!nav) return

  let user = null
  try { user = JSON.parse(localStorage.getItem('user') || 'null') } catch (e) { /* bad data = not admin */ }
  const isAdmin = !!localStorage.getItem('token') && user?.role === 'admin'

  const existing = nav.querySelector('.nav-admin-link')
  if (isAdmin && !existing) {
    const a = document.createElement('a')
    a.href = '/admin'
    a.className = 'nav-admin-link'
    a.setAttribute('data-link', '')
    a.textContent = '🛡️ Admin'
    nav.appendChild(a)
  } else if (!isAdmin && existing) {
    existing.remove()
  }
}

const updateNav = (path) => {
  syncAdminLink()
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path)
  })
}

export const initRouter = () => {
  window.addEventListener('popstate', render)
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-link]')) {
      e.preventDefault()
      navigate(e.target.getAttribute('href'))
    }
  })
  render()
}
