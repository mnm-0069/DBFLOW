// apps/web/src/app/SqlSuggestionPanel.tsx
// SQL Query Intelligence: side-by-side optimization, execution plan diagnostics & Natural Language to SQL

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { ExplainQueryResponse, NlToSqlResponse } from '@idp/shared';

interface SqlSuggestionPanelProps {
  connectionId: string | null;
  databaseName: string;
  initialSql?: string;
  onOpenInSqlWorkspace: (sql: string) => void;
  onNotify: (msg: string) => void;
}

export function SqlSuggestionPanel({
  connectionId,
  databaseName,
  initialSql = `SELECT * FROM students s JOIN departments d ON s.department_id = d.id WHERE s.gpa >= 3.5;`,
  onOpenInSqlWorkspace,
  onNotify,
}: SqlSuggestionPanelProps) {
  const [sql, setSql] = useState(initialSql);
  const [nlPrompt, setNlPrompt] = useState('');
  const [analysis, setAnalysis] = useState<ExplainQueryResponse | null>(null);
  const [busyExplain, setBusyExplain] = useState(false);
  const [busyNl, setBusyNl] = useState(false);
  const [error, setError] = useState('');
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [copiedOptimized, setCopiedOptimized] = useState(false);
  const [showRawPlan, setShowRawPlan] = useState(false);

  const runExplain = async () => {
    if (!sql.trim()) return;
    if (!connectionId) {
      onNotify('Please connect a database session first.');
      return;
    }

    setBusyExplain(true);
    setError('');
    try {
      const res = await fetch('http://localhost:4000/api/copilot/explain-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, query: sql }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to explain query.');
      setAnalysis(data);
    } catch (err: any) {
      setError(err.message || 'Error executing EXPLAIN.');
    } finally {
      setBusyExplain(false);
    }
  };

  const runNlToSql = async () => {
    if (!nlPrompt.trim()) return;
    if (!connectionId) {
      onNotify('Please connect a database session first.');
      return;
    }

    setBusyNl(true);
    setError('');
    try {
      const res = await fetch('http://localhost:4000/api/copilot/nl-to-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, prompt: nlPrompt }),
      });

      const data: NlToSqlResponse = await res.json();
      if (!res.ok) throw new Error((data as any).error || 'Failed to generate SQL.');
      setSql(data.sql);
      onNotify(`Generated SQL targeting: ${data.targetTables.join(', ') || 'tables'}`);
    } catch (err: any) {
      setError(err.message || 'Error generating SQL from prompt.');
    } finally {
      setBusyNl(false);
    }
  };

  const copySqlText = (text: string, isOptimized: boolean) => {
    navigator.clipboard.writeText(text);
    if (isOptimized) {
      setCopiedOptimized(true);
      setTimeout(() => setCopiedOptimized(false), 2000);
    } else {
      setCopiedOriginal(true);
      setTimeout(() => setCopiedOriginal(false), 2000);
    }
    onNotify('SQL copied to clipboard');
  };

  return (
    <div className="sql-intelligence-panel">
      {/* Natural Language to SQL Bar */}
      <div className="nl-to-sql-card">
        <div className="nl-card-header">
          <span className="nl-icon-box">
            <Sparkles size={16} className="text-purple-600" />
          </span>
          <div>
            <strong>Natural Language to SQL Generator</strong>
            <p>Type a request in plain English to generate a safe, read-only SELECT query for <code>{databaseName}</code>.</p>
          </div>
        </div>
        <div className="nl-input-row">
          <input
            type="text"
            className="nl-input"
            placeholder="e.g. Find students with GPA above 3.8 and their departments..."
            value={nlPrompt}
            onChange={(e) => setNlPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runNlToSql();
            }}
          />
          <button
            className="button button-primary"
            onClick={runNlToSql}
            disabled={busyNl || !nlPrompt.trim()}
          >
            {busyNl ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generate SQL
          </button>
        </div>
      </div>

      {/* SQL Editor Area */}
      <div className="sql-input-section">
        <div className="sql-section-header">
          <div className="sql-label-group">
            <Code2 size={16} className="text-blue-600" />
            <strong>Query to Analyze & Optimize</strong>
          </div>
          <div className="sql-header-actions">
            <button className="button button-quiet" onClick={() => copySqlText(sql, false)}>
              {copiedOriginal ? <Check size={13} /> : <Copy size={13} />}
              {copiedOriginal ? 'Copied' : 'Copy'}
            </button>
            <button
              className="button button-primary"
              onClick={runExplain}
              disabled={busyExplain || !sql.trim()}
            >
              {busyExplain ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
              Explain & Analyze Plan
            </button>
          </div>
        </div>

        <textarea
          className="sql-query-textarea"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="Enter a SELECT SQL query to analyze its execution plan and optimize..."
          rows={5}
          spellCheck={false}
        />

        {error && <div className="sql-error-alert">{error}</div>}
      </div>

      {/* Analysis Results */}
      {analysis && (
        <div className="explain-results-container">
          {/* Diagnostics summary bar */}
          <div className="plan-diagnostics-bar">
            <div className="plan-metric">
              <span className="metric-title">Estimated Cost</span>
              <strong className="metric-data">
                {analysis.estimatedCost?.totalCost !== undefined ? analysis.estimatedCost.totalCost : 'N/A'}
              </strong>
            </div>

            <div className="plan-metric">
              <span className="metric-title">Estimated Rows</span>
              <strong className="metric-data">
                {analysis.estimatedCost?.planRows !== undefined ? analysis.estimatedCost.planRows : 'N/A'}
              </strong>
            </div>

            <div className="plan-metric">
              <span className="metric-title">Scans</span>
              <strong className="metric-data">
                {analysis.scansUsed.map((s) => `${s.table} (${s.scanType})`).join(', ') || 'None'}
              </strong>
            </div>

            <div className="plan-metric">
              <span className="metric-title">Joins</span>
              <strong className="metric-data">
                {analysis.joinsUsed.map((j) => j.type).join(', ') || 'Single Table'}
              </strong>
            </div>
          </div>

          {/* Explanation narrative */}
          <div className="plan-explanation-box">
            <strong>Execution Strategy:</strong>
            <p>{analysis.explanation}</p>
          </div>

          {/* Inefficiencies Warning Box */}
          {analysis.potentialInefficiencies.length > 0 && (
            <div className="inefficiencies-box">
              <span className="inefficiency-header">
                <AlertTriangle size={15} /> Identified Inefficiencies:
              </span>
              <ul>
                {analysis.potentialInefficiencies.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Side-by-Side Comparison */}
          {analysis.suggestedSql && (
            <div className="sql-comparison-grid">
              <div className="comparison-col original-col">
                <div className="comparison-col-head">
                  <span>Current SQL Query</span>
                </div>
                <pre className="comparison-code-box">{analysis.originalQuery}</pre>
              </div>

              <div className="comparison-col optimized-col">
                <div className="comparison-col-head">
                  <span className="text-emerald-700 flex items-center gap-1">
                    <Sparkles size={13} /> Proposed Optimized Query
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="copy-btn-mini"
                      onClick={() => copySqlText(analysis.suggestedSql!, true)}
                    >
                      {copiedOptimized ? <Check size={12} /> : <Copy size={12} />}
                      {copiedOptimized ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      className="copy-btn-mini accent"
                      onClick={() => onOpenInSqlWorkspace(analysis.suggestedSql!)}
                    >
                      <ExternalLink size={12} /> Load in SQL Tab
                    </button>
                  </div>
                </div>
                <pre className="comparison-code-box optimized">{analysis.suggestedSql}</pre>
                {analysis.suggestedSqlExplanation && (
                  <p className="optimized-explanation">{analysis.suggestedSqlExplanation}</p>
                )}
              </div>
            </div>
          )}

          {/* Raw Execution Plan Accordion */}
          {analysis.executionPlanRaw && (
            <details className="raw-plan-accordion">
              <summary>
                <span>View Raw EXPLAIN Plan (JSON)</span>
              </summary>
              <pre className="raw-plan-box">{analysis.executionPlanRaw}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
