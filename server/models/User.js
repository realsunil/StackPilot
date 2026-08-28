const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  
  // User's deployment tokens - obtained automatically via OAuth login
  // (Vercel/Netlify) or a one-time API key connect (Render, which has no
  // public OAuth). NEVER sent to the client - see authController.getMe.
  tokens: {
    vercel: { type: String, default: null, select: false },
    netlify: { type: String, default: null, select: false },
    render: { type: String, default: null, select: false },
    github: { type: String, default: null, select: false },
    // Netlify's "create site" endpoint puts the new site in whichever
    // team the token happens to default to when no team is specified,
    // which is not always the personal team the user sees first in
    // their dashboard. Storing the personal account's slug at connect
    // time lets us always target it explicitly (see netlifyService.js).
    netlifyAccountSlug: { type: String, default: null, select: false }
  },

  // Safe-to-expose metadata about which platforms are connected,
  // shown on the user's Dashboard.
  connections: {
    vercel: {
      connected: { type: Boolean, default: false },
      accountName: { type: String, default: null },
      teamId: { type: String, default: null },
      connectedAt: { type: Date, default: null }
    },
    netlify: {
      connected: { type: Boolean, default: false },
      accountName: { type: String, default: null },
      connectedAt: { type: Date, default: null }
    },
    render: {
      connected: { type: Boolean, default: false },
      accountName: { type: String, default: null },
      connectedAt: { type: Date, default: null }
    }
  },
  
  // Usage limits
  deployCount: { type: Number, default: 0 },
  maxDeploys: { type: Number, default: 10 }, // Free tier limit
  plan: { type: String, enum: ['free', 'pro'], default: 'free' },

  // Admin panel: role-based access + activity/suspension tracking.
  // The very first account ever registered is auto-promoted to admin
  // (see authController.register) so there's always a way in without
  // touching the database by hand.
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  suspended: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: null },
  // Updated (throttled) on every authenticated request - used to derive
  // "online now" in the admin panel. Not a live socket presence, just
  // "active in the last few minutes".
  lastActiveAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
