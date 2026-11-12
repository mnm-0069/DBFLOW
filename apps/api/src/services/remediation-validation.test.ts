// Regression and invariant tests for SQL safety, read-only validation, and cancellation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TOOLS } from './agentTools.js';
import {
  runCopilotAgent,
  classifyUserIntent,
  isGeneralConceptQuestion,
} from './agentEngine.js';
import {
  validateReadOnlyQuery,
  ReadOnlyQueryValidationError,
  type DatabaseSession,
} from './connection-service.js';
import {
  previewCreateTable,
  executeCreateTable,
  previewAddColumn,
  executeAddColumn,
  SchemaOperationError,
} from './schema-service.js';
import {
  saveIntelligence,
  clearAllIntelligenceForTest,
  reinitIntelligenceStore,
} from './intelligenceStore.js';
import type { DatabaseIntelligenceSnapshot } from '@idp/shared';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Helper to create a spy mock session
function createSpySession(overrides: Partial<DatabaseSession> = {}) {
  let queryExecuted = false;
  let lastExecutedSql = '';

  const session: DatabaseSession = {
    engine: 'postgres',
    database: 'dbflow_demo',
    connectionId: 'spy-conn-test-001',
    pool: {
      connect: async () => ({
        query: async (sql: string) => {
          queryExecuted = true;
          lastExecutedSql = sql;
          return { rows: [], fields: [] };
        },
        release: () => {},
      }),
      query: async (sql: string) => {
        queryExecuted = true;
        lastExecutedSql = sql;
        if (typeof sql === 'string' && sql.includes('information_schema.schemata')) {
          return { rows: [{ exists: true, can_create: true }] };
        }
        return { rows: [], fields: [] };
      },
      end: async () => {},
    } as any,
    ...overrides,
  } as DatabaseSession;

  return {
    session,
    wasQueryExecuted: () => queryExecuted,
    getLastExecutedSql: () => lastExecutedSql,
    resetSpy: () => {
      queryExecuted = false;
      lastExecutedSql = '';
    },
  };
}

test('Task 1.A: compare_query_plans rejects missing, null, empty, whitespace, and invalid types', async () => {
  const { session, wasQueryExecuted } = createSpySession();
  const tool = AGENT_TOOLS.compare_query_plans;
  assert.ok(tool);

  // 1. Missing arguments (empty object)
  const res1 = (await tool.handler(session, {})) as any;
  assert.ok(res1.error);
  assert.match(res1.error, /Both 'queryA' and 'queryB'/i);

  // 2. Null arguments
  const res2 = (await tool.handler(session, { queryA: null, queryB: null })) as any;
  assert.ok(res2.error);
  assert.match(res2.error, /Both 'queryA' and 'queryB'/i);

  // 3. Empty strings
  const res3 = (await tool.handler(session, { queryA: '', queryB: '' })) as any;
  assert.ok(res3.error);
  assert.match(res3.error, /Both 'queryA' and 'queryB'/i);

  // 4. Whitespace-only strings
  const res4 = (await tool.handler(session, { queryA: '   ', queryB: '   \n\t' })) as any;
  assert.ok(res4.error);
  assert.match(res4.error, /Both 'queryA' and 'queryB'/i);

  // 5. One query missing, one valid
  const res5 = (await tool.handler(session, { queryA: 'SELECT 1;', queryB: '   ' })) as any;
  assert.ok(res5.error);
  assert.match(res5.error, /Both 'queryA' and 'queryB'/i);

  // 6. Incorrect argument types
  const res6 = (await tool.handler(session, { queryA: 12345, queryB: true })) as any;
  assert.ok(res6.error);
  assert.match(res6.error, /Both 'queryA' and 'queryB'/i);

  // Ensure DB was never queried for any invalid arguments
  assert.equal(wasQueryExecuted(), false);
});

test('Task 1.B: locate_schema_object rejects missing, null, empty, whitespace, and invalid types', async () => {
  const { session, wasQueryExecuted } = createSpySession();
  const tool = AGENT_TOOLS.locate_schema_object;
  assert.ok(tool);

  // 1. Missing arguments (empty object)
  const res1 = (await tool.handler(session, {})) as any;
  assert.equal(res1.found, false);
  assert.match(res1.error, /'tableName' parameter is required/i);

  // 2. Null arguments
  const res2 = (await tool.handler(session, { tableName: null })) as any;
  assert.equal(res2.found, false);
  assert.match(res2.error, /'tableName' parameter is required/i);

  // 3. Empty string
  const res3 = (await tool.handler(session, { tableName: '' })) as any;
  assert.equal(res3.found, false);
  assert.match(res3.error, /'tableName' parameter is required/i);

  // 4. Whitespace-only string
  const res4 = (await tool.handler(session, { tableName: '   \t  ' })) as any;
  assert.equal(res4.found, false);
  assert.match(res4.error, /'tableName' parameter is required/i);

  // 5. Incorrect argument types
  const res5 = (await tool.handler(session, { tableName: 98765 })) as any;
  assert.equal(res5.found, false);
  assert.match(res5.error, /'tableName' parameter is required/i);

  // Ensure DB introspection was never triggered for any invalid arguments
  assert.equal(wasQueryExecuted(), false);
});

test('Task 2: Destructive statements are rejected before execution and never reach the database', () => {
  const destructiveStatements = [
    { name: 'DROP TABLE', sql: 'DROP TABLE students;' },
    { name: 'ALTER TABLE', sql: 'ALTER TABLE students ADD COLUMN hacked boolean;' },
    { name: 'TRUNCATE TABLE', sql: 'TRUNCATE TABLE enrollments;' },
    { name: 'DELETE FROM', sql: 'DELETE FROM professors WHERE id = 1;' },
    { name: 'Multiple statements', sql: 'SELECT 1; DROP TABLE courses;' },
  ];

  for (const { name, sql } of destructiveStatements) {
    assert.throws(
      () => validateReadOnlyQuery(sql, 'postgres'),
      (err: any) => {
        assert.ok(err instanceof ReadOnlyQueryValidationError);
        assert.ok(!err.message.includes('password'));
        assert.ok(!err.message.includes('dbflow_dev_password'));
        return true;
      },
      `${name} must throw ReadOnlyQueryValidationError`
    );
  }

  // Valid SELECT must pass cleanly
  const validSelect = 'SELECT id, first_name FROM students WHERE id = 1;';
  assert.equal(validateReadOnlyQuery(validSelect, 'postgres'), 'SELECT id, first_name FROM students WHERE id = 1');

  // Valid CTE (WITH) must pass cleanly
  const validCte = 'WITH high_grades AS (SELECT student_id FROM submissions WHERE grade = \'A\') SELECT * FROM high_grades;';
  assert.ok(validateReadOnlyQuery(validCte, 'postgres').startsWith('WITH'));
});

test('Task 3: Explicit Intent Precedence routes all five specified prompts accurately', () => {
  // Prompt A: "Explain my foreign key relationships."
  // Expected: RELATIONSHIP_GRAPH (Cached relationship intelligence)
  const intentA = classifyUserIntent('Explain my foreign key relationships.');
  assert.equal(intentA, 'RELATIONSHIP_GRAPH');

  // Prompt B: "Suggest indexes for my foreign keys."
  // Expected: INDEX_ANALYSIS (Evidence-based candidate recommendations, no premature preview_plan)
  const intentB = classifyUserIntent('Suggest indexes for my foreign keys.');
  assert.equal(intentB, 'INDEX_ANALYSIS');

  // Prompt C: "Which foreign keys are missing indexes?"
  // Expected: INDEX_ANALYSIS (Index coverage analysis)
  const intentC = classifyUserIntent('Which foreign keys are missing indexes?');
  assert.equal(intentC, 'INDEX_ANALYSIS');

  // Prompt D: "Generate SQL to add indexes to my foreign keys."
  // Expected: SQL_GENERATION (Generates SQL and attaches preview_plan)
  const intentD = classifyUserIntent('Generate SQL to add indexes to my foreign keys.');
  assert.equal(intentD, 'SQL_GENERATION');

  // Prompt E: "Explain how indexes affect foreign key relationships."
  // Expected: GENERAL_CONCEPT (Conceptual answer without ERD dump)
  const intentE = classifyUserIntent('Explain how indexes affect foreign key relationships.');
  assert.equal(intentE, 'GENERAL_CONCEPT');
  const conceptText = isGeneralConceptQuestion('Explain how indexes affect foreign key relationships.');
  assert.ok(conceptText);
  assert.ok(conceptText.includes('indexing foreign key columns'));
});

test('Task 3.B: End-to-end agent execution for the 5 prompts produces expected responses', async () => {
  const { session } = createSpySession();

  // Populate mock intelligence cache for the session
  const mockSnapshot: DatabaseIntelligenceSnapshot = {
    connectionId: session.connectionId!,
    engine: 'postgres',
    database: 'dbflow_demo',
    schemaFingerprint: 'fp-regression-test',
    analysisVersion: 1,
    generation: 1,
    freshnessState: 'fresh',
    categoryStatus: {
      schema: 'ready',
      relationships: 'ready',
      indexes: 'ready',
      health: 'ready',
      dataProfiling: 'ready',
    },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    lastSuccessfulAnalysisTime: new Date().toISOString(),
    schema: { tables: [], views: [], tableCount: 8 },
    relationships: {
      graph: [
        {
          fromTable: 'enrollments',
          fromColumns: ['course_id'],
          toTable: 'courses',
          toColumns: ['id'],
          constraintName: 'fk_enrollments_course',
        },
      ],
      rootTables: ['departments'],
      leafTables: ['submissions'],
      junctionTables: ['enrollments'],
      parentChildMappings: {},
    },
    indexes: {
      existingIndexes: [],
      unindexedForeignKeys: [
        {
          tableName: 'enrollments',
          foreignKeyName: 'fk_enrollments_course',
          columns: ['course_id'],
          referencedTable: 'courses',
        },
      ],
      redundantIndexes: [],
      missingIndexRecommendations: [
        {
          tableName: 'enrollments',
          suggestedIndexName: 'idx_enrollments_course_id',
          columns: ['course_id'],
          reason: 'Unindexed foreign key',
          suggestedSql: 'CREATE INDEX idx_enrollments_course_id ON enrollments (course_id);',
        },
      ],
    },
    health: { score: 85, grade: 'B', categoryScores: {}, findings: [] },
    tableProfiles: {},
    recommendations: [],
  };

  saveIntelligence(mockSnapshot);

  // Prompt A: Cached relationship intelligence
  const resA = await runCopilotAgent(session, 'Explain my foreign key relationships.');
  assert.equal(resA.telemetry?.source, 'cached_intelligence');
  assert.ok(resA.content.includes('fk_enrollments_course'));

  // Prompt B: Suggest indexes - informational recommendations, NO preview_plan action
  const resB = await runCopilotAgent(session, 'Suggest indexes for my foreign keys.');
  assert.equal(resB.telemetry?.source, 'cached_intelligence');
  assert.ok(resB.content.includes('Foreign Key Index Analysis'));
  assert.ok(resB.content.includes('enrollments.course_id'));
  const hasPlanInB = (resB.suggestedActions || []).some((a) => a.actionType === 'preview_plan');
  assert.equal(hasPlanInB, false, 'Exploratory index suggestions must NOT prematurely attach preview_plan action');

  // Prompt C: Which foreign keys are missing indexes
  const resC = await runCopilotAgent(session, 'Which foreign keys are missing indexes?');
  assert.equal(resC.telemetry?.source, 'cached_intelligence');
  assert.ok(resC.content.includes('Foreign Key Index Analysis'));

  // Prompt D: Generate SQL to add indexes - MUST attach preview_plan action
  const resD = await runCopilotAgent(session, 'Generate SQL to add indexes to my foreign keys.');
  assert.ok(resD.content.includes('CREATE INDEX'));
  const hasPlanInD = (resD.suggestedActions || []).some((a) => a.actionType === 'preview_plan');
  assert.equal(hasPlanInD, true, 'Explicit SQL generation request MUST attach preview_plan action');

  // Prompt E: Explain how indexes affect foreign keys - Conceptual, 0 tools, no ERD dump
  const resE = await runCopilotAgent(session, 'Explain how indexes affect foreign key relationships.');
  assert.equal(resE.telemetry?.source, 'deterministic_local');
  assert.ok(resE.content.includes('JOIN Performance'));
  assert.equal(resE.toolCalls?.length || 0, 0);
  assert.equal(resE.content.includes('fk_enrollments_course'), false, 'Concept question must not dump ERD graph');
});

test('Task 4: SQL approval invariants are strictly enforced across preview and execution', async () => {
  const { session } = createSpySession({ connectionId: 'a'.repeat(64) });

  // 1. Plan is connection-bound
  const plan = await previewCreateTable(session, 'a'.repeat(64), {
    schema: 'public',
    table: 'audit_test_table',
    columns: [
      { name: 'id', type: 'integer', primaryKey: true, nullable: false, unique: false },
      { name: 'title', type: 'varchar', primaryKey: false, nullable: false, unique: false, length: 100 },
    ],
  });

  assert.ok(plan.planId);
  assert.ok(plan.sql.includes('CREATE TABLE'));

  // Attempt to execute with wrong connection ID -> rejected with 409
  await assert.rejects(
    executeCreateTable(session, 'b'.repeat(64), plan.planId),
    (err: any) => err instanceof SchemaOperationError && err.status === 409
  );

  // 2. Modified SQL requires new preview:
  // If user modifies column or table name, existing planId cannot be re-used for different SQL
  const plan2 = await previewCreateTable(session, 'a'.repeat(64), {
    schema: 'public',
    table: 'audit_test_table_v2',
    columns: [
      { name: 'id', type: 'integer', primaryKey: true, nullable: false, unique: false },
    ],
  });
  assert.notEqual(plan.planId, plan2.planId);

  // 3. Execution uses exact server-stored SQL and cannot be replayed
  await executeCreateTable(session, 'a'.repeat(64), plan.planId);

  // Attempt replay of the same planId -> rejected because it was deleted on execution
  await assert.rejects(
    executeCreateTable(session, 'a'.repeat(64), plan.planId),
    (err: any) => err instanceof SchemaOperationError && err.status === 409
  );

  // 4. Concurrent execution attempts cannot execute the same plan twice
  const planConcurrent = await previewCreateTable(session, 'a'.repeat(64), {
    schema: 'public',
    table: 'audit_test_concurrent',
    columns: [{ name: 'id', type: 'integer', primaryKey: true, nullable: false, unique: false }],
  });

  const execResults = await Promise.allSettled([
    executeCreateTable(session, 'a'.repeat(64), planConcurrent.planId),
    executeCreateTable(session, 'a'.repeat(64), planConcurrent.planId),
  ]);

  const fulfilledCount = execResults.filter((r) => r.status === 'fulfilled').length;
  const rejectedCount = execResults.filter((r) => r.status === 'rejected').length;

  assert.equal(fulfilledCount, 1, 'Exactly one concurrent execution must succeed');
  assert.equal(rejectedCount, 1, 'The duplicate concurrent execution must be rejected');
});

test('Task 5: AbortSignal stops agent execution immediately without orphaned operations', async () => {
  const { session, wasQueryExecuted } = createSpySession();

  // Test 1: Pre-aborted signal halts immediately before starting
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    runCopilotAgent(session, 'Why is my database slow?', [], {
      signal: controller.signal,
    }),
    (err: any) => err.name === 'AbortError' || err.message.includes('cancelled')
  );

  assert.equal(wasQueryExecuted(), false, 'Pre-aborted agent must not execute any queries');

  // Test 2: Signal aborted during execution halts long-running investigation
  const slowSession = createSpySession({
    pool: {
      connect: async () => ({
        query: async () => {
          await new Promise((r) => setTimeout(r, 100));
          return { rows: [], fields: [] };
        },
        release: () => {},
      }),
      query: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { rows: [], fields: [] };
      },
      end: async () => {},
    } as any,
  }).session;

  const activeController = new AbortController();
  setTimeout(() => activeController.abort(), 20);

  await assert.rejects(
    runCopilotAgent(slowSession, 'Deeply investigate all table performance bottlenecks', [], {
      signal: activeController.signal,
      maxIterations: 5,
    }),
    (err: any) => err.name === 'AbortError' || err.message.includes('cancelled')
  );
});
