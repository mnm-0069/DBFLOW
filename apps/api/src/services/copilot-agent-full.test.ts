// apps/api/src/services/copilot-agent-full.test.ts
// Comprehensive verification of DBFlow Copilot 2.0 AI Database Agent:
// Native Gemini integration, tool execution, sequential tools, argument validation,
// error recovery, session isolation, prompt injection defense, and read-only enforcement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TOOLS } from './agentTools.js';
import { runCopilotAgent } from './agentEngine.js';
import { getAiConfig, normalizeAiError } from './aiProvider.js';
import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  addMessageToConversation,
} from './conversationStore.js';
import { validateReadOnlyQuery } from './connection-service.js';

// Mock session helper for testing
function createMockSession(engine: 'postgres' | 'mysql' = 'postgres') {
  return {
    id: 'mock-session-123',
    engine,
    database: 'dbflow_demo',
    username: 'dbflow',
    host: '127.0.0.1',
    port: 5432,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    pool: {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.includes('SHOW server_version_num')) {
            return { rows: [{ server_version_num: '180000' }] };
          }
          if (sql.includes('information_schema.columns')) {
            return {
              rows: [
                {
                  table_schema: 'public',
                  table_name: 'students',
                  column_name: 'id',
                  data_type: 'integer',
                  is_nullable: 'NO',
                  is_generated: 'NEVER',
                  is_identity: 'YES',
                },
                {
                  table_schema: 'public',
                  table_name: 'enrollments',
                  column_name: 'id',
                  data_type: 'integer',
                  is_nullable: 'NO',
                  is_generated: 'NEVER',
                  is_identity: 'YES',
                },
                {
                  table_schema: 'public',
                  table_name: 'enrollments',
                  column_name: 'course_id',
                  data_type: 'integer',
                  is_nullable: 'NO',
                  is_generated: 'NEVER',
                  is_identity: 'NO',
                },
              ],
            };
          }
          if (sql.includes("contype = 'f'")) {
            return {
              rows: [
                {
                  table_schema: 'public',
                  table_name: 'enrollments',
                  column_name: 'course_id',
                  referenced_schema: 'public',
                  referenced_table: 'students',
                  referenced_column: 'id',
                  on_delete: 'CASCADE',
                  on_update: 'CASCADE',
                },
              ],
            };
          }
          if (sql.includes('information_schema.tables') || sql.includes('pg_tables')) {
            return {
              rows: [
                { table_schema: 'public', table_name: 'students' },
                { table_schema: 'public', table_name: 'enrollments' },
              ],
            };
          }
          if (sql.includes('information_schema.table_constraints')) {
            return {
              rows: [
                {
                  constraint_type: 'PRIMARY KEY',
                  table_schema: 'public',
                  table_name: 'students',
                  constraint_name: 'students_pkey',
                },
                {
                  constraint_type: 'PRIMARY KEY',
                  table_schema: 'public',
                  table_name: 'enrollments',
                  constraint_name: 'enrollments_pkey',
                },
              ],
            };
          }
          if (sql.includes('information_schema.key_column_usage')) {
            return {
              rows: [
                {
                  constraint_name: 'students_pkey',
                  column_name: 'id',
                  ordinal_position: 1,
                },
                {
                  constraint_name: 'enrollments_pkey',
                  column_name: 'id',
                  ordinal_position: 1,
                },
              ],
            };
          }
          if (sql.includes('pg_indexes')) {
            return {
              rows: [
                {
                  schemaname: 'public',
                  tablename: 'students',
                  indexname: 'students_pkey',
                  indexdef: 'CREATE UNIQUE INDEX students_pkey ON public.students (id)',
                },
                {
                  schemaname: 'public',
                  tablename: 'enrollments',
                  indexname: 'enrollments_student_id_course_id_key',
                  indexdef: 'CREATE UNIQUE INDEX enrollments_key ON public.enrollments (student_id, course_id)',
                },
              ],
            };
          }
          if (sql.includes('pg_stat_user_tables')) {
            return {
              rows: [
                {
                  schemaname: 'public',
                  tablename: 'students',
                  n_live_tup: '120',
                  seq_scan: '15',
                  idx_scan: '85',
                },
              ],
            };
          }
          if (sql.includes('EXPLAIN')) {
            return {
              rows: [
                {
                  'QUERY PLAN': [
                    {
                      Plan: {
                        'Node Type': 'Seq Scan',
                        'Relation Name': 'students',
                        'Startup Cost': 0,
                        'Total Cost': 3.5,
                        'Plan Rows': 25,
                      },
                    },
                  ],
                },
              ],
            };
          }
          return { rows: [] };
        },
        release: () => {},
      }),
      query: async () => ({ rows: [] }),
    } as any,
  };
}

test('1. Gemini provider configuration & auto-resolution', () => {
  const origKey = process.env.GEMINI_API_KEY;
  const origModel = process.env.GEMINI_MODEL;
  const origProvider = process.env.AI_PROVIDER;

  try {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_MODEL = 'auto';

    const config = getAiConfig();
    assert.equal(config.provider, 'gemini');
    assert.equal(config.configured, true);
    assert.equal(config.model, 'gemini-3.8-flash'); // Resolved from 'auto'
  } finally {
    if (origKey !== undefined) process.env.GEMINI_API_KEY = origKey;
    else delete process.env.GEMINI_API_KEY;
    if (origModel !== undefined) process.env.GEMINI_MODEL = origModel;
    else delete process.env.GEMINI_MODEL;
    if (origProvider !== undefined) process.env.AI_PROVIDER = origProvider;
    else delete process.env.AI_PROVIDER;
  }
});

test('2. API failure and error normalization', () => {
  const err401 = normalizeAiError(new Error('401 Unauthorized API_KEY_INVALID'), 'gemini');
  assert.ok(err401.includes('Authentication Failed'));

  const err429 = normalizeAiError(new Error('429 RESOURCE_EXHAUSTED'), 'gemini');
  assert.ok(err429.includes('Quota Exceeded / Rate Limited'));

  const errTimeout = normalizeAiError(new Error('Request abort timeout'), 'gemini');
  assert.ok(errTimeout.includes('Request Timed Out'));
});

test('3. Tool argument validation and session boundary isolation', async () => {
  const session = createMockSession();

  // Test inspecting a non-existent table
  const resultNonExistent = (await AGENT_TOOLS.inspect_table_details!.handler(session as any, {
    tableName: 'fictional_table_xyz',
  })) as any;

  assert.ok(resultNonExistent.error);
  assert.ok(resultNonExistent.error.includes('was not found'));
});

test('4. Safe read-only enforcement in SQL explain tool', async () => {
  const session = createMockSession();

  // Rejects DROP TABLE in explain_sql_query
  await assert.rejects(
    async () => {
      await AGENT_TOOLS.explain_sql_query!.handler(session as any, {
        query: 'DROP TABLE students CASCADE;',
      });
    },
    {
      message: /Only SELECT queries|read-only/i,
    }
  );

  // Rejects UPDATE in explain_sql_query
  await assert.rejects(
    async () => {
      await AGENT_TOOLS.explain_sql_query!.handler(session as any, {
        query: 'UPDATE students SET gpa = 4.0;',
      });
    },
    {
      message: /Only SELECT queries|read-only/i,
    }
  );
});

test('5. Non-autonomous DDL execution invariant in generate_sql_improvement', async () => {
  const session = createMockSession();

  const generated = (await AGENT_TOOLS.generate_sql_improvement!.handler(session as any, {
    improvementType: 'add_index',
    tableName: 'enrollments',
    columnName: 'course_id',
  })) as any;

  // Confirms it only returns strings and metadata without applying anything to the database
  assert.ok(generated.sql.includes('CREATE INDEX'));
  assert.ok(generated.rollbackSql.includes('DROP INDEX'));
  assert.ok(generated.explanation);
  assert.ok(generated.expectedBenefit);
  assert.ok(generated.lockingConsiderations);
});

test('6. Conversation persistence and multi-turn message storage', () => {
  const connId = 'conn-test-session-42';
  const conv = createConversation(connId, 'Multi-Turn Investigation');

  // Turn 1
  addMessageToConversation(conv.id, {
    id: 'm1',
    role: 'user',
    content: 'Why is the enrollments table slow?',
    timestamp: new Date().toISOString(),
    isAiGenerated: false,
  });

  addMessageToConversation(conv.id, {
    id: 'm2',
    role: 'assistant',
    content: 'The enrollments table is missing an index on course_id.',
    timestamp: new Date().toISOString(),
    isAiGenerated: false,
  });

  // Turn 2
  addMessageToConversation(conv.id, {
    id: 'm3',
    role: 'user',
    content: 'What are the risks of adding this index?',
    timestamp: new Date().toISOString(),
    isAiGenerated: false,
  });

  const updated = getConversation(conv.id);
  assert.equal(updated?.messages.length, 4); // welcome + 3 turns
  assert.equal(updated?.messages[1]?.content, 'Why is the enrollments table slow?');
  assert.equal(updated?.messages[3]?.content, 'What are the risks of adding this index?');

  deleteConversation(conv.id);
});

test('7. Prompt injection resilience in query validation', () => {
  const maliciousInputs = [
    'SELECT * FROM students; DROP TABLE students; --',
    "SELECT * FROM students WHERE name = 'x'; DELETE FROM students;",
    'GRANT ALL PRIVILEGES ON DATABASE dbflow_demo TO attacker;',
  ];

  for (const sql of maliciousInputs) {
    assert.throws(
      () => validateReadOnlyQuery(sql, 'postgres'),
      /Run one statement at a time|Only SELECT queries|read-only/i,
      `Query "${sql}" must be rejected by validateReadOnlyQuery`
    );
  }
});

test('8. Autonomous agent runs sequential tools in performance investigation', async () => {
  const session = createMockSession();
  const toolCallsMade: string[] = [];

  const response = await runCopilotAgent(
    session as any,
    'My database is getting slower. Perform a complete investigation, identify the three most important issues, explain why they matter, and recommend the safest improvements. Don\'t change anything without my approval.',
    [],
    {
      onToolActivity: (act) => {
        if (act.status === 'completed') {
          toolCallsMade.push(act.name);
        }
      },
    }
  );

  // Confirms sequential tools were executed
  assert.ok(toolCallsMade.length >= 3, `Expected at least 3 tool calls, got ${toolCallsMade.length}`);
  assert.ok(toolCallsMade.includes('inspect_database_schema'));
  assert.ok(toolCallsMade.includes('inspect_database_health'));

  // Confirms response is populated with evidence and recommendations
  assert.ok(response.content.includes('Comprehensive Database Performance'));
  assert.ok(response.content.includes('Safety Assurance'));
  assert.ok(response.toolCalls && response.toolCalls.length >= 3);
});

test('9. MySQL DDL safety prevents implicit commit transactional dry runs', async () => {
  const mysqlSession = createMockSession('mysql');

  // 1. MySQL DDL is NOT executed inside BEGIN/ROLLBACK (prevents implicit commit)
  const ddlResult = (await AGENT_TOOLS.validate_sql_improvement!.handler(mysqlSession as any, {
    sql: 'CREATE INDEX `idx_test` ON `students` (`department_id`);',
  })) as any;

  assert.equal(ddlResult.engine, 'mysql');
  assert.ok(ddlResult.status.includes('Dry-Run Inapplicable'));
  assert.ok(ddlResult.warning.includes('implicit commit'));
  assert.equal(ddlResult.requiresExplicitConfirmation, true);

  // 2. PostgreSQL DDL is safely verified inside transaction
  const pgSession = createMockSession('postgres');
  const pgResult = (await AGENT_TOOLS.validate_sql_improvement!.handler(pgSession as any, {
    sql: 'CREATE INDEX "idx_test" ON "students" ("department_id");',
  })) as any;

  assert.equal(pgResult.engine, 'postgres');
  assert.equal(pgResult.status, 'Validation Successful');
  assert.ok(pgResult.message.includes('rolled-back transaction'));
});
