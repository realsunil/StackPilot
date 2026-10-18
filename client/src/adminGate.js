import { api } from './api.js'
import { navigate } from './router.js'
import { toast } from './main.js'

// Hidden admin password box. Opened by: the invisible footer dot,
// Ctrl+Shift+A, or tapping the logo 5 times. The password itself is
// checked on the SERVER (ADMIN_PANEL_PASSWORD env var) - nothing secret
// lives in this file.
export const openAdminGate = () => {
  // Already unlocked this session -> go straight in.
  if (sessionStorage.getItem('adminToken')) {
    navigate('/admin')
    return
  }
  if (document.getElementById('adminGate')) return

  const overlay = document.createElement('div')
  overlay.id = 'adminGate'
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px'
  overlay.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--rl);padding:28px;width:100%;max-width:340px">
      <h3 style="margin-bottom:6px">🔐 Admin access</h3>
      <p style="color:var(--text2);font-size:0.82rem;margin-bottom:16px">Enter the admin password.</p>
      <input class="inp" type="password" id="adminPw" placeholder="Password" autocomplete="off">
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-primary btn-sm" id="adminGo" style="flex:1">Unlock</button>
        <button class="btn btn-secondary btn-sm" id="adminCancel">Cancel</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const input = overlay.querySelector('#adminPw')
  const goBtn = overlay.querySelector('#adminGo')
  const close = () => overlay.remove()
  input.focus()

  const submit = async () => {
    const password = input.value
    if (!password) return
    goBtn.disabled = true
    goBtn.textContent = 'Checking…'
    try {
      const res = await api.adminUnlock(password)
      sessionStorage.setItem('adminToken', res.data.token)
      close()
      navigate('/admin')
    } catch (err) {
      toast.error(err.message || 'Wrong password')
      goBtn.disabled = false
      goBtn.textContent = 'Unlock'
      input.value = ''
      input.focus()
    }
  }

  goBtn.onclick = submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') close()
  })
  overlay.querySelector('#adminCancel').onclick = close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
}
