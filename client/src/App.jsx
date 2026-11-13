import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MetricsBar from './components/MetricsBar';
import ApplicationSimulator from './components/ApplicationSimulator';
import ExecutionsTable from './components/ExecutionsTable';
import ExecutionModal from './components/ExecutionModal';
import ManualReviewModal from './components/ManualReviewModal';
import ConfigManager from './components/ConfigManager';
import { fetchMetrics, fetchDecisions, fetchHealth, retryDecision } from './api/decisionApi';

export default function App() {
  const [activeTab, setActiveTab] = useState('simulator');
  const [metrics, setMetrics] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ search: '', outcome: '' });
  const [healthData, setHealthData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals state
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [selectedReviewExecution, setSelectedReviewExecution] = useState(null);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [m, d, h] = await Promise.all([
        fetchMetrics().catch(() => null),
        fetchDecisions({ page: pagination.page, limit: pagination.limit, ...filters }).catch(() => ({ data: [], pagination: {} })),
        fetchHealth().catch(() => null)
      ]);

      if (m?.metrics) setMetrics(m.metrics);
      if (d?.data) {
        setExecutions(d.data);
        if (d.pagination) setPagination(d.pagination);
      }
      if (h) setHealthData(h);
    } catch (err) {
      console.error('Error refreshing dashboard:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [pagination.page, filters]);

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleTriggerRetry = async (id) => {
    try {
      await retryDecision(id);
      await loadData();
    } catch (err) {
      alert(`Retry failed: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefresh={loadData}
        isRefreshing={isRefreshing}
        healthData={healthData}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {/* Global Key Metrics Overview */}
        <MetricsBar metrics={metrics} />

        {/* Tab 1: Application Simulator */}
        {activeTab === 'simulator' && (
          <ApplicationSimulator
            onEvaluationSuccess={loadData}
            onInspectAudit={(id) => setSelectedAuditId(id)}
          />
        )}

        {/* Tab 2: Full Executions Queue */}
        {activeTab === 'executions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Application Executions Queue</h2>
                <p className="text-xs text-slate-500">Live feed of all evaluated loan decisions, state transitions, and idempotency status</p>
              </div>
            </div>

            <ExecutionsTable
              executions={executions}
              onInspectAudit={(id) => setSelectedAuditId(id)}
              onOpenManualReview={(item) => setSelectedReviewExecution(item)}
              onTriggerRetry={handleTriggerRetry}
              pagination={pagination}
              onPageChange={handlePageChange}
              onFilterChange={handleFilterChange}
            />
          </div>
        )}

        {/* Tab 3: Manual Review Underwriting Queue */}
        {activeTab === 'reviews' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Underwriting Manual Review Queue</h2>
                <p className="text-xs text-slate-500">
                  Applications flagged for supervisory review or falling back from auto-approval rules
                </p>
              </div>
            </div>

            <ExecutionsTable
              executions={executions.filter(e => e.decisionOutcome === 'MANUAL_REVIEW')}
              onInspectAudit={(id) => setSelectedAuditId(id)}
              onOpenManualReview={(item) => setSelectedReviewExecution(item)}
              onTriggerRetry={handleTriggerRetry}
              pagination={pagination}
              onPageChange={handlePageChange}
              onFilterChange={handleFilterChange}
            />
          </div>
        )}

        {/* Tab 4: Workflow Configurations */}
        {activeTab === 'configs' && (
          <ConfigManager onConfigChange={loadData} />
        )}
      </main>

      {/* Audit Detail Modal */}
      {selectedAuditId && (
        <ExecutionModal
          executionId={selectedAuditId}
          onClose={() => setSelectedAuditId(null)}
        />
      )}

      {/* Manual Review Modal */}
      {selectedReviewExecution && (
        <ManualReviewModal
          execution={selectedReviewExecution}
          onClose={() => setSelectedReviewExecution(null)}
          onReviewSubmitted={loadData}
        />
      )}
    </div>
  );
}
