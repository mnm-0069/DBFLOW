export type SchemaPlanAction = 'create-table' | 'add-column' | 'alter-column' | 'add-foreign-key';
export type StagedSchemaChange = {
  id: string;
  planId: string;
  action: SchemaPlanAction;
  label: string;
  sql: string;
  expiresAt: number;
};

export function stageSchemaChange(change: Omit<StagedSchemaChange, 'id' | 'expiresAt'> & { expiresInSeconds: number }): StagedSchemaChange {
  const { expiresInSeconds, ...rest } = change;
  return { ...rest, id: crypto.randomUUID(), expiresAt: Date.now() + expiresInSeconds * 1000 };
}
