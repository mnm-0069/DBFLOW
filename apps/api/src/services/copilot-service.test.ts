// apps/api/src/services/copilot-service.test.ts
// Unit tests for DBFlow Copilot Health Analyzer, Index Detection, and AI Provider

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHealthScore,
  parsePgIndexColumns,
  hasIndexOnColumn,
  type RawIndexInfo,
} from './databaseHealthAnalyzer.js';
import { extractPlanNodes } from './sqlIntelligenceService.js';
import { isAiConfigured, getAiConfig, callAiChatCompletion } from './aiProvider.js';
import type { HealthFinding } from '@idp/shared';

test('calculates 100/100 and Grade A when no findings are detected', () => {
  const result = calculateHealthScore([]);
  assert.equal(result.finalScore, 100);
  assert.equal(result.grade, 'A');
  assert.equal(result.totalDeductions, 0);
  assert.equal(result.categoryScores.performance, 100);
  assert.equal(result.categoryScores.integrity, 100);
  assert.equal(result.categoryScores.schemaDesign, 100);
});

test('calculates deterministic deductions based on finding severities and categories', () => {
  const findings: HealthFinding[] = [
    {
      id: 'f1',
      title: 'Table without PK',
      severity: 'critical',
      category: 'integrity',
      table: 'public.items',
      problem: 'Missing primary key',
      explanation: 'No unique identifier',
      evidence: 'None',
      recommendedSolution: 'Add PK',
      expectedBenefit: 'Integrity',
      potentialRisks: 'None',
      isReversible: true,
      confidence: 'confirmed',
    },
    {
      id: 'f2',
      title: 'Unindexed FK',
      severity: 'warning',
      category: 'performance',
      table: 'public.orders',
      problem: 'Missing index on user_id',
      explanation: 'Join bottleneck',
      evidence: 'No index',
      recommendedSolution: 'CREATE INDEX',
      expectedBenefit: 'Fast joins',
      potentialRisks: 'Disk space',
      isReversible: true,
      confidence: 'confirmed',
    },
    {
      id: 'f3',
      title: 'Unconstrained status column',
      severity: 'optimization',
      category: 'schema_design',
      table: 'public.orders',
      problem: 'Status has no CHECK constraint',
      explanation: 'Could store invalid string',
      evidence: 'varchar(20)',
      recommendedSolution: 'Add CHECK',
      expectedBenefit: 'Consistency',
      potentialRisks: 'None',
      isReversible: true,
      confidence: 'heuristic',
    },
  ];

  const result = calculateHealthScore(findings);
  // Critical (15) + Warning (5) + Optimization (3) = 23 deductions
  assert.equal(result.totalDeductions, 23);
  assert.equal(result.finalScore, 77);
  assert.equal(result.grade, 'C');
  assert.equal(result.deductions.length, 3);
});

test('parses single and composite index column definitions from PostgreSQL DDL', () => {
  const single = 'CREATE UNIQUE INDEX courses_pkey ON public.courses USING btree (id)';
  assert.deepEqual(parsePgIndexColumns(single), ['id']);

  const composite = 'CREATE INDEX enrollments_idx ON public.enrollments USING btree (student_id, course_id)';
  assert.deepEqual(parsePgIndexColumns(composite), ['student_id', 'course_id']);

  const quoted = 'CREATE INDEX test_idx ON public.items USING btree ("order_id", "item_code")';
  assert.deepEqual(parsePgIndexColumns(quoted), ['order_id', 'item_code']);
});

test('verifies that leading composite columns cover index requirements, but non-leading do not', () => {
  const indexes: RawIndexInfo[] = [
    {
      schema: 'public',
      table: 'enrollments',
      name: 'enrollments_student_id_course_id_key',
      columns: ['student_id', 'course_id'],
      isUnique: true,
    },
    {
      schema: 'public',
      table: 'departments',
      name: 'departments_pkey',
      columns: ['id'],
      isUnique: true,
    },
  ];

  // student_id is leading in (student_id, course_id) -> COVERED
  assert.equal(hasIndexOnColumn(indexes, 'student_id'), true);

  // course_id is 2nd column in B-Tree (student_id, course_id) -> NOT COVERED as standalone lookup
  assert.equal(hasIndexOnColumn(indexes, 'course_id'), false);

  // id is leading in (id) -> COVERED
  assert.equal(hasIndexOnColumn(indexes, 'id'), true);

  // missing column -> NOT COVERED
  assert.equal(hasIndexOnColumn(indexes, 'professor_id'), false);
});

test('traverses and extracts scan types and join types from query execution plan JSON', () => {
  const mockPlan = {
    'Node Type': 'Nested Loop',
    'Join Type': 'Inner',
    Plans: [
      {
        'Node Type': 'Seq Scan',
        'Relation Name': 'students',
        Filter: '(gpa > 3.5)',
      },
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'departments',
        'Index Name': 'departments_pkey',
      },
    ],
  };

  const { scans, joins } = extractPlanNodes(mockPlan);
  assert.equal(scans.length, 2);
  assert.equal(scans[0]?.table, 'students');
  assert.equal(scans[0]?.isSequential, true);
  assert.equal(scans[1]?.table, 'departments');
  assert.equal(scans[1]?.isSequential, false);
  assert.equal(joins.length, 1);
  assert.equal(joins[0]?.type, 'Nested Loop');
});

test('AI provider defaults to unconfigured state safely when AI_API_KEY is unset', async () => {
  const origKey = process.env.AI_API_KEY;
  try {
    delete process.env.AI_API_KEY;
    const config = getAiConfig();
    assert.equal(config.configured, false);
    assert.equal(isAiConfigured(), false);

    await assert.rejects(
      async () => {
        await callAiChatCompletion([{ role: 'user', content: 'test' }]);
      },
      {
        message: /AI Provider is not configured/,
      }
    );
  } finally {
    if (origKey !== undefined) process.env.AI_API_KEY = origKey;
  }
});
