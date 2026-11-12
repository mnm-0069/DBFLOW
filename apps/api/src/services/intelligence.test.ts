// apps/api/src/services/intelligence.test.ts
// Comprehensive unit tests for DBFlow Proactive Database Intelligence Engine
// Covers Intelligence Store, Orchestrator queueing, Generation counters, Invalidation, and Copilot Integration

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { DatabaseIntelligenceSnapshot } from '@idp/shared';
import {
  getIntelligence,
  saveIntelligence,
  updateCategoryStatus,
  deleteIntelligence,
  clearAllIntelligenceForTest,
  reinitIntelligenceStore,
} from './intelligenceStore.js';
import {
  isGreeting,
  isGeneralConceptQuestion,
  buildPreparedIntelligenceContext,
  runCopilotAgent,
} from './agentEngine.js';
import type { DatabaseSession } from './connection-service.js';

test('1. Intelligence store saves, retrieves, and persists snapshots to disk atomically', () => {
  const tmpFile = path.join(os.tmpdir(), `test-intel-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  reinitIntelligenceStore(tmpFile);

  try {
    const snapshot: DatabaseIntelligenceSnapshot = {
      connectionId: 'conn-test-111',
      engine: 'postgres',
      database: 'dbflow_test',
      schemaFingerprint: 'fp-123456',
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
        tables: [
          {
            name: 'users',
            schema: 'public',
            columns: [
              { name: 'id', type: 'integer', nullable: false, isPrimaryKey: true, isUnique: true, hasDefault: true, isGenerated: true },
              { name: 'email', type: 'varchar', nullable: false, isPrimaryKey: false, isUnique: true, hasDefault: false, isGenerated: false },
            ],
            primaryKey: ['id'],
            uniqueConstraints: [{ name: 'users_email_key', columns: ['email'] }],
            foreignKeys: [],
          },
        ],
        views: [],
        tableCount: 1,
      },
      relationships: {
        graph: [],
        rootTables: ['users'],
        leafTables: ['users'],
        junctionTables: [],
        parentChildMappings: {},
      },
      indexes: {
        existingIndexes: [
          { tableName: 'users', indexName: 'users_pkey', columns: ['id'], isUnique: true, isPrimary: true },
        ],
        unindexedForeignKeys: [],
        redundantIndexes: [],
        missingIndexRecommendations: [],
      },
      health: {
        score: 95,
        grade: 'A',
        categoryScores: { performance: 100, integrity: 95, schemaDesign: 90 },
        findings: [],
      },
      tableProfiles: {
        users: {
          tableName: 'users',
          schema: 'public',
          estimatedRowCount: 42,
          columnStats: [
            { columnName: 'id', dataType: 'integer', nullable: false, nullPercentage: 0 },
            { columnName: 'email', dataType: 'varchar', nullable: false, nullPercentage: 0 },
          ],
          lastProfiledAt: new Date().toISOString(),
        },
      },
      recommendations: [],
    };

    saveIntelligence(snapshot);

    const retrieved = getIntelligence('conn-test-111');
    assert.ok(retrieved, 'Should retrieve saved snapshot');
    assert.equal(retrieved?.database, 'dbflow_test');
    assert.equal(retrieved?.health.score, 95);
    assert.equal(retrieved?.health.grade, 'A');

    // Verify atomic disk persistence across simulated restart
    reinitIntelligenceStore(tmpFile);
    const recovered = getIntelligence('conn-test-111');
    assert.ok(recovered, 'Should recover snapshot from disk file');
    assert.equal(recovered?.schema.tableCount, 1);
    assert.equal(recovered?.tableProfiles.users.estimatedRowCount, 42);

    // Verify no password fields exist anywhere
    const rawDisk = fs.readFileSync(tmpFile, 'utf-8');
    assert.ok(!rawDisk.includes('password'), 'Persistence must never store database passwords');
    assert.ok(!rawDisk.includes('secret'), 'Persistence must never store credentials');
  } finally {
    clearAllIntelligenceForTest();
    reinitIntelligenceStore(); // reset to default
  }
});

test('2. Intelligence store enforces per-connection boundary isolation', () => {
  const tmpFile = path.join(os.tmpdir(), `test-intel-iso-${Date.now()}.json`);
  reinitIntelligenceStore(tmpFile);

  try {
    const snapA: DatabaseIntelligenceSnapshot = {
      connectionId: 'conn-alpha',
      engine: 'postgres',
      database: 'db_alpha',
      schemaFingerprint: 'fp-a',
      analysisVersion: 1,
      generation: 1,
      freshnessState: 'fresh',
      categoryStatus: { schema: 'ready', relationships: 'ready', indexes: 'ready', health: 'ready', dataProfiling: 'ready' },
      startedAt: new Date().toISOString(),
      schema: { tables: [], views: [], tableCount: 0 },
      relationships: { graph: [], rootTables: [], leafTables: [], junctionTables: [], parentChildMappings: {} },
      indexes: { existingIndexes: [], unindexedForeignKeys: [], redundantIndexes: [], missingIndexRecommendations: [] },
      health: { score: 88, grade: 'B', categoryScores: {}, findings: [] },
      tableProfiles: {},
      recommendations: [],
    };

    const snapB: DatabaseIntelligenceSnapshot = {
      connectionId: 'conn-beta',
      engine: 'mysql',
      database: 'db_beta',
      schemaFingerprint: 'fp-b',
      analysisVersion: 1,
      generation: 1,
      freshnessState: 'fresh',
      categoryStatus: { schema: 'ready', relationships: 'ready', indexes: 'ready', health: 'ready', dataProfiling: 'ready' },
      startedAt: new Date().toISOString(),
      schema: { tables: [], views: [], tableCount: 0 },
      relationships: { graph: [], rootTables: [], leafTables: [], junctionTables: [], parentChildMappings: {} },
      indexes: { existingIndexes: [], unindexedForeignKeys: [], redundantIndexes: [], missingIndexRecommendations: [] },
      health: { score: 92, grade: 'A', categoryScores: {}, findings: [] },
      tableProfiles: {},
      recommendations: [],
    };

    saveIntelligence(snapA);
    saveIntelligence(snapB);

    assert.equal(getIntelligence('conn-alpha')?.database, 'db_alpha');
    assert.equal(getIntelligence('conn-beta')?.database, 'db_beta');

    deleteIntelligence('conn-alpha');
    assert.equal(getIntelligence('conn-alpha'), null, 'conn-alpha should be deleted');
    assert.equal(getIntelligence('conn-beta')?.database, 'db_beta', 'conn-beta must remain intact');
  } finally {
    clearAllIntelligenceForTest();
    reinitIntelligenceStore();
  }
});

test('3. Category status and freshness state updates incrementally', () => {
  const tmpFile = path.join(os.tmpdir(), `test-intel-cat-${Date.now()}.json`);
  reinitIntelligenceStore(tmpFile);

  try {
    const snap: DatabaseIntelligenceSnapshot = {
      connectionId: 'conn-inc',
      engine: 'postgres',
      database: 'db_inc',
      schemaFingerprint: 'fp-1',
      analysisVersion: 1,
      generation: 1,
      freshnessState: 'updating',
      categoryStatus: { schema: 'running', relationships: 'pending', indexes: 'pending', health: 'pending', dataProfiling: 'pending' },
      startedAt: new Date().toISOString(),
      schema: { tables: [], views: [], tableCount: 0 },
      relationships: { graph: [], rootTables: [], leafTables: [], junctionTables: [], parentChildMappings: {} },
      indexes: { existingIndexes: [], unindexedForeignKeys: [], redundantIndexes: [], missingIndexRecommendations: [] },
      health: { score: 100, grade: 'A', categoryScores: {}, findings: [] },
      tableProfiles: {},
      recommendations: [],
    };
    saveIntelligence(snap);

    updateCategoryStatus('conn-inc', { schema: 'ready', relationships: 'ready' }, 'updating');
    let cur = getIntelligence('conn-inc');
    assert.equal(cur?.categoryStatus.schema, 'ready');
    assert.equal(cur?.categoryStatus.relationships, 'ready');
    assert.equal(cur?.categoryStatus.indexes, 'pending');
    assert.equal(cur?.freshnessState, 'updating');

    updateCategoryStatus('conn-inc', { indexes: 'ready', health: 'ready', dataProfiling: 'ready' }, 'fresh');
    cur = getIntelligence('conn-inc');
    assert.equal(cur?.categoryStatus.health, 'ready');
    assert.equal(cur?.freshnessState, 'fresh');
  } finally {
    clearAllIntelligenceForTest();
    reinitIntelligenceStore();
  }
});

test('4. Greeting and FAQ detection quick-circuits immediate responses without DB calls', () => {
  assert.equal(isGreeting('Hi'), true);
  assert.equal(isGreeting('Hello!'), true);
  assert.equal(isGreeting('Hey copilot'), true);
  assert.equal(isGreeting('Good morning'), true);
  assert.equal(isGreeting('Help'), true);
  assert.equal(isGreeting('Why is my database slow?'), false);

  const pkAnswer = isGeneralConceptQuestion('What is a primary key?');
  assert.ok(pkAnswer && pkAnswer.includes('uniquely identifies'));

  const fkAnswer = isGeneralConceptQuestion('What is a foreign key?');
  assert.ok(fkAnswer && fkAnswer.includes('referential constraint'));

  const idxAnswer = isGeneralConceptQuestion('What is an index?');
  assert.ok(idxAnswer && idxAnswer.includes('B-Tree'));

  assert.equal(isGeneralConceptQuestion('Inspect public.enrollments'), null);
});

test('5. Copilot Agent responds immediately to greeting with 0 tool calls', async () => {
  const dummySession: DatabaseSession = {
    engine: 'postgres',
    connectionId: 'conn-test-greet',
    database: 'dbflow_demo',
    pool: {} as any,
    lastUsedAt: Date.now(),
  };

  const response = await runCopilotAgent(dummySession, 'Hello!');
  assert.ok(response.content.includes('DBFlow Copilot 2.0'));
  assert.equal(response.isAiGenerated, false);
  assert.equal(response.toolCalls?.length || 0, 0, 'Must not execute any database tools for greetings');
});

test('6. Copilot Agent answers general concept questions with 0 tool calls', async () => {
  const dummySession: DatabaseSession = {
    engine: 'postgres',
    connectionId: 'conn-test-faq',
    database: 'dbflow_demo',
    pool: {} as any,
    lastUsedAt: Date.now(),
  };

  const response = await runCopilotAgent(dummySession, 'What is a primary key?');
  assert.ok(response.content.includes('primary key'));
  assert.equal(response.isAiGenerated, false);
  assert.equal(response.toolCalls?.length || 0, 0, 'Must not execute database tools for conceptual FAQs');
});

test('7. Copilot Agent answers relationship queries directly from prepared intelligence cache', async () => {
  const connId = 'conn-cached-rels';
  const dummySession: DatabaseSession = {
    engine: 'postgres',
    connectionId: connId,
    database: 'university_db',
    pool: {} as any,
    lastUsedAt: Date.now(),
  };

  const snapshot: DatabaseIntelligenceSnapshot = {
    connectionId: connId,
    engine: 'postgres',
    database: 'university_db',
    schemaFingerprint: 'fp-rels',
    analysisVersion: 1,
    generation: 1,
    freshnessState: 'fresh',
    categoryStatus: { schema: 'ready', relationships: 'ready', indexes: 'ready', health: 'ready', dataProfiling: 'ready' },
    startedAt: new Date().toISOString(),
    schema: {
      tables: [
        { name: 'students', schema: 'public', columns: [], primaryKey: ['id'], uniqueConstraints: [], foreignKeys: [] },
        { name: 'courses', schema: 'public', columns: [], primaryKey: ['id'], uniqueConstraints: [], foreignKeys: [] },
        { name: 'enrollments', schema: 'public', columns: [], primaryKey: ['id'], uniqueConstraints: [], foreignKeys: [] },
      ],
      views: [],
      tableCount: 3,
    },
    relationships: {
      graph: [
        { fromTable: 'enrollments', fromColumns: ['student_id'], toTable: 'students', toColumns: ['id'], constraintName: 'fk_enrollments_students' },
        { fromTable: 'enrollments', fromColumns: ['course_id'], toTable: 'courses', toColumns: ['id'], constraintName: 'fk_enrollments_courses' },
      ],
      rootTables: ['students', 'courses'],
      leafTables: ['enrollments'],
      junctionTables: ['enrollments'],
      parentChildMappings: { students: ['enrollments'], courses: ['enrollments'] },
    },
    indexes: { existingIndexes: [], unindexedForeignKeys: [], redundantIndexes: [], missingIndexRecommendations: [] },
    health: { score: 90, grade: 'A', categoryScores: {}, findings: [] },
    tableProfiles: {},
    recommendations: [],
  };

  saveIntelligence(snapshot);

  try {
    const response = await runCopilotAgent(dummySession, 'Show my database relationships', [], { connectionId: connId });
    assert.ok(response.content.includes('Prepared Database Relationships'), 'Should cite prepared intelligence');
    assert.ok(response.content.includes('enrollments.student_id') && response.content.includes('students.id'), 'Should list foreign key mappings');
    assert.ok(response.content.includes('enrollments.course_id') && response.content.includes('courses.id'), 'Should list foreign key mappings');
    assert.ok(response.content.includes('Junction Tables'), 'Should identify junction tables');
    assert.equal(response.toolCalls?.length || 0, 0, 'Must answer in 0 tool calls using cached intelligence');
  } finally {
    deleteIntelligence(connId);
  }
});

test('8. Copilot Agent answers health audit directly from prepared intelligence cache', async () => {
  const connId = 'conn-cached-health';
  const dummySession: DatabaseSession = {
    engine: 'postgres',
    connectionId: connId,
    database: 'commerce_db',
    pool: {} as any,
    lastUsedAt: Date.now(),
  };

  const snapshot: DatabaseIntelligenceSnapshot = {
    connectionId: connId,
    engine: 'postgres',
    database: 'commerce_db',
    schemaFingerprint: 'fp-health',
    analysisVersion: 2,
    generation: 2,
    freshnessState: 'fresh',
    categoryStatus: { schema: 'ready', relationships: 'ready', indexes: 'ready', health: 'ready', dataProfiling: 'ready' },
    startedAt: new Date().toISOString(),
    schema: { tables: [], views: [], tableCount: 5 },
    relationships: { graph: [], rootTables: [], leafTables: [], junctionTables: [], parentChildMappings: {} },
    indexes: { existingIndexes: [], unindexedForeignKeys: [], redundantIndexes: [], missingIndexRecommendations: [] },
    health: {
      score: 75,
      grade: 'C',
      categoryScores: { performance: 70, integrity: 80, schemaDesign: 75 },
      findings: [
        {
          id: 'f-1',
          title: 'Unindexed foreign key on orders(customer_id)',
          severity: 'warning',
          category: 'performance',
          table: 'public.orders',
          problem: 'Missing index on customer_id foreign key',
          explanation: 'Requires seq scan on joins',
          evidence: 'No B-Tree index found',
          recommendedSolution: 'CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);',
          expectedBenefit: 'Faster joins',
          potentialRisks: 'Slight insert overhead',
          isReversible: true,
          confidence: 'confirmed',
        },
      ],
    },
    tableProfiles: {},
    recommendations: [],
  };

  saveIntelligence(snapshot);

  try {
    const response = await runCopilotAgent(dummySession, 'Give me a database health report.', [], { connectionId: connId });
    assert.ok(response.content.includes('Database Health Report'), 'Should cite prepared health report');
    assert.ok(response.content.includes('75 / 100'), 'Should cite cached health score');
    assert.ok(response.content.includes('Grade: **C**'), 'Should cite cached grade');
    assert.ok(response.content.includes('Unindexed foreign key on orders(customer_id)'), 'Should list findings');
    assert.equal(response.toolCalls?.length || 0, 0, 'Must answer in 0 tool calls using cached intelligence');
  } finally {
    deleteIntelligence(connId);
  }
});
