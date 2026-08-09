const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      // Without these, a MongoDB command sent on a connection that has
      // gone silently dead (common on flaky/free-tier connections) can
      // hang far longer than expected instead of failing fast - which
      // freezes anything that awaits a DB write (like deployment logging)
      // mid-deploy with no error ever surfacing.
      serverSelectionTimeoutMS: 10000, // fail fast if we can't reach Atlas at all
      socketTimeoutMS: 20000,          // kill a stuck in-flight query
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
 } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    console.error('⚠️  Server will keep running, but anything touching the database will fail until this is fixed.');
    console.error('⚠️  Common cause: your current IP is not in MongoDB Atlas → Network Access → IP Access List (add 0.0.0.0/0 if deploying to Vercel/Netlify/Render, since they don\'t use a fixed IP).');
  }

  mongoose.connection.on('error', (err) => {
    console.error(`⚠️  MongoDB connection error: ${err.message}`);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected - mongoose will attempt to reconnect automatically');
  });
};

module.exports = connectDB;
