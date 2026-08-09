const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs-extra');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load env vars
dotenv.config();

// DB connection
const connectDB = require('./config/db');
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Ensure directories exist
fs.ensureDirSync(path.join(__dirname, 'uploads'));
fs.ensureDirSync(path.join(__dirname, 'temp'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // 100 requests per window
  message: 'Too many requests, try again later',
  // The deploy-logs endpoint has its own, much higher-budget limiter below
  // (it's polled every 2s while a deploy runs) - it must not also compete
  // for this general budget, or the same "deploy succeeds but the UI can
  // no longer see it" bug just comes back once this one runs out instead.
  skip: (req) => req.path.match(/^\/deploy\/[^/]+\/logs$/)
});
app.use('/api/', limiter);

// The deploy-logs endpoint is polled every 2s by the frontend while a
// deployment is running - it must NOT share a budget with anything else,
// or a single deploy burns through the whole /api/ limit and the UI loses
// visibility into a deployment that actually finished successfully.
const logsPollLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 120,             // way more than the 2s-interval poll needs
  message: 'Too many requests, try again shortly'
});
app.use('/api/deploy/:projectId/logs', logsPollLimiter);

// Deploy specific limiter (stricter) - only for the POST that kicks off
// a deployment, never applied globally so it can't be exhausted by GET
// routes used to check status.

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: '🚀 StackPilot API is running',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/projects', require('./routes/projectRoutes'));
app.use('/api/deploy', require('./routes/deployRoutes'));

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler (must be last)
app.use(require('./middleware/errorHandler'));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-project', (projectId) => {
    socket.join(projectId);
    console.log(`📡 Socket ${socket.id} joined project: ${projectId}`);
  });

  socket.on('leave-project', (projectId) => {
    socket.leave(projectId);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   🚀 StackPilot Server Running        ║
  ║   📡 Port: ${PORT}                      ║
  ║   🔗 http://localhost:${PORT}            ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);

  // Startup diagnostics - prints exactly what's configured and, for
  // OAuth, the EXACT callback URL that must be registered on
  // vercel.com / app.netlify.com. Most "not configured" / "login
  // doesn't work" issues are caught right here instead of by clicking
  // around the UI.
  const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
  const check = (label, ok, extra) =>
    console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? '  ' + extra : ''}`);

  console.log('  --- Config check ---');
  check('MONGODB_URI set', !!process.env.MONGODB_URI);
  check('JWT_SECRET set', !!process.env.JWT_SECRET);
  check(
    'VERCEL_CLIENT_ID / SECRET set',
    !!process.env.VERCEL_CLIENT_ID && !!process.env.VERCEL_CLIENT_SECRET,
    !process.env.VERCEL_CLIENT_ID
      ? '(Login with Vercel will show "not configured")'
      : `callback must be exactly: ${SERVER_URL}/api/auth/connect/vercel/callback`
  );
  check(
    'NETLIFY_CLIENT_ID / SECRET set',
    !!process.env.NETLIFY_CLIENT_ID && !!process.env.NETLIFY_CLIENT_SECRET,
    !process.env.NETLIFY_CLIENT_ID
      ? '(Login with Netlify will show "not configured")'
      : `redirect URI must be exactly: ${SERVER_URL}/api/auth/connect/netlify/callback`
  );
  console.log('  --------------------\n');
});