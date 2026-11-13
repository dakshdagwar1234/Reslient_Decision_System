import React, { useState } from 'react';
import { Sparkles, Key, Zap, CheckCircle2, XCircle, Clock, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { evaluateApplication } from '../api/decisionApi';

const generateUUID = () => 'idem-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);

export default function ApplicationSimulator({ onEvaluationSuccess, onInspectAudit }) {
  const [formData, setFormData] = useState({
    applicantName: 'Sarah Prime',
    annualIncome: 110000,
    monthlyDebt: 1200,
    requestedAmount: 25000,
    loanTermMonths: 36,
    employmentStatus: 'EMPLOYED'
  });

  const [idempotencyKey, setIdempotencyKey] = useState(generateUUID());
  const [forceTimeout, setForceTimeout] = useState(false);
  const [force503, setForce503] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorBanner, setErrorBanner] = useState(null);

  const presets = [
    {
      name: 'Prime Customer (Auto-Approve)',
      icon: '🌟',
      data: {
        applicantName: 'Sarah Prime',
        annualIncome: 120000,
        monthlyDebt: 1200,
        requestedAmount: 25000,
        loanTermMonths: 36,
        employmentStatus: 'EMPLOYED'
      }
    },
    {
      name: 'Unemployed (Hard Rejection)',
      icon: '🚫',
      data: {
        applicantName: 'Bob Jobless',
        annualIncome: 45000,
        monthlyDebt: 800,
        requestedAmount: 10000,
        loanTermMonths: 24,
        employmentStatus: 'UNEMPLOYED'
      }
    },
    {
      name: 'High DTI > 50% (Hard Rejection)',
      icon: '📉',
      data: {
        applicantName: 'Dave DebtHeavy',
        annualIncome: 48000,
        monthlyDebt: 2500, // DTI = 62.5%
        requestedAmount: 15000,
        loanTermMonths: 36,
        employmentStatus: 'EMPLOYED'
      }
    },
    {
      name: 'Large Loan > $50k (Manual Review)',
      icon: '🔍',
      data: {
        applicantName: 'Elena Executive',
        annualIncome: 180000,
        monthlyDebt: 2200,
        requestedAmount: 85000, // triggers large loan review
        loanTermMonths: 48,
        employmentStatus: 'EMPLOYED'
      }
    },
    {
      name: 'Borderline Risk (Manual Review)',
      icon: '⚖️',
      data: {
        applicantName: 'Chris Borderline',
        annualIncome: 55000,
        monthlyDebt: 1800,
        requestedAmount: 20000,
        loanTermMonths: 36,
        employmentStatus: 'SELF_EMPLOYED'
      }
    }
  ];

  const handleApplyPreset = (preset) => {
    setFormData({ ...preset.data });
    setIdempotencyKey(generateUUID());
    setResult(null);
    setErrorBanner(null);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setErrorBanner(null);

    const payload = {
      ...formData,
      annualIncome: Number(formData.annualIncome),
      monthlyDebt: Number(formData.monthlyDebt),
      requestedAmount: Number(formData.requestedAmount),
      loanTermMonths: Number(formData.loanTermMonths),
      chaosOverrides: {
        forceTimeout,
        force503
      }
    };

    try {
      const response = await evaluateApplication(payload, idempotencyKey);
      if (response.ok) {
        setResult({
          data: response.data,
          isCacheHit: response.headers.isCacheHit,
          status: response.status
        });
        if (onEvaluationSuccess) onEvaluationSuccess();
      } else {
        setErrorBanner(response.data.error || { message: 'Submission failed' });
      }
    } catch (err) {
      setErrorBanner({ message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Form & Presets */}
      <div className="lg:col-span-7 space-y-6">
        {/* Presets Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center space-x-2 mb-3">
            <Sparkles className="w-4 h-4 text-brand-600" />
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Quick Hackathon Demo Scenarios</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition-colors flex items-center space-x-1.5"
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Loan Application Payload</h2>
            <p className="text-xs text-slate-500">Evaluates business rules, DTI ratio, and simulated external credit report</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Applicant Name</label>
              <input
                type="text"
                required
                value={formData.applicantName}
                onChange={(e) => setFormData({ ...formData, applicantName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employment Status</label>
              <select
                value={formData.employmentStatus}
                onChange={(e) => setFormData({ ...formData, employmentStatus: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white"
              >
                <option value="EMPLOYED">EMPLOYED</option>
                <option value="SELF_EMPLOYED">SELF_EMPLOYED</option>
                <option value="UNEMPLOYED">UNEMPLOYED</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Annual Income ($)</label>
              <input
                type="number"
                min="1"
                required
                value={formData.annualIncome}
                onChange={(e) => setFormData({ ...formData, annualIncome: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">Strictly &gt; 0 (prevents division by zero)</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Monthly Debt Obligations ($)</label>
              <input
                type="number"
                min="0"
                required
                value={formData.monthlyDebt}
                onChange={(e) => setFormData({ ...formData, monthlyDebt: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Requested Loan Amount ($)</label>
              <input
                type="number"
                min="1"
                required
                value={formData.requestedAmount}
                onChange={(e) => setFormData({ ...formData, requestedAmount: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">&gt; $50,000 triggers Supervisory Review</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Loan Term (Months)</label>
              <input
                type="number"
                min="1"
                required
                value={formData.loanTermMonths}
                onChange={(e) => setFormData({ ...formData, loanTermMonths: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Idempotency Key Configuration */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                <Key className="w-3.5 h-3.5 text-brand-600" />
                <span>Idempotency-Key (Duplicate Protection)</span>
              </span>
              <button
                type="button"
                onClick={() => setIdempotencyKey(generateUUID())}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium"
              >
                Regenerate New Key
              </button>
            </div>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-brand-500"
            />
            <p className="text-[11px] text-slate-500">
              Submit twice with this same key to demonstrate <strong>atomic cached replay</strong> (zero duplicate evaluations). Alter the amount to trigger <strong>422 Conflict</strong>.
            </p>
          </div>

          {/* Simulated Chaos Injection */}
          <div className="bg-amber-50/60 p-3.5 rounded-lg border border-amber-200/80 space-y-2">
            <span className="text-xs font-semibold text-amber-900 flex items-center space-x-1">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              <span>External Dependency Fault Injection (Credit Bureau Chaos)</span>
            </span>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <label className="flex items-center space-x-2 text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceTimeout}
                  onChange={(e) => setForceTimeout(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Force Connection Timeout (ETIMEDOUT)</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={force503}
                  onChange={(e) => setForce503(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Force HTTP 503 (Service Unavailable)</span>
              </label>
            </div>
            <p className="text-[11px] text-amber-800">
              Transient failures trigger automatic state transition to <code className="bg-amber-100 px-1 py-0.5 rounded text-[10px]">AWAITING_RETRY</code> with exponential backoff.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-medium py-2.5 px-4 rounded-lg text-sm shadow-sm transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Evaluating Application...' : 'Submit Loan for Evaluation'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>

      {/* Right Column: Decision Outcome Card */}
      <div className="lg:col-span-5 space-y-4">
        {errorBanner && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-rose-900">
              <ShieldAlert className="w-4 h-4" />
              <span>{errorBanner.code || 'Request Failed'}</span>
            </div>
            <p>{errorBanner.message}</p>
            {errorBanner.details && (
              <ul className="list-disc pl-4 pt-1 space-y-0.5">
                {errorBanner.details.map((d, i) => (
                  <li key={i}>{d.message || d.field}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result ? (
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Evaluation Outcome</span>
              {result.isCacheHit && (
                <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-purple-200">
                  ⚡ Replay (Cache HIT)
                </span>
              )}
            </div>

            {/* Decision Status Badge */}
            <div className={`p-4 rounded-xl border flex items-start space-x-3 ${
              result.data.decisionOutcome === 'APPROVED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
              result.data.decisionOutcome === 'REJECTED' ? 'bg-rose-50 border-rose-200 text-rose-900' :
              result.data.decisionOutcome === 'MANUAL_REVIEW' ? 'bg-amber-50 border-amber-200 text-amber-900' :
              'bg-sky-50 border-sky-200 text-sky-900'
            }`}>
              {result.data.decisionOutcome === 'APPROVED' && <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5" />}
              {result.data.decisionOutcome === 'REJECTED' && <XCircle className="w-6 h-6 text-rose-600 mt-0.5" />}
              {result.data.decisionOutcome === 'MANUAL_REVIEW' && <Clock className="w-6 h-6 text-amber-600 mt-0.5" />}
              {result.data.decisionOutcome === 'RETRY' && <AlertTriangle className="w-6 h-6 text-sky-600 mt-0.5" />}

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold">
                    {result.data.decisionOutcome ? `DECISION: ${result.data.decisionOutcome}` : `STATE: ${result.data.executionState}`}
                  </span>
                  <span className="text-xs font-mono bg-white/70 px-2 py-0.5 rounded border border-current">
                    v{result.data.workflowVersion}
                  </span>
                </div>
                <p className="text-xs mt-1 font-medium">{result.data.decisionDetails?.message || 'Processing execution...'}</p>
                {result.data.decisionDetails?.reasonCode && (
                  <p className="text-[11px] font-mono mt-1 opacity-80">Reason: {result.data.decisionDetails.reasonCode}</p>
                )}
              </div>
            </div>

            {/* Enriched Context Data */}
            <div className="space-y-2 text-xs">
              <span className="font-semibold text-slate-700">Enriched Metrics & Calculations:</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Debt-to-Income (DTI)</span>
                  <span className="text-sm font-bold text-slate-900">
                    {result.data.context?.debtToIncomeRatio ? (result.data.context.debtToIncomeRatio * 100).toFixed(1) + '%' : 'N/A'}
                  </span>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[10px]">Credit Bureau Score</span>
                  <span className="text-sm font-bold text-slate-900">
                    {result.data.context?.creditScore || 'Pending / Flaky'}
                  </span>
                </div>
              </div>

              {result.data.context?.bureauReferenceId && (
                <div className="text-[11px] text-slate-500 font-mono bg-slate-50 p-2 rounded border border-slate-200">
                  Bureau Ref: {result.data.context.bureauReferenceId}
                </div>
              )}
            </div>

            {/* Retry Information if in retry state */}
            {result.data.executionState === 'AWAITING_RETRY' && (
              <div className="bg-sky-50 p-3 rounded-lg border border-sky-200 text-xs text-sky-900 space-y-1">
                <span className="font-bold flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-sky-600" />
                  <span>Transient Fault Captured - Retry Queued</span>
                </span>
                <p>Attempt {result.data.retryState?.currentAttempt} of {result.data.retryState?.maxRetries}</p>
                <p className="font-mono text-[10px]">Next Retry At: {new Date(result.data.retryState?.nextRetryAt).toLocaleTimeString()}</p>
                <p className="text-[11px] text-slate-600">The persistent retry worker will automatically reclaim this execution.</p>
              </div>
            )}

            {/* Inspect Button */}
            <button
              onClick={() => onInspectAudit(result.data.executionId)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center space-x-1.5"
            >
              <span>Inspect Full Audit Log & Rule Traces</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center space-y-3 text-slate-400">
            <Sparkles className="w-8 h-8 mx-auto text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-700">Awaiting Submission</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Select one of the test presets or enter custom figures, then hit Submit to evaluate business rules in real time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
