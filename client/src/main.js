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
    <div class="logo">StackPilot</div>
    <div class="nav-links">
      <a href="/" data-link>Home</a>
      <a href="/deploy" data-link>Deploy</a>
      <a href="/projects" data-link>Projects</a>
      <a href="/dashboard" data-link>Dashboard</a>
    </div>
  </nav>
  <main id="main"></main>
  <footer class="footer">
    <p> <strong>StackPilot</strong> — Upload → Detect → Deploy</p>
    <div class="social-links">
      <a href="https://github.com/realsunil/" target="_blank" rel="noopener" aria-label="GitHub">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.2.66.79.55A11.5 11.5 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z"/></svg>
      </a>
      <a href="https://www.linkedin.com/in/sunilkofficial/" target="_blank" rel="noopener" aria-label="LinkedIn">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z"/></svg>
      </a>
      <a href="https://discord.gg/NStzW7sVRw" target="_blank" rel="noopener" aria-label="Discord">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.3 4.7A18.5 18.5 0 0 0 15.6 3l-.25.5c1.7.5 2.65 1.2 2.65 1.2a13.6 13.6 0 0 0-11.9 0s.95-.7 2.65-1.2L8.5 3a18.4 18.4 0 0 0-4.7 1.7S.5 10.2.9 15.6a18.7 18.7 0 0 0 5.6 2.8s.45-.55.8-1c-1.5-.55-2.1-1.2-2.1-1.2s.13.1.35.23A14.9 14.9 0 0 0 12 17.9a14.8 14.8 0 0 0 6.45-1.47c.22-.13.35-.23.35-.23s-.6.65-2.1 1.2c.35.45.8 1 .8 1a18.6 18.6 0 0 0 5.6-2.8c.5-6.2-1.2-11-3.8-12.9ZM9 13.5c-.85 0-1.55-.8-1.55-1.75S8.15 10 9 10s1.56.8 1.55 1.75c0 .95-.7 1.75-1.55 1.75Zm6 0c-.85 0-1.55-.8-1.55-1.75S14.15 10 15 10s1.56.8 1.55 1.75c0 .95-.7 1.75-1.55 1.75Z"/></svg>
      </a>
    </div>
  </footer>
`

document.querySelector('.logo').addEventListener('click', () => navigate('/'))

initRouter()
