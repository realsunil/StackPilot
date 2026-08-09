// Simple polling-based updates (no socket library needed!)
// Server ke logs ko poll karke fetch karenge

const BASE = import.meta.env.VITE_API_URL || '/api'

let pollInterval = null

export const connectSocket = (projectId, onLog, onComplete, onFailed) => {
  // Safety net: if a previous poll loop is still running (e.g. the caller
  // forgot to disconnect, or a page navigation raced with this call), its
  // interval reference would otherwise get overwritten below and keep
  // running forever, invisibly eating into the logs rate limit.
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }

  let lastLogCount = 0
  
  const poll = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${BASE}/deploy/${projectId}/logs`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const json = await res.json()
      
      if (!json.success) return
      
      const project = json.data
      const logs = project.logs || []
      
      // Send only new logs
      if (logs.length > lastLogCount) {
        const newLogs = logs.slice(lastLogCount)
        newLogs.forEach(log => onLog(log))
        lastLogCount = logs.length
      }
      
      // Check status
      if (project.status === 'deployed') {
        clearInterval(pollInterval)
        pollInterval = null
        onComplete({ url: project.deployedUrl, platform: project.deploymentPlatform })
      } else if (project.status === 'failed') {
        clearInterval(pollInterval)
        pollInterval = null
        onFailed({ error: 'Deployment failed' })
      }
    } catch (err) {
      console.error('Poll error:', err)
    }
  }
  
  // Poll every 2 seconds
  poll() // immediate first call
  pollInterval = setInterval(poll, 2000)
}

export const disconnectSocket = () => {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}