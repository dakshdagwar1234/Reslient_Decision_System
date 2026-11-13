const mongoose = require('mongoose');
const env = require('./env');

let isConnected = false;

const connectionStateNames = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

const connectDB = async (uri = env.MONGODB_URI) => {
  if (isConnected || mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log(`[Database] MongoDB connected successfully to: ${mongoose.connection.host || 'cluster'}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[Database] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[Database] MongoDB disconnected.');
  });

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      autoIndex: true
    });
    isConnected = true;
    return conn;
  } catch (error) {
    console.error(`[Database] Initial MongoDB connection failed: ${error.message}`);
    console.warn('[Database] Server will continue running. Operations requiring DB will await connection or report state.');
    return null;
  }
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
  }
};

const getConnectionState = () => {
  const readyState = mongoose.connection.readyState;
  return {
    state: connectionStateNames[readyState] || 'unknown',
    readyState,
    isConnected: readyState === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionState
};

