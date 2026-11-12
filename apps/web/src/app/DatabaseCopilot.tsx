// Master Copilot tab container hosting chat, health audit, and SQL intelligence.

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  Layers,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { DatabaseHealthReport } from '@idp/shared';
import { DatabaseHealthPanel } from './DatabaseHealthPanel';
import { CopilotChat } from './CopilotChat';
import { SqlSuggestionPanel } from './SqlSuggestionPanel';
import { RecommendationCard } from './RecommendationCard';
import { DatabaseIntelligenceBar } from './DatabaseIntelligenceBar';

type CopilotSubTab = 'health' | 'chat' | 'recommendations' | 'sql';

interface DatabaseCopilotProps {
  connectionId: string | null;
  databaseName: string;
  engine: string;
  onNavigateToSchema: (tableName?: string) => void;
  onNavigateToSql: (query: string) => void;
  onNotify: (msg: string) => void;
}

export function DatabaseCopilot({
  connectionId,
  databaseName,
  engine,
  onNavigateToSchema,
  onNavigateToSql,
  onNotify,
}: DatabaseCopilotProps) {
  const [activeTab, setActiveTab] = useState<CopilotSubTab>('chat');
  const [report, setReport] = useState<DatabaseHealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('http://localhost:4000/api/copilot/status')
      .then((res) => res.json())
      .then((data) => {
        setAiConfigured(Boolean(data.aiConfigured));
      })
      .catch(() => setAiConfigured(false));
  }, []);

  const fetchHealthAudit = async () => {
    if (!connectionId) {
      onNotify('Connect a live database session to run a health audit.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/copilot/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to complete health audit.');
      }

      const data: DatabaseHealthReport = await res.json();
      setReport(data);
      onNotify(`Audit completed: Health Score ${data.healthScore.finalScore}/100`);
    } catch (err: any) {
      onNotify(`Audit error: ${err.message || 'Could not reach API.'}`);
    } finally {
      setLoading(false);
    }
  };

  // Auto-run initial audit if connected and report is missing.
  useEffect(() => {
    if (connectionId && !report && !loading) {
      void fetchHealthAudit();
    }
  }, [connectionId]);

  const toggleReview = (id: string) => {
    setReviewedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="database-copilot-container">
      {/* 1. Master Compact Header with Linear-grade aesthetic */}
      <div className="copilot-master-header">
        <div className="copilot-master-left">
          <div className="copilot-master-brand-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="copilot-master-title">DBFlow Copilot</h2>
              <span className="copilot-pill copilot-pill-subtle">Autonomous Database Specialist</span>
              <span className={`copilot-status-pill ${aiConfigured ? 'online' : 'offline'}`}>
                <span className="status-indicator-dot" />
                {aiConfigured ? 'Gemini 3.5 Flash Lite Active' : 'Autonomous Offline Heuristic'}
              </span>
            </div>
            <p className="copilot-master-subtitle">
              Intelligent performance engineering, relationship tracing, and non-destructive SQL optimization for{' '}
              <strong>{engine.toUpperCase()}</strong> (<code>{databaseName}</code>)
            </p>
          </div>
        </div>

        <div className="copilot-master-right">
          <button
            className="button button-primary copilot-audit-btn"
            onClick={fetchHealthAudit}
            disabled={loading || !connectionId}
            title="Execute on-demand database health & performance audit"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Auditing…' : 'Run Health Audit'}</span>
          </button>
        </div>
      </div>

      {/* 2. Proactive Continuous Intelligence Status Strip */}
      <DatabaseIntelligenceBar
        connectionId={connectionId}
        engine={engine}
        databaseName={databaseName}
        onNotify={onNotify}
      />

      {/* 3. Refined Segmented Sub-Tab Switcher */}
      <div className="copilot-segmented-nav">
        <button
          className={`copilot-nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={14} />
          <span>AI Consultant Chat</span>
        </button>

        <button
          className={`copilot-nav-item ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          <Activity size={14} />
          <span>Health Overview & Score</span>
          {report && (
            <span className="copilot-nav-badge score-badge">
              {report.healthScore.finalScore}/100
            </span>
          )}
        </button>

        <button
          className={`copilot-nav-item ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          <Zap size={14} />
          <span>Actionable Recommendations</span>
          {report && report.findings.length > 0 && (
            <span className="copilot-nav-badge count-badge">{report.findings.length}</span>
          )}
        </button>

        <button
          className={`copilot-nav-item ${activeTab === 'sql' ? 'active' : ''}`}
          onClick={() => setActiveTab('sql')}
        >
          <Code2 size={14} />
          <span>SQL Query Intelligence & EXPLAIN</span>
        </button>
      </div>

      {/* 4. Active Tab Content Pane */}
      <div className="copilot-tab-body">
        {activeTab === 'chat' && (
          <CopilotChat
            connectionId={connectionId}
            databaseName={databaseName}
            engine={engine}
            aiConfigured={aiConfigured}
            onNavigateToSchema={onNavigateToSchema}
            onNavigateToAudit={() => setActiveTab('health')}
            onNavigateToSql={onNavigateToSql}
            onNotify={onNotify}
          />
        )}

        {activeTab === 'health' && (
          <DatabaseHealthPanel
            report={report}
            loading={loading}
            onRefresh={fetchHealthAudit}
            onNavigateToSchema={onNavigateToSchema}
            onNotify={onNotify}
          />
        )}

        {activeTab === 'recommendations' && (
          <div className="recommendations-hub">
            <div className="recommendations-hub-header">
              <div>
                <h3>Actionable Optimization & Constraint Proposals</h3>
                <p>
                  Review and copy verified non-destructive SQL improvements. DBFlow never executes migrations
                  without your explicit inspection and approval in the Two-Phase Plan Engine.
                </p>
              </div>
              <div className="recommendations-stats">
                <span>
                  <strong>{reviewedIds.size}</strong> of{' '}
                  <strong>{report?.findings.length || 0}</strong> Reviewed
                </span>
              </div>
            </div>

            {(!report || report.findings.length === 0) ? (
              <div className="no-findings-box">
                <CheckCircle2 size={32} className="text-emerald-600" />
                <h4>No pending recommendations</h4>
                <p>Run a health audit to analyze index coverage and schema integrity.</p>
              </div>
            ) : (
              <div className="recommendations-card-stack">
                {report.findings.map((f) => (
                  <RecommendationCard
                    key={f.id}
                    finding={f}
                    isReviewed={reviewedIds.has(f.id)}
                    onToggleReview={toggleReview}
                    onNavigateToSchema={onNavigateToSchema}
                    onNotify={onNotify}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sql' && (
          <SqlSuggestionPanel
            connectionId={connectionId}
            databaseName={databaseName}
            onOpenInSqlWorkspace={onNavigateToSql}
            onNotify={onNotify}
          />
        )}
      </div>
    </div>
  );
}
