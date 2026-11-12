import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles, Play, Code2, Plus, Trash2, ArrowRight,
  Filter, ArrowDownUp, Check, Database, AlertCircle, Copy, Download
} from 'lucide-react';
import { exportToCsv } from './sql-utils';

export type QueryBuilderTable = {
  schema: string;
  name: string;
  columns: Array<{
    name: string;
    type: string;
    key?: 'pk' | 'fk' | 'pk-fk';
  }>;
  foreignKeys?: Array<{
    column: string;
    referencedSchema: string;
    referencedTable: string;
    referencedColumn: string;
  }>;
};

interface WhereClause {
  id: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IS NULL' | 'IS NOT NULL';
  value: string;
}

interface JoinConfig {
  enabled: boolean;
  type: 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN';
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
}

interface VisualQueryBuilderProps {
  engine: 'postgres' | 'mysql';
  tables: QueryBuilderTable[];
  liveConnectionId: string | null;
  onOpenInSqlWorkspace?: (sql: string) => void;
}

export function VisualQueryBuilder({
  engine,
  tables,
  liveConnectionId,
  onOpenInSqlWorkspace
}: VisualQueryBuilderProps) {
  const [selectedTableKey, setSelectedTableKey] = useState<string>(() =>
    tables.length > 0 ? `${tables[0].schema}.${tables[0].name}` : ''
  );

  useEffect(() => {
    if (!selectedTableKey && tables.length > 0) {
      setSelectedTableKey(`${tables[0].schema}.${tables[0].name}`);
    }
  }, [tables, selectedTableKey]);

  const selectedTable = useMemo(() => {
    return tables.find((t) => `${t.schema}.${t.name}` === selectedTableKey) || tables[0] || null;
  }, [tables, selectedTableKey]);

  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [whereClauses, setWhereClauses] = useState<WhereClause[]>([]);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [limit, setLimit] = useState<number>(50);

  // Join configuration
  const [join, setJoin] = useState<JoinConfig>({
    enabled: false,
    type: 'LEFT JOIN',
    targetTable: '',
    sourceColumn: '',
    targetColumn: ''
  });

  // Query execution state
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [results, setResults] = useState<{
    columns: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    elapsedMs: number;
  } | null>(null);

  // Update selected columns when primary table changes
  useEffect(() => {
    if (selectedTable) {
      setSelectedColumns(selectedTable.columns.slice(0, 6).map((c) => c.name));
      setWhereClauses([]);
      setSortColumn(selectedTable.columns[0]?.name || '');
      setJoin({
        enabled: false,
        type: 'LEFT JOIN',
        targetTable: '',
        sourceColumn: '',
        targetColumn: ''
      });
      setResults(null);
      setQueryError(null);
    }
  }, [selectedTableKey]);

  const toggleColumn = (colName: string) => {
    setSelectedColumns((prev) =>
      prev.includes(colName) ? prev.filter((c) => c !== colName) : [...prev, colName]
    );
  };

  const selectAllColumns = () => {
    if (selectedTable) {
      setSelectedColumns(selectedTable.columns.map((c) => c.name));
    }
  };

  const clearColumns = () => {
    setSelectedColumns([]);
  };

  const addWhereClause = () => {
    if (!selectedTable?.columns.length) return;
    setWhereClauses((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        column: selectedTable.columns[0].name,
        operator: '=',
        value: ''
      }
    ]);
  };

  const updateWhereClause = (id: string, patch: Partial<WhereClause>) => {
    setWhereClauses((prev) =>
      prev.map((clause) => (clause.id === id ? { ...clause, ...patch } : clause))
    );
  };

  const removeWhereClause = (id: string) => {
    setWhereClauses((prev) => prev.filter((c) => c.id !== id));
  };

  // Helper to quote identifiers
  const quote = (id: string) => (engine === 'postgres' ? `"${id}"` : `\`${id}\``);

  // Generate safe read-only SQL
  const generatedSql = useMemo(() => {
    if (!selectedTable) return '';

    const tAlias = selectedTable.name;
    const cols =
      selectedColumns.length > 0
        ? selectedColumns.map((c) => `${tAlias}.${quote(c)}`).join(', ')
        : `${tAlias}.*`;

    let sql = `SELECT ${cols}\nFROM ${quote(selectedTable.schema)}.${quote(selectedTable.name)} AS ${tAlias}`;

    // Add JOIN if enabled
    if (join.enabled && join.targetTable && join.sourceColumn && join.targetColumn) {
      const [tSchema, tName] = join.targetTable.split('.');
      const joinAlias = tName || join.targetTable;
      sql += `\n${join.type} ${quote(tSchema || 'public')}.${quote(tName || join.targetTable)} AS ${joinAlias}`;
      sql += ` ON ${tAlias}.${quote(join.sourceColumn)} = ${joinAlias}.${quote(join.targetColumn)}`;
    }

    // Add WHERE conditions
    const activeFilters = whereClauses.filter(
      (c) => c.operator === 'IS NULL' || c.operator === 'IS NOT NULL' || c.value.trim() !== ''
    );

    if (activeFilters.length > 0) {
      const conditions = activeFilters.map((c) => {
        if (c.operator === 'IS NULL' || c.operator === 'IS NOT NULL') {
          return `${tAlias}.${quote(c.column)} ${c.operator}`;
        }
        // Sanitize single quotes in user input
        const safeVal = c.value.replaceAll("'", "''");
        if (c.operator === 'LIKE' || c.operator === 'ILIKE') {
          return `${tAlias}.${quote(c.column)} ${c.operator} '%${safeVal}%'`;
        }
        // Check if numeric
        const isNum = !isNaN(Number(c.value)) && c.value.trim() !== '';
        return isNum
          ? `${tAlias}.${quote(c.column)} ${c.operator} ${c.value}`
          : `${tAlias}.${quote(c.column)} ${c.operator} '${safeVal}'`;
      });

      sql += `\nWHERE ${conditions.join(' AND ')}`;
    }

    // Add ORDER BY
    if (sortColumn) {
      sql += `\nORDER BY ${tAlias}.${quote(sortColumn)} ${sortDirection}`;
    }

    // Add LIMIT
    sql += `\nLIMIT ${limit};`;

    return sql;
  }, [selectedTable, selectedColumns, whereClauses, sortColumn, sortDirection, limit, join, engine]);

  const executeGeneratedQuery = async () => {
    if (!liveConnectionId) {
      setQueryError('Please connect a database session to execute queries.');
      return;
    }

    setQueryRunning(true);
    setQueryError(null);

    try {
      const response = await fetch('http://localhost:4000/api/connections/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: liveConnectionId,
          query: generatedSql
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to execute query');
      }

      setResults({
        columns: payload.columns || [],
        rows: payload.rows || [],
        rowCount: payload.rowCount || 0,
        elapsedMs: payload.elapsedMs || 0
      });
    } catch (err: any) {
      setQueryError(err.message || 'Query execution error');
      setResults(null);
    } finally {
      setQueryRunning(false);
    }
  };

  // Find candidate join tables and foreign keys
  const candidateJoinTargets = useMemo(() => {
    if (!selectedTable) return [];
    return tables.filter((t) => `${t.schema}.${t.name}` !== selectedTableKey);
  }, [tables, selectedTableKey]);

  return (
    <div className="query-builder-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">VISUAL SQL QUERY DESIGNER</div>
          <h1>Visual Query Builder</h1>
          <p>
            Build, filter, and join relational queries visually without writing raw SQL. Instant SQL preview and safe execution.
          </p>
        </div>
        <div className="heading-actions">
          {onOpenInSqlWorkspace && (
            <button
              className="button button-quiet"
              onClick={() => onOpenInSqlWorkspace(generatedSql)}
            >
              <Code2 size={14} /> Open in SQL Workspace
            </button>
          )}
          <button
            className="button button-primary"
            onClick={executeGeneratedQuery}
            disabled={queryRunning}
          >
            <Play size={14} className={queryRunning ? 'animate-spin' : ''} />
            {queryRunning ? 'Executing...' : 'Run Query'}
          </button>
        </div>
      </div>

      <div className="builder-layout">
        {/* Left column: Visual query configuration */}
        <div className="builder-controls">
          {/* Table Selector */}
          <div className="builder-card">
            <div className="builder-card-header">
              <span className="card-step">1</span>
              <h3>Choose Primary Table</h3>
            </div>
            <div className="builder-card-body">
              <label className="builder-label">
                Select Table
                <select
                  value={selectedTableKey}
                  onChange={(e) => setSelectedTableKey(e.target.value)}
                  className="builder-select"
                >
                  {tables.map((t) => {
                    const key = `${t.schema}.${t.name}`;
                    return (
                      <option key={key} value={key}>
                        {t.schema}.{t.name} ({t.columns.length} columns)
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
          </div>

          {/* Column Selector */}
          <div className="builder-card">
            <div className="builder-card-header">
              <span className="card-step">2</span>
              <h3>Select Columns</h3>
              <div className="card-header-actions">
                <button className="text-button" onClick={selectAllColumns}>
                  Select All
                </button>
                <button className="text-button text-slate-500" onClick={clearColumns}>
                  Clear
                </button>
              </div>
            </div>
            <div className="builder-card-body">
              <div className="column-chips-grid">
                {selectedTable?.columns.map((col) => {
                  const isChecked = selectedColumns.includes(col.name);
                  return (
                    <button
                      key={col.name}
                      type="button"
                      className={`column-chip ${isChecked ? 'is-selected' : ''}`}
                      onClick={() => toggleColumn(col.name)}
                    >
                      <span className="chip-check">{isChecked && <Check size={11} />}</span>
                      <span className="font-mono">{col.name}</span>
                      <small className="text-slate-400 font-mono">{col.type}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Join Relationship (Optional) */}
          <div className="builder-card">
            <div className="builder-card-header">
              <span className="card-step">3</span>
              <h3>Relationship Join (Optional)</h3>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-blue-600">
                <input
                  type="checkbox"
                  checked={join.enabled}
                  onChange={(e) =>
                    setJoin((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                      targetTable: prev.targetTable || (candidateJoinTargets[0] ? `${candidateJoinTargets[0].schema}.${candidateJoinTargets[0].name}` : '')
                    }))
                  }
                  className="rounded"
                />
                Enable Join
              </label>
            </div>
            {join.enabled && (
              <div className="builder-card-body space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="builder-label">
                    Join Type
                    <select
                      value={join.type}
                      onChange={(e) => setJoin((prev) => ({ ...prev, type: e.target.value as any }))}
                      className="builder-select"
                    >
                      <option value="LEFT JOIN">LEFT JOIN</option>
                      <option value="INNER JOIN">INNER JOIN</option>
                      <option value="RIGHT JOIN">RIGHT JOIN</option>
                    </select>
                  </label>

                  <label className="builder-label">
                    Target Table
                    <select
                      value={join.targetTable}
                      onChange={(e) => {
                        const targetKey = e.target.value;
                        const target = tables.find((t) => `${t.schema}.${t.name}` === targetKey);
                        setJoin((prev) => ({
                          ...prev,
                          targetTable: targetKey,
                          targetColumn: target?.columns[0]?.name || ''
                        }));
                      }}
                      className="builder-select"
                    >
                      <option value="">Select table...</option>
                      {candidateJoinTargets.map((t) => (
                        <option key={`${t.schema}.${t.name}`} value={`${t.schema}.${t.name}`}>
                          {t.schema}.{t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {join.targetTable && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="builder-label">
                      Source Column ({selectedTable?.name})
                      <select
                        value={join.sourceColumn}
                        onChange={(e) => setJoin((prev) => ({ ...prev, sourceColumn: e.target.value }))}
                        className="builder-select"
                      >
                        <option value="">Select source column...</option>
                        {selectedTable?.columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="builder-label">
                      Target Column ({join.targetTable.split('.')[1]})
                      <select
                        value={join.targetColumn}
                        onChange={(e) => setJoin((prev) => ({ ...prev, targetColumn: e.target.value }))}
                        className="builder-select"
                      >
                        <option value="">Select target column...</option>
                        {tables
                          .find((t) => `${t.schema}.${t.name}` === join.targetTable)
                          ?.columns.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.type})
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* WHERE Filter Conditions */}
          <div className="builder-card">
            <div className="builder-card-header">
              <span className="card-step">4</span>
              <h3>Filter Criteria (WHERE)</h3>
              <button className="button button-quiet text-xs py-1 px-2" onClick={addWhereClause}>
                <Plus size={13} /> Add Condition
              </button>
            </div>
            <div className="builder-card-body">
              {whereClauses.length === 0 ? (
                <p className="text-xs text-slate-500 py-1">No filter conditions applied. All rows matching limit will be returned.</p>
              ) : (
                <div className="space-y-2">
                  {whereClauses.map((clause) => (
                    <div className="flex items-center gap-2" key={clause.id}>
                      <select
                        value={clause.column}
                        onChange={(e) => updateWhereClause(clause.id, { column: e.target.value })}
                        className="builder-select flex-1"
                      >
                        {selectedTable?.columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={clause.operator}
                        onChange={(e) => updateWhereClause(clause.id, { operator: e.target.value as any })}
                        className="builder-select w-32"
                      >
                        <option value="=">=</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="LIKE">LIKE (%..%)</option>
                        <option value="ILIKE">ILIKE</option>
                        <option value="IS NULL">IS NULL</option>
                        <option value="IS NOT NULL">IS NOT NULL</option>
                      </select>

                      {!['IS NULL', 'IS NOT NULL'].includes(clause.operator) && (
                        <input
                          type="text"
                          placeholder="Value..."
                          value={clause.value}
                          onChange={(e) => updateWhereClause(clause.id, { value: e.target.value })}
                          className="builder-input flex-1"
                        />
                      )}

                      <button
                        className="text-slate-400 hover:text-red-600 p-1"
                        onClick={() => removeWhereClause(clause.id)}
                        title="Remove condition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sorting & Limit */}
          <div className="builder-card">
            <div className="builder-card-header">
              <span className="card-step">5</span>
              <h3>Sorting & Bounded Limit</h3>
            </div>
            <div className="builder-card-body grid grid-cols-3 gap-3">
              <label className="builder-label">
                Order By Column
                <select
                  value={sortColumn}
                  onChange={(e) => setSortColumn(e.target.value)}
                  className="builder-select"
                >
                  <option value="">No sort</option>
                  {selectedTable?.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="builder-label">
                Direction
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value as any)}
                  className="builder-select"
                >
                  <option value="ASC">Ascending (ASC)</option>
                  <option value="DESC">Descending (DESC)</option>
                </select>
              </label>

              <label className="builder-label">
                Result Limit
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="builder-select"
                >
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={500}>500 rows</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Right column: Real-time SQL Preview & Execution Results */}
        <div className="builder-output">
          {/* SQL Preview Box */}
          <div className="sql-preview-card">
            <div className="sql-preview-header">
              <div className="flex items-center gap-2">
                <Code2 size={15} className="text-blue-600" />
                <span className="font-semibold text-sm">Generated Read-Only SQL</span>
              </div>
              <button
                className="text-button text-xs"
                onClick={() => navigator.clipboard.writeText(generatedSql)}
                title="Copy SQL to clipboard"
              >
                <Copy size={12} /> Copy SQL
              </button>
            </div>
            <pre className="sql-code-block font-mono">{generatedSql}</pre>
          </div>

          {/* Results Table Panel */}
          <div className="builder-results-card">
            <div className="results-header">
              <div>
                <span className="results-title">Query Results</span>
                <span className="results-subtitle">
                  {results
                    ? `${results.rowCount} records returned · ${results.elapsedMs} ms`
                    : 'Click "Run Query" above to fetch records'}
                </span>
              </div>
              {results && results.rows.length > 0 && (
                <button
                  className="button button-quiet text-xs py-1 px-3"
                  onClick={() => exportToCsv(results.columns, results.rows, `${selectedTable?.name || 'query'}_results.csv`)}
                >
                  <Download size={13} /> Export CSV
                </button>
              )}
            </div>

            {queryError && (
              <div className="query-error flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <span>{queryError}</span>
              </div>
            )}

            {results && results.rows.length > 0 && (
              <div className="builder-table-wrap">
                <table className="builder-data-table">
                  <thead>
                    <tr>
                      {results.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {results.columns.map((c) => (
                          <td key={c} className="font-mono">
                            {row[c] === null ? (
                              <span className="text-slate-400 italic">NULL</span>
                            ) : (
                              String(row[c])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {results && results.rows.length === 0 && !queryError && (
              <div className="empty-results">
                <strong>No rows returned</strong>
                <span>Try adjusting your WHERE filter conditions or check table contents.</span>
              </div>
            )}

            {!results && !queryError && !queryRunning && (
              <div className="empty-results">
                <div className="empty-result-icon">
                  <Sparkles size={22} />
                </div>
                <strong>Query Ready for Execution</strong>
                <span>Configure the filters on the left and click "Run Query" to fetch live data.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
