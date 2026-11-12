import { readSchemaPreference } from './schema-preferences';

export type SchemaNotes = {
  tables: Record<string, string>;
  columns: Record<string, string>;
};

export const schemaNotesStorageKey = (scope: string) => `dbflow.schema-notes.v1:${scope}`;
export const schemaColumnNoteKey = (tableId: string, columnName: string) => JSON.stringify([tableId, columnName]);

export function loadSchemaNotes(scope: string): SchemaNotes {
  try {
    const value = JSON.parse(readSchemaPreference(schemaNotesStorageKey(scope), '{}')) as Partial<SchemaNotes>;
    const clean = (entries: unknown) => entries && typeof entries === 'object' && !Array.isArray(entries)
      ? Object.fromEntries(Object.entries(entries).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
      : {};
    return { tables: clean(value.tables), columns: clean(value.columns) };
  } catch { return { tables: {}, columns: {} }; }
}
