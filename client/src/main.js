import { initRouter, navigate } from './router.js'

const toastContainer = document.createElement('div')
toastContainer.className = 'toast-container'
document.body.appendChild(toastContainer)

export const toast = {
  show(msg, type = 'info', duration = 3000) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', loading: '⏳' }
    const el = document.createElement('div')
    el.className = `toast ${type}`
    el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`
    toastContainer.appendChild(el)
    if (type !== 'loading') {
      setTimeout(() => el.remove(), duration)
    }
    return el
  },
  success(msg) { return this.show(msg, 'success') },
  error(msg) { return this.show(msg, 'error') },
  info(msg) { return this.show(msg, 'info') },
  loading(msg) {
    const el = this.show(msg, 'loading', 0)
    return { dismiss: () => el.remove() }
  }
}

document.getElementById('app').innerHTML = `
  <nav class="navbar">
    <div class="logo">🚀 StackPilot</div>
    <div class="nav-links">
      <a href="/" data-link>Home</a>
      <a href="/deploy" data-link>Deploy</a>
      <a href="/projects" data-link>Projects</a>
      <a href="/dashboard" data-link>Dashboard</a>
    </div>
  </nav>
  <main id="main"></main>
  <footer class="footer">
    <p>🚀 <strong>StackPilot</strong> — Upload → Detect → Deploy</p>
  </footer>
`

document.querySelector('.logo').addEventListener('click', () => navigate('/'))

initRouter()