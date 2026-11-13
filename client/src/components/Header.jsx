import React from 'react';
import { ShieldCheck, RefreshCw, Layers, Database } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, onRefresh, isRefreshing, healthData }) {
  const isDbConnected = healthData?.database?.connected;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="bg-brand-500 text-white p-2 rounded-lg shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">Resilient Decision Engine</span>
                <span className="text-xs bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded border border-slate-300">
                  Loan Underwriting v1
                </span>
              </div>
              <p className="text-xs text-slate-500">Generic Workflow Engine • Idempotent & Fault-Tolerant</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 sm:space-x-2">
            {[
              { id: 'simulator', label: 'Loan Simulator' },
              { id: 'executions', label: 'Executions Queue' },
              { id: 'reviews', label: 'Manual Review Queue' },
              { id: 'configs', label: 'Workflow Rules' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Database Health Badge & Refresh */}
          <div className="flex items-center space-x-3">
            <div className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isDbConnected 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <Database className="w-3.5 h-3.5" />
              <span>{isDbConnected ? 'DB: Connected' : 'DB: In-Memory / Connecting'}</span>
            </div>

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-600' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
