export const QUERY_HISTORY_LIMIT = 15;
export const QUERY_HISTORY_STORAGE_KEY = 'dbflow.query-history.v1';

export type QueryHistoryOutcome = 'demo' | 'database' | 'error';

export type QueryHistoryEntry = {
  id: string;
  sql: string;
  ranAt: string;
  outcome: QueryHistoryOutcome;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
};

export type QueryHistoryInput = {
  sql: string;
  outcome: QueryHistoryOutcome;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
  ranAt?: string;
  id?: string;
};

function createHistoryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function previewQuery(sql: string, maxLength = 88) {
  const compact = sql.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

export function rememberQuery(entries: QueryHistoryEntry[], input: QueryHistoryInput): QueryHistoryEntry[] {
  const sql = input.sql.trim().slice(0, 50_000);
  if (!sql) return entries;
  const next: QueryHistoryEntry = {
    id: input.id ?? createHistoryId(),
    sql,
    ranAt: input.ranAt ?? new Date().toISOString(),
    outcome: input.outcome,
    ...(typeof input.rowCount === 'number' ? { rowCount: input.rowCount } : {}),
    ...(input.truncated ? { truncated: true } : {}),
    ...(input.error ? { error: input.error.slice(0, 500) } : {}),
  };
  return [next, ...entries.filter((entry) => entry.sql !== sql)].slice(0, QUERY_HISTORY_LIMIT);
}

function isHistoryEntry(value: unknown): value is QueryHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as QueryHistoryEntry;
  return typeof entry.id === 'string'
    && typeof entry.sql === 'string'
    && typeof entry.ranAt === 'string'
    && (entry.outcome === 'demo' || entry.outcome === 'database' || entry.outcome === 'error');
}

export function loadQueryHistory(): QueryHistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(QUERY_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, QUERY_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveQueryHistory(entries: QueryHistoryEntry[]) {
  try {
    sessionStorage.setItem(QUERY_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, QUERY_HISTORY_LIMIT)));
  } catch {
    // Private mode and quota errors should not break the editor.
  }
}
