import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { submitManualReview } from '../api/decisionApi';

export default function ManualReviewModal({ execution, onClose, onReviewSubmitted }) {
  const [decision, setDecision] = useState('APPROVED');
  const [reviewerName, setReviewerName] = useState('Senior Underwriter');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!execution) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await submitManualReview(execution._id, {
        reviewDecision: decision,
        reviewedBy: reviewerName,
        notes
      });
      if (onReviewSubmitted) onReviewSubmitted();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900">Underwriter Manual Review</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
              {error}
            </div>
          )}

          {/* Applicant Snapshot */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">{execution.inputPayload?.applicantName}</span>
              <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[10px] font-bold">
                MANUAL REVIEW QUEUE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600">
              <div>Income: <strong>${(execution.inputPayload?.annualIncome || 0).toLocaleString()}</strong></div>
              <div>Requested: <strong>${(execution.inputPayload?.requestedAmount || 0).toLocaleString()}</strong></div>
              <div>DTI: <strong>{execution.context?.debtToIncomeRatio ? (execution.context.debtToIncomeRatio * 100).toFixed(1) + '%' : 'N/A'}</strong></div>
              <div>Credit Score: <strong>{execution.context?.creditScore || 'N/A'}</strong></div>
            </div>
            <p className="text-slate-500 pt-1 text-[11px] border-t border-slate-200 mt-1">
              Trigger: {execution.decisionDetails?.message || 'Supervisory policy criteria triggered'}
            </p>
          </div>

          {/* Decision Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Underwriter Final Verdict</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision('APPROVED')}
                className={`p-3 rounded-xl border text-center font-bold flex items-center justify-center space-x-2 transition-all ${
                  decision === 'APPROVED'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Approve Loan</span>
              </button>

              <button
                type="button"
                onClick={() => setDecision('REJECTED')}
                className={`p-3 rounded-xl border text-center font-bold flex items-center justify-center space-x-2 transition-all ${
                  decision === 'REJECTED'
                    ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Reject Loan</span>
              </button>
            </div>
          </div>

          {/* Reviewer Identifier */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Underwriter Name / ID</label>
            <input
              type="text"
              required
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          {/* Underwriting Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Underwriter Audit Rationale / Justification</label>
            <textarea
              rows={3}
              required
              placeholder="e.g. Borrower verified via secondary assets and positive banking relationship."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? 'Recording Decision...' : 'Apply Overriding Verdict'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
