import { useState } from 'react';
import { ChevronDown, ChevronRight, Layers3, Plus, Trash2, X } from 'lucide-react';
import type { SchemaTableGroup } from './schema-groups';

const palette = ['#3973c7', '#8b5cf6', '#0f9b8e', '#d97706', '#d14343', '#61758f'];

export function SchemaGroupsDialog({ groups, onClose, onCreate, onRename, onColor, onToggle, onDelete }: {
  groups: SchemaTableGroup[];
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
  onRename: (id: string, name: string) => void;
  onColor: (id: string, color: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(palette[0]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="connection-modal schema-groups-modal" role="dialog" aria-modal="true" aria-labelledby="schema-groups-title"><div className="modal-heading"><div className="modal-icon"><Layers3 size={18}/></div><button className="icon-button" aria-label="Close table groups" onClick={onClose}><X size={16}/></button></div><h2 id="schema-groups-title">Table groups</h2><p>Group related tables by feature or domain. Assign tables from each table’s action menu. Groups and colors are saved for this database in this browser session.</p>
    <form className="schema-group-create" onSubmit={(event) => { event.preventDefault(); const trimmed = name.trim(); if (!trimmed) return; onCreate(trimmed, color); setName(''); }}><label><span>New group name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Billing" maxLength={48}/></label><label className="schema-group-color"><span>Color</span><input aria-label="New group color" type="color" value={color} onChange={(event) => setColor(event.target.value)}/></label><button className="button button-primary" disabled={!name.trim()}><Plus size={14}/> Create group</button></form>
    <div className="schema-group-list">{groups.length ? groups.map((group) => <article className="schema-group-row" key={group.id}><span className="schema-group-swatch" style={{ '--group-color': group.color } as React.CSSProperties}/><input className="schema-group-name" aria-label={`Group name for ${group.name}`} value={group.name} onChange={(event) => onRename(group.id, event.target.value)} maxLength={48}/><span className="schema-group-table-count">{group.tableIds.length} tables</span><label className="schema-group-color"><span className="sr-only">Color for {group.name}</span><input aria-label={`Color for ${group.name}`} type="color" value={group.color} onChange={(event) => onColor(group.id, event.target.value)}/></label><button className="icon-button" aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`} title={`${group.collapsed ? 'Expand' : 'Collapse'} group`} onClick={() => onToggle(group.id)}>{group.collapsed ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}</button><button className="icon-button" aria-label={`Delete group ${group.name}`} title="Delete group; tables become unassigned" onClick={() => onDelete(group.id)}><Trash2 size={14}/></button></article>) : <div className="schema-groups-empty">No groups yet. Create one, then assign tables from their ⋯ menus.</div>}</div>
    <div className="create-table-actions"><button className="button button-primary" onClick={onClose}>Done</button></div>
  </section></div>;
}
