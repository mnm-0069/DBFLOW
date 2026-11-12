// apps/api/src/services/hybrid-intelligence.test.ts
// Comprehensive Test Suite for DBFlow Copilot 2.0 Hybrid Conversational AI Architecture
// Validates Path A (Local), Path B (Conversational Gemini / Offline), Path C (Database Specialist), and Multi-turn context.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runCopilotAgent,
  classifyUserIntent,
  isGreeting,
  isGratitude,
  isGoodbye,
  isAcknowledgement,
  isCasualConversation,
  hasDatabaseContextSignal,
  getOfflineConversationalFallback,
} from './agentEngine.js';
import type { DatabaseSession } from './connection-service.js';
import { saveIntelligence } from './intelligenceStore.js';
import type { DatabaseIntelligenceSnapshot } from '@idp/shared';

const testSession: DatabaseSession = {
  engine: 'postgres',
  connectionId: 'conn-hybrid-test',
  database: 'dbflow_demo',
  pool: {} as any,
  lastUsedAt: Date.now(),
};

const knownTables = ['students', 'courses', 'enrollments', 'submissions', 'departments'];

const mockSnapshot: any = {
  connectionId: 'conn-hybrid-test',
  engine: 'postgres',
  database: 'dbflow_demo',
  schemaFingerprint: 'fp-hybrid-test',
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
  schema: {
    tableCount: 5,
    tables: [
      {
        name: 'students',
        schema: 'public',
        columns: [{ name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false, hasDefault: false, isGenerated: true }],
        primaryKey: ['id'],
        uniqueConstraints: [],
        foreignKeys: [],
      },
      {
        name: 'courses',
        schema: 'public',
        columns: [{ name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: false, hasDefault: false, isGenerated: true }],
        primaryKey: ['id'],
        uniqueConstraints: [],
        foreignKeys: [],
      },
      {
        name: 'enrollments',
        schema: 'public',
        columns: [
          { name: 'student_id', type: 'integer', nullable: false, isPrimaryKey: false, isUnique: false, hasDefault: false, isGenerated: false },
          { name: 'course_id', type: 'integer', nullable: false, isPrimaryKey: false, isUnique: false, hasDefault: false, isGenerated: false },
        ],
        primaryKey: [],
        uniqueConstraints: [],
        foreignKeys: [
          { constraintName: 'fk_enrollments_courses', columns: ['course_id'], referencedTable: 'courses', referencedColumns: ['id'], onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
        ],
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
        constraintName: 'fk_enrollments_courses',
      },
    ],
    junctionTables: ['enrollments'],
    rootTables: ['courses', 'students'],
    leafTables: [],
  },
  indexes: {
    unindexedForeignKeys: [
      {
        tableName: 'enrollments',
        foreignKeyName: 'fk_enrollments_courses',
        columns: ['course_id'],
        referencedTable: 'courses',
      },
    ],
    redundantIndexes: [],
    unusedIndexes: [],
  },
  statistics: {
    tableCount: 3,
    totalRows: 1500,
    tableStats: [],
  },
  health: {
    score: 80,
    grade: 'B',
    evaluatedAt: new Date().toISOString(),
    findings: [],
  },
};

saveIntelligence('conn-hybrid-test', mockSnapshot);

// ============================================================================
// 1. PATH A: LIGHTWEIGHT LOCAL RESPONSES
// ============================================================================
test('Path A: Formulaic messages (Greetings, Thanks, Goodbye, Acknowledgements) execute locally in <50ms with 0 tools', async () => {
  const localPrompts = [
    { text: 'Hello!', expectedIntent: 'GREETING', expectedWord: 'DBFlow Copilot 2.0' },
    { text: 'Hi there', expectedIntent: 'GREETING', expectedWord: 'DBFlow Copilot' },
    { text: 'Thanks!', expectedIntent: 'CASUAL_CONVERSATION', expectedWord: 'welcome' },
    { text: 'Thank you so much', expectedIntent: 'CASUAL_CONVERSATION', expectedWord: 'welcome' },
    { text: 'Goodbye', expectedIntent: 'CASUAL_CONVERSATION', expectedWord: 'great day' },
    { text: 'Got it', expectedIntent: 'CASUAL_CONVERSATION', expectedWord: 'Sounds good' },
    { text: 'Understood', expectedIntent: 'CASUAL_CONVERSATION', expectedWord: 'Sounds good' },
  ];

  for (const item of localPrompts) {
    const t0 = Date.now();
    const res = await runCopilotAgent(testSession, item.text, [], { connectionId: 'conn-hybrid-test' });
    const duration = Date.now() - t0;

    assert.ok(duration < 50, `"${item.text}" took ${duration}ms, expected < 50ms`);
    assert.equal(res.toolCalls?.length || 0, 0, `"${item.text}" must not execute tools`);
    assert.equal(res.telemetry?.geminiInvoked, false, `"${item.text}" must be handled locally`);
    assert.equal(res.telemetry?.apiRequestsCount || 0, 0, `"${item.text}" must have 0 API requests`);
    assert.equal(res.telemetry?.source, 'deterministic_local');
    assert.ok(res.content.toLowerCase().includes(item.expectedWord.toLowerCase()), `"${item.text}" response should contain "${item.expectedWord}"`);
  }
});

// ============================================================================
// 2. PATH B: GENERAL CONVERSATIONAL INTELLIGENCE & PROGRAMMING HELP
// ============================================================================
test('Path B: Casual conversation & programming questions execute with 0 database tools', async () => {
  const casualQueries = [
    'Can you swim?',
    'Do you like cars?',
    'What would you do on a free weekend?',
    "I'm having a rough day.",
    'Tell me something interesting.',
    'What is recursion?',
    'Explain React hooks.',
    'What is the difference between SQL and NoSQL?',
    'Explain normalization.',
  ];

  for (const q of casualQueries) {
    const res = await runCopilotAgent(testSession, q, [], { connectionId: 'conn-hybrid-test' });

    // Assert NO database tools are executed
    assert.equal(res.toolCalls?.length || 0, 0, `Query "${q}" must execute 0 database tools`);

    // Assert no generic persona intro is repeated
    assert.ok(
      !res.content.includes("I'm an AI database specialist designed to help with schemas, query performance"),
      `Query "${q}" must NOT repeat the generic persona fallback`
    );

    // Assert response is substantial and non-empty
    assert.ok(res.content.length > 25, `Query "${q}" must have a meaningful response`);

    // Telemetry asserts
    assert.ok(
      res.telemetry?.source === 'gemini_direct' || res.telemetry?.source === 'deterministic_local',
      `Query "${q}" should use direct conversational path, got ${res.telemetry?.source}`
    );
  }
});

// ============================================================================
// 3. PATH C: AUTONOMOUS DATABASE SPECIALIST
// ============================================================================
test('Path C: Database questions route to database specialist with tools and cache', async () => {
  // Test 3.1: Missing index analysis
  const idxRes = await runCopilotAgent(testSession, 'Find missing indexes.', [], { connectionId: 'conn-hybrid-test' });
  assert.equal(idxRes.telemetry?.classifiedIntent, 'INDEX_ANALYSIS');
  assert.equal(idxRes.telemetry?.source, 'cached_intelligence');
  assert.ok(idxRes.content.includes('enrollments.course_id'));

  // Test 3.2: General relationship graph
  const relRes = await runCopilotAgent(testSession, 'Explain my table relationships.', [], { connectionId: 'conn-hybrid-test' });
  assert.equal(relRes.telemetry?.classifiedIntent, 'RELATIONSHIP_GRAPH');
  assert.equal(relRes.telemetry?.source, 'cached_intelligence');

  // Test 3.3: Specific table relationship investigation routes to AGENT_INVESTIGATION
  const specificRelIntent = classifyUserIntent('Explain the relationships between courses and enrollments.', knownTables);
  assert.equal(specificRelIntent, 'AGENT_INVESTIGATION', 'Specific table relationship inquiry must route to AGENT_INVESTIGATION');

  // Test 3.4: Table mention in investigation context
  const tableCheckIntent = classifyUserIntent('Investigate the submissions table for performance issues.', knownTables);
  assert.equal(tableCheckIntent, 'AGENT_INVESTIGATION');

  // Test 3.5: SQL Generation with preview_plan action
  const sqlRes = await runCopilotAgent(testSession, 'Generate SQL to add indexes to my foreign keys.', [], { connectionId: 'conn-hybrid-test' });
  assert.equal(sqlRes.telemetry?.classifiedIntent, 'SQL_GENERATION');
  assert.ok(sqlRes.content.includes('CREATE INDEX'));
  const hasPlanAction = (sqlRes.suggestedActions || []).some((a) => a.actionType === 'preview_plan');
  assert.equal(hasPlanAction, true, 'Explicit SQL generation must attach preview_plan action');
});

// ============================================================================
// 4. MULTI-TURN CONTEXT CONTINUITY & TOPIC SWITCHING
// ============================================================================
test('Multi-turn Context: Preserves investigation context, allows clean casual interruption, and resumes database context', async () => {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Turn 1: Database question
  const turn1 = await runCopilotAgent(testSession, 'Find missing indexes.', history, { connectionId: 'conn-hybrid-test' });
  assert.equal(turn1.telemetry?.classifiedIntent, 'INDEX_ANALYSIS');
  assert.ok(turn1.content.includes('enrollments.course_id'));
  history.push({ role: 'user', content: 'Find missing indexes.' });
  history.push({ role: 'assistant', content: turn1.content });

  // Turn 2: Follow-up referring to database findings
  const turn2Intent = classifyUserIntent('Which table needs attention first?', knownTables, history);
  assert.equal(turn2Intent, 'AGENT_INVESTIGATION', 'Anaphoric database follow-up must route to AGENT_INVESTIGATION');

  const turn2 = await runCopilotAgent(testSession, 'Which table needs attention first?', history, { connectionId: 'conn-hybrid-test' });
  history.push({ role: 'user', content: 'Which table needs attention first?' });
  history.push({ role: 'assistant', content: turn2.content });

  // Turn 3: Unrelated casual question (Topic Switch)
  const turn3Intent = classifyUserIntent('By the way, do you like cars?', knownTables, history);
  assert.equal(turn3Intent, 'CASUAL_CONVERSATION', 'Casual interruption must NOT inherit database investigation intent');

  const turn3 = await runCopilotAgent(testSession, 'By the way, do you like cars?', history, { connectionId: 'conn-hybrid-test' });
  assert.equal(turn3.toolCalls?.length || 0, 0, 'Casual turn must execute 0 tools');
  history.push({ role: 'user', content: 'By the way, do you like cars?' });
  history.push({ role: 'assistant', content: turn3.content });

  // Turn 4: Return to the database investigation
  const turn4Intent = classifyUserIntent('Okay, back to the database. What was that indexing issue?', knownTables, history);
  assert.equal(turn4Intent, 'AGENT_INVESTIGATION', 'Resumption of database topic must route to AGENT_INVESTIGATION');
});

// ============================================================================
// 5. INTENT ROUTER PRECISION
// ============================================================================
test('Intent Router: Accurately separates conceptual categories without false positives', () => {
  // Non-database conceptual queries containing SQL/database words must NOT trigger live investigations
  assert.equal(classifyUserIntent('What is the difference between SQL and NoSQL?'), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('Explain normalization.'), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('What is a primary key?'), 'GENERAL_CONCEPT');
  assert.equal(classifyUserIntent('What is ACID?'), 'GENERAL_CONCEPT');

  // Programming queries must NOT trigger database investigations
  assert.equal(classifyUserIntent('What is recursion?'), 'PROGRAMMING_HELP');
  assert.equal(classifyUserIntent('Explain React hooks.'), 'PROGRAMMING_HELP');
  assert.equal(classifyUserIntent('React vs Vue for web applications'), 'PROGRAMMING_HELP');

  // General knowledge queries
  assert.equal(classifyUserIntent('Explain how AI works.'), 'GENERAL_KNOWLEDGE');
  assert.equal(classifyUserIntent('What do you think about electric vehicles?'), 'GENERAL_KNOWLEDGE');

  // Casual queries
  assert.equal(classifyUserIntent('Can you swim?'), 'CASUAL_CONVERSATION');
  assert.equal(classifyUserIntent('I am having a rough day.'), 'CASUAL_CONVERSATION');
  assert.equal(classifyUserIntent('What would you do on a free weekend?'), 'CASUAL_CONVERSATION');

  // Live database investigations
  assert.equal(classifyUserIntent('Why is my database slow?', knownTables), 'AGENT_INVESTIGATION');
  assert.equal(classifyUserIntent('Identify tables with the highest row counts.', knownTables), 'AGENT_INVESTIGATION');
  assert.equal(classifyUserIntent('Investigate potential database performance bottlenecks.', knownTables), 'AGENT_INVESTIGATION');
  assert.equal(classifyUserIntent('Find missing indexes.', knownTables), 'INDEX_ANALYSIS');
  assert.equal(classifyUserIntent('Generate SQL to add indexes to my foreign keys.', knownTables), 'SQL_GENERATION');
});
