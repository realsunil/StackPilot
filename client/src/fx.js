// Visual effects only (no app logic): animated background, cursor glow,
// card spotlight, and the home-page animations. Safe to delete together
// with the matching lines in index.html / home.js.

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
let run = 0 // bumps every time the home page is (re)rendered, so old loops stop

/* ---------- always-on: pointer glow, card spotlight, 3D tilt ---------- */
const glow = document.getElementById('glow')
addEventListener('pointermove', (e) => {
  if (glow) { glow.style.left = e.clientX + 'px'; glow.style.top = e.clientY + 'px' }

  const card = e.target.closest && e.target.closest('.feature-card, .proj-card')
  if (card) {
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px')
    card.style.setProperty('--my', (e.clientY - r.top) + 'px')
  }

  const st = document.getElementById('stack')
  if (st && !reduce && e.pointerType === 'mouse') {
    st.style.setProperty('--rx', ((e.clientX / innerWidth - 0.5) * 24) + 'deg')
    st.style.setProperty('--ry', ((e.clientY / innerHeight - 0.5) * -14) + 'deg')
  }
}, { passive: true })

/* ---------- always-on: neon grid floor + particle network ---------- */
;(function background () {
  const cv = document.getElementById('rain')
  if (!cv || reduce) return
  const cx = cv.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  let W = 0, H = 0, lastW = 0, pts = [], mx = -999, my = -999, col = '74,222,128', frameNo = 0

  const rgb = (h) => {
    h = (h || '').trim().replace('#', '')
    if (h.length !== 6) return col
    return parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16)
  }
  const size = () => {
    W = innerWidth; H = innerHeight
    cv.width = W * dpr; cv.height = H * dpr
    cx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const seed = () => {
    const c = Math.min(90, Math.floor(W * H / 15000))
    pts = []
    for (let i = 0; i < c; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r: Math.random() * 1.5 + 0.7 })
  }
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY }, { passive: true })

  function frame (ts) {
    requestAnimationFrame(frame)
    if (document.hidden) return
    frameNo++
    if (frameNo % 60 === 1) col = rgb(getComputedStyle(document.documentElement).getPropertyValue('--cyan'))
    const t = ts / 1000
    cx.clearRect(0, 0, W, H)

    // perspective grid floor
    const hy = H * 0.64
    cx.lineWidth = 1
    for (let i = -12; i <= 12; i++) {
      cx.strokeStyle = 'rgba(' + col + ',.13)'
      cx.beginPath(); cx.moveTo(W / 2 + i * W * 0.02, hy); cx.lineTo(W / 2 + i * W * 0.2, H); cx.stroke()
    }
    const off = (t * 0.35) % 1
    for (let k = 0; k < 14; k++) {
      const u = (k + off) / 14, y = hy + (H - hy) * u * u
      cx.strokeStyle = 'rgba(' + col + ',' + (0.04 + u * 0.3) + ')'
      cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke()
    }

    // scanning beam
    const sy = ((t * 60) % (H + 200)) - 100
    const g = cx.createLinearGradient(0, sy - 60, 0, sy)
    g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(1, 'rgba(' + col + ',.1)')
    cx.fillStyle = g; cx.fillRect(0, sy - 60, W, 60)

    // particle network (reacts to the cursor)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], dx = mx - p.x, dy = my - p.y, dm = Math.sqrt(dx * dx + dy * dy)
      if (dm < 170 && dm > 1) { p.x += dx / dm * 0.35; p.y += dy / dm * 0.35 }
      p.x += p.vx; p.y += p.vy
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
      cx.fillStyle = 'rgba(' + col + ',.85)'
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill()
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j], ax = p.x - q.x, ay = p.y - q.y, d = Math.sqrt(ax * ax + ay * ay)
        if (d < 125) { cx.strokeStyle = 'rgba(' + col + ',' + ((1 - d / 125) * 0.45) + ')'; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(q.x, q.y); cx.stroke() }
      }
      if (dm < 170) { cx.strokeStyle = 'rgba(' + col + ',' + ((1 - dm / 170) * 0.7) + ')'; cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(mx, my); cx.stroke() }
    }
  }

  size(); lastW = W; seed()
  addEventListener('resize', () => {
    const w = innerWidth
    size()
    if (w !== lastW) { lastW = w; seed() } // mobile URL-bar resize must not reshuffle particles
  })
  requestAnimationFrame(frame)
})()

/* ---------- home page: typewriter, stack swap, marquee, reveal, counters ---------- */
const PHRASES = ['In one click.', 'From a ZIP.', 'From GitHub.', 'On Vercel.', 'On Netlify.', 'On Render.']
// bottom -> top layer: Deploy, Build, Detect, Upload
const STACKS = [
  ['Vercel',  'npm run build', 'React + Vite', 'my-app.zip'],
  ['Netlify', 'npm run build', 'Vue.js',       'GitHub URL'],
  ['Render',  'pip install',   'Flask',        'my-api.zip'],
  ['Vercel',  'npm run build', 'Next.js',      'GitHub URL'],
]
const TECH = ['React', 'Next.js', 'Vue.js', 'Angular', 'Svelte', 'HTML/CSS/JS', 'Node/Express', 'Python/Flask', 'Django', 'FastAPI', 'Go', 'Rust']

const countUp = (el) => {
  const n = +el.dataset.n, s = el.dataset.s || ''
  let t0 = null
  const f = (ts) => {
    t0 = t0 || ts
    const p = Math.min((ts - t0) / 1400, 1)
    el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))) + s
    if (p < 1) requestAnimationFrame(f)
  }
  if (reduce) el.textContent = n + s
  else requestAnimationFrame(f)
}

export const initHomeFx = () => {
  const my = ++run
  const alive = (el) => my === run && el && el.isConnected

  // typewriter in the headline
  const te = document.getElementById('type')
  if (te) {
    if (reduce) te.textContent = PHRASES[0]
    else {
      let wi = 0, ci = 0, del = false
      const tick = () => {
        if (!alive(te)) return
        const w = PHRASES[wi]
        te.textContent = w.slice(0, ci)
        if (!del && ci < w.length) { ci++; setTimeout(tick, 110) }
        else if (!del) { del = true; setTimeout(tick, 1400) }
        else if (ci > 0) { ci--; setTimeout(tick, 55) }
        else { del = false; wi = (wi + 1) % PHRASES.length; setTimeout(tick, 300) }
      }
      tick()
    }
  }

  // 3D stack: swap the tool names every few seconds
  const layers = [].slice.call(document.querySelectorAll('.layer'))
  if (layers.length && !reduce) {
    let si = 0
    const next = () => {
      if (!alive(layers[0])) return
      si = (si + 1) % STACKS.length
      layers.forEach((l, i) => {
        l.classList.add('swap')
        setTimeout(() => { const b = l.querySelector('b'); if (b) b.textContent = STACKS[si][i]; l.classList.remove('swap') }, 220 + i * 90)
      })
      setTimeout(next, 3200)
    }
    setTimeout(next, 3200)
  }

  // marquee of supported frameworks
  const track = document.getElementById('track')
  if (track) track.innerHTML = TECH.concat(TECH).map((x) => '<span>◆ ' + x + '</span>').join('')

  // scroll reveal + flight path + counters
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return
      e.target.classList.add('in')
      const p = e.target.querySelector('#path')
      if (p) p.classList.add('go')
      e.target.querySelectorAll('[data-n]').forEach(countUp)
      io.unobserve(e.target)
    })
  }, { threshold: 0.2 })
  document.querySelectorAll('.rv').forEach((el) => io.observe(el))
}
