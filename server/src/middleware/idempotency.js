const crypto = require('crypto');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const env = require('../config/env');

// Compute canonical SHA-256 hash of normalized JSON payload
const computePayloadHash = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return crypto.createHash('sha256').update('').digest('hex');
  }
  // Sort keys recursively for canonical determinism
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
};

/**
 * Robust Idempotency Middleware
 * - Atomic insertion with MongoDB unique key
 * - SHA-256 payload conflict detection (returns 422 on payload mismatch)
 * - Concurrency protection (returns 409 Conflict if in-progress)
 * - Stale/crashed in-flight recovery (reclaims lock if heartbeat is older than timeout)
 * - Caches completed response snapshot (returns exact cached response)
 */
const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    return res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'The Idempotency-Key header or idempotencyKey body field is required for this operation.',
        timestamp: new Date().toISOString()
      }
    });
  }

  const cleanKey = idempotencyKey.trim();
  const currentHash = computePayloadHash(req.body);

  try {
    // 1. Attempt atomic creation of in-flight record
    let record;
    let isOriginalRequest = false;

    try {
      record = await IdempotencyRecord.create({
        key: cleanKey,
        requestHash: currentHash,
        status: 'IN_PROGRESS',
        heartbeatAt: new Date()
      });
      isOriginalRequest = true;
    } catch (createErr) {
      // Duplicate key error (code 11000) -> Record already exists; this is a duplicate or concurrent request
      if (createErr.code === 11000) {
        record = await IdempotencyRecord.findOne({ key: cleanKey });
        isOriginalRequest = false;
      } else {
        throw createErr;
      }
    }

    if (!record) {
      record = await IdempotencyRecord.findOne({ key: cleanKey });
    }

    // 2. If not the original request, enforce conflict, completed replay, or concurrency locking
    if (!isOriginalRequest && record) {
      // A. Payload Conflict Check
      if (record.requestHash !== currentHash) {
        return res.status(422).json({
          error: {
            code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
            message: 'An existing idempotency record was found for this key with a different request payload.',
            idempotencyKey: cleanKey,
            timestamp: new Date().toISOString()
          }
        });
      }

      // B. Completed Record -> Return Cached Response Snapshot Immediately
      if (record.status === 'COMPLETED') {
        res.set('X-Cache-Lookup', 'HIT');
        res.set('X-Idempotent-Replay', 'true');
        return res.status(record.responseStatus || 200).json(record.responseBody);
      }

      // C. In-Progress Record -> Check for Stale/Crashed Worker Recovery or Reject Concurrent Call
      if (record.status === 'IN_PROGRESS') {
        const staleThresholdMs = (env.IN_PROGRESS_TIMEOUT_SECONDS || 60) * 1000;
        const timeSinceHeartbeat = Date.now() - new Date(record.heartbeatAt || record.createdAt).getTime();

        if (timeSinceHeartbeat > staleThresholdMs) {
          // Reclaim stale lock from a crashed process
          console.warn(`[Idempotency] Reclaiming stale in-progress key '${cleanKey}' (idle for ${timeSinceHeartbeat}ms)`);
          record.heartbeatAt = new Date();
          await record.save();
        } else {
          // Concurrency lock: Currently processing by active worker
          res.set('Retry-After', '2');
          return res.status(409).json({
            error: {
              code: 'CONCURRENT_REQUEST_IN_PROGRESS',
              message: 'A request with this idempotency key is currently being processed. Please retry shortly.',
              idempotencyKey: cleanKey,
              retryAfterSeconds: 2,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    }

    // 3. Attach metadata to request
    req.idempotencyRecord = record;
    req.idempotencyKey = cleanKey;

    // 4. Wrap res.json as fallback snapshot writer if not already explicitly written by controller
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Background safety net update if still in progress
      IdempotencyRecord.updateOne(
        { key: cleanKey, status: 'IN_PROGRESS' },
        {
          $set: {
            status: 'COMPLETED',
            responseStatus: res.statusCode,
            responseBody: body,
            heartbeatAt: new Date()
          }
        }
      ).catch(updateErr => {
        console.error(`[Idempotency] Notice during fallback finalize for '${cleanKey}':`, updateErr.message);
      });

      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('[Idempotency] Error processing idempotency record:', error.message);
    next(error);
  }
};

module.exports = {
  idempotencyMiddleware,
  computePayloadHash
};
