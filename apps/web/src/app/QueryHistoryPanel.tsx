import { History, Trash2 } from 'lucide-react';
import { previewQuery, type QueryHistoryEntry } from './query-history';

function outcomeLabel(entry: QueryHistoryEntry) {
  if (entry.outcome === 'error') return entry.error ?? 'Query failed';
  if (entry.outcome === 'demo') return `${entry.rowCount ?? 0} demo rows`;
  return `${entry.rowCount ?? 0} rows${entry.truncated ? ' · truncated' : ''}`;
}

export function QueryHistoryPanel({
  entries,
  activeSql,
  onReuse,
  onClear,
}: {
  entries: QueryHistoryEntry[];
  activeSql: string;
  onReuse: (sql: string) => void;
  onClear: () => void;
}) {
  return (
    <aside className="query-history-panel" aria-label="Recent queries">
      <div className="query-history-header">
        <div>
          <span className="query-history-kicker"><History size={13}/> Recent queries</span>
          <p>Reuse a query you already ran. Nothing is sent until you run it again.</p>
        </div>
        {entries.length > 0 && (
          <button type="button" className="button button-quiet" onClick={onClear} aria-label="Clear query history">
            <Trash2 size={13}/> Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="query-history-empty">Queries you run in this tab appear here, including demo previews.</p>
      ) : (
        <ul className="query-history-list">
          {entries.map((entry) => {
            const selected = entry.sql.trim() === activeSql.trim();
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`query-history-item${selected ? ' selected' : ''}${entry.outcome === 'error' ? ' failed' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`Reuse query: ${previewQuery(entry.sql, 120)}`}
                  onClick={() => onReuse(entry.sql)}
                >
                  <code>{previewQuery(entry.sql)}</code>
                  <span>{outcomeLabel(entry)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
