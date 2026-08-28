import { renderHome } from './pages/home.js'
import { renderDeploy } from './pages/deploy.js'
import { renderProjects, renderProjectDetail } from './pages/projects.js'
import { renderLogin, renderRegister } from './pages/auth.js'
import { renderDashboard } from './pages/dashboard.js'
import { renderAdmin } from './pages/admin.js'

const routes = {
  '/': renderHome,
  '/deploy': renderDeploy,
  '/projects': renderProjects,
  '/login': renderLogin,
  '/register': renderRegister,
  '/dashboard': renderDashboard,
  '/settings': renderDashboard, // old link, kept working
  '/admin': renderAdmin,
}

// Routes that require the user to be logged in
const protectedRoutes = ['/deploy', '/projects', '/dashboard', '/settings', '/admin']

// Routes that require role === 'admin' on top of being logged in. This is
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

  // Redirect non-admins away from the admin panel
  if (adminRoutes.some(r => path.startsWith(r))) {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user?.role !== 'admin') {
      window.history.replaceState({}, '', '/dashboard')
      renderDashboard()
      updateNav('/dashboard')
      return
    }
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

const updateNav = (path) => {
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
