const crypto = require('crypto');
const env = require('../config/env');

class CreditBureauClient {
  constructor(options = {}) {
    this.timeoutRate = options.timeoutRate !== undefined ? options.timeoutRate : env.SIMULATE_TIMEOUT_RATE;
    this.errorRate = options.errorRate !== undefined ? options.errorRate : env.SIMULATE_5XX_RATE;
    this.latencyMs = options.latencyMs !== undefined ? options.latencyMs : env.EXTERNAL_LATENCY_MS;
  }

  /**
   * Fetches credit score report from the simulated bureau.
   * 
   * @param {Object} applicantData - { applicantName, annualIncome, monthlyDebt, employmentStatus, ... }
   * @param {Object} [chaosOverrides] - { forceTimeout: boolean, force503: boolean }
   * @returns {Promise<Object>} { creditScore, bureauReferenceId, reportDate, latencyMs }
   */
  async fetchCreditReport(applicantData, chaosOverrides = {}) {
    const start = Date.now();
    const effectiveLatency = chaosOverrides.latencyMs !== undefined ? chaosOverrides.latencyMs : this.latencyMs;

    // Simulate network delay
    if (effectiveLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, effectiveLatency));
    }

    // 1. Forced or Probabilistic Timeout Check
    const shouldTimeout = chaosOverrides.forceTimeout === true || (Math.random() < this.timeoutRate);
    if (shouldTimeout) {
      const err = new Error('Credit Bureau connection timed out after 3000ms.');
      err.code = 'ETIMEDOUT';
      err.isTransient = true;
      err.service = 'CREDIT_BUREAU';
      err.durationMs = Date.now() - start;
      throw err;
    }

    // 2. Forced or Probabilistic 5xx Service Unavailable Check
    const shouldFail5xx = chaosOverrides.force503 === true || (Math.random() < this.errorRate);
    if (shouldFail5xx) {
      const err = new Error('Credit Bureau service temporarily unavailable (HTTP 503).');
      err.code = 'SERVICE_UNAVAILABLE';
      err.statusCode = 503;
      err.isTransient = true;
      err.service = 'CREDIT_BUREAU';
      err.durationMs = Date.now() - start;
      throw err;
    }

    // 3. Compute realistic deterministic credit score from applicant metrics
    const { annualIncome = 50000, monthlyDebt = 1000, employmentStatus = 'EMPLOYED' } = applicantData;
    const dti = annualIncome > 0 ? (monthlyDebt * 12) / annualIncome : 1.0;

    let baseScore = 680;

    if (employmentStatus === 'UNEMPLOYED') {
      baseScore = 520;
    } else if (employmentStatus === 'SELF_EMPLOYED') {
      baseScore = 650;
    }

    if (annualIncome >= 100000) baseScore += 50;
    else if (annualIncome >= 60000) baseScore += 20;

    if (dti <= 0.20) baseScore += 40;
    else if (dti <= 0.35) baseScore += 10;
    else if (dti > 0.50) baseScore -= 70;

    // Deterministic hash variance based on name for test predictability
    const hashVariance = (crypto.createHash('md5').update(applicantData.applicantName || 'default').digest()[0] % 31) - 15;
    const finalScore = Math.max(300, Math.min(850, baseScore + hashVariance));

    const durationMs = Date.now() - start;

    return {
      creditScore: finalScore,
      bureauReferenceId: `CRB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      reportDate: new Date().toISOString(),
      durationMs,
      bureauStatus: 'ONLINE'
    };
  }
}

module.exports = CreditBureauClient;

