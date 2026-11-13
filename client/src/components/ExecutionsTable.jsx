import React, { useState } from 'react';
import { Search, Eye, RefreshCw, UserCheck, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';

export default function ExecutionsTable({
  executions,
  onInspectAudit,
  onOpenManualReview,
  onTriggerRetry,
  pagination,
  onPageChange,
  onFilterChange
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onFilterChange({ search: searchTerm, outcome: outcomeFilter });
  };

  const handleOutcomeChange = (e) => {
    const val = e.target.value;
    setOutcomeFilter(val);
    onFilterChange({ search: searchTerm, outcome: val });
  };

  const renderOutcomeBadge = (outcome) => {
    switch (outcome) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </span>
        );
      case 'MANUAL_REVIEW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 mr-1" /> Manual Review
          </span>
        );
      case 'RETRY':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <AlertTriangle className="w-3 h-3 mr-1" /> Retry Queued
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by applicant name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </form>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-medium">Outcome:</span>
          <select
            value={outcomeFilter}
            onChange={handleOutcomeChange}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none"
          >
            <option value="">All Outcomes</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
            <option value="RETRY">RETRY</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider">
              <th className="py-3 px-3">Applicant</th>
              <th className="py-3 px-3">Requested</th>
              <th className="py-3 px-3">DTI</th>
              <th className="py-3 px-3">Credit Score</th>
              <th className="py-3 px-3">Tech State</th>
              <th className="py-3 px-3">Decision Outcome</th>
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {executions && executions.length > 0 ? (
              executions.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-semibold text-slate-900 block">{item.inputPayload?.applicantName || 'Anonymous'}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{item.inputPayload?.employmentStatus}</span>
                  </td>

                  <td className="py-3 px-3 font-medium text-slate-800">
                    ${(item.inputPayload?.requestedAmount || 0).toLocaleString()}
                  </td>

                  <td className="py-3 px-3">
                    {item.context?.debtToIncomeRatio ? (
                      <span className={`font-semibold ${item.context.debtToIncomeRatio > 0.5 ? 'text-rose-600' : 'text-slate-700'}`}>
                        {(item.context.debtToIncomeRatio * 100).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>

                  <td className="py-3 px-3">
                    {item.context?.creditScore ? (
                      <span className={`font-semibold ${
                        item.context.creditScore >= 720 ? 'text-emerald-600' :
                        item.context.creditScore < 580 ? 'text-rose-600' : 'text-amber-600'
                      }`}>
                        {item.context.creditScore}
                      </span>
                    ) : (
                      <span className="text-slate-400">N/A</span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700">
                      {item.executionState}
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    {renderOutcomeBadge(item.decisionOutcome)}
                  </td>

                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>

                  <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                    {item.decisionOutcome === 'MANUAL_REVIEW' && (
                      <button
                        onClick={() => onOpenManualReview(item)}
                        className="p-1.5 text-amber-700 hover:bg-amber-50 rounded border border-amber-200 transition-colors inline-flex items-center text-[11px] font-medium"
                        title="Submit Underwriter Review"
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1" /> Review
                      </button>
                    )}

                    {(item.executionState === 'AWAITING_RETRY' || item.executionState === 'FAILED') && (
                      <button
                        onClick={() => onTriggerRetry(item._id)}
                        className="p-1.5 text-sky-700 hover:bg-sky-50 rounded border border-sky-200 transition-colors inline-flex items-center text-[11px] font-medium"
                        title="Manually trigger immediate retry"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
                      </button>
                    )}

                    <button
                      onClick={() => onInspectAudit(item._id)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded border border-slate-200 transition-colors inline-flex items-center text-[11px]"
                      title="Inspect Full Audit Trail"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> Audit
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="py-8 text-center text-slate-400 text-xs">
                  No decision records found matching criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</span>
          <div className="flex space-x-1">
            <button
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
