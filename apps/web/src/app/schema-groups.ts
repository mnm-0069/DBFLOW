import { readSchemaPreference } from './schema-preferences';

export type SchemaTableGroup = { id: string; name: string; color: string; tableIds: string[]; collapsed: boolean };

export function schemaGroupsStorageKey(scope: string) {
  return `dbflow.schema-groups.v1:${scope}`;
}

export function loadSchemaGroups(scope: string, legacyScope?: string): SchemaTableGroup[] {
  try {
    const legacyKey = legacyScope ? schemaGroupsStorageKey(legacyScope) : undefined;
    const value = JSON.parse(readSchemaPreference(schemaGroupsStorageKey(scope), '[]', legacyKey)) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SchemaTableGroup => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.color === 'string' && Array.isArray(item.tableIds) && item.tableIds.every((id: unknown) => typeof id === 'string') && typeof item.collapsed === 'boolean'));
  } catch { return []; }
}
