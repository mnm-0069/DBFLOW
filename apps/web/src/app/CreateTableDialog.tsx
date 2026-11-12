import { useState } from 'react';
import { Check, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';
import type { StagedSchemaChange } from './schema-change-plan';

type Engine = 'postgres' | 'mysql';
type PgType = 'smallint' | 'integer' | 'bigint' | 'varchar' | 'text' | 'boolean' | 'date' | 'time' | 'timetz' | 'timestamp' | 'timestamptz' | 'decimal' | 'real' | 'double_precision' | 'uuid' | 'jsonb' | 'bytea';
type MysqlType = 'integer' | 'bigint' | 'varchar' | 'text' | 'boolean' | 'timestamp' | 'decimal';
type ColumnType = PgType | MysqlType;
type Reference = { schema: string; table: string; column: string; onDelete: 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default'; onUpdate: 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default' };
type ColumnDraft = { name: string; type: ColumnType; nullable: boolean; primaryKey: boolean; unique: boolean; identity: '' | 'always' | 'by-default'; defaultKind: 'none' | 'literal' | 'current_timestamp' | 'current_date' | 'gen_random_uuid'; defaultValue: string; reference: Reference | null; minimum: string; maximum: string; minLength: string; maxLength: string; allowedValuesText: string; length: string; precision: string; scale: string };
type ForeignKeyDraft = { columns: string[]; reference: { schema: string; table: string; columns: string[]; onDelete: Reference['onDelete']; onUpdate: Reference['onUpdate'] } };
type Draft = { schema: string; table: string; columns: ColumnDraft[]; uniqueConstraints?: string[][]; foreignKeyConstraints?: ForeignKeyDraft[] };
type Preview = { planId: string; sql: string; expiresInSeconds: number };
type ReferenceTable = { schema: string; name: string; columns: Array<{ name: string; key?: string; unique?: boolean; referenceable?: boolean; nullable?: boolean; hasDefault?: boolean }>; keyGroups?: Array<{ kind: 'primary' | 'unique'; columns: string[] }> };
type Constraint = 'primaryKey' | 'required' | 'unique' | 'identity' | 'default' | 'check' | 'foreignKey';

const newColumn = (name = ''): ColumnDraft => ({ name, type: 'text', nullable: true, primaryKey: false, unique: false, identity: '', defaultKind: 'none', defaultValue: '', reference: null, minimum: '', maximum: '', minLength: '', maxLength: '', allowedValuesText: '', length: '120', precision: '10', scale: '2' });
const api = 'http://localhost:4000/api/connections';
const pgTypes: Array<[PgType, string]> = [['smallint', 'Small integer'], ['integer', 'Integer'], ['bigint', 'Big integer'], ['decimal', 'Decimal / numeric'], ['real', 'Real number'], ['double_precision', 'Double precision'], ['varchar', 'Short text with limit'], ['text', 'Long text'], ['boolean', 'True / false'], ['date', 'Date'], ['time', 'Time'], ['timetz', 'Time with timezone'], ['timestamp', 'Date and time'], ['timestamptz', 'Date and time with timezone'], ['uuid', 'UUID'], ['jsonb', 'JSON document'], ['bytea', 'Binary data']];
const mysqlTypes: Array<[MysqlType, string]> = [['integer', 'Integer'], ['bigint', 'Big integer'], ['varchar', 'Short text with limit'], ['text', 'Long text'], ['boolean', 'True / false'], ['timestamp', 'Timestamp'], ['decimal', 'Decimal']];
const actions: Reference['onDelete'][] = ['no action', 'restrict', 'cascade', 'set null', 'set default'];
const constraintLabels: Record<Constraint, string> = { primaryKey: 'Primary key', required: 'Required (NOT NULL)', unique: 'Unique', identity: 'Auto-generated number', default: 'Default value', check: 'Value rule (CHECK)', foreignKey: 'Foreign key' };

export function CreateTableDialog({ connectionId, engine, initialSchema, references, onClose, onCreated, onPlanned }: {
  connectionId: string; engine: Engine; initialSchema: string; references: ReferenceTable[]; onClose: () => void;
  onCreated?: (schema: string, table: string) => Promise<void>;
  onPlanned?: (change: Omit<StagedSchemaChange, 'id' | 'expiresAt'> & { expiresInSeconds: number }) => void;
}) {
  const [draft, setDraft] = useState<Draft>({ schema: initialSchema, table: '', columns: [] });
  const [column, setColumn] = useState<ColumnDraft>(() => newColumn());
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [constraintChoice, setConstraintChoice] = useState('');
  const [uniqueMembers, setUniqueMembers] = useState<string[]>([]);
  const [uniqueMemberChoice, setUniqueMemberChoice] = useState('');
  const [foreignKeyTarget, setForeignKeyTarget] = useState('');
  const [foreignKeySources, setForeignKeySources] = useState<string[]>([]);
  const [foreignKeyDelete, setForeignKeyDelete] = useState<Reference['onDelete']>('no action');
  const [foreignKeyUpdate, setForeignKeyUpdate] = useState<Reference['onUpdate']>('no action');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useDialogFocus<HTMLElement>(onClose, !busy);
  const changed = (next: Draft) => { setDraft(next); setPreview(null); setReviewed(false); setError(''); };
  const updateColumn = (patch: Partial<ColumnDraft>) => {
    const typeChanged = patch.type !== undefined && patch.type !== column.type;
    setColumn((current) => {
      return { ...current, ...patch,
        ...(patch.primaryKey ? { nullable: false, unique: false } : {}),
        ...(typeChanged ? { defaultKind: 'none' as const, defaultValue: '', reference: null, minimum: '', maximum: '', minLength: '', maxLength: '' } : {}),
        ...(patch.type && !['smallint', 'integer', 'bigint'].includes(patch.type) ? { identity: '' as const, nullable: current.identity && !current.primaryKey && !constraints.includes('required') ? true : current.nullable } : {}) };
    });
    if (typeChanged) setConstraints((current) => current.filter((item) => !['default', 'foreignKey', 'check', ...(['smallint', 'integer', 'bigint'].includes(patch.type!) ? [] : ['identity'])].includes(item)));
    setPreview(null); setReviewed(false); setError('');
  };
  const addConstraint = (value: string) => {
    setConstraintChoice('');
    if (!value) return;
    const item = value as Constraint;
    if (constraints.includes(item)) return;
    setConstraints((current) => [...current, item]);
    if (item === 'primaryKey') { updateColumn({ primaryKey: true, nullable: false, unique: false, reference: column.reference ? { ...column.reference, onDelete: column.reference.onDelete === 'set null' ? 'no action' : column.reference.onDelete, onUpdate: column.reference.onUpdate === 'set null' ? 'no action' : column.reference.onUpdate } : null }); setConstraints((current) => current.filter((entry) => entry !== 'unique')); }
    if (item === 'required') updateColumn({ nullable: false, reference: column.reference ? { ...column.reference, onDelete: column.reference.onDelete === 'set null' ? 'no action' : column.reference.onDelete, onUpdate: column.reference.onUpdate === 'set null' ? 'no action' : column.reference.onUpdate } : null });
    if (item === 'unique') updateColumn({ unique: true });
    if (item === 'identity') { updateColumn({ identity: 'by-default', nullable: false, defaultKind: 'none', defaultValue: '', reference: column.reference ? { ...column.reference, onDelete: column.reference.onDelete === 'set null' ? 'no action' : column.reference.onDelete, onUpdate: column.reference.onUpdate === 'set null' ? 'no action' : column.reference.onUpdate } : null }); setConstraints((current) => current.filter((entry) => entry !== 'default')); }
    if (item === 'default') updateColumn({ defaultKind: 'literal' });
    if (item === 'foreignKey' && !column.reference) updateColumn({ reference: null });
  };
  const removeConstraint = (item: Constraint) => {
    setConstraints((current) => current.filter((entry) => entry !== item));
    if (item === 'primaryKey') updateColumn({ primaryKey: false, nullable: Boolean(column.identity) || constraints.includes('required') ? false : true });
    if (item === 'required') updateColumn({ nullable: column.primaryKey || Boolean(column.identity) ? false : true });
    if (item === 'unique') updateColumn({ unique: false });
    if (item === 'identity') updateColumn({ identity: '', nullable: column.primaryKey || constraints.includes('required') ? false : true });
    if (item === 'default') updateColumn({ defaultKind: 'none', defaultValue: '', reference: column.reference ? { ...column.reference, onDelete: column.reference.onDelete === 'set default' ? 'no action' : column.reference.onDelete, onUpdate: column.reference.onUpdate === 'set default' ? 'no action' : column.reference.onUpdate } : null });
    if (item === 'check') updateColumn({ minimum: '', maximum: '', minLength: '', maxLength: '', allowedValuesText: '' });
    if (item === 'foreignKey') updateColumn({ reference: null });
  };
  const resetEditor = () => { setColumn(newColumn()); setConstraints([]); setEditingIndex(null); setConstraintChoice(''); };
  const saveColumn = () => {
    const name = column.name.trim();
    if (!name) { setError('Enter a name for this column before adding it.'); return; }
    if (draft.columns.some((existing, index) => existing.name.toLowerCase() === name.toLowerCase() && index !== editingIndex)) { setError('Each column needs a unique name.'); return; }
    const saved = { ...column, name };
    const nextColumns = [...draft.columns];
    let uniqueConstraints = draft.uniqueConstraints;
    if (editingIndex === null) nextColumns.push(saved); else {
      const oldName = nextColumns[editingIndex]!.name;
      nextColumns[editingIndex] = saved;
      uniqueConstraints = uniqueConstraints?.map((group) => group.map((member) => member === oldName ? name : member));
    }
    const foreignKeyConstraints = draft.foreignKeyConstraints?.map((fk) => ({ ...fk, columns: fk.columns.map((member) => editingIndex !== null && draft.columns[editingIndex]?.name === member ? name : member) }));
    changed({ ...draft, columns: nextColumns, uniqueConstraints, foreignKeyConstraints }); resetEditor();
  };
  const editColumn = (index: number) => {
    if (JSON.stringify(column) === JSON.stringify(newColumn())) {
      setColumn(draft.columns[index]);
      setConstraints(constraintsFor(draft.columns[index]));
      setUniqueMembers([]); setUniqueMemberChoice('');
      setEditingIndex(index); setError('');
    } else setError('Add or clear the current column before editing another one.');
  };
  const removeSavedColumn = (index: number) => {
    const removed = draft.columns[index]?.name;
    const uniqueConstraints = draft.uniqueConstraints?.map((group) => group.filter((member) => member !== removed)).filter((group) => group.length > 1);
    const foreignKeyConstraints = draft.foreignKeyConstraints?.filter((fk) => !fk.columns.includes(removed ?? ''));
    changed({ ...draft, columns: draft.columns.filter((_, i) => i !== index), uniqueConstraints, foreignKeyConstraints });
    if (editingIndex === index) resetEditor(); else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
    setUniqueMembers((members) => members.filter((member) => member !== removed));
  };
  const addUniqueMember = () => { if (uniqueMemberChoice && !uniqueMembers.includes(uniqueMemberChoice)) setUniqueMembers((members) => [...members, uniqueMemberChoice]); setUniqueMemberChoice(''); };
  const saveUniqueConstraint = () => {
    if (uniqueMembers.length < 2) { setError('Choose at least two columns for a composite unique rule.'); return; }
    const key = [...uniqueMembers].sort().join('\0');
    if ((draft.uniqueConstraints ?? []).some((group) => [...group].sort().join('\0') === key)) { setError('That combination is already unique.'); return; }
    changed({ ...draft, uniqueConstraints: [...(draft.uniqueConstraints ?? []), uniqueMembers] }); setUniqueMembers([]); setUniqueMemberChoice('');
  };
  const compositeTargets = references.flatMap((table) => (table.keyGroups ?? []).filter((group) => group.columns.length > 1).map((group) => ({ schema: table.schema, table: table.name, kind: group.kind, columns: group.columns })));
  const selectedForeignKeyTarget = compositeTargets.find((target) => JSON.stringify([target.schema, target.table, target.kind, target.columns]) === foreignKeyTarget);
  const selectedSourceColumns = foreignKeySources.map((name) => draft.columns.find((item) => item.name === name)).filter(Boolean) as ColumnDraft[];
  const compositeActions = actions.filter((action) => (action !== 'set null' || selectedSourceColumns.length === (selectedForeignKeyTarget?.columns.length ?? 0) && selectedSourceColumns.every((item) => item.nullable)) && (action !== 'set default' || selectedSourceColumns.length === (selectedForeignKeyTarget?.columns.length ?? 0) && selectedSourceColumns.every((item) => item.defaultKind !== 'none')));
  const addForeignKey = () => {
    if (!selectedForeignKeyTarget || foreignKeySources.length !== selectedForeignKeyTarget.columns.length || foreignKeySources.some((source) => !source)) { setError('Map each referenced key column to one source column.'); return; }
    if ((draft.foreignKeyConstraints ?? []).some((fk) => JSON.stringify([fk.columns, fk.reference.schema, fk.reference.table, fk.reference.columns]) === JSON.stringify([foreignKeySources, selectedForeignKeyTarget.schema, selectedForeignKeyTarget.table, selectedForeignKeyTarget.columns]))) { setError('That relationship is already added.'); return; }
    changed({ ...draft, foreignKeyConstraints: [...(draft.foreignKeyConstraints ?? []), { columns: foreignKeySources, reference: { schema: selectedForeignKeyTarget.schema, table: selectedForeignKeyTarget.table, columns: selectedForeignKeyTarget.columns, onDelete: foreignKeyDelete, onUpdate: foreignKeyUpdate } }] });
    setForeignKeyTarget(''); setForeignKeySources([]); setForeignKeyDelete('no action'); setForeignKeyUpdate('no action');
  };
  const previewSql = async () => {
    if (!draft.columns.length) { setError('Add at least one column before reviewing the SQL.'); return; }
    if (column.name.trim() || constraints.length || column.type !== 'text') { setError('Add or clear the current column before reviewing the SQL.'); return; }
    if (uniqueMembers.length) { setError('Finish the composite unique rule or remove its selected columns before reviewing the SQL.'); return; }
    if (foreignKeyTarget || foreignKeySources.length) { setError('Finish the composite foreign key or clear its selected target before reviewing the SQL.'); return; }
    setBusy(true); setError(''); setPreview(null); setReviewed(false);
    try {
      const response = await fetch(`${api}/schema/preview-create-table`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, draft: {
        schema: draft.schema, table: draft.table, ...(draft.uniqueConstraints?.length ? { uniqueConstraints: draft.uniqueConstraints } : {}), ...(draft.foreignKeyConstraints?.length ? { foreignKeyConstraints: draft.foreignKeyConstraints } : {}),
        columns: draft.columns.map(({ name, type, nullable, primaryKey, unique, identity, defaultKind, defaultValue, reference, minimum, maximum, minLength, maxLength, allowedValuesText, length, precision, scale }) => ({ name, type, nullable, primaryKey, unique,
          ...(identity ? { identity } : {}),
          ...(defaultKind === 'literal' ? { default: { kind: 'literal', value: defaultValue } } : defaultKind !== 'none' ? { default: { kind: defaultKind } } : {}),
          ...(reference ? { reference } : {}),
          ...((minimum || maximum || minLength || maxLength || allowedValuesText.trim()) ? { checks: { ...(minimum ? { minimum } : {}), ...(maximum ? { maximum } : {}), ...(minLength ? { minLength: Number(minLength) } : {}), ...(maxLength ? { maxLength: Number(maxLength) } : {}), ...(allowedValuesText.trim() ? { allowedValues: allowedValuesText.split('\n').map((value) => value.trim()).filter(Boolean) } : {}) } } : {}),
          ...(type === 'varchar' ? { length: Number(length) } : {}), ...(type === 'decimal' ? { precision: Number(precision), scale: Number(scale) } : {}) })),
      } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not preview this table.');
      setPreview(payload as Preview);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reach the local API.'); }
    finally { setBusy(false); }
  };
  const createTable = async () => {
    if (!preview || !reviewed) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${api}/schema/create-table`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId, planId: preview.planId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The database rejected this table definition.');
      if (onCreated) await onCreated(payload.schema, payload.table);
      if (onPlanned) onPlanned({ planId: preview.planId, sql: preview.sql, action: 'create-table', label: `Create ${draft.schema}.${draft.table}`, expiresInSeconds: preview.expiresInSeconds });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create this table.'); setPreview(null); setReviewed(false); }
    finally { setBusy(false); }
  };
  const refValue = (reference: Reference | null) => reference ? JSON.stringify([reference.schema, reference.table, reference.column]) : '';
  const typeOptions = engine === 'postgres' ? pgTypes : mysqlTypes;
  const identityAllowed = engine === 'postgres' && ['smallint', 'integer', 'bigint'].includes(column.type);
  const numericType = ['smallint', 'integer', 'bigint', 'decimal', 'real', 'double_precision'].includes(column.type);
  const textType = ['varchar', 'text'].includes(column.type);
  const defaultOptions = engine !== 'postgres' ? [] : [['current_timestamp', 'Current time'], ['current_date', 'Today’s date'], ['gen_random_uuid', 'Generate UUID']].filter(([value]) => value === 'current_timestamp' ? ['timestamp', 'timestamptz', 'time', 'timetz'].includes(column.type) : value === 'current_date' ? column.type === 'date' : column.type === 'uuid');
  const targets = [
    ...references.flatMap((table) => table.columns.filter((candidate) => (candidate.key === 'pk' || candidate.key === 'pk-fk') && candidate.referenceable !== false || candidate.unique).map((candidate) => ({ ...candidate, schema: table.schema, table: table.name }))),
    ...(draft.table ? draft.columns.filter((candidate) => candidate.name !== column.name && (candidate.primaryKey || candidate.unique)).map((candidate) => ({ name: candidate.name, schema: draft.schema, table: draft.table, key: candidate.primaryKey ? 'pk' : 'unique' })) : []),
  ];
  const availableReferenceActions = actions.filter((action) => (action !== 'set null' || column.nullable) && (action !== 'set default' || column.defaultKind !== 'none'));
  const availableConstraints = (['primaryKey', ...(!column.primaryKey && !column.identity ? ['required' as const] : []), 'unique', ...(identityAllowed && column.defaultKind === 'none' ? ['identity' as const] : []), ...(engine === 'postgres' ? [...(!column.identity ? ['default' as const] : []), ...(numericType || textType ? ['check' as const] : []), ...(targets.length ? ['foreignKey' as const] : [])] : [])] as Constraint[]).filter((item) => !constraints.includes(item));
  const literalDefaultField = () => {
    const numeric = ['smallint', 'integer', 'bigint', 'decimal', 'real', 'double_precision'].includes(column.type);
    const label = column.type === 'bytea' ? 'Hex bytes' : 'Default value';
    const onChange = (value: string) => updateColumn({ defaultValue: value });
    if (column.type === 'boolean') return <label><span>{label}</span><select aria-label="Literal default value" value={column.defaultValue} onChange={(event) => onChange(event.target.value)}><option value="">Choose true or false…</option><option value="true">True</option><option value="false">False</option></select><small>Use a true/false value.</small></label>;
    if (column.type === 'jsonb') return <label><span>{label}</span><textarea aria-label="Literal default value" value={column.defaultValue} onChange={(event) => onChange(event.target.value)} placeholder={'{"enabled":true}'}/><small>Enter a valid JSON value.</small></label>;
    const inputType = numeric ? 'number' : column.type === 'date' ? 'date' : column.type === 'timestamp' ? 'datetime-local' : 'text';
    const placeholder = column.type === 'bytea' ? '\\x48656c6c6f' : numeric ? '0' : column.type === 'timestamptz' || column.type === 'timetz' ? '2026-01-31 14:30:00+00' : column.type === 'time' ? '14:30:00' : 'Enter a value';
    return <label><span>{label}</span><input aria-label="Literal default value" type={inputType} step={numeric ? 'any' : undefined} inputMode={numeric ? 'decimal' : undefined} value={column.defaultValue} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/><small>DBFLOW checks this value against the selected PostgreSQL type.</small></label>;
  };
  const constraintDetail = (item: Constraint) => {
    switch (item) {
      case 'primaryKey': return <p className="constraint-description">Identifies each row. This column will also be required.</p>;
      case 'required': return <p className="constraint-description">This column must have a value in every row.</p>;
      case 'unique': return <p className="constraint-description">Prevents duplicate values in this column.</p>;
      case 'identity': return <label><span>Number generation</span><select aria-label="Identity mode" value={column.identity} onChange={(event) => updateColumn({ identity: event.target.value as ColumnDraft['identity'], nullable: event.target.value ? false : column.nullable })}><option value="by-default">Automatic (manual override allowed)</option><option value="always">Automatic (database controlled)</option></select></label>;
      case 'default': return <><label><span>Default value</span><select aria-label="Default kind" value={column.defaultKind} onChange={(event) => updateColumn({ defaultKind: event.target.value as ColumnDraft['defaultKind'] })}><option value="literal">A value I choose</option>{defaultOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{column.defaultKind === 'literal' && literalDefaultField()}</>;
      case 'check': return numericType ? <div className="draft-rule-fields"><label><span>Minimum (optional)</span><input aria-label="Minimum value" inputMode="decimal" value={column.minimum} onChange={(event) => updateColumn({ minimum: event.target.value })} placeholder="No minimum"/></label><label><span>Maximum (optional)</span><input aria-label="Maximum value" inputMode="decimal" value={column.maximum} onChange={(event) => updateColumn({ maximum: event.target.value })} placeholder="No maximum"/></label></div> : <><div className="draft-rule-fields"><label><span>Minimum characters (optional)</span><input aria-label="Minimum characters" type="number" min="0" value={column.minLength} onChange={(event) => updateColumn({ minLength: event.target.value })} placeholder="No minimum"/></label><label><span>Maximum characters (optional)</span><input aria-label="Maximum characters" type="number" min="0" value={column.maxLength} onChange={(event) => updateColumn({ maxLength: event.target.value })} placeholder="No maximum"/></label></div><label><span>Only allow these values (optional)</span><textarea aria-label="Allowed values" value={column.allowedValuesText} onChange={(event) => updateColumn({ allowedValuesText: event.target.value })} placeholder={'draft\nactive\narchived'}/><small>Enter one allowed value per line. Quotes and special characters are handled safely.</small></label></>;
      case 'foreignKey': return <><label><span>Reference table and column</span><select aria-label="Foreign key target" value={refValue(column.reference)} onChange={(event) => { const target = targets.find((entry) => JSON.stringify([entry.schema, entry.table, entry.name]) === event.target.value); updateColumn({ reference: target ? { schema: target.schema, table: target.table, column: target.name, onDelete: 'no action', onUpdate: 'no action' } : null }); }}><option value="">Choose a primary key or unique column…</option>{targets.map((target) => <option key={`${target.schema}.${target.table}.${target.name}`} value={JSON.stringify([target.schema, target.table, target.name])}>{target.schema}.{target.table}.{target.name}</option>)}</select></label>{column.reference && <div className="draft-reference-actions"><label><span>When referenced row is deleted</span><select aria-label="Foreign key on delete" value={column.reference.onDelete} onChange={(event) => updateColumn({ reference: { ...column.reference!, onDelete: event.target.value as Reference['onDelete'] } })}>{availableReferenceActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label><label><span>When referenced row is updated</span><select aria-label="Foreign key on update" value={column.reference.onUpdate} onChange={(event) => updateColumn({ reference: { ...column.reference!, onUpdate: event.target.value as Reference['onDelete'] } })}>{availableReferenceActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label></div>}</>;
    }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="connection-modal create-table-modal" role="dialog" aria-modal="true" aria-labelledby="create-table-title" aria-describedby="create-table-description">
      <header className="create-table-header">
        <div className="create-table-header-top">
          <div className="modal-icon" aria-hidden="true"><Plus size={19}/></div>
          <span className="create-table-draft-status">Draft · nothing has run</span>
          <button type="button" className="icon-button" aria-label="Close table designer" onClick={onClose} disabled={busy}><X size={17}/></button>
        </div>
        <div className="create-table-title-row">
          <div>
            <h2 id="create-table-title">Create a table</h2>
            <p id="create-table-description">Name the table, add its columns, then review the SQL before it runs in <strong>{draft.schema || 'your database'}</strong>.</p>
          </div>
          <ol className="create-table-steps" aria-label="Table creation steps">
            {['Table', 'Columns', 'Review SQL'].map((label, index) => {
              const currentStep = preview ? 2 : draft.table.trim() ? 1 : 0;
              const state = index === currentStep ? 'current' : index < currentStep ? 'complete' : 'upcoming';
              return <li className={`create-table-step ${state}`} key={label} aria-current={state === 'current' ? 'step' : undefined}><span>{index < currentStep ? <Check size={12} aria-hidden="true"/> : index + 1}</span>{label}</li>;
            })}
          </ol>
        </div>
      </header>
      <div className="create-table-body">
        <section className="create-table-section" aria-labelledby="create-table-details-title">
          <div className="create-table-section-heading"><div><h3 id="create-table-details-title">Table details</h3><p>Choose where this table lives and give it a clear name.</p></div></div>
          <div className="create-table-target">
            <label><span>Schema</span><input name="schema" autoComplete="off" value={draft.schema} onChange={(event) => changed({ ...draft, schema: event.target.value })} disabled={engine === 'mysql'} aria-label="Schema"/></label>
            <label><span>Table name</span><input name="tableName" autoComplete="off" spellCheck={false} value={draft.table} onChange={(event) => changed({ ...draft, table: event.target.value })} placeholder="e.g. projects…" data-dialog-autofocus/></label>
          </div>
        </section>
        <section className="create-table-section create-table-columns-section" aria-labelledby="create-table-columns-title">
          <div className="draft-columns-heading"><div><h3 id="create-table-columns-title">Columns</h3><p>Add the fields this table needs. You can edit them before creating the table.</p></div><span className="create-table-column-count">{draft.columns.length}<span> / 50</span></span></div>
          {draft.columns.length === 0 && <div className="create-table-empty-columns"><strong>Start with your first column</strong><span>Every table needs at least one. An <code>id</code> or a descriptive field like <code>name</code> is a good place to begin.</span></div>}
          {draft.columns.length > 0 && <div className="saved-columns" aria-label="Added columns">{draft.columns.map((saved, index) => <div className="saved-column" key={`${saved.name}-${index}`}><div><strong>{saved.name}</strong><span>{typeOptions.find(([value]) => value === saved.type)?.[1] ?? saved.type}{saved.primaryKey ? ' · Primary key' : ''}{saved.unique ? ' · Unique' : ''}{saved.reference ? ` · → ${saved.reference.table}.${saved.reference.column}` : ''}</span></div><button type="button" className="saved-column-edit" onClick={() => editColumn(index)} aria-label={`Edit ${saved.name}`}>Edit</button><button type="button" className="draft-remove" aria-label={`Remove ${saved.name}`} onClick={() => removeSavedColumn(index)}><Trash2 size={14} aria-hidden="true"/></button></div>)}</div>}
        </section>
        {engine === 'postgres' && draft.columns.length >= 2 && <section className="create-table-section create-table-rules-section" aria-label="Optional table-wide rules">
          <h3>Optional table-wide rules</h3>
          <div className="create-table-rule-grid">
            <details className="table-constraints" open={uniqueMembers.length > 0 || Boolean(draft.uniqueConstraints?.length)}>
              <summary><span><strong>Unique combinations</strong><small>Make a pair of columns unique together</small></span></summary>
              {(draft.uniqueConstraints ?? []).map((group, index) => <div className="saved-column" key={`${group.join('-')}-${index}`}><div><strong>Unique together</strong><span>{group.join(' + ')}</span></div><button type="button" className="draft-remove" aria-label={`Remove unique rule ${index + 1}`} onClick={() => changed({ ...draft, uniqueConstraints: draft.uniqueConstraints?.filter((_, i) => i !== index) })}><Trash2 size={14} aria-hidden="true"/></button></div>)}
              <p className="table-constraints-hint">For example, prevent duplicate combinations of <code>workspace_id</code> and <code>slug</code>.</p>
              <div className="composite-unique-builder"><label><span>Add a column</span><select aria-label="Choose unique column" value={uniqueMemberChoice} onChange={(event) => setUniqueMemberChoice(event.target.value)}><option value="">Choose a column…</option>{draft.columns.filter((item) => !uniqueMembers.includes(item.name)).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><button type="button" className="button button-quiet" onClick={addUniqueMember} disabled={!uniqueMemberChoice}>Add</button>{uniqueMembers.length > 0 && <div className="unique-member-list">{uniqueMembers.map((member) => <button type="button" key={member} onClick={() => setUniqueMembers((items) => items.filter((item) => item !== member))} aria-label={`Remove ${member} from unique combination`}>{member}<X size={12} aria-hidden="true"/></button>)}</div>}<button type="button" className="button button-quiet" onClick={saveUniqueConstraint} disabled={uniqueMembers.length < 2}>Make combination unique</button></div>
            </details>
            <details className="table-constraints" open={Boolean(foreignKeyTarget || foreignKeySources.length || draft.foreignKeyConstraints?.length)}>
              <summary><span><strong>Composite relationships</strong><small>Connect this table to a multi-column key</small></span></summary>
              {(draft.foreignKeyConstraints ?? []).map((fk, index) => <div className="saved-column" key={`fk-${index}`}><div><strong>{fk.columns.join(' + ')} → {fk.reference.schema}.{fk.reference.table}</strong><span>({fk.reference.columns.join(' + ')}) · delete: {fk.reference.onDelete} · update: {fk.reference.onUpdate}</span></div><button type="button" className="draft-remove" aria-label={`Remove composite foreign key ${index + 1}`} onClick={() => changed({ ...draft, foreignKeyConstraints: draft.foreignKeyConstraints?.filter((_, i) => i !== index) })}><Trash2 size={14} aria-hidden="true"/></button></div>)}
              <p className="table-constraints-hint">Map this table’s columns to an existing composite primary or unique key.</p>
              {compositeTargets.length > 0 ? <div className="composite-fk-builder"><label><span>Referenced key</span><select aria-label="Composite foreign key target" value={foreignKeyTarget} onChange={(event) => { setForeignKeyTarget(event.target.value); setForeignKeySources([]); }}><option value="">Choose a table key…</option>{compositeTargets.map((target) => { const value = JSON.stringify([target.schema, target.table, target.kind, target.columns]); return <option key={value} value={value}>{target.schema}.{target.table} · {target.kind === 'primary' ? 'primary key' : 'unique'} ({target.columns.join(', ')})</option>; })}</select></label>{selectedForeignKeyTarget && <div className="composite-fk-mappings">{selectedForeignKeyTarget.columns.map((targetColumn, index) => <label key={`${targetColumn}-${index}`}><span>{targetColumn} maps to</span><select aria-label={`Source column for ${targetColumn}`} value={foreignKeySources[index] ?? ''} onChange={(event) => setForeignKeySources((current) => { const next = [...current]; next[index] = event.target.value; return next; })}><option value="">Choose a source column…</option>{draft.columns.filter((candidate) => !foreignKeySources.includes(candidate.name) || foreignKeySources[index] === candidate.name).map((candidate) => <option key={candidate.name} value={candidate.name}>{candidate.name}</option>)}</select></label>)}</div>}{selectedForeignKeyTarget && <div className="draft-reference-actions"><label><span>On delete</span><select aria-label="Composite foreign key on delete" value={foreignKeyDelete} onChange={(event) => setForeignKeyDelete(event.target.value as Reference['onDelete'])}>{compositeActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label><label><span>On update</span><select aria-label="Composite foreign key on update" value={foreignKeyUpdate} onChange={(event) => setForeignKeyUpdate(event.target.value as Reference['onDelete'])}>{compositeActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label><button type="button" className="button button-quiet" onClick={addForeignKey} disabled={foreignKeySources.length !== selectedForeignKeyTarget.columns.length || foreignKeySources.some((source) => !source)}>Add relationship</button></div>}</div> : <div className="create-table-rule-empty">Add a composite primary or unique key to another table to choose it here.</div>}
            </details>
          </div>
        </section>}
        {draft.columns.length < 50 && <section className="column-editor" aria-labelledby="column-editor-title"><div className="column-editor-heading"><div><h3 id="column-editor-title">{editingIndex === null ? `Column ${draft.columns.length + 1}` : `Edit ${draft.columns[editingIndex]?.name}`}</h3><p>Set the name and type. Add rules only when you need them.</p></div></div>
      <div className="draft-column-main"><label className="draft-column-name"><span>Column name</span><input name="columnName" autoComplete="off" spellCheck={false} value={column.name} onChange={(event) => updateColumn({ name: event.target.value })} placeholder="e.g. customer_email…" aria-label="Column name"/></label><label className="draft-column-type"><span>Data type</span><select name="columnType" aria-label="Data type" value={column.type} onChange={(event) => updateColumn({ type: event.target.value as ColumnType })}>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {column.type === 'varchar' && <label className="draft-column-size"><span>Max length</span><input type="number" min="1" max={engine === 'postgres' ? 10000000 : 255} value={column.length} onChange={(event) => updateColumn({ length: event.target.value })}/></label>}
        {column.type === 'decimal' && <div className="draft-decimal"><label><span>Precision</span><input type="number" min="1" max={engine === 'postgres' ? 1000 : 65} value={column.precision} onChange={(event) => updateColumn({ precision: event.target.value })}/></label><label><span>Scale</span><input type="number" min="0" max={engine === 'postgres' ? 1000 : 30} value={column.scale} onChange={(event) => updateColumn({ scale: event.target.value })}/></label></div>}
      </div>
      {availableConstraints.length > 0 && <div className="constraint-picker"><div><label htmlFor="add-column-constraint">Add a rule</label><small>Optional · choose only what this column needs</small></div><select id="add-column-constraint" aria-label="Add a rule or constraint" value={constraintChoice} onChange={(event) => addConstraint(event.target.value)}><option value="">Choose a rule…</option>{availableConstraints.map((item) => <option key={item} value={item}>{constraintLabels[item]}</option>)}</select></div>}
      {constraints.length > 0 && <div className="selected-constraints"><span className="selected-constraints-label">This column’s constraints</span>{constraints.map((item) => <section className="constraint-detail" key={item}><header><strong>{constraintLabels[item]}</strong><button type="button" aria-label={`Remove ${constraintLabels[item]}`} onClick={() => removeConstraint(item)}><X size={14}/></button></header>{constraintDetail(item)}</section>)}</div>}
      <div className="column-editor-actions">{editingIndex !== null && <button type="button" className="button button-quiet" onClick={resetEditor}>Cancel edit</button>}<button type="button" className="button button-primary" onClick={saveColumn}><Plus size={15}/>{editingIndex === null ? 'Add column' : 'Save column'}</button></div>
        </section>}
        {error && <div className="connection-result error" role="alert">{error}</div>}
        {preview && <div className="sql-preview"><div><strong>SQL preview</strong><span>Expires in {preview.expiresInSeconds} seconds</span></div><pre>{preview.sql}</pre><label className="draft-confirm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/> I reviewed this SQL and want to create the table.</label></div>}
      </div>
      <footer className="create-table-footer">
        <div className="create-table-footer-note"><ShieldCheck size={16} aria-hidden="true"/><span>{engine === 'postgres' ? 'PostgreSQL checks the draft. You review the SQL before it runs.' : 'Review the generated SQL before it runs on your database.'}</span></div>
        <div className="create-table-actions">{preview ? <button className="button button-primary" type="button" disabled={!reviewed || busy} onClick={() => void createTable()}>{busy ? 'Creating…' : 'Create table'} <Check size={15} aria-hidden="true"/></button> : <button className="button button-primary" type="button" disabled={busy} onClick={() => void previewSql()}>{busy ? 'Generating preview…' : 'Review SQL'}</button>}<button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
      </footer>
    </section>
  </div>;
}

function constraintsFor(column: ColumnDraft): Constraint[] {
  return [column.primaryKey && 'primaryKey', !column.nullable && !column.primaryKey && !column.identity && 'required', column.unique && 'unique', column.identity && 'identity', column.defaultKind !== 'none' && 'default', (column.minimum || column.maximum || column.minLength || column.maxLength || column.allowedValuesText.trim()) && 'check', column.reference && 'foreignKey'].filter(Boolean) as Constraint[];
}
