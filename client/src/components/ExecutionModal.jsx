import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, XCircle, Clock, AlertTriangle, Activity, ArrowRight, ShieldCheck, Database, Key } from 'lucide-react';
import { fetchDecisionDetails, fetchAuditTrail } from '../api/decisionApi';

export default function ExecutionModal({ executionId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [auditData, setAuditData] = useState([]);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'audit' | 'rules'

  useEffect(() => {
    if (!executionId) return;
    setLoading(true);
    Promise.all([
      fetchDecisionDetails(executionId),
      fetchAuditTrail(executionId)
    ])
      .then(([detailRes, auditRes]) => {
        setDetails(detailRes);
        setAuditData(auditRes.auditTrail || []);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [executionId]);

  if (!executionId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-brand-600" />
            <h3 className="text-base font-bold text-slate-900">Execution Diagnosis & Audit Trace</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-slate-100 px-6 space-x-4 bg-slate-50/50 text-xs font-medium text-slate-500">
          <button
            onClick={() => setActiveView('overview')}
            className={`py-3 border-b-2 ${activeView === 'overview' ? 'border-brand-600 text-brand-600 font-bold' : 'border-transparent hover:text-slate-700'}`}
          >
            Overview & Context
          </button>
          <button
            onClick={() => setActiveView('audit')}
            className={`py-3 border-b-2 ${activeView === 'audit' ? 'border-brand-600 text-brand-600 font-bold' : 'border-transparent hover:text-slate-700'}`}
          >
            Sequential Audit Trail ({auditData.length} Events)
          </button>
          <button
            onClick={() => setActiveView('rules')}
            className={`py-3 border-b-2 ${activeView === 'rules' ? 'border-brand-600 text-brand-600 font-bold' : 'border-transparent hover:text-slate-700'}`}
          >
            Rule Evaluation Traces
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {loading ? (
            <div className="py-12 text-center text-slate-400">Loading execution details and audit records...</div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">{error}</div>
          ) : details ? (
            <>
              {activeView === 'overview' && (
                <div className="space-y-4">
                  {/* Decision Banner */}
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    details.decisionOutcome === 'APPROVED' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' :
                    details.decisionOutcome === 'REJECTED' ? 'bg-rose-50 border-rose-200 text-rose-900' :
                    details.decisionOutcome === 'MANUAL_REVIEW' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                    'bg-sky-50 border-sky-200 text-sky-900'
                  }`}>
                    <div className="flex items-center space-x-3">
                      {details.decisionOutcome === 'APPROVED' && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                      {details.decisionOutcome === 'REJECTED' && <XCircle className="w-6 h-6 text-rose-600" />}
                      {details.decisionOutcome === 'MANUAL_REVIEW' && <Clock className="w-6 h-6 text-amber-600" />}
                      {details.decisionOutcome === 'RETRY' && <AlertTriangle className="w-6 h-6 text-sky-600" />}
                      <div>
                        <span className="text-sm font-bold block">{details.decisionOutcome || details.executionState}</span>
                        <span className="text-xs">{details.decisionDetails?.message || 'Processing pipeline complete.'}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-white text-[11px] font-mono border border-current">
                      Reason: {details.decisionDetails?.reasonCode || 'N/A'}
                    </span>
                  </div>

                  {/* Underwriter Override Info if exists */}
                  {details.manualReview?.reviewedBy && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                      <span className="font-bold flex items-center space-x-1">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        <span>Underwriter Manual Override Applied</span>
                      </span>
                      <p>Decision: <strong>{details.manualReview.reviewDecision}</strong> by {details.manualReview.reviewedBy}</p>
                      {details.manualReview.notes && <p className="italic text-[11px]">"{details.manualReview.notes}"</p>}
                      <p className="text-[10px] text-amber-700 font-mono">Reviewed at: {new Date(details.manualReview.reviewedAt).toLocaleString()}</p>
                    </div>
                  )}

                  {/* Idempotency & Lifecycle Metadata */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                      <span className="text-slate-400 block text-[10px]">Technical State</span>
                      <span className="font-mono font-bold text-slate-800">{details.executionState}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                      <span className="text-slate-400 block text-[10px]">Pinned Workflow Version</span>
                      <span className="font-mono font-bold text-slate-800">Version {details.workflowVersion}</span>
                    </div>

                    <div className="col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono text-[11px] space-y-1">
                      <span className="text-slate-400 block text-[10px] flex items-center space-x-1">
                        <Key className="w-3 h-3 text-brand-600" />
                        <span>Idempotency-Key</span>
                      </span>
                      <span className="text-slate-700">{details.idempotencyKey}</span>
                      <span className="text-slate-400 block text-[10px] pt-1">SHA-256 Request Hash: {details.requestHash?.substring(0, 24)}...</span>
                    </div>
                  </div>

                  {/* Input vs Enriched Context */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <span className="font-bold text-slate-700 block">Applicant Input Data:</span>
                      <ul className="space-y-1 text-slate-600">
                        <li><strong>Name:</strong> {details.inputPayload?.applicantName}</li>
                        <li><strong>Income:</strong> ${(details.inputPayload?.annualIncome || 0).toLocaleString()}</li>
                        <li><strong>Monthly Debt:</strong> ${(details.inputPayload?.monthlyDebt || 0).toLocaleString()}</li>
                        <li><strong>Requested:</strong> ${(details.inputPayload?.requestedAmount || 0).toLocaleString()}</li>
                        <li><strong>Term:</strong> {details.inputPayload?.loanTermMonths} months</li>
                        <li><strong>Employment:</strong> {details.inputPayload?.employmentStatus}</li>
                      </ul>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
                      <span className="font-bold text-slate-700 block">Enriched Context:</span>
                      <ul className="space-y-1 text-slate-600">
                        <li>
                          <strong>DTI Ratio:</strong> {details.context?.debtToIncomeRatio ? (details.context.debtToIncomeRatio * 100).toFixed(1) + '%' : 'N/A'}
                        </li>
                        <li>
                          <strong>Credit Score:</strong> {details.context?.creditScore || 'Pending'}
                        </li>
                        <li>
                          <strong>Bureau Reference:</strong> {details.context?.bureauReferenceId || 'N/A'}
                        </li>
                        <li>
                          <strong>Report Date:</strong> {details.context?.creditReportDate ? new Date(details.context.creditReportDate).toLocaleDateString() : 'N/A'}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'audit' && (
                <div className="space-y-3">
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {auditData.map((log) => (
                      <div key={log._id || log.sequence} className="relative">
                        <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-white ring-2 ring-brand-100" />
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-800 text-[11px] bg-slate-200 px-1.5 py-0.5 rounded">
                              #{log.sequence} {log.eventType}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <pre className="text-[10px] bg-white p-2 rounded border border-slate-200 overflow-x-auto text-slate-700 font-mono">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeView === 'rules' && (
                <div className="space-y-3">
                  <span className="font-semibold text-slate-700 block">Evaluated Rule Steps:</span>
                  {auditData
                    .filter(a => a.eventType === 'RULE_EVALUATION')
                    .map((ruleAudit, idx) => {
                      const d = ruleAudit.details;
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border ${
                            d.passed ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-800">
                              {d.ruleName} <span className="font-mono text-slate-400">({d.ruleId})</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              d.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {d.passed ? 'TRIGGERED MATCH' : 'DID NOT TRIGGER'}
                            </span>
                          </div>

                          {d.conditions && d.conditions.map((c, cIdx) => (
                            <div key={cIdx} className="text-[11px] font-mono text-slate-600 pl-2 border-l-2 border-slate-200 mt-1">
                              {c.field} {c.operator} {JSON.stringify(c.expectedValue)} ➔ actual: <strong>{JSON.stringify(c.actualValue)}</strong> ({c.passed ? 'true' : 'false'})
                            </div>
                          ))}

                          {d.passed && (
                            <div className="mt-2 text-[11px] text-emerald-900 font-medium bg-emerald-100/70 p-1.5 rounded">
                              Action Outcome: <strong>{d.action?.outcome}</strong> | Reason: {d.action?.reasonCode}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
