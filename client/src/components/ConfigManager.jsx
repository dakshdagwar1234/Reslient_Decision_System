import React, { useEffect, useState } from 'react';
import { Layers, ShieldCheck, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchConfigs, activateConfig } from '../api/decisionApi';

export default function ConfigManager({ onConfigChange }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchConfigs();
      setConfigs(res.data || []);
      if (res.data && res.data.length > 0) {
        // Select active or first
        const active = res.data.find(c => c.status === 'ACTIVE') || res.data[0];
        setSelectedConfig(active);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleActivate = async (id) => {
    try {
      const res = await activateConfig(id);
      setActionMsg(res.message);
      await loadData();
      if (onConfigChange) onConfigChange();
      setTimeout(() => setActionMsg(null), 4000);
    } catch (err) {
      setActionMsg(`Failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{actionMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Version List Sidebar */}
        <div className="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-brand-600" />
              <span>Workflow Versions</span>
            </span>
          </div>

          <div className="space-y-2">
            {configs.map((cfg) => (
              <div
                key={cfg._id}
                onClick={() => setSelectedConfig(cfg)}
                className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                  selectedConfig?._id === cfg._id
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">
                    {cfg.name} v{cfg.version}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    cfg.status === 'ACTIVE'
                      ? 'bg-emerald-500 text-white'
                      : cfg.status === 'ARCHIVED'
                      ? 'bg-slate-300 text-slate-800'
                      : 'bg-amber-400 text-slate-900'
                  }`}>
                    {cfg.status}
                  </span>
                </div>

                <p className={`text-[11px] truncate ${selectedConfig?._id === cfg._id ? 'text-slate-300' : 'text-slate-500'}`}>
                  {cfg.description}
                </p>

                <div className="mt-2 flex items-center justify-between text-[10px] opacity-80">
                  <span>{cfg.rules?.length || 0} Business Rules</span>
                  {cfg.isImmutable && (
                    <span className="flex items-center space-x-1 text-emerald-400">
                      <Lock className="w-3 h-3" />
                      <span>Immutable</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Config Details */}
        <div className="lg:col-span-8 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          {selectedConfig ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-slate-900">{selectedConfig.name} (Version {selectedConfig.version})</h2>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      selectedConfig.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {selectedConfig.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedConfig.description}</p>
                </div>

                {selectedConfig.status !== 'ACTIVE' && (
                  <button
                    onClick={() => handleActivate(selectedConfig._id)}
                    className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                  >
                    Set as ACTIVE Version
                  </button>
                )}
              </div>

              {/* Safe Fallback Policy */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                <span className="font-bold flex items-center space-x-1 text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Explicit Safe Fallback Policy (No Silent Approvals)</span>
                </span>
                <p>
                  Outcome if no explicit approval or rejection rules trigger: <strong className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">{selectedConfig.fallbackAction?.outcome}</strong> ({selectedConfig.fallbackAction?.reasonCode})
                </p>
                <p className="text-[11px] text-slate-500">{selectedConfig.fallbackAction?.message}</p>
              </div>

              {/* Business Rules Priority Table */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Configured Rules Hierarchy (Evaluated by Priority)</span>
                <div className="space-y-2">
                  {selectedConfig.rules?.map((rule, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          #{rule.priority} - {rule.name} <span className="font-mono text-slate-400 font-normal">({rule.id})</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rule.action?.outcome === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          rule.action?.outcome === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {rule.action?.outcome}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 font-mono bg-white p-2 rounded border border-slate-200">
                        IF {rule.conditionGroup?.operator} (
                        {rule.conditionGroup?.conditions?.map((c, i) => (
                          <span key={i} className="block pl-3">
                            {c.field} {c.operator} {JSON.stringify(c.value)}
                          </span>
                        ))}
                        ) ➔ THEN: <strong>{rule.action?.outcome}</strong> ({rule.action?.reasonCode})
                      </div>
                      <p className="text-[11px] text-slate-500">{rule.action?.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">No configuration selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}
