// apps/web/src/app/DatabaseHealthPanel.tsx
// Comprehensive Database Health Dashboard with Deterministic Score & Filterable Findings

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { DatabaseHealthReport, HealthFinding, CopilotSeverity } from '@idp/shared';
import { RecommendationCard } from './RecommendationCard';

interface DatabaseHealthPanelProps {
  report: DatabaseHealthReport | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigateToSchema: (tableName: string) => void;
  onNotify: (msg: string) => void;
}

export function DatabaseHealthPanel({
  report,
  loading,
  onRefresh,
  onNavigateToSchema,
  onNotify,
}: DatabaseHealthPanelProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | CopilotSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <div className="health-loading-state">
        <RefreshCw size={28} className="animate-spin text-blue-600" />
        <h3>Introspecting database metadata and executing health audit…</h3>
        <p>Analyzing foreign key indexes, primary key integrity, constraints, and query scans.</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="health-empty-state">
        <Activity size={36} className="text-slate-400" />
        <h3>No Health Audit on Record</h3>
        <p>Run a database health audit to inspect index coverage, primary keys, and performance bottlenecks.</p>
        <button className="button button-primary" onClick={onRefresh}>
          <Sparkles size={15} /> Run Database Health Audit
        </button>
      </div>
    );
  }

  const toggleReview = (id: string) => {
    setReviewedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredFindings = report.findings.filter((f) => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        f.title.toLowerCase().includes(q) ||
        f.table.toLowerCase().includes(q) ||
        (f.column && f.column.toLowerCase().includes(q)) ||
        f.problem.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const exportAudit = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `dbflow_health_audit_${report.database}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    onNotify('Audit report exported to JSON');
  };

  const scoreColor =
    report.healthScore.finalScore >= 80
      ? 'score-green'
      : report.healthScore.finalScore >= 60
      ? 'score-amber'
      : 'score-red';

  return (
    <div className="database-health-panel">
      {/* Top Health Overview Card */}
      <div className="health-hero-card">
        <div className="health-score-dial">
          <div className={`score-circle ${scoreColor}`}>
            <span className="score-number">{report.healthScore.finalScore}</span>
            <span className="score-total">/ 100</span>
          </div>
          <div className="score-grade-badge">Grade {report.healthScore.grade}</div>
        </div>

        <div className="health-summary-content">
          <div className="health-title-row">
            <div>
              <h3>Database Health & Architecture Score</h3>
              <p>
                Calculated deterministically from <strong>{report.tableCount} tables</strong>,{' '}
                <strong>{report.foreignKeyCount} foreign keys</strong>, and{' '}
                <strong>{report.indexCount} indexes</strong> in <code>{report.database}</code>.
              </p>
            </div>
            <div className="health-action-row">
              <button className="button button-quiet" onClick={exportAudit} title="Export Audit JSON">
                <Download size={14} /> Export Report
              </button>
              <button className="button button-primary" onClick={onRefresh} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Run New Audit
              </button>
            </div>
          </div>

          <div className="category-scores-grid">
            <div className="category-score-card">
              <div className="category-score-header">
                <span className="cat-label">Performance & Indexing</span>
                <strong className="cat-val">{report.healthScore.categoryScores.performance}%</strong>
              </div>
              <div className="cat-progress-bar">
                <div
                  className="cat-progress-fill bg-blue-600"
                  style={{ width: `${report.healthScore.categoryScores.performance}%` }}
                />
              </div>
            </div>

            <div className="category-score-card">
              <div className="category-score-header">
                <span className="cat-label">Data Integrity & Keys</span>
                <strong className="cat-val">{report.healthScore.categoryScores.integrity}%</strong>
              </div>
              <div className="cat-progress-bar">
                <div
                  className="cat-progress-fill bg-emerald-600"
                  style={{ width: `${report.healthScore.categoryScores.integrity}%` }}
                />
              </div>
            </div>

            <div className="category-score-card">
              <div className="category-score-header">
                <span className="cat-label">Schema Design & Sizing</span>
                <strong className="cat-val">{report.healthScore.categoryScores.schemaDesign}%</strong>
              </div>
              <div className="cat-progress-bar">
                <div
                  className="cat-progress-fill bg-purple-600"
                  style={{ width: `${report.healthScore.categoryScores.schemaDesign}%` }}
                />
              </div>
            </div>
          </div>

          <div className="summary-pill-row">
            <span className="stat-pill red">
              <ShieldAlert size={13} /> {report.summary.criticalCount} Critical
            </span>
            <span className="stat-pill amber">
              <AlertTriangle size={13} /> {report.summary.warningCount} Warnings
            </span>
            <span className="stat-pill blue">
              <Zap size={13} /> {report.summary.optimizationCount} Optimizations
            </span>
            <span className="stat-pill green">
              <CheckCircle2 size={13} /> {reviewedIds.size} of {report.findings.length} Reviewed
            </span>
          </div>
        </div>
      </div>

      {/* Transparent Deduction Breakdown Section */}
      {report.healthScore.deductions.length > 0 && (
        <details className="deductions-accordion">
          <summary>
            <strong>Transparent Score Deduction Breakdown ({report.healthScore.totalDeductions} pts deducted)</strong>
            <span>Click to inspect the exact rules triggered</span>
          </summary>
          <div className="deductions-table-wrap">
            <table className="deductions-table">
              <thead>
                <tr>
                  <th>Audit Finding</th>
                  <th>Category</th>
                  <th>Score Impact</th>
                </tr>
              </thead>
              <tbody>
                {report.healthScore.deductions.map((d, idx) => (
                  <tr key={idx}>
                    <td>{d.reason}</td>
                    <td>
                      <span className="category-badge">{d.category.replace('_', ' ')}</span>
                    </td>
                    <td className="text-red-600 font-mono font-bold">-{d.points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Filter and Search Bar */}
      <div className="health-findings-toolbar">
        <div className="findings-filter-group">
          <span className="toolbar-label">
            <Filter size={13} /> Severity:
          </span>
          <button
            className={`filter-chip ${severityFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('all')}
          >
            All ({report.findings.length})
          </button>
          <button
            className={`filter-chip ${severityFilter === 'critical' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('critical')}
          >
            Critical ({report.summary.criticalCount})
          </button>
          <button
            className={`filter-chip ${severityFilter === 'warning' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('warning')}
          >
            Warnings ({report.summary.warningCount})
          </button>
          <button
            className={`filter-chip ${severityFilter === 'optimization' ? 'active' : ''}`}
            onClick={() => setSeverityFilter('optimization')}
          >
            Optimizations ({report.summary.optimizationCount})
          </button>
        </div>

        <div className="findings-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search by table, column or issue…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Findings Cards List */}
      <div className="health-findings-list">
        {filteredFindings.length === 0 ? (
          <div className="no-findings-box">
            <CheckCircle2 size={32} className="text-emerald-600" />
            <h4>No findings match your filter criteria</h4>
            <p>All items in this category comply with DBFlow architectural and performance standards.</p>
          </div>
        ) : (
          filteredFindings.map((finding) => (
            <RecommendationCard
              key={finding.id}
              finding={finding}
              isReviewed={reviewedIds.has(finding.id)}
              onToggleReview={toggleReview}
              onNavigateToSchema={onNavigateToSchema}
              onNotify={onNotify}
            />
          ))
        )}
      </div>
    </div>
  );
}
