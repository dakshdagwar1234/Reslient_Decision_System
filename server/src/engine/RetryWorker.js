const Execution = require('../models/Execution');
const WorkflowConfig = require('../models/WorkflowConfig');
const IdempotencyRecord = require('../models/IdempotencyRecord');
const WorkflowRunner = require('./WorkflowRunner');
const env = require('../config/env');

class RetryWorker {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs || env.RETRY_POLL_INTERVAL_MS || 5000;
    this.workflowRunner = options.workflowRunner || new WorkflowRunner();
    this.timer = null;
    this.isProcessing = false;
  }

  start() {
    if (this.timer) return;
    console.log(`[RetryWorker] Starting persistent retry worker (poll interval: ${this.pollIntervalMs}ms)`);
    this.timer = setInterval(() => this.processPendingRetries(), this.pollIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[RetryWorker] Persistent retry worker stopped.');
    }
  }

  /**
   * Process pending retries with atomic lock acquisition
   */
  async processPendingRetries() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      // Find candidate executions awaiting retry whose backoff period has passed
      const candidates = await Execution.find({
        executionState: 'AWAITING_RETRY',
        'retryState.nextRetryAt': { $lte: now }
      }).limit(10);

      for (const candidate of candidates) {
        // Atomic lock acquisition: Transition to RUNNING only if still AWAITING_RETRY
        const lockedExecution = await Execution.findOneAndUpdate(
          {
            _id: candidate._id,
            executionState: 'AWAITING_RETRY'
          },
          {
            $set: {
              executionState: 'RUNNING',
              heartbeatAt: new Date()
            }
          },
          { new: true }
        );

        if (!lockedExecution) {
          // Another worker process claimed this execution; skip
          continue;
        }

        console.log(`[RetryWorker] Claimed retry for Execution ID: ${lockedExecution._id} (Attempt ${lockedExecution.retryState.currentAttempt})`);

        // Load the exact pinned workflow configuration version
        const workflowConfig = await WorkflowConfig.findById(lockedExecution.workflowId);
        if (!workflowConfig) {
          console.error(`[RetryWorker] WorkflowConfig not found for execution ${lockedExecution._id}`);
          lockedExecution.executionState = 'FAILED';
          await lockedExecution.save();
          continue;
        }

        // Execute runner
        const updated = await this.workflowRunner.run(lockedExecution, workflowConfig);

        // If completed or failed, update the corresponding idempotency record if present
        if (updated.executionState === 'COMPLETED' || updated.executionState === 'FAILED') {
          await IdempotencyRecord.updateOne(
            { key: updated.idempotencyKey },
            {
              $set: {
                status: 'COMPLETED',
                responseStatus: 200,
                responseBody: {
                  executionId: updated._id,
                  executionState: updated.executionState,
                  decisionOutcome: updated.decisionOutcome,
                  decisionDetails: updated.decisionDetails,
                  context: updated.context,
                  retryState: updated.retryState
                },
                heartbeatAt: new Date()
              }
            }
          ).catch(err => {
            console.error(`[RetryWorker] Failed to update idempotency cache for execution ${updated._id}:`, err.message);
          });
        }
      }
    } catch (err) {
      console.error('[RetryWorker] Error during retry polling cycle:', err.message);
    } finally {
      this.isProcessing = false;
    }
  }
}

module.exports = RetryWorker;

