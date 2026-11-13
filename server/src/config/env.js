const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env in server directory, fallback to root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const isTest = process.env.NODE_ENV === 'test';

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5001,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/resilient_decision_system',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Simulated Chaos for External Services
  // In automated tests, chaos defaults to 0 so tests remain deterministic unless explicitly overridden via chaosOverrides
  SIMULATE_TIMEOUT_RATE: isTest ? 0.0 : (parseFloat(process.env.SIMULATE_TIMEOUT_RATE) || 0.0),
  SIMULATE_5XX_RATE: isTest ? 0.0 : (parseFloat(process.env.SIMULATE_5XX_RATE) || 0.0),
  EXTERNAL_LATENCY_MS: isTest ? 0 : (parseInt(process.env.EXTERNAL_LATENCY_MS, 10) || 200),
  CIRCUIT_BREAKER_TIMEOUT_MS: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS, 10) || 3000,

  // Retry Mechanics
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES, 10) || 3,
  RETRY_BASE_BACKOFF_MS: parseInt(process.env.RETRY_BASE_BACKOFF_MS, 10) || 1000,
  RETRY_POLL_INTERVAL_MS: parseInt(process.env.RETRY_POLL_INTERVAL_MS, 10) || 5000,

  // Idempotency
  IDEMPOTENCY_TTL_SECONDS: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400, // 24 hours
  IN_PROGRESS_TIMEOUT_SECONDS: parseInt(process.env.IN_PROGRESS_TIMEOUT_SECONDS, 10) || 60 // 60s stale threshold
};

module.exports = env;
