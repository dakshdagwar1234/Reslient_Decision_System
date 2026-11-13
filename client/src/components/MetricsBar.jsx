import React from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle, FileText } from 'lucide-react';

export default function MetricsBar({ metrics }) {
  const m = metrics || {
    totalApplications: 0,
    approved: 0,
    rejected: 0,
    manualReview: 0,
    awaitingRetry: 0,
    failed: 0,
    approvalRate: '0.0%'
  };

  const cards = [
    {
      label: 'Total Applications',
      value: m.totalApplications,
      icon: FileText,
      color: 'text-slate-700 bg-slate-100 border-slate-200'
    },
    {
      label: 'Auto-Approved',
      value: m.approved,
      sub: `Approval Rate: ${m.approvalRate}`,
      icon: CheckCircle2,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200'
    },
    {
      label: 'Auto-Rejected',
      value: m.rejected,
      icon: XCircle,
      color: 'text-rose-700 bg-rose-50 border-rose-200'
    },
    {
      label: 'Manual Review Queue',
      value: m.manualReview,
      icon: Clock,
      color: 'text-amber-700 bg-amber-50 border-amber-200'
    },
    {
      label: 'Awaiting Retry / Failed',
      value: (m.awaitingRetry || 0) + (m.failed || 0),
      sub: `${m.awaitingRetry || 0} retrying • ${m.failed || 0} failed`,
      icon: AlertTriangle,
      color: 'text-sky-700 bg-sky-50 border-sky-200'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={i}
            className={`p-4 rounded-xl border bg-white shadow-sm flex flex-col justify-between transition-all`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{card.label}</span>
              <div className={`p-1.5 rounded-lg ${card.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">{card.value}</span>
              {card.sub && <p className="text-xs text-slate-500 mt-0.5">{card.sub}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
