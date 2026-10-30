import { useEffect, useMemo, useState } from 'react';
import { Check, Clock3, FileCode2, Trash2, X } from 'lucide-react';
import type { StagedSchemaChange } from './schema-change-plan';

const endpoint: Record<StagedSchemaChange['action'], string> = {
  'create-table': 'create-table',
  'add-column': 'add-column',
  'alter-column': 'set-nullability',
  'add-foreign-key': 'add-foreign-key',
};

export function SchemaChangePlan({ connectionId, changes, onRemove, onClose, onApplied }: {
  connectionId: string;
  changes: StagedSchemaChange[];
  onRemove: (id: string) => void;
  onClose: () => void;
  onApplied: (applied: StagedSchemaChange[]) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  const expiredCount = useMemo(() => changes.filter((change) => change.expiresAt <= now).length, [changes, now]);
  const apply = async () => {
    if (!confirmed || !changes.length || expiredCount || busy) return;
    setBusy(true); setError(''); setProgress('');
    const applied: StagedSchemaChange[] = [];
    for (const change of changes) {
      try {
        if (change.expiresAt <= Date.now()) throw new Error('A preview expired. Remove it and review the change again.');
        const response = await fetch(`http://localhost:4000/api/connections/schema/${endpoint[change.action]}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, planId: change.planId }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? `Could not apply ${change.label}.`);
        applied.push(change);
        setProgress(`Applied ${applied.length} of ${changes.length} changes…`);
      } catch (cause) {
        setError(`${applied.length ? `Applied ${applied.length} change${applied.length === 1 ? '' : 's'}. ` : ''}${cause instanceof Error ? cause.message : 'Could not apply the migration plan.'}`);
        break;
      }
    }
    if (applied.length) await onApplied(applied);
    if (applied.length === changes.length) onClose();
    setBusy(false);
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="connection-modal schema-plan-modal" role="dialog" aria-modal="true" aria-labelledby="schema-plan-title">
    <div className="modal-heading"><div className="modal-icon"><FileCode2 size={18}/></div><button className="icon-button" aria-label="Close change plan" onClick={onClose} disabled={busy}><X size={16}/></button></div>
    <h2 id="schema-plan-title">Schema change plan <span className="schema-plan-count">{changes.length}</span></h2>
    <p>Review the complete SQL plan before applying it. Changes run in order and stop at the first error; completed steps cannot be rolled back as a group.</p>
    {changes.length ? <div className="schema-plan-list">{changes.map((change, index) => <article className="schema-plan-item" key={change.id}><header><div><span>STEP {index + 1}</span><strong>{change.label}</strong></div><button className="icon-button" aria-label={`Remove ${change.label} from plan`} onClick={() => onRemove(change.id)} disabled={busy}><Trash2 size={14}/></button></header><pre>{change.sql}</pre><small className={change.expiresAt <= now ? 'expired' : ''}><Clock3 size={12}/>{change.expiresAt <= now ? 'Preview expired · review this change again' : `Preview valid for ${Math.max(0, Math.ceil((change.expiresAt - now) / 60_000))} more minute(s)`}</small></article>)}</div> : <div className="schema-plan-empty">No staged changes. Review a table, column, or relationship change to add it here.</div>}
    {error && <div className="connection-result error" role="alert">{error}</div>}{progress && <div className="schema-plan-progress" role="status">{progress}</div>}
    {changes.length > 0 && <label className="draft-confirm schema-plan-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy}/> I reviewed every SQL statement and want to apply this plan.</label>}
    <div className="create-table-actions"><button className="button button-quiet" onClick={onClose} disabled={busy}>Close</button><button className="button button-primary" onClick={() => void apply()} disabled={!confirmed || !changes.length || expiredCount > 0 || busy}>{busy ? 'Applying…' : `Apply ${changes.length} change${changes.length === 1 ? '' : 's'}`} <Check size={14}/></button></div>
  </section></div>;
}
