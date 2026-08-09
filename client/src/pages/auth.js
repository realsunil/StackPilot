import { navigate } from '../router.js'
import { toast } from '../main.js'

export const renderLogin = () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:400px;margin:80px auto;padding:40px;background:var(--card);border:1px solid var(--border);border-radius:var(--rl)">
      <h2 style="text-align:center;margin-bottom:30px">🚀 Login to StackPilot</h2>
      
      <div class="input-grp">
        <label>Email</label>
        <input class="inp" type="email" id="email" placeholder="you@example.com">
      </div>
      
      <div class="input-grp">
        <label>Password</label>
        <input class="inp" type="password" id="password" placeholder="••••••••">
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
      const res = await fetch('/api/auth/login', {
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
}

export const renderRegister = () => {
  document.getElementById('main').innerHTML = `
    <div style="max-width:400px;margin:80px auto;padding:40px;background:var(--card);border:1px solid var(--border);border-radius:var(--rl)">
      <h2 style="text-align:center;margin-bottom:30px">🚀 Create Account</h2>
      
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
      const res = await fetch('/api/auth/register', {
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
