// apps/web/src/app/DatabaseIntelligenceBar.tsx
// DBFlow Proactive Database Intelligence Status Banner
// Displays live background analysis state, category progress, and trigger controls.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Layers,
  Link2,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  IntelligenceStatusResponse,
  CategoryStatus,
  IntelligenceFreshnessState,
  JobLifecycleState,
} from '@idp/shared';

interface DatabaseIntelligenceBarProps {
  connectionId: string | null;
  engine: string;
  databaseName: string;
  onNotify?: (msg: string) => void;
}

export function DatabaseIntelligenceBar({
  connectionId,
  engine,
  databaseName,
  onNotify,
}: DatabaseIntelligenceBarProps) {
  const [data, setData] = useState<IntelligenceStatusResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!connectionId) return;
    try {
      const res = await fetch(
        `http://localhost:4000/api/copilot/intelligence?connectionId=${encodeURIComponent(connectionId)}`
      );
      if (res.ok) {
        const json: IntelligenceStatusResponse = await res.json();
        setData(json);
      }
    } catch {
      // Non-intrusive polling failure ignored
    }
  }, [connectionId]);

  // Dynamic polling interval
  useEffect(() => {
    if (!connectionId) return;

    void fetchStatus();

    const isBusy = data?.status === 'running' || data?.freshnessState === 'updating';
    const intervalMs = isBusy ? 3000 : 12000;

    const timer = setInterval(() => {
      void fetchStatus();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [connectionId, fetchStatus, data?.status, data?.freshnessState]);

  const handleManualRefresh = async () => {
    if (!connectionId || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch('http://localhost:4000/api/copilot/intelligence/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, force: true }),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        onNotify?.('Background intelligence refresh triggered.');
      } else {
        onNotify?.('Failed to schedule intelligence refresh.');
      }
    } catch {
      onNotify?.('Could not reach API server.');
    } finally {
      setTimeout(() => setRefreshing(false), 800);
    }
  };

  if (!connectionId) return null;

  const isRunning = data?.status === 'running' || refreshing || data?.freshnessState === 'updating';
  const isFailed = data?.status === 'failed' || data?.freshnessState === 'failed';
  const isStale = data?.freshnessState === 'stale';
  const isReady = data?.categoryStatus.schema === 'ready' && data?.categoryStatus.health === 'ready';

  const formatTime = (iso?: string) => {
    if (!iso) return 'Pending analysis';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return iso;
    }
  };

  const renderCategoryIcon = (status?: CategoryStatus) => {
    if (status === 'ready') return <CheckCircle2 size={13} className="text-emerald-500" />;
    if (status === 'running') return <RefreshCw size={13} className="text-sky-500 animate-spin" />;
    if (status === 'failed') return <AlertCircle size={13} className="text-rose-500" />;
    return <Clock size={13} className="text-slate-400" />;
  };

  return (
    <div className="intelligence-bar-container">
      <div className="intelligence-bar-main">
        <div className="intelligence-bar-left">
          {/* Status Badge */}
          <div
            className={`intelligence-status-pill ${
              isFailed
                ? 'status-failed'
                : isRunning
                ? 'status-running'
                : isStale
                ? 'status-stale'
                : isReady
                ? 'status-ready'
                : 'status-pending'
            }`}
          >
            {isRunning ? (
              <RefreshCw size={13} className="animate-spin text-sky-600" />
            ) : isFailed ? (
              <AlertCircle size={13} className="text-rose-600" />
            ) : isReady ? (
              <CheckCircle2 size={13} className="text-emerald-600" />
            ) : (
              <Clock size={13} className="text-amber-600" />
            )}
            <span>
              {isRunning
                ? 'Analysing Database…'
                : isFailed
                ? 'Analysis Error'
                : isStale
                ? 'Intelligence Stale'
                : isReady
                ? 'Continuous Intelligence Ready'
                : 'Preparing Intelligence…'}
            </span>
          </div>

          {/* Category Progress Breakdown */}
          <div className="intelligence-categories-group">
            <span
              className={`category-chip ${data?.categoryStatus.schema === 'ready' ? 'ready' : ''}`}
              title="Schema: Tables, columns, constraints"
            >
              {renderCategoryIcon(data?.categoryStatus.schema)}
              <span>Schema</span>
            </span>

            <span
              className={`category-chip ${data?.categoryStatus.relationships === 'ready' ? 'ready' : ''}`}
              title="Relationships: FK graph and junction tables"
            >
              {renderCategoryIcon(data?.categoryStatus.relationships)}
              <span>Relationships</span>
            </span>

            <span
              className={`category-chip ${data?.categoryStatus.indexes === 'ready' ? 'ready' : ''}`}
              title="Indexes: B-Trees, coverage, unindexed FKs"
            >
              {renderCategoryIcon(data?.categoryStatus.indexes)}
              <span>Indexes</span>
            </span>

            <span
              className={`category-chip ${data?.categoryStatus.health === 'ready' ? 'ready' : ''}`}
              title="Health: Deterministic audit score & findings"
            >
              {renderCategoryIcon(data?.categoryStatus.health)}
              <span>Health</span>
            </span>

            <span
              className={`category-chip ${data?.categoryStatus.dataProfiling === 'ready' ? 'ready' : ''}`}
              title="Data Profiling: Catalog row counts, null statistics"
            >
              {renderCategoryIcon(data?.categoryStatus.dataProfiling)}
              <span>Profiling</span>
            </span>
          </div>
        </div>

        {/* Right Actions & Timestamp */}
        <div className="intelligence-bar-right">
          <span className="intelligence-timestamp">
            Last analyzed: <strong>{formatTime(data?.lastSuccessfulAnalysisTime)}</strong>
          </span>

          <button
            className="intelligence-refresh-btn"
            onClick={handleManualRefresh}
            disabled={isRunning}
            title="Trigger an incremental background analysis refresh"
          >
            <RefreshCw size={13} className={isRunning ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            className="intelligence-toggle-btn"
            onClick={() => setExpanded(!expanded)}
            title="Toggle cached intelligence details"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Cached Intelligence Details Panel */}
      {expanded && data?.snapshot && (
        <div className="intelligence-drawer">
          <div className="intelligence-drawer-grid">
            <div className="drawer-metric">
              <span className="drawer-label">Tables Analyzed</span>
              <span className="drawer-value">{data.snapshot.schema.tableCount} tables</span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-label">Relational Constraints</span>
              <span className="drawer-value">{data.snapshot.relationships.graph.length} foreign keys</span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-label">Unindexed Foreign Keys</span>
              <span className="drawer-value text-amber-600">
                {data.snapshot.indexes.unindexedForeignKeys.length} column(s)
              </span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-label">Cached Health Score</span>
              <span className="drawer-value text-emerald-600 font-bold">
                {data.snapshot.health.score}/100 (Grade {data.snapshot.health.grade})
              </span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-label">Schema Fingerprint</span>
              <span className="drawer-value font-mono text-xs text-slate-500">
                {data.snapshot.schemaFingerprint.slice(0, 12)}…
              </span>
            </div>
          </div>
          <div className="intelligence-drawer-footer">
            <span>
              DBFlow Copilot answers questions immediately using this cached intelligence without
              waiting for repetitive live introspection queries.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
