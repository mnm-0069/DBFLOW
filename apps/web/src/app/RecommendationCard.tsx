// apps/web/src/app/RecommendationCard.tsx
// Displays actionable AI recommendations with SQL previews, risks, and Schema Designer navigation

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { HealthFinding } from '@idp/shared';

interface RecommendationCardProps {
  finding: HealthFinding;
  isReviewed: boolean;
  onToggleReview: (id: string) => void;
  onNavigateToSchema: (tableName: string) => void;
  onNotify: (msg: string) => void;
}

export function RecommendationCard({
  finding,
  isReviewed,
  onToggleReview,
  onNavigateToSchema,
  onNotify,
}: RecommendationCardProps) {
  const [copied, setCopied] = useState(false);
  const [showRollback, setShowRollback] = useState(false);

  const copySql = () => {
    if (!finding.suggestedSql) return;
    navigator.clipboard.writeText(finding.suggestedSql);
    setCopied(true);
    onNotify('Proposed SQL copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const severityIcon = () => {
    switch (finding.severity) {
      case 'critical':
        return <ShieldAlert size={16} className="text-red-600" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-amber-600" />;
      case 'optimization':
        return <Zap size={16} className="text-blue-600" />;
      default:
        return <Info size={16} className="text-slate-500" />;
    }
  };

  const severityClass = `finding-badge finding-badge-${finding.severity}`;

  return (
    <div className={`recommendation-card ${isReviewed ? 'is-reviewed' : ''}`}>
      <div className="recommendation-header">
        <div className="recommendation-title-row">
          <span className="recommendation-icon-box">{severityIcon()}</span>
          <div>
            <div className="recommendation-badge-bar">
              <span className={severityClass}>{finding.severity.toUpperCase()}</span>
              <span className="category-badge">{finding.category.replace('_', ' ')}</span>
              <span className="table-target-badge">{finding.table}</span>
              {finding.confidence && (
                <span className="confidence-badge">
                  {finding.confidence === 'confirmed' ? 'Verified Fact' : 'Heuristic Recommendation'}
                </span>
              )}
            </div>
            <h4 className="recommendation-title">{finding.title}</h4>
          </div>
        </div>

        <label className="reviewed-checkbox-label" title="Mark as reviewed">
          <input
            type="checkbox"
            checked={isReviewed}
            onChange={() => onToggleReview(finding.id)}
          />
          <span>{isReviewed ? 'Reviewed' : 'Review'}</span>
        </label>
      </div>

      <div className="recommendation-body">
        <div className="recommendation-text-block">
          <strong>Problem & Impact:</strong>
          <p>{finding.problem}</p>
        </div>

        <div className="recommendation-text-block">
          <strong>Architectural Context:</strong>
          <p>{finding.explanation}</p>
        </div>

        <div className="recommendation-evidence-box">
          <span className="evidence-label">Observed Database Evidence:</span>
          <code>{finding.evidence}</code>
        </div>

        {finding.suggestedSql && (
          <div className="recommendation-sql-block">
            <div className="sql-block-head">
              <span className="sql-head-label">
                <Sparkles size={13} /> Proposed SQL Improvement
              </span>
              <button className="copy-sql-btn" onClick={copySql}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy SQL'}
              </button>
            </div>
            <pre className="sql-code-box">{finding.suggestedSql}</pre>
          </div>
        )}

        <div className="recommendation-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Expected Benefit</span>
            <span className="meta-value text-emerald-700">{finding.expectedBenefit}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Potential Risks</span>
            <span className="meta-value text-slate-700">{finding.potentialRisks}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Reversible</span>
            <span className="meta-value">
              {finding.isReversible ? 'Yes (Safe rollback script available)' : 'No (Structural change)'}
            </span>
          </div>
        </div>

        {finding.rollbackSql && (
          <div className="rollback-toggle-area">
            <button
              className="rollback-toggle-btn"
              onClick={() => setShowRollback(!showRollback)}
            >
              <RotateCcw size={12} />
              {showRollback ? 'Hide rollback script' : 'Show rollback script'}
            </button>
            {showRollback && (
              <pre className="rollback-code-box">{finding.rollbackSql}</pre>
            )}
          </div>
        )}
      </div>

      <div className="recommendation-footer">
        <button
          className="button button-quiet"
          onClick={() => onNavigateToSchema(finding.table)}
        >
          <ExternalLink size={14} /> Locate "{finding.table}" in Schema Canvas
        </button>

        {finding.suggestedSql && (
          <button className="button button-primary" onClick={copySql}>
            <Copy size={14} /> Copy Proposed SQL
          </button>
        )}
      </div>
    </div>
  );
}
