import { useState } from 'react';
import { MessageSquareText, Save, Trash2, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

type NoteKind = 'table' | 'column';
export function SchemaNoteDialog({ kind, name, initialNote, onClose, onSave }: { kind: NoteKind; name: string; initialNote: string; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initialNote);
  const dialogRef = useDialogFocus<HTMLElement>(onClose);
  const title = kind === 'table' ? 'Table description' : 'Column description';
  const save = () => { onSave(note.trim()); onClose(); };
  const remove = () => { onSave(''); onClose(); };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="connection-modal schema-note-modal" role="dialog" aria-modal="true" aria-labelledby="schema-note-title" aria-describedby="schema-note-description"><div className="modal-heading"><div className="modal-icon"><MessageSquareText size={19}/></div><button className="icon-button" aria-label="Close note editor" onClick={onClose}><X size={17}/></button></div><h2 id="schema-note-title">{title}</h2><p id="schema-note-description"><strong>{name}</strong><br/>Add context to help your team understand this part of the schema. Notes are saved in this browser and do not change the database.</p><label className="schema-note-field">Description<textarea autoFocus data-dialog-autofocus maxLength={1000} rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === 'table' ? 'What does this table represent?' : 'What is this column used for?'}/><span>{note.length}/1000</span></label><div className="create-table-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>{initialNote && <button className="button button-quiet schema-note-remove" type="button" onClick={remove}><Trash2 size={14}/> Remove note</button>}<button className="button button-primary" type="button" onClick={save}><Save size={14}/> Save note</button></div></section></div>;
}
