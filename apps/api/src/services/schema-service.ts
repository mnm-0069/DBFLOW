import { randomBytes } from 'node:crypto';
import type { DatabaseSession } from './connection-service.js';

export type CreateTableColumnType = 'smallint' | 'integer' | 'bigint' | 'varchar' | 'text' | 'boolean' | 'timestamp' | 'timestamptz' | 'date' | 'time' | 'timetz' | 'decimal' | 'real' | 'double_precision' | 'uuid' | 'jsonb' | 'bytea';
export type CreateTableDefault = { kind: 'literal'; value: string } | { kind: 'current_timestamp' } | { kind: 'current_date' } | { kind: 'gen_random_uuid' };
export type CreateTableReference = { schema: string; table: string; column: string; onDelete: 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default'; onUpdate: 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default' };
export type CreateTableForeignKey = { columns: string[]; reference: { schema: string; table: string; columns: string[]; onDelete: CreateTableReference['onDelete']; onUpdate: CreateTableReference['onUpdate'] } };
export type CreateTableChecks = { minimum?: string; maximum?: string; minLength?: number; maxLength?: number; allowedValues?: string[] };
export type CreateTableColumnDraft = {
  name: string;
  type: CreateTableColumnType;
  nullable: boolean;
  primaryKey: boolean;
  unique?: boolean;
  identity?: 'always' | 'by-default';
  default?: CreateTableDefault;
  reference?: CreateTableReference;
  checks?: CreateTableChecks;
  length?: number;
  precision?: number;
  scale?: number;
};
export type CreateTableDraft = { schema: string; table: string; columns: CreateTableColumnDraft[]; uniqueConstraints?: string[][]; foreignKeyConstraints?: CreateTableForeignKey[] };
export type CreateTablePlan = { planId: string; sql: string; expiresInSeconds: number };

export class SchemaOperationError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const PLAN_TTL_MS = 5 * 60_000;
const MAX_PLANS = 100;
type DropTableBehavior = 'restrict' | 'drop-constraints' | 'cascade';
type SchemaPlan = { connectionId: string; engine: DatabaseSession['engine']; sql: string; schema: string; table: string; expiresAt: number; action: 'create-table' | 'add-column' | 'alter-column' | 'add-foreign-key' | 'drop-table'; columnName?: string; dropBehavior?: DropTableBehavior; dependencySignature?: string };
const plans = new Map<string, SchemaPlan>();

function validateIdentifier(value: string, label: string, engine: DatabaseSession['engine']) {
  if (typeof value !== 'string') throw new SchemaOperationError(`${label} must be text.`);
  const normalized = value.trim();
  const maxBytes = engine === 'postgres' ? 63 : 64;
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > maxBytes || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new SchemaOperationError(`${label} must be 1–${maxBytes} bytes and cannot contain control characters.`);
  }
  return normalized;
}

export function validateCreateTableDraft(input: CreateTableDraft, engine: DatabaseSession['engine']): CreateTableDraft {
  if (!input || typeof input !== 'object') throw new SchemaOperationError('Provide a table definition.');
  const schema = validateIdentifier(input.schema, 'Schema name', engine);
  const table = validateIdentifier(input.table, 'Table name', engine);
  if (!Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 50) {
    throw new SchemaOperationError('A table must have between 1 and 50 columns.');
  }
  const names = new Set<string>();
  const columns = input.columns.map((column) => {
    if (!column || typeof column !== 'object') throw new SchemaOperationError('Each column needs a definition.');
    const name = validateIdentifier(column.name, 'Column name', engine);
    const normalizedName = name.toLocaleLowerCase('en-US');
    if (names.has(normalizedName)) throw new SchemaOperationError(`Column “${name}” is duplicated.`);
    names.add(normalizedName);
    const postgresTypes: CreateTableColumnType[] = ['smallint', 'integer', 'bigint', 'varchar', 'text', 'boolean', 'timestamp', 'timestamptz', 'date', 'time', 'timetz', 'decimal', 'real', 'double_precision', 'uuid', 'jsonb', 'bytea'];
    const mysqlTypes: CreateTableColumnType[] = ['integer', 'bigint', 'varchar', 'text', 'boolean', 'timestamp', 'decimal'];
    if (!(engine === 'postgres' ? postgresTypes : mysqlTypes).includes(column.type)) {
      throw new SchemaOperationError(`Column “${name}” has an unsupported type.`);
    }
    if (typeof column.nullable !== 'boolean' || typeof column.primaryKey !== 'boolean') {
      throw new SchemaOperationError(`Column “${name}” needs explicit nullability and primary-key settings.`);
    }
    if (column.primaryKey && column.nullable) throw new SchemaOperationError(`Primary key column “${name}” cannot be nullable.`);
    if (column.unique !== undefined && typeof column.unique !== 'boolean') throw new SchemaOperationError(`Column “${name}” needs a valid uniqueness setting.`);
    if (column.primaryKey && column.unique) throw new SchemaOperationError(`Column “${name}” is already unique because it is part of the primary key.`);
    if (column.identity !== undefined && !['always', 'by-default'].includes(column.identity)) throw new SchemaOperationError(`Column “${name}” has an unsupported identity setting.`);
    if (column.identity && (engine !== 'postgres' || !['smallint', 'integer', 'bigint'].includes(column.type))) throw new SchemaOperationError(`Identity columns need a PostgreSQL SMALLINT, INTEGER, or BIGINT column.`);
    if (column.identity && column.default) throw new SchemaOperationError(`Column “${name}” cannot use both an identity and a default.`);
    if (column.identity && column.nullable) throw new SchemaOperationError(`Identity column “${name}” cannot be nullable.`);
    if (column.reference && engine !== 'postgres') throw new SchemaOperationError('Foreign-key column options are currently available for PostgreSQL tables.');
    let reference: CreateTableReference | undefined;
    if (column.reference) {
      if (typeof column.reference !== 'object') throw new SchemaOperationError(`Column “${name}” needs a valid foreign-key target.`);
      reference = { schema: validateIdentifier(column.reference.schema, 'Referenced schema', engine), table: validateIdentifier(column.reference.table, 'Referenced table', engine), column: validateIdentifier(column.reference.column, 'Referenced column', engine), onDelete: column.reference.onDelete, onUpdate: column.reference.onUpdate };
      if (!['no action', 'restrict', 'cascade', 'set null', 'set default'].includes(reference.onDelete) || !['no action', 'restrict', 'cascade', 'set null', 'set default'].includes(reference.onUpdate)) throw new SchemaOperationError(`Column “${name}” has an unsupported foreign-key action.`);
      if ((reference.onDelete === 'set null' || reference.onUpdate === 'set null') && !column.nullable) throw new SchemaOperationError(`Column “${name}” must allow NULL when its foreign key uses SET NULL.`);
      if ((reference.onDelete === 'set default' || reference.onUpdate === 'set default') && !column.default) throw new SchemaOperationError(`Column “${name}” needs a default when its foreign key uses SET DEFAULT.`);
    }
    if (column.default) {
      if (typeof column.default !== 'object' || !column.default.kind) throw new SchemaOperationError(`Column “${name}” needs a valid default choice.`);
      if (engine !== 'postgres') throw new SchemaOperationError('Guided defaults are currently available for PostgreSQL tables.');
      const type = column.type;
      const kind = column.default.kind;
      const temporal = ['timestamp', 'timestamptz', 'time', 'timetz'];
      if (kind === 'current_timestamp' && !temporal.includes(type)) throw new SchemaOperationError(`CURRENT_TIMESTAMP is not a supported default for “${name}”.`);
      if (kind === 'current_date' && type !== 'date') throw new SchemaOperationError(`CURRENT_DATE is only available for DATE columns.`);
      if (kind === 'gen_random_uuid' && type !== 'uuid') throw new SchemaOperationError(`Generated UUID is only available for UUID columns.`);
      if (kind === 'literal') {
        const value = column.default.value;
        if (typeof value !== 'string' || value.length > 10_000) throw new SchemaOperationError(`Default for “${name}” must be a value under 10,000 characters.`);
        if (['smallint', 'integer', 'bigint', 'decimal', 'real', 'double_precision'].includes(type) && !/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new SchemaOperationError(`Default for “${name}” must be a numeric value.`);
        if (type === 'boolean' && !['true', 'false'].includes(value.toLowerCase())) throw new SchemaOperationError(`Default for “${name}” must be true or false.`);
        if (type === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new SchemaOperationError(`Default for “${name}” must be a valid UUID.`);
        if (type === 'jsonb') { try { JSON.parse(value); } catch { throw new SchemaOperationError(`Default for “${name}” must be valid JSON.`); } }
        if (!['smallint', 'integer', 'bigint', 'decimal', 'real', 'double_precision', 'boolean', 'varchar', 'text', 'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'uuid', 'jsonb', 'bytea'].includes(type)) throw new SchemaOperationError(`A literal default is not supported for “${name}” columns.`);
        if (type === 'varchar' && value.length > (column.length ?? 0)) throw new SchemaOperationError(`Default for “${name}” is longer than its VARCHAR limit.`);
      } else if (!['literal', 'current_timestamp', 'current_date', 'gen_random_uuid'].includes(kind)) throw new SchemaOperationError(`Column “${name}” has an unsupported default.`);
    }
    let checks: CreateTableChecks | undefined;
    if (column.checks !== undefined) {
      if (engine !== 'postgres' || !column.checks || typeof column.checks !== 'object') throw new SchemaOperationError(`Column “${name}” has invalid validation rules.`);
      checks = {};
      const numericType = ['smallint', 'integer', 'bigint', 'decimal', 'real', 'double_precision'].includes(column.type);
      const textType = ['varchar', 'text'].includes(column.type);
      if (column.checks.minimum !== undefined || column.checks.maximum !== undefined) {
        if (!numericType) throw new SchemaOperationError(`Minimum and maximum rules need a numeric column (“${name}”).`);
        for (const [field, value] of [['minimum', column.checks.minimum], ['maximum', column.checks.maximum]] as const) {
          if (value !== undefined && (typeof value !== 'string' || !/^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value)))) throw new SchemaOperationError(`${field === 'minimum' ? 'Minimum' : 'Maximum'} for “${name}” must be a finite numeric value.`);
        }
        if (column.checks.minimum !== undefined) checks.minimum = column.checks.minimum;
        if (column.checks.maximum !== undefined) checks.maximum = column.checks.maximum;
        if (checks.minimum !== undefined && checks.maximum !== undefined && Number(checks.minimum) > Number(checks.maximum)) throw new SchemaOperationError(`Minimum for “${name}” cannot be greater than its maximum.`);
      }
      if (column.checks.minLength !== undefined || column.checks.maxLength !== undefined) {
        if (!textType) throw new SchemaOperationError(`Length rules need a text column (“${name}”).`);
        for (const value of [column.checks.minLength, column.checks.maxLength]) if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 10_000_000)) throw new SchemaOperationError(`Length rules for “${name}” must be whole numbers from 0 to 10,000,000.`);
        if (column.checks.minLength !== undefined) checks.minLength = column.checks.minLength;
        if (column.checks.maxLength !== undefined) checks.maxLength = column.checks.maxLength;
        if (checks.minLength !== undefined && checks.maxLength !== undefined && checks.minLength > checks.maxLength) throw new SchemaOperationError(`Minimum length for “${name}” cannot be greater than its maximum length.`);
      }
      if (column.checks.allowedValues !== undefined) {
        if (!textType || !Array.isArray(column.checks.allowedValues) || column.checks.allowedValues.length < 1 || column.checks.allowedValues.length > 100) throw new SchemaOperationError(`Allowed values for “${name}” need a text column and 1–100 choices.`);
        if (column.checks.allowedValues.some((value) => typeof value !== 'string' || value.length > 1_000) || new Set(column.checks.allowedValues).size !== column.checks.allowedValues.length) throw new SchemaOperationError(`Allowed values for “${name}” must be unique text values under 1,000 characters each.`);
        checks.allowedValues = [...column.checks.allowedValues];
      }
      if (!Object.keys(checks).length) checks = undefined;
    }
    const varcharMaximum = engine === 'postgres' ? 10_000_000 : 255;
    if (column.type === 'varchar' && (!Number.isInteger(column.length) || column.length! < 1 || column.length! > varcharMaximum)) {
      throw new SchemaOperationError(`Column “${name}” needs a VARCHAR length from 1 to ${varcharMaximum}.`);
    }
    const decimalMaximum = engine === 'postgres' ? 1000 : 65;
    const scaleMaximum = engine === 'postgres' ? 1000 : 30;
    if (column.type === 'decimal' && (!Number.isInteger(column.precision) || column.precision! < 1 || column.precision! > decimalMaximum || !Number.isInteger(column.scale) || column.scale! < 0 || column.scale! > Math.min(scaleMaximum, column.precision!))) {
      throw new SchemaOperationError(`Column “${name}” needs DECIMAL precision 1–${decimalMaximum} and scale 0–${Math.min(scaleMaximum, column.precision ?? 0)}.`);
    }
    return { name, type: column.type, nullable: column.nullable, primaryKey: column.primaryKey, ...(column.unique ? { unique: true } : {}), ...(column.identity ? { identity: column.identity } : {}), ...(column.default ? { default: column.default } : {}), ...(reference ? { reference } : {}), ...(checks ? { checks } : {}),
      ...(column.type === 'varchar' ? { length: column.length } : {}),
      ...(column.type === 'decimal' ? { precision: column.precision, scale: column.scale } : {}) };
  });
  const uniqueConstraints = input.uniqueConstraints ?? [];
  if (!Array.isArray(uniqueConstraints) || uniqueConstraints.length > 50) throw new SchemaOperationError('A table can have up to 50 composite unique constraints.');
  const uniqueKeys = new Set<string>();
  const normalizedUniqueConstraints = uniqueConstraints.map((group) => {
    if (engine !== 'postgres') throw new SchemaOperationError('Composite unique constraints are currently available for PostgreSQL tables.');
    if (!Array.isArray(group) || group.length < 2 || group.length > 50) throw new SchemaOperationError('A composite unique constraint must contain between 2 and 50 columns.');
    const members = group.map((member) => validateIdentifier(member, 'Unique constraint column', engine));
    if (new Set(members).size !== members.length) throw new SchemaOperationError('A composite unique constraint cannot list a column more than once.');
    for (const member of members) if (!columns.some((column) => column.name === member)) throw new SchemaOperationError(`Unique constraint column “${member}” does not exist in this table.`);
    const key = [...members].sort().join('\0');
    if (uniqueKeys.has(key)) throw new SchemaOperationError('The same composite unique constraint cannot be added twice.');
    uniqueKeys.add(key);
    return members;
  });
  const foreignKeyConstraints = input.foreignKeyConstraints ?? [];
  if (!Array.isArray(foreignKeyConstraints) || foreignKeyConstraints.length > 50) throw new SchemaOperationError('A table can have up to 50 multi-column foreign keys.');
  const foreignKeyKeys = new Set<string>();
  const normalizedForeignKeyConstraints = foreignKeyConstraints.map((constraint) => {
    if (engine !== 'postgres') throw new SchemaOperationError('Multi-column foreign keys are currently available for PostgreSQL tables.');
    if (!constraint || typeof constraint !== 'object' || !Array.isArray(constraint.columns) || !constraint.reference || typeof constraint.reference !== 'object') throw new SchemaOperationError('Each multi-column foreign key needs source and target columns.');
    if (constraint.columns.length < 2 || constraint.columns.length > 50 || !Array.isArray(constraint.reference.columns) || constraint.reference.columns.length !== constraint.columns.length) throw new SchemaOperationError('Choose matching source and referenced column lists with at least two columns.');
    const members = constraint.columns.map((member) => validateIdentifier(member, 'Foreign-key source column', engine));
    const targetColumns = constraint.reference.columns.map((member) => validateIdentifier(member, 'Referenced column', engine));
    if (new Set(members).size !== members.length || new Set(targetColumns).size !== targetColumns.length) throw new SchemaOperationError('A multi-column foreign key cannot list a column more than once.');
    for (const member of members) if (!columns.some((column) => column.name === member)) throw new SchemaOperationError(`Foreign-key source column “${member}” does not exist in this table.`);
    const onDelete = constraint.reference.onDelete;
    const onUpdate = constraint.reference.onUpdate;
    if (!['no action', 'restrict', 'cascade', 'set null', 'set default'].includes(onDelete) || !['no action', 'restrict', 'cascade', 'set null', 'set default'].includes(onUpdate)) throw new SchemaOperationError('A multi-column foreign key has an unsupported action.');
    if ((onDelete === 'set null' || onUpdate === 'set null') && members.some((member) => !columns.find((column) => column.name === member)?.nullable)) throw new SchemaOperationError('Every source column must allow NULL when a multi-column foreign key uses SET NULL.');
    if ((onDelete === 'set default' || onUpdate === 'set default') && members.some((member) => !columns.find((column) => column.name === member)?.default)) throw new SchemaOperationError('Every source column needs a default when a multi-column foreign key uses SET DEFAULT.');
    const normalized = { columns: members, reference: { schema: validateIdentifier(constraint.reference.schema, 'Referenced schema', engine), table: validateIdentifier(constraint.reference.table, 'Referenced table', engine), columns: targetColumns, onDelete, onUpdate } };
    const key = JSON.stringify([normalized.columns, normalized.reference.schema, normalized.reference.table, normalized.reference.columns]);
    if (foreignKeyKeys.has(key)) throw new SchemaOperationError('The same multi-column foreign key cannot be added twice.');
    foreignKeyKeys.add(key);
    return normalized;
  });
  return { schema, table, columns, ...(normalizedUniqueConstraints.length ? { uniqueConstraints: normalizedUniqueConstraints } : {}), ...(normalizedForeignKeyConstraints.length ? { foreignKeyConstraints: normalizedForeignKeyConstraints } : {}) };
}

function quoteIdentifier(identifier: string, engine: DatabaseSession['engine']) {
  return engine === 'postgres' ? `"${identifier.replace(/"/g, '""')}"` : `\`${identifier.replace(/`/g, '``')}\``;
}

export function generateCreateTableSql(draft: CreateTableDraft, engine: DatabaseSession['engine']) {
  const tableName = `${quoteIdentifier(draft.schema, engine)}.${quoteIdentifier(draft.table, engine)}`;
  const definitions = draft.columns.map((column) => {
    const typeMap: Record<CreateTableColumnType, string> = { smallint: 'SMALLINT', integer: 'INTEGER', bigint: 'BIGINT', varchar: `VARCHAR(${column.length})`, text: 'TEXT', boolean: 'BOOLEAN', timestamp: 'TIMESTAMP', timestamptz: 'TIMESTAMPTZ', date: 'DATE', time: 'TIME', timetz: 'TIMETZ', decimal: `DECIMAL(${column.precision}, ${column.scale})`, real: 'REAL', double_precision: 'DOUBLE PRECISION', uuid: 'UUID', jsonb: 'JSONB', bytea: 'BYTEA' };
    let definition = `  ${quoteIdentifier(column.name, engine)} ${typeMap[column.type]}`;
    if (column.identity) definition += ` GENERATED ${column.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
    if (column.default) {
      let value: string;
      if (column.default.kind === 'current_timestamp') value = 'CURRENT_TIMESTAMP';
      else if (column.default.kind === 'current_date') value = 'CURRENT_DATE';
      else if (column.default.kind === 'gen_random_uuid') value = 'gen_random_uuid()';
      else if (['smallint', 'integer', 'bigint', 'decimal', 'real', 'double_precision', 'boolean'].includes(column.type)) value = column.default.value;
      else if (column.type === 'bytea') value = `'${column.default.value.replace(/'/g, "''")}'::BYTEA`;
      else value = `'${(column.type === 'jsonb' ? JSON.stringify(JSON.parse(column.default.value)) : column.default.value).replace(/'/g, "''")}'${column.type === 'jsonb' ? '::JSONB' : ''}`;
      definition += ` DEFAULT ${value}`;
    }
    if (!column.nullable) definition += ' NOT NULL';
    if (column.unique) definition += ' UNIQUE';
    return definition;
  });
  const primaryKey = draft.columns.filter((column) => column.primaryKey);
  if (primaryKey.length) definitions.push(`  PRIMARY KEY (${primaryKey.map((column) => quoteIdentifier(column.name, engine)).join(', ')})`);
  for (const column of draft.columns) if (column.reference) {
    const reference = column.reference;
    definitions.push(`  FOREIGN KEY (${quoteIdentifier(column.name, engine)}) REFERENCES ${quoteIdentifier(reference.schema, engine)}.${quoteIdentifier(reference.table, engine)} (${quoteIdentifier(reference.column, engine)}) ON DELETE ${reference.onDelete.toUpperCase()} ON UPDATE ${reference.onUpdate.toUpperCase()}`);
  }
  for (const constraint of draft.foreignKeyConstraints ?? []) {
    const reference = constraint.reference;
    definitions.push(`  FOREIGN KEY (${constraint.columns.map((name) => quoteIdentifier(name, engine)).join(', ')}) REFERENCES ${quoteIdentifier(reference.schema, engine)}.${quoteIdentifier(reference.table, engine)} (${reference.columns.map((name) => quoteIdentifier(name, engine)).join(', ')}) ON DELETE ${reference.onDelete.toUpperCase()} ON UPDATE ${reference.onUpdate.toUpperCase()}`);
  }
  for (const column of draft.columns) if (column.checks) {
    const quoted = quoteIdentifier(column.name, engine);
    const predicates = [
      ...(column.checks.minimum !== undefined ? [`${quoted} >= ${column.checks.minimum}`] : []),
      ...(column.checks.maximum !== undefined ? [`${quoted} <= ${column.checks.maximum}`] : []),
      ...(column.checks.minLength !== undefined ? [`char_length(${quoted}) >= ${column.checks.minLength}`] : []),
      ...(column.checks.maxLength !== undefined ? [`char_length(${quoted}) <= ${column.checks.maxLength}`] : []),
      ...(column.checks.allowedValues ? [`${quoted} IN (${column.checks.allowedValues.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ')})`] : []),
    ];
    if (predicates.length) definitions.push(`  CHECK (${predicates.join(' AND ')})`);
  }
  for (const group of draft.uniqueConstraints ?? []) definitions.push(`  UNIQUE (${group.map((name) => quoteIdentifier(name, engine)).join(', ')})`);
  return `CREATE TABLE ${tableName} (\n${definitions.join(',\n')}\n);`;
}

async function assertTargetAvailable(session: DatabaseSession, schema: string, table: string) {
  if (session.engine === 'postgres') {
    const schemaResult = await session.pool.query<{ exists: boolean; can_create: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists, has_schema_privilege($1, \'CREATE\') AS can_create', [schema],
    );
    if (!schemaResult.rows[0]?.exists) throw new SchemaOperationError(`Schema “${schema}” does not exist.`, 422);
    if (!schemaResult.rows[0]?.can_create) throw new SchemaOperationError(`The current database user cannot create tables in schema “${schema}”.`, 403);
    const tableResult = await session.pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS exists', [schema, table],
    );
    if (tableResult.rows[0]?.exists) throw new SchemaOperationError(`Table “${schema}.${table}” already exists.`, 409);
    return;
  }
  if (schema !== session.database) throw new SchemaOperationError('MySQL table creation is limited to the connected database.', 400);
  const result = await session.pool.query('SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [schema, table]);
  if ((result[0] as unknown[]).length) throw new SchemaOperationError(`Table “${schema}.${table}” already exists.`, 409);
}

async function assertForeignKeyTargetsExist(session: DatabaseSession, draft: CreateTableDraft) {
  if (session.engine !== 'postgres') return;
  for (const column of draft.columns) {
    const reference = column.reference;
    if (!reference) continue;
    if (reference.schema === draft.schema && reference.table === draft.table) {
      const target = draft.columns.find((candidate) => candidate.name === reference.column);
      if (target && (target.primaryKey || target.unique)) continue;
      throw new SchemaOperationError(`The referenced column “${reference.column}” must be a primary key or unique column.`, 422);
    }
    const result = await session.pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        JOIN pg_catalog.pg_constraint con ON con.conrelid = c.oid AND con.contype IN ('p', 'u')
          AND con.conkey = ARRAY[a.attnum]::smallint[]
        WHERE n.nspname = $1 AND c.relname = $2 AND a.attname = $3
      ) AS exists
    `, [reference.schema, reference.table, reference.column]);
    if (!result.rows[0]?.exists) throw new SchemaOperationError(`Choose a primary key or unique column for the relationship target “${reference.schema}.${reference.table}.${reference.column}”.`, 422);
  }
  for (const constraint of draft.foreignKeyConstraints ?? []) {
    const { schema, table, columns } = constraint.reference;
    if (schema === draft.schema && table === draft.table) {
      const primary = draft.columns.filter((column) => column.primaryKey).map((column) => column.name);
      const unique = [...draft.columns.filter((column) => column.unique).map((column) => [column.name]), ...(draft.uniqueConstraints ?? [])];
      if (![primary, ...unique].some((key) => key.length === columns.length && key.every((name, index) => name === columns[index]))) throw new SchemaOperationError('The self-referenced columns must match a primary key or unique key in the same order.', 422);
      continue;
    }
    const result = await session.pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS member(attnum, position)
        JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = member.attnum
        WHERE con.contype IN ('p', 'u') AND n.nspname = $1 AND c.relname = $2
        GROUP BY con.oid
        HAVING array_agg(a.attname::text ORDER BY member.position) = $3::text[]
      ) AS exists
    `, [schema, table, columns]);
    if (!result.rows[0]?.exists) throw new SchemaOperationError(`Choose a primary key or unique key matching the referenced columns on “${schema}.${table}”.`, 422);
  }
}

function prunePlans() {
  const now = Date.now();
  for (const [id, plan] of plans) if (plan.expiresAt <= now) plans.delete(id);
  while (plans.size >= MAX_PLANS) plans.delete(plans.keys().next().value!);
}

export async function previewCreateTable(session: DatabaseSession, connectionId: string, input: CreateTableDraft): Promise<CreateTablePlan> {
  const draft = validateCreateTableDraft(input, session.engine);
  await assertTargetAvailable(session, draft.schema, draft.table);
  await assertForeignKeyTargetsExist(session, draft);
  await validatePostgresValues(session, draft);
  const sql = generateCreateTableSql(draft, session.engine);
  await validatePostgresCreateStatement(session, sql);
  prunePlans();
  const planId = randomBytes(32).toString('hex');
  plans.set(planId, { connectionId, engine: session.engine, sql, schema: draft.schema, table: draft.table, expiresAt: Date.now() + PLAN_TTL_MS, action: 'create-table' });
  return { planId, sql, expiresInSeconds: PLAN_TTL_MS / 1000 };
}

async function validatePostgresValues(session: DatabaseSession, draft: CreateTableDraft) {
  if (session.engine !== 'postgres') return;
  for (const column of draft.columns) {
    const sqlType = column.type === 'varchar' ? `VARCHAR(${column.length})` : column.type === 'decimal' ? `DECIMAL(${column.precision}, ${column.scale})` : column.type === 'double_precision' ? 'DOUBLE PRECISION' : column.type.toUpperCase();
    const values: Array<{ label: string; value: string }> = [];
    if (column.default?.kind === 'literal') values.push({ label: `Default for “${column.name}”`, value: column.default.value });
    if (column.checks?.minimum !== undefined) values.push({ label: `Minimum for “${column.name}”`, value: column.checks.minimum });
    if (column.checks?.maximum !== undefined) values.push({ label: `Maximum for “${column.name}”`, value: column.checks.maximum });
    for (const entry of values) {
      try { await session.pool.query(`SELECT $1::${sqlType} AS value`, [entry.value]); }
      catch { throw new SchemaOperationError(`${entry.label} is not a valid ${column.type === 'double_precision' ? 'double precision' : column.type} value.`); }
    }
  }
}

/** Ask PostgreSQL to parse and apply the exact DDL inside a transaction, then roll it back. */
async function validatePostgresCreateStatement(session: DatabaseSession, sql: string) {
  if (session.engine !== 'postgres') return;
  const client = await session.pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(sql);
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n', 1)[0]?.slice(0, 300) : '';
    throw new SchemaOperationError(detail ? `PostgreSQL cannot create this table yet: ${detail}` : 'PostgreSQL cannot create this table definition yet.');
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

type SqlToken = { kind: 'word' | 'identifier' | 'number' | 'string' | 'punctuation'; value: string };
function tokenizeAddColumnSql(source: string, engine: DatabaseSession['engine']): SqlToken[] {
  if (typeof source !== 'string' || source.length < 1 || source.length > 5_000) throw new SchemaOperationError('Enter one ALTER TABLE statement under 5,000 characters.');
  const tokens: SqlToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) { index += 1; continue; }
    if (source.startsWith('--', index) || (engine === 'mysql' && char === '#')) {
      const end = source.indexOf('\n', index + (char === '#' ? 1 : 2)); index = end < 0 ? source.length : end + 1; continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new SchemaOperationError('The SQL contains an unfinished comment.');
      index = end + 2; continue;
    }
    const quote = engine === 'postgres' ? '"' : '`';
    if (char === quote) {
      index += 1; let value = '';
      while (index < source.length) {
        if (source[index] === quote) {
          if (source[index + 1] === quote) { value += quote; index += 2; continue; }
          index += 1; break;
        }
        value += source[index]!; index += 1;
      }
      if (source[index - 1] !== quote || !value) throw new SchemaOperationError('The SQL contains an invalid quoted identifier.');
      tokens.push({ kind: 'identifier', value }); continue;
    }
    if (char === "'") {
      index += 1; let value = ''; let closed = false;
      while (index < source.length) {
        if (source[index] === "'") { if (source[index + 1] === "'") { value += "'"; index += 2; continue; } index += 1; closed = true; break; }
        value += source[index++]!;
      }
      if (!closed) throw new SchemaOperationError('The SQL contains an unfinished string value.');
      tokens.push({ kind: 'string', value }); continue;
    }
    if (char === '"' || char === '`') throw new SchemaOperationError('Use double quotes only for column and table identifiers.');
    const word = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) { tokens.push({ kind: 'word', value: word }); index += word.length; continue; }
    const number = source.slice(index).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
    if (number) { tokens.push({ kind: 'number', value: number }); index += number.length; continue; }
    if ('.(),;'.includes(char)) { tokens.push({ kind: 'punctuation', value: char }); index += 1; continue; }
    throw new SchemaOperationError('This ALTER TABLE statement contains unsupported syntax.');
  }
  if (tokens.at(-1)?.value === ';') tokens.pop();
  if (tokens.some((token) => token.value === ';')) throw new SchemaOperationError('Run one statement at a time.');
  return tokens;
}

export function parseAddColumnSql(source: string, engine: DatabaseSession['engine']) {
  const tokens = tokenizeAddColumnSql(source, engine);
  let index = 0;
  const readWord = (expected: string) => {
    const token = tokens[index++];
    if (token?.kind !== 'word' || token.value.toUpperCase() !== expected) throw new SchemaOperationError(`This workflow supports ALTER TABLE … ADD COLUMN only (expected ${expected}).`);
  };
  const readIdentifier = (label: string) => {
    const token = tokens[index++];
    if (token?.kind !== 'word' && token?.kind !== 'identifier') throw new SchemaOperationError(`Provide a ${label} identifier.`);
    return validateIdentifier(token.kind === 'word' && engine === 'postgres' ? token.value.toLowerCase() : token.value, label, engine);
  };
  const readNumber = (label: string) => {
    const token = tokens[index++];
    if (token?.kind !== 'number') throw new SchemaOperationError(`Provide a numeric ${label}.`);
    return Number(token.value);
  };
  readWord('ALTER'); readWord('TABLE');
  const schema = readIdentifier('schema');
  if (tokens[index++]?.value !== '.') throw new SchemaOperationError('Qualify the table as schema.table.');
  const table = readIdentifier('table');
  readWord('ADD');
  if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'COLUMN') index += 1;
  const columnName = readIdentifier('column');
  const typeToken = tokens[index++];
  if (typeToken?.kind !== 'word') throw new SchemaOperationError('Use a supported column type: INTEGER, BIGINT, VARCHAR, TEXT, BOOLEAN, TIMESTAMP, or DECIMAL.');
  const typeName = typeToken.value.toUpperCase();
  let type: string;
  if (typeName === 'INTEGER' || typeName === 'INT') type = 'INTEGER';
  else if (typeName === 'BIGINT' || typeName === 'TEXT' || typeName === 'BOOLEAN' || typeName === 'TIMESTAMP') type = typeName;
  else if (typeName === 'VARCHAR') {
    if (tokens[index++]?.value !== '(') throw new SchemaOperationError('VARCHAR requires a length from 1 to 255.');
    const length = readNumber('VARCHAR length');
    if (tokens[index++]?.value !== ')' || length < 1 || length > 255) throw new SchemaOperationError('VARCHAR requires a length from 1 to 255.');
    type = `VARCHAR(${length})`;
  } else if (typeName === 'DECIMAL' || typeName === 'NUMERIC') {
    if (tokens[index++]?.value !== '(') throw new SchemaOperationError('DECIMAL requires precision and scale.');
    const precision = readNumber('DECIMAL precision');
    if (tokens[index++]?.value !== ',') throw new SchemaOperationError('DECIMAL requires precision and scale.');
    const scale = readNumber('DECIMAL scale');
    if (tokens[index++]?.value !== ')' || precision < 1 || precision > 38 || scale > precision) throw new SchemaOperationError('DECIMAL precision must be 1–38 and scale 0–precision.');
    type = `DECIMAL(${precision}, ${scale})`;
  } else throw new SchemaOperationError('This workflow supports INTEGER, BIGINT, VARCHAR, TEXT, BOOLEAN, TIMESTAMP, and DECIMAL columns.');
  let nullable = true;
  if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'NOT') { index += 1; readWord('NULL'); nullable = false; }
  else if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'NULL') index += 1;
  if (tokens.slice(index).some((token) => token.kind === 'string')) throw new SchemaOperationError('This ADD COLUMN workflow does not accept quoted defaults.');
  if (index !== tokens.length) throw new SchemaOperationError('Only a single ADD COLUMN clause with an optional NULL or NOT NULL modifier is supported.');
  const sql = `ALTER TABLE ${quoteIdentifier(schema, engine)}.${quoteIdentifier(table, engine)} ADD COLUMN ${quoteIdentifier(columnName, engine)} ${type}${nullable ? '' : ' NOT NULL'};`;
  return { schema, table, columnName, sql };
}

// Existing-column edits are intentionally limited to nullability. Defaults are
// handled separately once typed default editing has a dedicated UI.
export function parseSetNullableColumnSql(source: string, engine: DatabaseSession['engine']) {
  if (engine !== 'postgres') throw new SchemaOperationError('Editing existing columns is currently available for PostgreSQL only.');
  const tokens = tokenizeAddColumnSql(source, engine); let index = 0;
  const word = (expected: string) => { const token = tokens[index++]; if (token?.kind !== 'word' || token.value.toUpperCase() !== expected) throw new SchemaOperationError('This workflow supports ALTER TABLE … ALTER COLUMN … SET/DROP NOT NULL only.'); };
  const ident = (label: string) => { const token = tokens[index++]; if (token?.kind !== 'word' && token?.kind !== 'identifier') throw new SchemaOperationError(`Provide a ${label} identifier.`); return validateIdentifier(token.kind === 'word' ? token.value.toLowerCase() : token.value, label, engine); };
  word('ALTER'); word('TABLE'); const schema = ident('schema'); if (tokens[index++]?.value !== '.') throw new SchemaOperationError('Qualify the table as schema.table.'); const table = ident('table'); word('ALTER'); if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'COLUMN') index++; const columnName = ident('column');
  let clause: string;
  if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'SET') {
    index++;
    if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'NOT') { index++; word('NULL'); clause = 'SET NOT NULL'; }
    else if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'DEFAULT') {
      index++; const token = tokens[index++]; let expression: string;
      if (token?.kind === 'string') expression = `'${token.value.replace(/'/g, "''")}'`;
      else if (token?.kind === 'number' && Number.isFinite(Number(token.value))) expression = token.value;
      else if (token?.kind === 'word' && ['TRUE', 'FALSE', 'CURRENT_TIMESTAMP', 'CURRENT_DATE'].includes(token.value.toUpperCase())) expression = token.value.toUpperCase();
      else if (token?.kind === 'word' && token.value.toUpperCase() === 'GEN_RANDOM_UUID' && tokens[index++]?.value === '(' && tokens[index++]?.value === ')') expression = 'gen_random_uuid()';
      else throw new SchemaOperationError('Defaults support a quoted string, finite number, TRUE/FALSE, CURRENT_TIMESTAMP, CURRENT_DATE, or gen_random_uuid().');
      clause = `SET DEFAULT ${expression}`;
    } else throw new SchemaOperationError('Choose SET NOT NULL or SET DEFAULT with a supported value.');
  } else if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'DROP') {
    index++;
    if (tokens[index]?.kind === 'word' && tokens[index]?.value.toUpperCase() === 'NOT') { index++; word('NULL'); clause = 'DROP NOT NULL'; }
    else { word('DEFAULT'); clause = 'DROP DEFAULT'; }
  } else throw new SchemaOperationError('Choose SET/DROP NOT NULL or SET/DROP DEFAULT.');
  if (index !== tokens.length) throw new SchemaOperationError('Only one nullability or default change is supported at a time.');
  return { schema, table, columnName, sql: `ALTER TABLE ${quoteIdentifier(schema, engine)}.${quoteIdentifier(table, engine)} ALTER COLUMN ${quoteIdentifier(columnName, engine)} ${clause};` };
}

async function assertColumnCanBeAdded(session: DatabaseSession, schema: string, table: string, column: string) {
  if (session.engine === 'postgres') {
    const tableResult = await session.pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 AND table_type = \'BASE TABLE\') AS exists', [schema, table],
    );
    if (!tableResult.rows[0]?.exists) throw new SchemaOperationError(`Table “${schema}.${table}” does not exist or is not visible.`, 404);
    const columnResult = await session.pool.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS exists', [schema, table, column],
    );
    if (columnResult.rows[0]?.exists) throw new SchemaOperationError(`Column “${column}” already exists on “${schema}.${table}”.`, 409);
    return;
  }
  if (schema !== session.database) throw new SchemaOperationError('MySQL table changes are limited to the connected database.', 400);
  const [tables] = await session.pool.query('SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = \'BASE TABLE\'', [schema, table]);
  if (!(tables as unknown[]).length) throw new SchemaOperationError(`Table “${schema}.${table}” does not exist or is not visible.`, 404);
  const [columns] = await session.pool.query('SELECT COLUMN_NAME FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [schema, table, column]);
  if ((columns as unknown[]).length) throw new SchemaOperationError(`Column “${column}” already exists on “${schema}.${table}”.`, 409);
}

async function assertExistingColumn(session: DatabaseSession, schema: string, table: string, column: string) {
  if (session.engine !== 'postgres') throw new SchemaOperationError('Editing existing columns is currently available for PostgreSQL only.');
  const result = await session.pool.query<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM information_schema.columns c JOIN information_schema.tables t USING (table_catalog, table_schema, table_name) WHERE c.table_schema = $1 AND c.table_name = $2 AND c.column_name = $3 AND t.table_type = \'BASE TABLE\') AS exists', [schema, table, column],
  );
  if (!result.rows[0]?.exists) throw new SchemaOperationError(`Column “${column}” does not exist on “${schema}.${table}”.`, 404);
}

export async function previewAddColumn(session: DatabaseSession, connectionId: string, source: string): Promise<CreateTablePlan> {
  const parsed = parseAddColumnSql(source, session.engine);
  await assertColumnCanBeAdded(session, parsed.schema, parsed.table, parsed.columnName);
  prunePlans();
  const planId = randomBytes(32).toString('hex');
  plans.set(planId, { connectionId, engine: session.engine, sql: parsed.sql, schema: parsed.schema, table: parsed.table, columnName: parsed.columnName, expiresAt: Date.now() + PLAN_TTL_MS, action: 'add-column' });
  return { planId, sql: parsed.sql, expiresInSeconds: PLAN_TTL_MS / 1000 };
}

export async function previewSetNullableColumn(session: DatabaseSession, connectionId: string, source: string): Promise<CreateTablePlan> {
  const parsed = parseSetNullableColumnSql(source, session.engine);
  await assertExistingColumn(session, parsed.schema, parsed.table, parsed.columnName);
  prunePlans(); const planId = randomBytes(32).toString('hex');
  plans.set(planId, { connectionId, engine: session.engine, sql: parsed.sql, schema: parsed.schema, table: parsed.table, columnName: parsed.columnName, expiresAt: Date.now() + PLAN_TTL_MS, action: 'alter-column' });
  return { planId, sql: parsed.sql, expiresInSeconds: PLAN_TTL_MS / 1000 };
}

export type ForeignKeyDraft = { sourceSchema: string; sourceTable: string; sourceColumn: string; targetSchema: string; targetTable: string; targetColumn: string; onDelete: CreateTableReference['onDelete']; onUpdate: CreateTableReference['onUpdate'] };
export async function previewForeignKey(session: DatabaseSession, connectionId: string, input: ForeignKeyDraft): Promise<CreateTablePlan> {
  if (session.engine !== 'postgres') throw new SchemaOperationError('Creating relationships from the schema map is currently available for PostgreSQL only.');
  if (!input || typeof input !== 'object' || !['no action', 'restrict', 'cascade', 'set null', 'set default'].includes(input.onDelete) || !['no action', 'restrict', 'cascade', 'set null', 'set default'].includes(input.onUpdate)) throw new SchemaOperationError('Choose valid actions for the new relationship.');
  const sourceSchema = validateIdentifier(input.sourceSchema, 'Source schema', 'postgres'); const sourceTable = validateIdentifier(input.sourceTable, 'Source table', 'postgres'); const sourceColumn = validateIdentifier(input.sourceColumn, 'Source column', 'postgres');
  const targetSchema = validateIdentifier(input.targetSchema, 'Referenced schema', 'postgres'); const targetTable = validateIdentifier(input.targetTable, 'Referenced table', 'postgres'); const targetColumn = validateIdentifier(input.targetColumn, 'Referenced column', 'postgres');
  const result = await session.pool.query<{ source_type: string; target_type: string; nullable: boolean; has_default: boolean; target_key: boolean; exists: boolean }>(`SELECT sc.udt_name AS source_type, tc.udt_name AS target_type, sc.is_nullable = 'YES' AS nullable, sc.column_default IS NOT NULL AS has_default,
    EXISTS (SELECT 1 FROM information_schema.key_column_usage k JOIN information_schema.table_constraints c USING (constraint_catalog, constraint_schema, constraint_name, table_schema, table_name) WHERE k.table_schema = tc.table_schema AND k.table_name = tc.table_name AND k.column_name = tc.column_name AND c.constraint_type IN ('PRIMARY KEY','UNIQUE') AND (SELECT count(*) FROM information_schema.key_column_usage members WHERE members.constraint_catalog = k.constraint_catalog AND members.constraint_schema = k.constraint_schema AND members.constraint_name = k.constraint_name AND members.table_schema = k.table_schema AND members.table_name = k.table_name) = 1) AS target_key,
    EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = sc.table_schema AND t.table_name = sc.table_name AND t.table_type = 'BASE TABLE') AND EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = tc.table_schema AND t.table_name = tc.table_name AND t.table_type = 'BASE TABLE') AS exists
    FROM information_schema.columns sc JOIN information_schema.columns tc ON tc.table_schema = $4 AND tc.table_name = $5 AND tc.column_name = $6
    WHERE sc.table_schema = $1 AND sc.table_name = $2 AND sc.column_name = $3`, [sourceSchema, sourceTable, sourceColumn, targetSchema, targetTable, targetColumn]);
  const pair = result.rows[0];
  if (!pair?.exists) throw new SchemaOperationError('Choose existing columns on visible tables.', 404);
  if (!pair.target_key) throw new SchemaOperationError('The referenced column must be a primary key or have a unique constraint.', 422);
  if (pair.source_type !== pair.target_type) throw new SchemaOperationError('The source and referenced columns must use matching PostgreSQL types.', 422);
  if ((input.onDelete === 'set null' || input.onUpdate === 'set null') && !pair.nullable) throw new SchemaOperationError('The source column must allow NULL when using SET NULL.', 422);
  if ((input.onDelete === 'set default' || input.onUpdate === 'set default') && !pair.has_default) throw new SchemaOperationError('The source column needs a default when using SET DEFAULT.', 422);
  const existing = await session.pool.query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM information_schema.referential_constraints rc JOIN information_schema.key_column_usage k ON k.constraint_catalog = rc.constraint_catalog AND k.constraint_schema = rc.constraint_schema AND k.constraint_name = rc.constraint_name WHERE k.table_schema = $1 AND k.table_name = $2 AND k.column_name = $3 AND rc.unique_constraint_schema = $4 AND rc.unique_constraint_name IN (SELECT c.constraint_name FROM information_schema.table_constraints c JOIN information_schema.key_column_usage k2 USING (constraint_catalog, constraint_schema, constraint_name, table_schema, table_name) WHERE c.table_schema = $4 AND c.table_name = $5 AND k2.column_name = $6)) AS exists', [sourceSchema, sourceTable, sourceColumn, targetSchema, targetTable, targetColumn]);
  if (existing.rows[0]?.exists) throw new SchemaOperationError('These columns already have a foreign-key relationship.', 409);
  const constraintName = `dbflow_fk_${randomBytes(8).toString('hex')}`;
  const sql = `ALTER TABLE ${quoteIdentifier(sourceSchema, 'postgres')}.${quoteIdentifier(sourceTable, 'postgres')} ADD CONSTRAINT ${quoteIdentifier(constraintName, 'postgres')} FOREIGN KEY (${quoteIdentifier(sourceColumn, 'postgres')}) REFERENCES ${quoteIdentifier(targetSchema, 'postgres')}.${quoteIdentifier(targetTable, 'postgres')} (${quoteIdentifier(targetColumn, 'postgres')}) ON DELETE ${input.onDelete.toUpperCase()} ON UPDATE ${input.onUpdate.toUpperCase()};`;
  prunePlans(); const planId = randomBytes(32).toString('hex');
  plans.set(planId, { connectionId, engine: session.engine, sql, schema: sourceSchema, table: sourceTable, columnName: sourceColumn, expiresAt: Date.now() + PLAN_TTL_MS, action: 'add-foreign-key' });
  return { planId, sql, expiresInSeconds: PLAN_TTL_MS / 1000 };
}

export type DropTableDependency = { schema: string; table: string; constraint: string; columns: string[]; referencedColumns: string[] };
async function inspectTableDrop(session: DatabaseSession, schema: string, table: string) {
  if (session.engine !== 'postgres') throw new SchemaOperationError('Table deletion is currently available for PostgreSQL only.');
  const tableResult = await session.pool.query<{ exists: boolean; can_drop: boolean }>(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE') AS exists, COALESCE((SELECT current_setting('is_superuser') = 'on' OR pg_has_role(c.relowner, 'USAGE') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p')), false) AS can_drop`, [schema, table]);
  const permissions = tableResult.rows[0];
  if (!permissions?.exists) throw new SchemaOperationError(`Table “${schema}.${table}” does not exist or is not visible.`, 404);
  if (!permissions.can_drop) throw new SchemaOperationError(`The current database user cannot drop “${schema}.${table}”.`, 403);
  const dependencyRows = await session.pool.query<{ table_schema: string; table_name: string; constraint_name: string; column_name: string; referenced_column_name: string }>(`SELECT source_ns.nspname AS table_schema, source_table.relname AS table_name, fk.conname AS constraint_name, source_column.attname AS column_name, referenced_column.attname AS referenced_column_name
    FROM pg_constraint fk
    JOIN pg_class source_table ON source_table.oid = fk.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
    JOIN pg_class referenced_table ON referenced_table.oid = fk.confrelid
    JOIN pg_namespace referenced_ns ON referenced_ns.oid = referenced_table.relnamespace
    JOIN LATERAL unnest(fk.conkey) WITH ORDINALITY AS source_key(attnum, position) ON true
    JOIN pg_attribute source_column ON source_column.attrelid = source_table.oid AND source_column.attnum = source_key.attnum
    JOIN LATERAL unnest(fk.confkey) WITH ORDINALITY AS referenced_key(attnum, position) ON referenced_key.position = source_key.position
    JOIN pg_attribute referenced_column ON referenced_column.attrelid = referenced_table.oid AND referenced_column.attnum = referenced_key.attnum
    WHERE fk.contype = 'f' AND referenced_ns.nspname = $1 AND referenced_table.relname = $2
    ORDER BY source_ns.nspname, source_table.relname, fk.conname, source_key.position`, [schema, table]);
  const grouped = new Map<string, DropTableDependency>();
  for (const row of dependencyRows.rows) {
    const key = JSON.stringify([row.table_schema, row.table_name, row.constraint_name]);
    const entry = grouped.get(key) ?? { schema: row.table_schema, table: row.table_name, constraint: row.constraint_name, columns: [], referencedColumns: [] };
    entry.columns.push(row.column_name); entry.referencedColumns.push(row.referenced_column_name); grouped.set(key, entry);
  }
  return [...grouped.values()];
}

export async function previewDropTable(session: DatabaseSession, connectionId: string, schemaInput: string, tableInput: string, behavior: DropTableBehavior) {
  if (session.engine !== 'postgres') throw new SchemaOperationError('Table deletion is currently available for PostgreSQL only.');
  if (!['restrict', 'drop-constraints', 'cascade'].includes(behavior)) throw new SchemaOperationError('Choose RESTRICT, remove foreign-key constraints, or CASCADE.');
  const schema = validateIdentifier(schemaInput, 'Schema name', 'postgres'); const table = validateIdentifier(tableInput, 'Table name', 'postgres');
  const dependencies = await inspectTableDrop(session, schema, table);
  const tableSql = `${quoteIdentifier(schema, 'postgres')}.${quoteIdentifier(table, 'postgres')}`;
  const dropTableSql = `DROP TABLE ${tableSql} ${behavior === 'cascade' ? 'CASCADE' : 'RESTRICT'};`;
  const dependencySql = behavior === 'drop-constraints' ? dependencies.map((dependency) => `ALTER TABLE ${quoteIdentifier(dependency.schema, 'postgres')}.${quoteIdentifier(dependency.table, 'postgres')} DROP CONSTRAINT ${quoteIdentifier(dependency.constraint, 'postgres')};`).join('\n') : '';
  const sql = dependencySql ? `${dependencySql}\n${dropTableSql}` : dropTableSql;
  prunePlans(); const planId = randomBytes(32).toString('hex');
  plans.set(planId, { connectionId, engine: session.engine, sql, schema, table, expiresAt: Date.now() + PLAN_TTL_MS, action: 'drop-table', dropBehavior: behavior, dependencySignature: JSON.stringify(dependencies) });
  return { planId, sql, expiresInSeconds: PLAN_TTL_MS / 1000, dependencies, canApply: behavior !== 'restrict' || dependencies.length === 0 };
}

async function executePlan(session: DatabaseSession, connectionId: string, planId: string, expectedAction: SchemaPlan['action']) {
  const plan = plans.get(planId);
  if (!plan || plan.expiresAt <= Date.now()) { plans.delete(planId); throw new SchemaOperationError('This SQL preview expired. Generate a new preview before creating the table.', 409); }
  if (plan.connectionId !== connectionId || plan.engine !== session.engine) throw new SchemaOperationError('This SQL preview belongs to a different database session.', 409);
  if (plan.action !== expectedAction) throw new SchemaOperationError('This SQL preview is for a different schema operation.', 409);
  plans.delete(planId);
  if (plan.action === 'create-table') await assertTargetAvailable(session, plan.schema, plan.table);
  else if (plan.action === 'add-column') await assertColumnCanBeAdded(session, plan.schema, plan.table, plan.columnName!);
  else if (plan.action === 'alter-column') await assertExistingColumn(session, plan.schema, plan.table, plan.columnName!);
  else if (plan.action === 'drop-table') {
    const dependencies = await inspectTableDrop(session, plan.schema, plan.table);
    if (JSON.stringify(dependencies) !== plan.dependencySignature) throw new SchemaOperationError('The table dependencies changed after review. Generate a new deletion preview.', 409);
    if (plan.dropBehavior === 'restrict' && dependencies.length) throw new SchemaOperationError('Other tables reference this table. Choose another dependency behavior.', 409);
  }
  else await assertExistingColumn(session, plan.schema, plan.table, plan.columnName!);
  if (session.engine === 'postgres') {
    const client = await session.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(plan.sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  } else {
    await session.pool.query({ sql: plan.sql, timeout: 8_000 });
  }
  return { success: true as const, sql: plan.sql, database: session.database, schema: plan.schema, table: plan.table, ...(plan.columnName ? { column: plan.columnName } : {}) };
}

export async function executeCreateTable(session: DatabaseSession, connectionId: string, planId: string) {
  return executePlan(session, connectionId, planId, 'create-table');
}

export async function executeAddColumn(session: DatabaseSession, connectionId: string, planId: string) {
  return executePlan(session, connectionId, planId, 'add-column');
}

export async function executeSetNullableColumn(session: DatabaseSession, connectionId: string, planId: string) {
  return executePlan(session, connectionId, planId, 'alter-column');
}

export async function executeForeignKey(session: DatabaseSession, connectionId: string, planId: string) {
  return executePlan(session, connectionId, planId, 'add-foreign-key');
}

export async function executeDropTable(session: DatabaseSession, connectionId: string, planId: string) {
  return executePlan(session, connectionId, planId, 'drop-table');
}
