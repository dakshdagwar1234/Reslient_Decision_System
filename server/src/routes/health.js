const express = require('express');
const { getConnectionState } = require('../config/database');
const env = require('../config/env');

const router = express.Router();

const startTime = Date.now();

router.get('/health', (req, res) => {
  const dbState = getConnectionState();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.status(200).json({
    status: 'healthy',
    system: 'Resilient Decision System Engine',
    uptimeSeconds,
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    database: {
      connected: dbState.isConnected,
      state: dbState.state,
      host: dbState.host
    },
    version: '1.0.0'
  });
});

module.exports = router;

