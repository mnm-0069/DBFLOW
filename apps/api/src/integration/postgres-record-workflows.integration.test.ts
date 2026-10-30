import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { mutationErrorMessage } from '../routes/connections.js';
import {
  closeDatabaseSession,
  executeDatabaseQuery,
  getDatabaseSession,
  introspectDatabaseSchema,
  openDatabaseSession,
  readDatabaseTablePage,
  ReadOnlyQueryValidationError,
} from '../services/connection-service.js';
import { executeRecordDelete, executeRecordInsert, previewRecordDelete, previewRecordInsert, RecordMutationError } from '../services/record-mutation-service.js';
import { RecordUpdateError, updateDatabaseRecord } from '../services/record-update-service.js';
import { executeAddColumn, executeCreateTable, previewAddColumn, previewCreateTable, SchemaOperationError } from '../services/schema-service.js';

const databaseUrl = process.env.DBFLOW_TEST_DATABASE_URL;

test('PostgreSQL live record workflows handle paging, search, edits, constraints, and reviewed mutations', {
  skip: !databaseUrl ? 'Set DBFLOW_TEST_DATABASE_URL to a dedicated database ending in _test.' : false,
}, async () => {
  const url = new URL(databaseUrl!);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  assert.match(database, /(?:^|_)test$/i, 'Refusing to run destructive integration setup outside a database ending in _test');

  const connectionInput = {
    engine: 'postgres' as const,
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 5432),
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? ''),
  };
  const fixturePool = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `dbflow_it_${randomBytes(5).toString('hex')}`;
  const otherSchema = `${schema}_other`;
  let connectionId: string | undefined;

  try {
    await fixturePool.query(`CREATE SCHEMA "${schema}"`);
    await fixturePool.query(`CREATE SCHEMA "${otherSchema}"`);
    await fixturePool.query(`CREATE TABLE "${schema}"."records" (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL UNIQUE,
      score integer NOT NULL,
      active boolean NOT NULL DEFAULT true,
      note text
    )`);
    await fixturePool.query(`CREATE TABLE "${schema}"."parent_pairs" (
      tenant_id integer NOT NULL,
      id integer NOT NULL,
      label text NOT NULL,
      PRIMARY KEY (tenant_id, id)
    )`);
    await fixturePool.query(`CREATE TABLE "${schema}"."references" (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      record_id integer NOT NULL REFERENCES "${schema}"."records" (id)
    )`);
    await fixturePool.query(`CREATE TABLE "${otherSchema}"."records" (id integer PRIMARY KEY, label text NOT NULL)`);
    await fixturePool.query(`INSERT INTO "${otherSchema}"."records" VALUES (1, 'other schema row')`);
    await fixturePool.query(`INSERT INTO "${schema}"."records" (name, score, active, note)
      VALUES ('Alpha', 30, true, 'first'), ('Bravo', 10, false, NULL), ('Charlie', 20, true, 'search-target')`);
    await fixturePool.query(`INSERT INTO "${schema}"."records" (name, score, note)
      SELECT 'Row-' || n, n, 'paging' FROM generate_series(4, 12) AS n`);

    const opened = await openDatabaseSession(connectionInput);
    connectionId = opened.connectionId;
    const session = getDatabaseSession(connectionId);
    assert.ok(session, 'opened database session is available');

    const schemaInfo = await introspectDatabaseSchema(session);
    const parentPairs = schemaInfo.tables.find((table) => table.schema === schema && table.name === 'parent_pairs');
    assert.ok(parentPairs?.keyGroups?.some((group) => group.kind === 'primary' && group.columns.join(',') === 'tenant_id,id'), 'composite key columns are exposed in their PostgreSQL order');
    const recordsTable = schemaInfo.tables.find((table) => table.schema === schema && table.name === 'records');
    assert.ok(recordsTable, 'fixture table is visible in schema introspection');
    assert.equal(recordsTable.columns.find((column) => column.name === 'id')?.identity, true);
    assert.equal(recordsTable.columns.find((column) => column.name === 'active')?.hasDefault, true);
    assert.ok(schemaInfo.tables.some((table) => table.schema === otherSchema && table.name === 'records'), 'same-named tables in different schemas remain distinct');

    const addColumnPlan = await previewAddColumn(session, connectionId, `ALTER TABLE "${schema}"."records" ADD COLUMN "reviewed_note" TEXT NULL;`);
    assert.equal(addColumnPlan.sql, `ALTER TABLE "${schema}"."records" ADD COLUMN "reviewed_note" TEXT;`);
    await executeAddColumn(session, connectionId, addColumnPlan.planId);
    await assert.rejects(previewAddColumn(session, connectionId, `ALTER TABLE "${schema}"."records" ADD COLUMN "reviewed_note" TEXT;`), (error: unknown) => error instanceof SchemaOperationError && error.status === 409);
    const schemaAfterAddColumn = await introspectDatabaseSchema(session);
    assert.ok(schemaAfterAddColumn.tables.find((table) => table.schema === schema && table.name === 'records')?.columns.some((column) => column.name === 'reviewed_note'), 'a reviewed column addition appears after fresh introspection');

    const sqlResult = await executeDatabaseQuery(session, 'SELECT 40 + 2 AS answer');
    assert.deepEqual(sqlResult.rows, [{ answer: 42 }]);
    await assert.rejects(executeDatabaseQuery(session, 'CREATE TABLE should_not_run (id integer)'), ReadOnlyQueryValidationError);

    const shadowRecords = await readDatabaseTablePage(session, otherSchema, 'records', 0, 10);
    assert.deepEqual(shadowRecords.rows.map((row) => row.label), ['other schema row']);
    await assert.rejects(previewCreateTable(session, connectionId, { schema, table: 'bad_reference', columns: [
      { name: 'id', type: 'integer', nullable: false, primaryKey: true },
      { name: 'record_score', type: 'integer', nullable: false, primaryKey: false, reference: { schema, table: 'records', column: 'score', onDelete: 'no action', onUpdate: 'no action' } },
    ] }), (error: unknown) => error instanceof SchemaOperationError && error.status === 422);

    const parent = await fixturePool.query(`INSERT INTO "${schema}"."records" (name, score) VALUES ('FK target', 0) RETURNING id`);
    await fixturePool.query(`INSERT INTO "${schema}"."parent_pairs" VALUES (7, 9, 'composite target')`);
    const compositeFkPlan = await previewCreateTable(session, connectionId, { schema, table: 'composite_children', columns: [
      { name: 'id', type: 'integer', nullable: false, primaryKey: true, identity: 'always' },
      { name: 'tenant_ref', type: 'integer', nullable: false, primaryKey: false },
      { name: 'parent_ref', type: 'integer', nullable: false, primaryKey: false },
    ], foreignKeyConstraints: [{ columns: ['tenant_ref', 'parent_ref'], reference: { schema, table: 'parent_pairs', columns: ['tenant_id', 'id'], onDelete: 'cascade', onUpdate: 'no action' } }] });
    assert.match(compositeFkPlan.sql, /FOREIGN KEY \("tenant_ref", "parent_ref"\).*\("tenant_id", "id"\) ON DELETE CASCADE/);
    await executeCreateTable(session, connectionId, compositeFkPlan.planId);
    await fixturePool.query(`INSERT INTO "${schema}"."composite_children" (tenant_ref, parent_ref) VALUES (7, 9)`);
    await fixturePool.query(`DELETE FROM "${schema}"."parent_pairs" WHERE tenant_id = 7 AND id = 9`);
    const cascadeResult = await fixturePool.query(`SELECT count(*)::int AS count FROM "${schema}"."composite_children"`);
    assert.equal(cascadeResult.rows[0]?.count, 0, 'composite foreign key cascade applies to the matching pair');
    const guidedPlan = await previewCreateTable(session, connectionId, { schema, table: 'composite_records', uniqueConstraints: [['workspace_id', 'slug']], columns: [
      { name: 'workspace_id', type: 'integer', nullable: false, primaryKey: true },
      { name: 'id', type: 'bigint', nullable: false, primaryKey: true, identity: 'always' },
      { name: 'slug', type: 'text', nullable: false, primaryKey: false, unique: true, default: { kind: 'literal', value: "owner's seed" } },
      { name: 'record_id', type: 'integer', nullable: true, primaryKey: false, reference: { schema, table: 'records', column: 'id', onDelete: 'set null', onUpdate: 'cascade' } },
      { name: 'settings', type: 'jsonb', nullable: false, primaryKey: false, default: { kind: 'literal', value: '{"enabled":true,"tags":["a","b"]}' } },
      { name: 'score', type: 'decimal', nullable: false, primaryKey: false, precision: 7, scale: 2, default: { kind: 'literal', value: '10' }, checks: { minimum: '0', maximum: '100' } },
      { name: 'label', type: 'text', nullable: true, primaryKey: false, checks: { minLength: 2, maxLength: 40, allowedValues: ['draft', "owner's"] } },
      { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, default: { kind: 'current_timestamp' } },
      { name: 'joined_on', type: 'date', nullable: false, primaryKey: false, default: { kind: 'current_date' } },
    ] });
    assert.match(guidedPlan.sql, /PRIMARY KEY \("workspace_id", "id"\)/);
    assert.match(guidedPlan.sql, /UNIQUE \("workspace_id", "slug"\)/);
    assert.match(guidedPlan.sql, /owner''s seed/);
    assert.match(guidedPlan.sql, /CHECK \("score" >= 0 AND "score" <= 100\)/);
    await executeCreateTable(session, connectionId, guidedPlan.planId);
    const introspectedGuided = await introspectDatabaseSchema(session);
    const composite = introspectedGuided.tables.find((table) => table.schema === schema && table.name === 'composite_records');
    assert.ok(composite, 'guided table creation appears in fresh schema introspection');
    assert.equal(composite.columns.find((column) => column.name === 'id')?.identity, true);
    assert.equal(composite.columns.find((column) => column.name === 'settings')?.type.toLowerCase().includes('jsonb'), true);

    const invalidRangeInsert = await previewRecordInsert(session, connectionId, { schema, table: 'composite_records', values: { workspace_id: 5, slug: 'outside range', score: 101 } });
    await assert.rejects(executeRecordInsert(session, connectionId, invalidRangeInsert.planId), (error: unknown) => (error as { code?: string }).code === '23514');
    const invalidLabelInsert = await previewRecordInsert(session, connectionId, { schema, table: 'composite_records', values: { workspace_id: 6, label: 'unsupported' } });
    await assert.rejects(executeRecordInsert(session, connectionId, invalidLabelInsert.planId), (error: unknown) => (error as { code?: string }).code === '23514');
    const compositeInsert = await previewRecordInsert(session, connectionId, { schema, table: 'composite_records', values: { workspace_id: 4, record_id: parent.rows[0]!.id } });
    await executeRecordInsert(session, connectionId, compositeInsert.planId);
    const duplicateGroupInsert = await previewRecordInsert(session, connectionId, { schema, table: 'composite_records', values: { workspace_id: 4, slug: "owner's seed" } });
    await assert.rejects(executeRecordInsert(session, connectionId, duplicateGroupInsert.planId), (error: unknown) => (error as { code?: string }).code === '23505');
    const compositeRow = await fixturePool.query(`SELECT workspace_id, id, slug, record_id, settings, score, created_at IS NOT NULL AS has_created_at, joined_on IS NOT NULL AS has_joined_on FROM "${schema}"."composite_records"`);
    const compositeId = compositeRow.rows[0]!.id;
    assert.deepEqual({ ...compositeRow.rows[0], id: String(compositeId) }, { workspace_id: 4, id: String(compositeId), slug: "owner's seed", record_id: parent.rows[0]!.id, settings: { enabled: true, tags: ['a', 'b'] }, score: '10.00', has_created_at: true, has_joined_on: true });
    await updateDatabaseRecord(session, { schema, table: 'composite_records', primaryKey: { workspace_id: 4, id: compositeId }, originalValues: { slug: "owner's seed" }, changes: { slug: 'renamed' } });
    const liveCompositeRows = await readDatabaseTablePage(session, schema, 'composite_records', 0, 10);
    assert.equal(liveCompositeRows.rows[0]?.settings && (liveCompositeRows.rows[0].settings as { enabled: boolean }).enabled, true, 'JSONB values are returned intact by the live data page');
    assert.equal(liveCompositeRows.rows[0]?.slug, 'renamed');
    await fixturePool.query(`DELETE FROM "${schema}"."records" WHERE id = $1`, [parent.rows[0]!.id]);
    const setNullCheck = await fixturePool.query(`SELECT record_id FROM "${schema}"."composite_records" WHERE workspace_id = 4 AND id = $1`, [compositeId]);
    assert.equal(setNullCheck.rows[0]?.record_id, null, 'ON DELETE SET NULL is honored');

    const firstPage = await readDatabaseTablePage(session, schema, 'records', 0, 10, { column: 'score', direction: 'asc' });
    assert.equal(firstPage.rows.length, 10);
    assert.equal(firstPage.hasMore, true);
    assert.deepEqual(firstPage.rows.slice(0, 3).map((row) => row.score), [4, 5, 6]);
    const secondPage = await readDatabaseTablePage(session, schema, 'records', 1, 10, { column: 'score', direction: 'asc' });
    assert.deepEqual(secondPage.rows.map((row) => row.name), ['Charlie', 'Alpha']);
    assert.equal(secondPage.hasMore, false);

    const searchPage = await readDatabaseTablePage(session, schema, 'records', 0, 10, undefined, 'search-target');
    assert.deepEqual(searchPage.rows.map((row) => row.name), ['Charlie']);
    const literalWildcardSearch = await readDatabaseTablePage(session, schema, 'records', 0, 10, undefined, '%');
    assert.deepEqual(literalWildcardSearch.rows, []);

    await updateDatabaseRecord(session, {
      schema, table: 'records', primaryKey: { id: 2 }, originalValues: { score: 10 }, changes: { score: 11 },
    });
    await assert.rejects(updateDatabaseRecord(session, {
      schema, table: 'records', primaryKey: { id: 2 }, originalValues: { score: 10 }, changes: { score: 12 },
    }), (error: unknown) => error instanceof RecordUpdateError && error.status === 409);

    const insertPlan = await previewRecordInsert(session, connectionId, { schema, table: 'records', values: { name: 'Inserted', score: 2 } });
    await executeRecordInsert(session, connectionId, insertPlan.planId);
    const inserted = await fixturePool.query(`SELECT id, name, score, active, note FROM "${schema}"."records" WHERE name = 'Inserted'`);
    assert.ok(Number(inserted.rows[0]?.id) > 0, 'identity values are generated by PostgreSQL');
    assert.deepEqual({ name: inserted.rows[0]?.name, score: inserted.rows[0]?.score, active: inserted.rows[0]?.active, note: inserted.rows[0]?.note }, { name: 'Inserted', score: 2, active: true, note: null });
    await assert.rejects(executeRecordInsert(session, connectionId, insertPlan.planId), (error: unknown) => error instanceof RecordMutationError && error.status === 409);

    const duplicatePlan = await previewRecordInsert(session, connectionId, { schema, table: 'records', values: { name: 'Alpha', score: 3 } });
    await assert.rejects(executeRecordInsert(session, connectionId, duplicatePlan.planId), (error: unknown) => {
      assert.equal((error as { code?: string }).code, '23505');
      assert.equal(mutationErrorMessage(error, 'insert'), 'A row with these unique values already exists. Change the values and review again.');
      return true;
    });

    const referencedRow = await fixturePool.query(`SELECT * FROM "${schema}"."records" WHERE id = 1`);
    const blockedDelete = await previewRecordDelete(session, connectionId, { schema, table: 'records', primaryKey: { id: 1 }, originalValues: referencedRow.rows[0] });
    await fixturePool.query(`INSERT INTO "${schema}"."references" (record_id) VALUES (1)`);
    await assert.rejects(executeRecordDelete(session, connectionId, blockedDelete.planId), (error: unknown) => {
      assert.equal((error as { code?: string }).code, '23503');
      assert.equal(mutationErrorMessage(error, 'delete'), 'This row is referenced by another record and cannot be deleted yet.');
      return true;
    });

    const changingRow = await fixturePool.query(`SELECT * FROM "${schema}"."records" WHERE id = 2`);
    const staleDelete = await previewRecordDelete(session, connectionId, { schema, table: 'records', primaryKey: { id: 2 }, originalValues: changingRow.rows[0] });
    await fixturePool.query(`UPDATE "${schema}"."records" SET note = 'changed elsewhere' WHERE id = 2`);
    await assert.rejects(executeRecordDelete(session, connectionId, staleDelete.planId), (error: unknown) => error instanceof RecordMutationError && error.status === 409);

    const deleteRow = inserted.rows[0];
    const deletePlan = await previewRecordDelete(session, connectionId, { schema, table: 'records', primaryKey: { id: deleteRow.id }, originalValues: deleteRow });
    await executeRecordDelete(session, connectionId, deletePlan.planId);
    const afterDelete = await fixturePool.query(`SELECT 1 FROM "${schema}"."records" WHERE id = $1`, [deleteRow.id]);
    assert.equal(afterDelete.rowCount, 0);
    await assert.rejects(executeRecordDelete(session, connectionId, deletePlan.planId), (error: unknown) => error instanceof RecordMutationError && error.status === 409);
  } finally {
    if (connectionId) await closeDatabaseSession(connectionId);
    await fixturePool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await fixturePool.query(`DROP SCHEMA IF EXISTS "${otherSchema}" CASCADE`).catch(() => undefined);
    await fixturePool.end();
  }
});
