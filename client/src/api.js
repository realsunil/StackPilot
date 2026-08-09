// Base API URL. In production, set VITE_API_URL at build time to point
// at wherever the StackPilot backend is deployed (e.g. by the person
// running their own instance). Defaults to a relative '/api' for local
// dev, where Vite proxies it to the backend.
const BASE = import.meta.env.VITE_API_URL || '/api'

const req = async (method, url, data = null, isForm = false) => {
  const token = localStorage.getItem('token')
  const headers = isForm ? {} : { 'Content-Type': 'application/json' }

  if (token) headers['Authorization'] = `Bearer ${token}`

  const opts = {
    method,
    headers,
    body: data ? (isForm ? data : JSON.stringify(data)) : undefined
  }

  const res = await fetch(BASE + url, opts)

  let json
  try {
    json = await res.json()
  } catch {
    json = { success: false, message: 'Invalid response from server' }
  }

  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    if (!url.startsWith('/auth/login')) {
      window.location.href = '/login'
    }
    throw new Error(json.message || 'Not authorized')
  }

  if (!res.ok || json.success === false) throw new Error(json.message || 'Request failed')
  return json
}

export const api = {
  // Auth
  register: (data) => req('POST', '/auth/register', data),
  login: (data) => req('POST', '/auth/login', data),
  logout: () => req('POST', '/auth/logout'),
  getMe: () => req('GET', '/auth/me'),
  updateTokens: (tokens) => req('PUT', '/auth/tokens', tokens),

  // Connected deployment platforms (dashboard)
  getConnections: () => req('GET', '/auth/connections'),
  // Vercel/Netlify are full-page OAuth redirects, not fetch calls -
  // see loginWithProvider() below.
  connectRender: (apiKey) => req('POST', '/auth/connect/render', { apiKey }),
  disconnectProvider: (provider) => req('DELETE', `/auth/connect/${provider}`),

  // Projects
  uploadProject: (formData) => req('POST', '/projects/upload', formData, true),
  importGitHub: (data) => req('POST', '/projects/github', data),
  getProjects: () => req('GET', '/projects'),
  getProject: (projectId) => req('GET', `/projects/${projectId}`),
  deleteProject: (projectId) => req('DELETE', `/projects/${projectId}`),
  getProjectTree: (projectId) => req('GET', `/projects/${projectId}/tree`),

  // Deploy
  startDeploy: (projectId, platform) => req('POST', `/deploy/${projectId}`, platform ? { platform } : {}),
  analyzeProject: (projectId) => req('GET', `/deploy/${projectId}/analyze`),
  getDeployLogs: (projectId) => req('GET', `/deploy/${projectId}/logs`),
  quickAnalyze: (githubUrl) => req('POST', '/deploy/analyze/quick', { githubUrl }),
}

// Full-page redirect into "Login with Vercel" / "Login with Netlify".
// This is a real browser navigation (not a fetch), so the user's JWT is
// passed as a query param - the server verifies it, then hands them off
// to Vercel/Netlify's own login+consent screen.
export const loginWithProvider = (provider) => {
  const token = localStorage.getItem('token')
  window.location.href = `${BASE}/auth/connect/${provider}?token=${encodeURIComponent(token)}`
}
