const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

// Configure reliable public DNS servers to prevent Windows querySrv ECONNREFUSED on Atlas SRV records
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {
  // Ignore in sandboxed or restricted DNS environments
}

let isConnected = false;
let connectionType = 'disconnected'; // 'atlas' | 'in-memory' | 'disconnected'
let memServerInstance = null;

const connectionStateNames = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

const connectDB = async (uri = env.MONGODB_URI) => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Event Listeners
  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log(`[Database] MongoDB connected successfully to: ${mongoose.connection.host || 'cluster'} (${connectionType})`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('[Database] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[Database] MongoDB disconnected.');
  });

  // Attempt 1: Connect to configured MongoDB URI (e.g. Atlas)
  try {
    console.log(`[Database] Connecting to MongoDB (${uri.includes('mongodb+srv') ? 'MongoDB Atlas' : 'Local MongoDB'})...`);
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 8000,
      autoIndex: true
    });
    isConnected = true;
    connectionType = 'atlas';
    return conn;
  } catch (error) {
    console.warn(`\n[Database] Note: Direct connection to Atlas failed: ${error.message}`);
    console.warn('[Database] Common Cause: Your current IP address is not whitelisted in MongoDB Atlas Network Access.');
    console.warn('[Database] Solution: Go to MongoDB Atlas (https://cloud.mongodb.com) -> Network Access -> Add IP Address.');
    console.warn('[Database] Select "Allow Access from Anywhere" (0.0.0.0/0) or add your current public IP: 152.59.184.131.\n');

    // Attempt 2: In-Memory / Local Resilient Fallback (ensures app is 100% functional without blocking)
    try {
      console.log('[Database] Starting resilient In-Memory MongoDB fallback so all operations continue to function...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memServerInstance = await MongoMemoryServer.create();
      const memUri = memServerInstance.getUri();
      
      connectionType = 'in-memory';
      const memConn = await mongoose.connect(memUri, {
        serverSelectionTimeoutMS: 3000,
        autoIndex: true
      });
      isConnected = true;
      console.log(`[Database] Resilient In-Memory database initialized and active at: ${memUri}`);
      return memConn;
    } catch (fallbackError) {
      console.error('[Database] In-memory fallback initialization failed:', fallbackError.message);
      return null;
    }
  }
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    connectionType = 'disconnected';
  }
  if (memServerInstance) {
    await memServerInstance.stop();
    memServerInstance = null;
  }
};

const getConnectionState = () => {
  const readyState = mongoose.connection.readyState;
  return {
    state: connectionStateNames[readyState] || 'unknown',
    readyState,
    isConnected: readyState === 1,
    type: connectionType,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
};

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionState
};
