const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/health');
const errorHandler = require('./middleware/errorHandler');
const env = require('./config/env');

const app = express();

// Security and utility middleware
app.use(cors({
  origin: env.CLIENT_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url} | Idempotency-Key: ${req.headers['idempotency-key'] || 'none'}`);
    next();
  });
}

// Health Probes
app.use(healthRoutes);
app.use('/api', healthRoutes);

// API v1 Routes
const apiRoutes = require('./routes/api');
app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes);

// Static client production hosting if client/dist exists in production mode
const path = require('path');
const fs = require('fs');
const clientDistPath = path.resolve(__dirname, '../../client/dist');

if (env.NODE_ENV === 'production' && fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    // If request starts with /api or /health, pass to next (404 handler)
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Root informational endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Resilient Decision System API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health'
  });
});

// 404 Handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      timestamp: new Date().toISOString()
    }
  });
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;

