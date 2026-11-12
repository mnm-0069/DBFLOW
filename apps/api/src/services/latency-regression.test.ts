// apps/api/src/services/latency-regression.test.ts
// Performance and Latency Regression Test Suite for DBFlow Copilot 2.0
// Verifies sub-second casual conversation fast path, conceptual FAQs, and preserved full database investigation

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCopilotAgent, classifyUserIntent, hasDatabaseContextSignal, isCasualConversation } from './agentEngine.js';
import type { DatabaseSession } from './connection-service.js';
import { saveIntelligence } from './intelligenceStore.js';
import type { DatabaseIntelligenceSnapshot } from '@idp/shared';

const testSession: DatabaseSession = {
  engine: 'postgres',
  connectionId: 'conn-perf-test',
  database: 'dbflow_demo',
  pool: {} as any,
  lastUsedAt: Date.now(),
};

// Seed proactive intelligence snapshot for connection
const mockSnapshot: any = {
  connectionId: 'conn-perf-test',
  database: 'dbflow_demo',
  engine: 'postgres',
  analyzedAt: new Date().toISOString(),
  lastSuccessfulAnalysisTime: new Date().toISOString(),
  freshnessState: 'fresh',
  categories: {
    schema: 'completed',
    relationships: 'completed',
    indexes: 'completed',
    statistics: 'completed',
    health: 'completed',
  },
  schema: {
    tableCount: 3,
    tables: [
      {
        name: 'students',
        columns: [{ name: 'id', dataType: 'integer', isNullable: false }],
        primaryKey: ['id'],
        foreignKeys: [],
        uniqueConstraints: [],
        indexes: [],
      },
      {
        name: 'courses',
        columns: [{ name: 'id', dataType: 'integer', isNullable: false }],
        primaryKey: ['id'],
        foreignKeys: [],
        uniqueConstraints: [],
        indexes: [],
      },
      {
        name: 'enrollments',
        columns: [
          { name: 'student_id', dataType: 'integer', isNullable: false },
          { name: 'course_id', dataType: 'integer', isNullable: false },
        ],
        primaryKey: ['student_id', 'course_id'],
        foreignKeys: [
          {
            constraintName: 'fk_enrollment_course',
            columnNames: ['course_id'],
            referencedTable: 'courses',
            referencedColumnNames: ['id'],
          },
        ],
        uniqueConstraints: [],
        indexes: [],
      },
    ],
  },
  relationships: {
    graph: [
      {
        fromTable: 'enrollments',
        fromColumns: ['course_id'],
        toTable: 'courses',
        toColumns: ['id'],
        constraintName: 'fk_enrollment_course',
      },
    ],
    junctionTables: ['enrollments'],
    rootTables: ['courses', 'students'],
    leafTables: [],
  },
  indexes: {
    totalIndexes: 3,
    unindexedForeignKeys: [
      {
        tableName: 'enrollments',
        columns: ['course_id'],
        referencedTable: 'courses',
        foreignKeyName: 'fk_enrollment_course',
      },
    ],
    redundantIndexes: [],
    unusedIndexes: [],
  },
  statistics: {
    tableCount: 3,
    totalEstimatedRows: 1500,
  },
  health: {
    score: 82,
    grade: 'B',
    evaluatedAt: new Date().toISOString(),
    findings: [
      {
        id: 'finding-fk-unindexed-1',
        title: 'Unindexed Foreign Key on enrollments.course_id',
        severity: 'high',
        category: 'indexing',
        table: 'enrollments',
        problem: 'No index exists on foreign key column course_id.',
        impact: 'Full table sequential scan on joins.',
        recommendedSolution: 'Create B-Tree index on enrollments(course_id).',
      },
    ],
    deductions: [],
  },
};

saveIntelligence('conn-perf-test', mockSnapshot);

test('Intent Classifier: Accurately separates Casual Conversation from Database Investigations', () => {
  const knownTables = ['students', 'courses', 'enrollments'];

  // Category A: Casual Conversation
  assert.equal(classifyUserIntent('Hello', knownTables), 'GREETING');
  assert.equal(classifyUserIntent('Do you like cars?', knownTables), 'CASUAL_CONVERSATION');
  assert.equal(classifyUserIntent('Can you make cookies?', knownTables), 'CASUAL_CONVERSATION');
  assert.equal(classifyUserIntent('Thanks.', knownTables), 'CASUAL_CONVERSATION');
  assert.equal(classifyUserIntent('What can you do?', knownTables), 'CASUAL_CONVERSATION');
  assert.equal(classifyUserIntent('How are you doing today?', knownTables), 'CASUAL_CONVERSATION');

  // Category B: General Database Knowledge
  assert.equal(classifyUserIntent('What is a primary key?', knownTables), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('Explain database indexing.', knownTables), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('What is normalization?', knownTables), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('What is an execution plan?', knownTables), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('What is ACID?', knownTables), 'GENERAL_CONCEPT');

  // Category C: Actual Database Investigations
  assert.equal(classifyUserIntent('Why is my database slow?', knownTables), 'AGENT_INVESTIGATION');
  assert.equal(classifyUserIntent('Find missing indexes.', knownTables), 'INDEX_ANALYSIS');
  assert.equal(classifyUserIntent('Explain my table relationships.', knownTables), 'RELATIONSHIP_GRAPH');
  assert.equal(classifyUserIntent('Analyse my entire database.', knownTables), 'HEALTH_REPORT');
  assert.equal(classifyUserIntent('Generate SQL to add indexes to my foreign keys.', knownTables), 'SQL_GENERATION');

  // Table context signal protection: mentioning a table prevents casual classification
  assert.equal(hasDatabaseContextSignal('Can you check students?', knownTables), true);
  assert.equal(isCasualConversation('Can you check students?', knownTables), false);
  assert.equal(classifyUserIntent('Can you check students?', knownTables), 'AGENT_INVESTIGATION');
});

test('Category A: Casual Conversation executes in <100ms with 0 database tools and 0 LLM calls', async () => {
  const casualQueries = [
    'Hello',
    'Do you like cars?',
    'Can you make cookies?',
    'Thanks.',
    'What can you do?',
  ];

  for (const q of casualQueries) {
    const start = Date.now();
    const res = await runCopilotAgent(testSession, q, [], {
      connectionId: 'conn-perf-test',
      frontendSubmittedAt: new Date(start).toISOString(),
    });
    const duration = Date.now() - start;

    assert.ok(duration < 100, `Query "${q}" took ${duration}ms, expected < 100ms`);
    assert.equal(res.toolCalls?.length || 0, 0, `Query "${q}" must execute 0 tool calls`);
    assert.equal(res.telemetry?.apiRequestsCount || 0, 0, `Query "${q}" must execute 0 LLM requests`);
    assert.equal(res.telemetry?.geminiInvoked, false, `Query "${q}" must not invoke Gemini`);
    assert.ok(
      res.telemetry?.classifiedIntent === 'GREETING' || res.telemetry?.classifiedIntent === 'CASUAL_CONVERSATION',
      `Query "${q}" must classify as casual/greeting`
    );

    // Verify response is natural and doesn't dump database health or persona
    assert.ok(!res.content.includes('Health Score: 82'), `Query "${q}" must not dump health scores`);
    if (q !== 'Hello') {
      assert.ok(!res.content.includes('I have active proactive intelligence'), `Query "${q}" should not dump intelligence status`);
    }
    assert.ok(res.content.length > 20, `Query "${q}" should have a helpful response`);
  }
});

test('Category B: General Database Knowledge executes in <100ms with 0 database tools', async () => {
  const conceptQueries = [
    { query: 'What is a primary key?', keyword: 'uniquely identifies' },
    { query: 'Explain database indexing.', keyword: 'B-Tree' },
    { query: 'What is normalization?', keyword: '1NF' },
  ];

  for (const item of conceptQueries) {
    const start = Date.now();
    const res = await runCopilotAgent(testSession, item.query, [], {
      connectionId: 'conn-perf-test',
    });
    const duration = Date.now() - start;

    assert.ok(duration < 100, `Concept "${item.query}" took ${duration}ms, expected < 100ms`);
    assert.equal(res.toolCalls?.length || 0, 0, `Concept "${item.query}" must execute 0 tool calls`);
    assert.equal(res.telemetry?.geminiInvoked, false, `Concept "${item.query}" must not invoke Gemini`);
    assert.equal(res.telemetry?.classifiedIntent, 'GENERAL_CONCEPT');
    assert.ok(res.content.includes(item.keyword), `Concept "${item.query}" must contain "${item.keyword}"`);
  }
});

test('Category C: Database Investigations preserve intelligence cache and tools', async () => {
  // Test 1: Find missing indexes
  const idxRes = await runCopilotAgent(testSession, 'Find missing indexes.', [], {
    connectionId: 'conn-perf-test',
  });
  assert.equal(idxRes.telemetry?.classifiedIntent, 'INDEX_ANALYSIS');
  assert.ok(idxRes.content.includes('enrollments.course_id'));
  assert.equal(idxRes.telemetry?.source, 'cached_intelligence');

  // Test 2: Explain table relationships
  const relRes = await runCopilotAgent(testSession, 'Explain my table relationships.', [], {
    connectionId: 'conn-perf-test',
  });
  assert.equal(relRes.telemetry?.classifiedIntent, 'RELATIONSHIP_GRAPH');
  assert.ok(relRes.content.includes('enrollments.course_id'));
  assert.equal(relRes.telemetry?.source, 'cached_intelligence');

  // Test 3: SQL generation
  const sqlRes = await runCopilotAgent(testSession, 'Generate SQL to add indexes to my foreign keys.', [], {
    connectionId: 'conn-perf-test',
  });
  assert.equal(sqlRes.telemetry?.classifiedIntent, 'SQL_GENERATION');
  assert.ok(sqlRes.content.includes('CREATE INDEX'));
  assert.ok(sqlRes.content.includes('ROLLBACK') || sqlRes.content.includes('Rollback'));
});

test('Category D: Multi-turn Conversation maintains state and routes correctly', async () => {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Turn 1: Database question
  const turn1 = await runCopilotAgent(testSession, 'Explain my table relationships.', history, {
    connectionId: 'conn-perf-test',
  });
  assert.equal(turn1.telemetry?.classifiedIntent, 'RELATIONSHIP_GRAPH');
  history.push({ role: 'user', content: 'Explain my table relationships.' });
  history.push({ role: 'assistant', content: turn1.content });

  // Turn 2: Follow-up about the same finding
  const turn2 = await runCopilotAgent(testSession, 'Which foreign keys are unindexed?', history, {
    connectionId: 'conn-perf-test',
  });
  assert.equal(turn2.telemetry?.classifiedIntent, 'INDEX_ANALYSIS');
  history.push({ role: 'user', content: 'Which foreign keys are unindexed?' });
  history.push({ role: 'assistant', content: turn2.content });

  // Turn 3: Unrelated casual question in the middle of database consultation
  const startTurn3 = Date.now();
  const turn3 = await runCopilotAgent(testSession, 'Can you make cookies?', history, {
    connectionId: 'conn-perf-test',
  });
  const durationTurn3 = Date.now() - startTurn3;

  assert.ok(durationTurn3 < 100, `Casual turn in multi-turn took ${durationTurn3}ms, expected < 100ms`);
  assert.equal(turn3.telemetry?.classifiedIntent, 'CASUAL_CONVERSATION');
  assert.equal(turn3.toolCalls?.length || 0, 0);
  assert.equal(turn3.telemetry?.geminiInvoked, false);
  assert.ok(turn3.content.includes('cookie') || turn3.content.includes('bake'));
});
