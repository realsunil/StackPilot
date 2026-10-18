const mongoose = require("mongoose");

// One row per login / register attempt - shown in Admin Panel -> Login history.
// Passwords are NEVER stored here. Rows auto-delete after 90 days (TTL index).
const loginLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  email: { type: String, default: "", lowercase: true, trim: true, index: true },
  name: { type: String, default: "" },
  method: { type: String, enum: ["login", "register"], default: "login" },
  success: { type: Boolean, default: true },
  // e.g. invalid_password | user_not_found | suspended
  reason: { type: String, default: "" },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: true, expires: 60 * 60 * 24 * 90 }
});

module.exports = mongoose.model("LoginLog", loginLogSchema);
