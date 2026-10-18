import { navigate } from '../router.js'
import { toast } from '../main.js'
import { BASE, api } from '../api.js'

export const renderLogin = () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:400px;margin:80px auto;padding:40px;background:var(--card);border:1px solid var(--border);border-radius:var(--rl)">
      <h2 style="text-align:center;margin-bottom:30px"> Login to StackPilot</h2>
      
      <div class="input-grp">
        <label>Email</label>
        <input class="inp" type="email" id="email" placeholder="you@example.com">
      </div>
      
      <div class="input-grp">
        <label>Password</label>
        <input class="inp" type="password" id="password" placeholder="••••••••">
      </div>
      
      <div style="text-align:right;margin:-6px 0 4px">
        <a href="#" id="goForgot" style="color:var(--blue);font-size:0.85rem">Forgot password?</a>
      </div>

      <button class="btn btn-primary btn-full" id="loginBtn" style="margin-top:10px">
        🔐 Login
      </button>
      
      <p style="text-align:center;margin-top:20px;color:var(--text2);font-size:0.9rem">
        Don't have an account? 
        <a href="#" id="goRegister" style="color:var(--blue)">Sign up</a>
      </p>
    </div>
  `
  
  document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    
    if (!email || !password) return toast.error('Fill all fields')
    
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      
      if (!data.success) throw new Error(data.message)
      
      localStorage.setItem('token', data.data.token)
      localStorage.setItem('user', JSON.stringify(data.data))
      toast.success('Login successful!')
      navigate('/deploy')
    } catch (err) {
      toast.error(err.message)
    }
  }
  
  document.getElementById('goRegister').onclick = (e) => {
    e.preventDefault()
    navigate('/register')
  }

  document.getElementById('goForgot').onclick = (e) => {
    e.preventDefault()
    navigate('/forgot-password')
  }
}

export const renderForgotPassword = () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:400px;margin:80px auto;padding:40px;background:var(--card);border:1px solid var(--border);border-radius:var(--rl)">
      <h2 style="text-align:center;margin-bottom:12px">Forgot password?</h2>
      <p style="text-align:center;color:var(--text2);font-size:0.9rem;margin-bottom:24px">
        Enter your account email and we'll send you a link to set a new password.
      </p>

      <div class="input-grp">
        <label>Email</label>
        <input class="inp" type="email" id="fpEmail" placeholder="you@example.com">
      </div>

      <button class="btn btn-primary btn-full" id="fpBtn" style="margin-top:10px">Send reset link</button>

      <p style="text-align:center;margin-top:20px;color:var(--text2);font-size:0.9rem">
        <a href="#" id="fpBack" style="color:var(--blue)">← Back to login</a>
      </p>
    </div>
  `

  const btn = document.getElementById('fpBtn')
  const submit = async () => {
    const email = document.getElementById('fpEmail').value.trim()
    if (!email) return toast.error('Enter your email')

    btn.disabled = true
    btn.textContent = 'Sending…'
    try {
      const res = await api.forgotPassword(email)
      toast.success(res.message || 'Check your email for the reset link')
      btn.textContent = 'Link sent ✓'
    } catch (err) {
      toast.error(err.message)
      btn.disabled = false
      btn.textContent = 'Send reset link'
    }
  }
  btn.onclick = submit
  document.getElementById('fpEmail').onkeydown = (e) => { if (e.key === 'Enter') submit() }
  document.getElementById('fpBack').onclick = (e) => { e.preventDefault(); navigate('/login') }
}

export const renderResetPassword = (token) => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:400px;margin:80px auto;padding:40px;background:var(--card);border:1px solid var(--border);border-radius:var(--rl)">
      <h2 style="text-align:center;margin-bottom:30px">Set a new password</h2>

      <div class="input-grp">
        <label>New password (min 6 chars)</label>
        <input class="inp" type="password" id="rpPassword" placeholder="••••••••">
      </div>

      <div class="input-grp">
        <label>Confirm new password</label>
        <input class="inp" type="password" id="rpConfirm" placeholder="••••••••">
      </div>

      <button class="btn btn-primary btn-full" id="rpBtn" style="margin-top:10px">Update password</button>

      <p style="text-align:center;margin-top:20px;color:var(--text2);font-size:0.9rem">
        <a href="#" id="rpBack" style="color:var(--blue)">← Back to login</a>
      </p>
    </div>
  `

  const btn = document.getElementById('rpBtn')
  const submit = async () => {
    const password = document.getElementById('rpPassword').value
    const confirm = document.getElementById('rpConfirm').value
    if (password.length < 6) return toast.error('Password must be 6+ chars')
    if (password !== confirm) return toast.error('Passwords do not match')

    btn.disabled = true
    btn.textContent = 'Updating…'
    try {
      await api.resetPassword(token, password)
      toast.success('Password updated. Please log in.')
      navigate('/login')
    } catch (err) {
      toast.error(err.message)
      btn.disabled = false
      btn.textContent = 'Update password'
    }
  }
  btn.onclick = submit
  document.getElementById('rpConfirm').onkeydown = (e) => { if (e.key === 'Enter') submit() }
  document.getElementById('rpBack').onclick = (e) => { e.preventDefault(); navigate('/login') }
}

export const renderRegister = () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:400px;margin:80px auto;padding:40px;background:var(--card);border:1px solid var(--border);border-radius:var(--rl)">
      <h2 style="text-align:center;margin-bottom:30px"> Create Account</h2>
      
      <div class="input-grp">
        <label>Name</label>
        <input class="inp" id="name" placeholder="Your name">
      </div>
      
      <div class="input-grp">
        <label>Email</label>
        <input class="inp" type="email" id="email" placeholder="you@example.com">
      </div>
      
      <div class="input-grp">
        <label>Password (min 6 chars)</label>
        <input class="inp" type="password" id="password" placeholder="••••••••">
      </div>
      
      <button class="btn btn-primary btn-full" id="registerBtn" style="margin-top:10px">
        ✨ Sign Up
      </button>
      
      <p style="text-align:center;margin-top:20px;color:var(--text2);font-size:0.9rem">
        Already have account? 
        <a href="#" id="goLogin" style="color:var(--blue)">Login</a>
      </p>
    </div>
  `
  
  document.getElementById('registerBtn').onclick = async () => {
    const name = document.getElementById('name').value
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    
    if (!name || !email || !password) return toast.error('Fill all fields')
    
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      })
      const data = await res.json()
      
      if (!data.success) throw new Error(data.message)
      
      localStorage.setItem('token', data.data.token)
      localStorage.setItem('user', JSON.stringify(data.data))
      toast.success('Account created!')
      navigate('/dashboard') // Connect Vercel/Netlify/Render from here
    } catch (err) {
      toast.error(err.message)
    }
  }
  
  document.getElementById('goLogin').onclick = (e) => {
    e.preventDefault()
    navigate('/login')
  }
}
