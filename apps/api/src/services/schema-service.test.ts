import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseSession } from './connection-service.js';
import { executeAddColumn, executeCreateTable, executeForeignKey, generateCreateTableSql, parseAddColumnSql, previewAddColumn, previewCreateTable, previewForeignKey, SchemaOperationError, validateCreateTableDraft, type CreateTableDraft } from './schema-service.js';

const base: CreateTableDraft = {
  schema: 'public', table: 'people', columns: [
    { name: 'id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'display_name', type: 'varchar', length: 120, nullable: false, primaryKey: false },
  ],
};

test('generates engine-specific quoted CREATE TABLE statements', () => {
  const postgres = generateCreateTableSql(base, 'postgres');
  assert.match(postgres, /CREATE TABLE "public"\."people"/);
  assert.match(postgres, /"display_name" VARCHAR\(120\) NOT NULL/);
  assert.match(postgres, /PRIMARY KEY \("id"\)/);
  const mysql = generateCreateTableSql(base, 'mysql');
  assert.match(mysql, /CREATE TABLE `public`\.`people`/);
  assert.match(mysql, /`id` INTEGER NOT NULL/);
});

test('quotes embedded identifier delimiters in generated SQL', () => {
  const draft = { ...base, table: 'peo"ple', schema: 'pub`lic' };
  assert.match(generateCreateTableSql(draft, 'postgres'), /"peo""ple"/);
  assert.match(generateCreateTableSql(draft, 'mysql'), /`pub``lic`/);
});

test('generates guided PostgreSQL identity, composite keys, defaults, uniqueness, and foreign keys', () => {
  const guided: CreateTableDraft = { schema: 'public', table: 'work_items', columns: [
    { name: 'workspace_id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'id', type: 'bigint', nullable: false, primaryKey: true, identity: 'always' },
    { name: 'slug', type: 'text', nullable: false, unique: true, primaryKey: false, default: { kind: 'literal', value: "owner's seed" } },
    { name: 'settings', type: 'jsonb', nullable: false, primaryKey: false, default: { kind: 'literal', value: '{"enabled":true}' } },
    { name: 'score', type: 'decimal', nullable: false, primaryKey: false, precision: 7, scale: 2, checks: { minimum: '0', maximum: '100' } },
    { name: 'label', type: 'text', nullable: true, primaryKey: false, checks: { minLength: 2, maxLength: 40 } },
    { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, default: { kind: 'current_timestamp' } },
    { name: 'record_id', type: 'integer', nullable: true, primaryKey: false, reference: { schema: 'public', table: 'records', column: 'id', onDelete: 'set null', onUpdate: 'cascade' } },
  ] };
  const sql = generateCreateTableSql(guided, 'postgres');
  assert.match(sql, /"id" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL/);
  assert.match(sql, /PRIMARY KEY \("workspace_id", "id"\)/);
  assert.match(sql, /"slug" TEXT DEFAULT 'owner''s seed' NOT NULL UNIQUE/);
  assert.match(sql, /"settings" JSONB DEFAULT '\{"enabled":true\}'::JSONB NOT NULL/);
  assert.match(sql, /CHECK \("score" >= 0 AND "score" <= 100\)/);
  assert.match(sql, /CHECK \(char_length\("label"\) >= 2 AND char_length\("label"\) <= 40\)/);
  assert.match(sql, /"created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL/);
  assert.match(sql, /FOREIGN KEY \("record_id"\) REFERENCES "public"\."records" \("id"\) ON DELETE SET NULL ON UPDATE CASCADE/);
  assert.deepEqual(validateCreateTableDraft(guided, 'postgres').columns[2]?.default, { kind: 'literal', value: "owner's seed" });
});

test('validates and generates table-level composite unique constraints', () => {
  const draft: CreateTableDraft = { ...base, uniqueConstraints: [['workspace_id', 'slug']], columns: [
    { name: 'workspace_id', type: 'integer', nullable: false, primaryKey: true },
    { name: 'slug', type: 'text', nullable: false, primaryKey: false },
  ] };
  assert.match(generateCreateTableSql(validateCreateTableDraft(draft, 'postgres'), 'postgres'), /UNIQUE \("workspace_id", "slug"\)/);
  assert.throws(() => validateCreateTableDraft({ ...draft, uniqueConstraints: [['missing', 'slug']] }, 'postgres'), /does not exist/);
  assert.throws(() => validateCreateTableDraft({ ...draft, uniqueConstraints: [['slug', 'slug']] }, 'postgres'), /more than once/);
  assert.throws(() => validateCreateTableDraft({ ...draft, uniqueConstraints: [['workspace_id', 'slug'], ['slug', 'workspace_id']] }, 'postgres'), /cannot be added twice/);
  assert.throws(() => validateCreateTableDraft({ ...draft, uniqueConstraints: [['workspace_id', 'slug']] }, 'mysql'), /currently available for PostgreSQL/);
});

test('validates and generates ordered composite foreign keys', () => {
  const draft: CreateTableDraft = { schema: 'public', table: 'child', columns: [
    { name: 'parent_tenant', type: 'integer', nullable: false, primaryKey: false },
    { name: 'parent_id', type: 'integer', nullable: false, primaryKey: false },
  ], foreignKeyConstraints: [{ columns: ['parent_tenant', 'parent_id'], reference: { schema: 'public', table: 'parents', columns: ['tenant_id', 'id'], onDelete: 'cascade', onUpdate: 'restrict' } }] };
  const normalized = validateCreateTableDraft(draft, 'postgres');
  assert.match(generateCreateTableSql(normalized, 'postgres'), /FOREIGN KEY \("parent_tenant", "parent_id"\) REFERENCES "public"\."parents" \("tenant_id", "id"\) ON DELETE CASCADE ON UPDATE RESTRICT/);
  assert.throws(() => validateCreateTableDraft({ ...draft, foreignKeyConstraints: [{ ...draft.foreignKeyConstraints![0]!, reference: { ...draft.foreignKeyConstraints![0]!.reference, columns: ['id'] } }] }, 'postgres'), /matching source and referenced/);
  assert.throws(() => validateCreateTableDraft({ ...draft, foreignKeyConstraints: [{ ...draft.foreignKeyConstraints![0]!, columns: ['parent_tenant', 'missing'] }] }, 'postgres'), /does not exist/);
  assert.throws(() => validateCreateTableDraft({ ...draft, foreignKeyConstraints: [{ ...draft.foreignKeyConstraints![0]!, columns: ['parent_tenant', 'parent_tenant'] }] }, 'postgres'), /more than once/);
  assert.throws(() => validateCreateTableDraft({ ...draft, foreignKeyConstraints: [{ ...draft.foreignKeyConstraints![0]!, reference: { ...draft.foreignKeyConstraints![0]!.reference, onDelete: 'set null' } }] }, 'postgres'), /Every source column must allow NULL/);
  assert.throws(() => validateCreateTableDraft(draft, 'mysql'), /currently available for PostgreSQL/);
});

test('generates safe allowed-value checks for text columns', () => {
  const draft: CreateTableDraft = { ...base, columns: [
    { name: 'state', type: 'text', nullable: false, primaryKey: false, checks: { allowedValues: ['draft', "owner's"] } },
  ] };
  assert.match(generateCreateTableSql(validateCreateTableDraft(draft, 'postgres'), 'postgres'), /CHECK \("state" IN \('draft', 'owner''s'\)\)/);
  assert.throws(() => validateCreateTableDraft({ ...draft, columns: [{ ...draft.columns[0]!, type: 'integer' }] }, 'postgres'), /need a text column/);
  assert.throws(() => validateCreateTableDraft({ ...draft, columns: [{ ...draft.columns[0]!, checks: { allowedValues: ['draft', 'draft'] } }] }, 'postgres'), /must be unique/);
});

test('rejects unsafe defaults, invalid identity settings, and inconsistent foreign-key actions', () => {
  const numeric: CreateTableDraft = { schema: 'public', table: 'bad_defaults', columns: [{ name: 'amount', type: 'decimal', nullable: false, primaryKey: false, precision: 10, scale: 2, default: { kind: 'literal', value: '0; DROP TABLE people' } }] };
  assert.throws(() => validateCreateTableDraft(numeric, 'postgres'), /numeric value/);
  const identityOnText: CreateTableDraft = { ...base, columns: [{ name: 'value', type: 'text', nullable: false, primaryKey: false, identity: 'always' }] };
  assert.throws(() => validateCreateTableDraft(identityOnText, 'postgres'), /Identity columns need/);
  const setNullOnRequired: CreateTableDraft = { ...base, columns: [{ name: 'record_id', type: 'integer', nullable: false, primaryKey: false, reference: { schema: 'public', table: 'records', column: 'id', onDelete: 'set null', onUpdate: 'no action' } }] };
  assert.throws(() => validateCreateTableDraft(setNullOnRequired, 'postgres'), /must allow NULL/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ name: 'settings', type: 'jsonb', nullable: true, primaryKey: false, default: { kind: 'literal', value: 'not-json' } }] }, 'postgres'), /valid JSON/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ name: 'score', type: 'decimal', nullable: true, primaryKey: false, checks: { minimum: '20', maximum: '10' } }] }, 'postgres'), /cannot be greater/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ name: 'settings', type: 'jsonb', nullable: true, primaryKey: false }] }, 'mysql'), /unsupported type/);
});

test('rejects invalid identifiers, duplicate columns, nullable keys, and invalid bounds', () => {
  assert.throws(() => validateCreateTableDraft({ ...base, table: '' }, 'postgres'), SchemaOperationError);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [base.columns[0]!, { ...base.columns[1]!, name: 'ID' }] }, 'postgres'), /duplicated/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ ...base.columns[0]!, nullable: true }] }, 'mysql'), /cannot be nullable/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ ...base.columns[1]!, length: 10_000_001 }] }, 'postgres'), /VARCHAR length/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ ...base.columns[1]!, length: 256 }] }, 'mysql'), /VARCHAR length/);
  assert.throws(() => validateCreateTableDraft({ ...base, columns: [{ name: 'amount', type: 'decimal', nullable: true, primaryKey: false, precision: 4, scale: 5 }] }, 'mysql'), /DECIMAL precision/);
});

function fakePostgresSession() {
  const executed: string[] = [];
  const pool = {
    query: async (sql: string) => ({ rows: sql.includes('information_schema.schemata') ? [{ exists: true, can_create: true }] : [{ exists: false }] }),
    connect: async () => ({ query: async (sql: string) => { executed.push(sql); return { rows: [] }; }, release: () => undefined }),
  };
  return { session: { engine: 'postgres', database: 'sample', pool } as unknown as DatabaseSession, executed };
}

test('previews and executes a reviewed foreign-key relationship with normalized identifiers', async () => {
  const statements: string[] = [];
  const pool = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('source_type')) return { rows: [{ source_type: 'int4', target_type: 'int4', nullable: true, has_default: false, target_key: true, exists: true }] };
      if (sql.includes('referential_constraints')) return { rows: [{ exists: false }] };
      if (sql.includes('information_schema.columns')) return { rows: [{ exists: true }] };
      return { rows: [] };
    },
    connect: async () => ({ query: async (sql: string) => { statements.push(sql); return { rows: [] }; }, release: () => undefined }),
  };
  const session = { engine: 'postgres', database: 'sample', pool } as unknown as DatabaseSession;
  const draft = { sourceSchema: 'public', sourceTable: 'child rows', sourceColumn: 'parent_id', targetSchema: 'public', targetTable: 'parent rows', targetColumn: 'id', onDelete: 'cascade' as const, onUpdate: 'restrict' as const };
  const plan = await previewForeignKey(session, 'f'.repeat(64), draft);
  assert.match(plan.sql, /FOREIGN KEY \("parent_id"\) REFERENCES "public"\."parent rows" \("id"\) ON DELETE CASCADE ON UPDATE RESTRICT/);
  await executeForeignKey(session, 'f'.repeat(64), plan.planId);
  assert.ok(statements.includes(plan.sql));
  assert.ok(statements.includes('COMMIT'));
  await assert.rejects(executeForeignKey(session, 'f'.repeat(64), plan.planId), /expired/);
});

test('previews are connection-bound and one-use', async () => {
  const { session, executed } = fakePostgresSession();
  const plan = await previewCreateTable(session, 'a'.repeat(64), base);
  assert.equal(plan.expiresInSeconds, 300);
  await assert.rejects(executeCreateTable(session, 'b'.repeat(64), plan.planId), /different database session/);
  await executeCreateTable(session, 'a'.repeat(64), plan.planId);
  assert.ok(executed.includes(plan.sql));
  await assert.rejects(executeCreateTable(session, 'a'.repeat(64), plan.planId), /expired/);
});

test('MySQL plans are restricted to the connected database and execute generated SQL', async () => {
  const calls: string[] = [];
  const pool = { query: async (sql: string | { sql: string }) => {
    const statement = typeof sql === 'string' ? sql : sql.sql;
    calls.push(statement);
    return [[], []];
  } };
  const session = { engine: 'mysql', database: 'sample', pool } as unknown as DatabaseSession;
  await assert.rejects(previewCreateTable(session, 'c'.repeat(64), { ...base, schema: 'other' }), /limited to the connected database/);
  const plan = await previewCreateTable(session, 'c'.repeat(64), { ...base, schema: 'sample' });
  await executeCreateTable(session, 'c'.repeat(64), plan.planId);
  assert.ok(calls.includes(plan.sql));
  assert.match(plan.sql, /CREATE TABLE `sample`\.`people`/);
});

test('parses only one safe ALTER TABLE ADD COLUMN operation for each engine', () => {
  const pg = parseAddColumnSql('ALTER TABLE public.accounts ADD COLUMN "display_name" VARCHAR(80) NOT NULL;', 'postgres');
  assert.deepEqual(pg, { schema: 'public', table: 'accounts', columnName: 'display_name', sql: 'ALTER TABLE "public"."accounts" ADD COLUMN "display_name" VARCHAR(80) NOT NULL;' });
  const mysql = parseAddColumnSql('ALTER TABLE `sample`.`accounts` ADD COLUMN created_at TIMESTAMP NULL;', 'mysql');
  assert.match(mysql.sql, /ALTER TABLE `sample`\.`accounts` ADD COLUMN `created_at` TIMESTAMP;/);
  assert.throws(() => parseAddColumnSql('DROP TABLE public.accounts', 'postgres'), /ALTER TABLE/);
  assert.throws(() => parseAddColumnSql('ALTER TABLE public.accounts ADD COLUMN x INTEGER; DROP TABLE public.accounts', 'postgres'), /one statement/);
  assert.throws(() => parseAddColumnSql('ALTER TABLE public.accounts ADD COLUMN x TEXT DEFAULT \'secret\'', 'postgres'), /quoted/);
  assert.throws(() => parseAddColumnSql('ALTER TABLE public.accounts DROP COLUMN x', 'postgres'), /ADD/);
});

test('manual add-column plans recheck the target and execute only normalized SQL', async () => {
  const executed: string[] = [];
  const pool = {
    query: async (sql: string) => ({ rows: sql.includes('information_schema.tables') ? [{ exists: true }] : [{ exists: false }] }),
    connect: async () => ({ query: async (sql: string) => { executed.push(sql); return { rows: [] }; }, release: () => undefined }),
  };
  const session = { engine: 'postgres', database: 'sample', pool } as unknown as DatabaseSession;
  const plan = await previewAddColumn(session, 'd'.repeat(64), 'ALTER TABLE public.accounts ADD COLUMN note TEXT');
  await executeAddColumn(session, 'd'.repeat(64), plan.planId);
  assert.equal(executed[1], 'ALTER TABLE "public"."accounts" ADD COLUMN "note" TEXT;');
  assert.ok(executed.includes('COMMIT'));
  await assert.rejects(executeAddColumn(session, 'd'.repeat(64), plan.planId), /expired/);
});

test('MySQL add-column plans execute with a bounded timeout', async () => {
  const calls: Array<string | { sql: string; timeout?: number }> = [];
  const pool = { query: async (input: string | { sql: string; timeout?: number }) => {
    calls.push(input);
    const sql = typeof input === 'string' ? input : input.sql;
    if (sql.includes('information_schema.tables')) return [[{ TABLE_NAME: 'accounts' }], []];
    if (sql.includes('information_schema.columns')) return [[], []];
    return [[], []];
  } };
  const session = { engine: 'mysql', database: 'sample', pool } as unknown as DatabaseSession;
  const plan = await previewAddColumn(session, 'e'.repeat(64), 'ALTER TABLE `sample`.`accounts` ADD COLUMN nickname VARCHAR(40)');
  await executeAddColumn(session, 'e'.repeat(64), plan.planId);
  const executed = calls.at(-1);
  assert.deepEqual(executed, { sql: plan.sql, timeout: 8_000 });
});
