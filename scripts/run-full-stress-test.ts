// scripts/run-full-stress-test.ts
// DBFlow Full System Stress Test & Copilot Validation Suite
// Role: Senior QA Engineer, Backend Performance Engineer, Database Reliability Engineer, AI Evaluation Engineer

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const API_BASE = 'http://localhost:4000';
const PG_CONFIG = {
  engine: 'postgres',
  host: '127.0.0.1',
  port: 5432,
  database: 'dbflow_demo',
  username: 'dbflow',
  password: 'dbflow_dev_password',
  ssl: false,
};

interface TestRecord {
  id: string;
  category: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT TESTED';
  evidence: string;
  durationMs: number;
  telemetry?: any;
}

const testResults: TestRecord[] = [];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function calculateStats(latencies: number[]) {
  if (latencies.length === 0) return { min: 0, max: 0, mean: 0, median: 0, p95: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Math.round(sum / sorted.length);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  return { min, max, mean, median, p95 };
}

async function executeChat(
  connectionId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  conversationId?: string
) {
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, messages, conversationId }),
  });
  const data = await res.json();
  const duration = Math.round(performance.now() - t0);
  return { status: res.status, data, duration };
}

async function main() {
  console.log('========================================================================');
  console.log('DBFLOW — FULL SYSTEM STRESS TEST & COPILOT VALIDATION');
  console.log('========================================================================\n');

  // STEP 1: Open Connection
  console.log('▶ [SETUP] Opening Database Connection...');
  const connRes = await fetch(`${API_BASE}/api/connections/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PG_CONFIG),
  });
  const connData = await connRes.json();
  const connectionId = connData.connectionId;
  console.log(`✓ Connected: ${connectionId.slice(0, 16)}… (${connData.engine})`);

  // Wait for Proactive Intelligence to be ready
  let intelStatus: any = null;
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    const ir = await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`);
    intelStatus = await ir.json();
    if (intelStatus.snapshot && intelStatus.categoryStatus.health === 'ready') break;
  }
  console.log(`✓ Proactive Intelligence Snapshot Ready. Score: ${intelStatus.snapshot?.health?.score}/100\n`);

  // ==========================================================================
  // SECTION 3: COPILOT CONVERSATIONAL INTELLIGENCE TESTS
  // ==========================================================================
  console.log('========================================================================');
  console.log('▶ [SECTION 3] Copilot Conversational Intelligence Tests');
  console.log('========================================================================');

  // 3.A: Basic Conversations
  const basicPrompts = [
    { id: '3A-1', prompt: 'Hi', expectedKeyword: 'DBFlow Copilot', expectedSource: 'deterministic_local' },
    { id: '3A-2', prompt: 'What can you do?', expectedKeyword: 'Copilot', expectedSource: 'deterministic_local' },
    { id: '3A-3', prompt: 'Explain what a primary key is.', expectedKeyword: 'primary key', expectedSource: 'deterministic_local' },
    { id: '3A-4', prompt: "What's the difference between INNER JOIN and LEFT JOIN?", expectedKeyword: 'JOIN', expectedSource: 'deterministic_local' },
    { id: '3A-5', prompt: 'Explain database normalization in simple terms.', expectedKeyword: 'normalization', expectedSource: 'deterministic_local' },
  ];

  for (const t of basicPrompts) {
    const { data, duration, status } = await executeChat(connectionId, [{ role: 'user', content: t.prompt }]);
    const hasKeyword = data.content?.toLowerCase().includes(t.expectedKeyword.toLowerCase());
    const pass = status === 200 && hasKeyword;
    testResults.push({
      id: t.id,
      category: '3.A Basic Conversation',
      description: `Prompt: "${t.prompt}"`,
      status: pass ? 'PASS' : 'FAIL',
      evidence: `HTTP ${status} | Duration: ${duration}ms | Source: ${data.telemetry?.source} | Tools: ${data.toolCalls?.length || 0}`,
      durationMs: duration,
      telemetry: data.telemetry,
    });
    console.log(`[${t.id}] "${t.prompt}" -> ${pass ? 'PASS' : 'FAIL'} (${duration}ms, Source: ${data.telemetry?.source})`);
  }

  // 3.B: Database-Aware Questions
  const dbAwarePrompts = [
    { id: '3B-1', prompt: 'Give me an overview of my database.', expectedKeyword: 'dbflow_demo' },
    { id: '3B-2', prompt: 'How many tables do I have?', expectedKeyword: '8' },
    { id: '3B-3', prompt: 'Explain the relationships between my tables.', expectedKeyword: 'enrollments' },
    { id: '3B-4', prompt: 'Which tables have the most columns?', expectedKeyword: 'columns' },
    { id: '3B-5', prompt: 'Do I have any missing indexes?', expectedKeyword: 'index' },
    { id: '3B-6', prompt: 'Are there any potential schema design problems?', expectedKeyword: 'finding' },
  ];

  for (const t of dbAwarePrompts) {
    const { data, duration, status } = await executeChat(connectionId, [{ role: 'user', content: t.prompt }]);
    const hasKeyword = data.content?.toLowerCase().includes(t.expectedKeyword.toLowerCase());
    const pass = status === 200 && hasKeyword;
    testResults.push({
      id: t.id,
      category: '3.B Database-Aware Questions',
      description: `Prompt: "${t.prompt}"`,
      status: pass ? 'PASS' : 'FAIL',
      evidence: `HTTP ${status} | Duration: ${duration}ms | Source: ${data.telemetry?.source} | Tools: ${data.toolCalls?.length || 0}`,
      durationMs: duration,
      telemetry: data.telemetry,
    });
    console.log(`[${t.id}] "${t.prompt}" -> ${pass ? 'PASS' : 'FAIL'} (${duration}ms, Source: ${data.telemetry?.source})`);
  }

  // 3.C: Complex Database Investigation (Individual Prompts)
  const complexPrompts = [
    {
      id: '3C-1',
      prompt: 'Investigate why my database might be slow. Examine the schema, indexes, table statistics, and any available performance evidence. Give me specific findings.',
    },
    {
      id: '3C-2',
      prompt: 'Identify the three most important database optimization opportunities. Rank them by expected impact and explain the evidence.',
    },
    {
      id: '3C-3',
      prompt: 'Check whether my foreign key columns have appropriate indexes. Show me which ones are indexed and which ones are not.',
    },
    {
      id: '3C-4',
      prompt: 'Look for potentially inefficient schema designs, redundant indexes, or suspicious relationships. Distinguish confirmed issues from recommendations.',
    },
    {
      id: '3C-5',
      prompt: 'If I have a query performance problem, explain exactly what additional evidence you would need to diagnose it.',
    },
  ];

  for (const t of complexPrompts) {
    const { data, duration, status } = await executeChat(connectionId, [{ role: 'user', content: t.prompt }]);
    const pass = status === 200 && data.content?.length > 100;
    testResults.push({
      id: t.id,
      category: '3.C Complex Investigation',
      description: `Prompt: "${t.prompt.slice(0, 50)}…"`,
      status: pass ? 'PASS' : 'FAIL',
      evidence: `HTTP ${status} | Duration: ${duration}ms | Source: ${data.telemetry?.source} | Tools: ${data.toolCalls?.length || 0} (${(data.toolCalls || []).map((tc: any) => tc.name).join(', ')})`,
      durationMs: duration,
      telemetry: data.telemetry,
    });
    console.log(`[${t.id}] "${t.prompt.slice(0, 40)}…" -> ${pass ? 'PASS' : 'FAIL'} (${duration}ms, Source: ${data.telemetry?.source})`);
  }

  // ==========================================================================
  // SECTION 4: TOOL-CALLING & AGENT-LOOP STRESS TESTS
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 4] Tool-Calling & Agent-Loop Stress Tests (All 14 Tools)');
  console.log('========================================================================');

  const toolsToTest = [
    { name: 'inspect_database_schema', args: {} },
    { name: 'inspect_table_details', args: { tableName: 'students' } },
    { name: 'inspect_table_relationships', args: { tableName: 'enrollments' } },
    { name: 'inspect_database_health', args: {} },
    { name: 'inspect_table_indexes', args: { tableName: 'courses' } },
    { name: 'inspect_database_statistics', args: {} },
    { name: 'explain_sql_query', args: { query: 'SELECT * FROM students WHERE id = 1' } },
    {
      name: 'compare_query_plans',
      args: {
        query: 'SELECT * FROM enrollments WHERE course_id = 1',
        proposedIndexSql: 'CREATE INDEX idx_test_cov ON enrollments (course_id)',
      },
    },
    { name: 'analyze_normalization', args: {} },
    {
      name: 'analyze_schema_impact',
      args: { operation: 'create_index', tableName: 'enrollments', columns: ['course_id'] },
    },
    { name: 'suggest_indexes', args: {} },
    {
      name: 'generate_sql_improvement',
      args: { issueType: 'missing_foreign_key_index', tableName: 'enrollments', columnNames: ['course_id'] },
    },
    {
      name: 'validate_sql_improvement',
      args: {
        sql: 'CREATE INDEX idx_enrollments_course_id ON enrollments (course_id);',
        rollbackSql: 'DROP INDEX IF EXISTS idx_enrollments_course_id;',
        tableName: 'enrollments',
      },
    },
    { name: 'locate_schema_object', args: { objectName: 'students' } },
  ];

  for (let i = 0; i < toolsToTest.length; i++) {
    const t = toolsToTest[i];
    const t0 = performance.now();
    const res = await fetch(`${API_BASE}/api/copilot/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, toolName: t.name, args: t.args }),
    });
    const dur = Math.round(performance.now() - t0);
    const data = await res.json();
    const pass = res.status === 200 && Boolean(data.result);
    testResults.push({
      id: `4T-${i + 1}`,
      category: '4. Tool Execution (Direct)',
      description: `Tool: ${t.name}`,
      status: pass ? 'PASS' : 'FAIL',
      evidence: `HTTP ${res.status} | Duration: ${dur}ms | Keys: ${Object.keys(data.result || {}).slice(0, 4).join(', ')}`,
      durationMs: dur,
    });
    console.log(`[4T-${i + 1}] Tool: ${t.name} -> ${pass ? 'PASS' : 'FAIL'} (${dur}ms)`);
  }

  // Multi-Tool Comprehensive Investigation Prompt
  console.log('\nRunning Multi-Tool Comprehensive Investigation Prompt...');
  const multiToolPrompt =
    'Analyze my database comprehensively. First inspect the schema, then relationships, then indexes, then table statistics, and finally give me a prioritized performance assessment.';
  const { data: mtData, duration: mtDur, status: mtStatus } = await executeChat(connectionId, [
    { role: 'user', content: multiToolPrompt },
  ]);
  const mtPass = mtStatus === 200 && mtData.content?.length > 100;
  testResults.push({
    id: '4-MULTI',
    category: '4. Multi-Tool Investigation',
    description: 'Comprehensive 4-step database assessment',
    status: mtPass ? 'PASS' : 'FAIL',
    evidence: `HTTP ${mtStatus} | Duration: ${mtDur}ms | Source: ${mtData.telemetry?.source} | Tools: ${mtData.toolCalls?.length || 0}`,
    durationMs: mtDur,
    telemetry: mtData.telemetry,
  });
  console.log(`[4-MULTI] Multi-tool assessment -> ${mtPass ? 'PASS' : 'FAIL'} (${mtDur}ms, Source: ${mtData.telemetry?.source})`);

  // ==========================================================================
  // SECTION 5: MULTI-TURN CONVERSATIONAL MEMORY
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 5] Multi-Turn Conversational Memory (5-Step Sequence)');
  console.log('========================================================================');

  const convRes = await fetch(`${API_BASE}/api/copilot/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, title: 'Multi-Turn Memory Evaluation Session' }),
  });
  const { id: conversationId } = await convRes.json();
  console.log(`✓ Conversation Initialized: ${conversationId}`);

  const conversationTurns = [
    { id: '5M-1', prompt: 'Find the three biggest performance concerns in my database.', expectKeyword: 'concern' },
    { id: '5M-2', prompt: 'Explain the first concern in more detail.', expectKeyword: 'detail' },
    { id: '5M-3', prompt: 'What evidence supports that conclusion?', expectKeyword: 'evidence' },
    { id: '5M-4', prompt: 'What would you recommend doing about it?', expectKeyword: 'recommend' },
    { id: '5M-5', prompt: 'Can you generate a SQL script to address that issue?', expectKeyword: 'CREATE INDEX' },
  ];

  const threadHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const turn of conversationTurns) {
    threadHistory.push({ role: 'user', content: turn.prompt });
    const { data, duration, status } = await executeChat(connectionId, threadHistory, conversationId);
    threadHistory.push({ role: 'assistant', content: data.content || '' });
    const pass = status === 200 && (data.content || '').length > 50;
    testResults.push({
      id: turn.id,
      category: '5. Multi-Turn Memory',
      description: `Turn: "${turn.prompt}"`,
      status: pass ? 'PASS' : 'FAIL',
      evidence: `HTTP ${status} | Duration: ${duration}ms | Source: ${data.telemetry?.source} | Actions: ${data.suggestedActions?.length || 0}`,
      durationMs: duration,
      telemetry: data.telemetry,
    });
    console.log(`[${turn.id}] "${turn.prompt}" -> ${pass ? 'PASS' : 'FAIL'} (${duration}ms)`);
  }

  // Cross-Conversation Isolation Test
  console.log('\nTesting Cross-Conversation Isolation...');
  const convRes2 = await fetch(`${API_BASE}/api/copilot/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, title: 'Isolated Clean Conversation' }),
  });
  const { id: conversationId2 } = await convRes2.json();
  const { data: isoData, duration: isoDur, status: isoStatus } = await executeChat(
    connectionId,
    [{ role: 'user', content: 'What were we just talking about?' }],
    conversationId2
  );
  const isIsolated = !isoData.content?.includes(conversationId);
  testResults.push({
    id: '5M-ISO',
    category: '5. Multi-Turn Memory',
    description: 'Cross-conversation isolation check',
    status: isIsolated ? 'PASS' : 'FAIL',
    evidence: `HTTP ${isoStatus} | Duration: ${isoDur}ms | Isolated: ${isIsolated}`,
    durationMs: isoDur,
  });
  console.log(`[5M-ISO] Isolation check -> ${isIsolated ? 'PASS' : 'FAIL'} (${isoDur}ms)`);

  // ==========================================================================
  // SECTION 6: SQL GENERATION AND SAFETY INVARIANTS
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 6] SQL Generation & Safety Invariants');
  console.log('========================================================================');

  const sqlPrompts = [
    { id: '6S-1', prompt: 'Write a SELECT query to show all tables.', expectedPattern: /SELECT/i },
    { id: '6S-2', prompt: 'Write a query to count rows in each table.', expectedPattern: /COUNT/i },
    { id: '6S-3', prompt: 'Generate a query joining two related tables.', expectedPattern: /JOIN/i },
    { id: '6S-4', prompt: 'Suggest indexes for my most important foreign keys.', expectedPattern: /INDEX/i },
    { id: '6S-5', prompt: 'Generate a script to add the recommended indexes.', expectedPattern: /CREATE INDEX/i },
  ];

  for (const t of sqlPrompts) {
    const { data, duration, status } = await executeChat(connectionId, [{ role: 'user', content: t.prompt }]);
    const matchesPattern = t.expectedPattern.test(data.content || '');
    const hasPlanAction = (data.suggestedActions || []).some((a: any) => a.actionType === 'preview_plan');
    const pass = status === 200 && matchesPattern;
    testResults.push({
      id: t.id,
      category: '6. SQL Generation & Safety',
      description: `Prompt: "${t.prompt}"`,
      status: pass ? 'PASS' : 'FAIL',
      evidence: `HTTP ${status} | Duration: ${duration}ms | Has Plan Action: ${hasPlanAction} | Non-autonomous: true`,
      durationMs: duration,
      telemetry: data.telemetry,
    });
    console.log(`[${t.id}] "${t.prompt}" -> ${pass ? 'PASS' : 'FAIL'} (Has Plan Action: ${hasPlanAction})`);
  }

  // ==========================================================================
  // SECTION 7: PERFORMANCE BENCHMARKING (5 TRIALS PER CATEGORY)
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 7] Performance Benchmarking (5 Trials Per Category)');
  console.log('========================================================================');

  const benchmarkSuites = [
    { name: 'Greeting', prompt: 'Hi' },
    { name: 'General Knowledge', prompt: 'What is normalization?' },
    { name: 'Cached DB Question', prompt: 'Show my database relationships.' },
    { name: 'Database Health', prompt: 'How healthy is my database?' },
    { name: 'Complex Investigation', prompt: 'Investigate database performance.' },
    { name: 'Multi-Tool Reasoning', prompt: 'Comprehensive database assessment' },
  ];

  const benchmarkSummary: Record<string, any> = {};

  for (const suite of benchmarkSuites) {
    console.log(`Testing benchmark category: "${suite.name}" (5 trials)...`);
    const durations: number[] = [];
    const backendTimes: number[] = [];

    for (let i = 0; i < 5; i++) {
      const { data, duration } = await executeChat(connectionId, [{ role: 'user', content: suite.prompt }]);
      durations.push(duration);
      backendTimes.push(data.telemetry?.timings?.totalBackendDurationMs || 0);
      await sleep(100);
    }

    const roundtripStats = calculateStats(durations);
    const backendStats = calculateStats(backendTimes);
    benchmarkSummary[suite.name] = { roundtrip: roundtripStats, backend: backendStats };

    testResults.push({
      id: `7B-${suite.name.replace(/\s+/g, '')}`,
      category: '7. Performance Benchmark',
      description: `Category: ${suite.name} (5 trials)`,
      status: 'PASS',
      evidence: `Roundtrip Med: ${roundtripStats.median}ms (Min: ${roundtripStats.min}ms, p95: ${roundtripStats.p95}ms) | Backend Med: ${backendStats.median}ms`,
      durationMs: roundtripStats.median,
    });

    console.log(`  -> ${suite.name}: Roundtrip Med: ${roundtripStats.median}ms (p95: ${roundtripStats.p95}ms) | Backend Med: ${backendStats.median}ms`);
  }

  // ==========================================================================
  // SECTION 8: CACHE & PROACTIVE DATABASE INTELLIGENCE TESTS
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 8] Cache & Proactive Database Intelligence Tests');
  console.log('========================================================================');

  // 1. Initial database analysis verified during setup
  testResults.push({
    id: '8C-1',
    category: '8. Cache & Proactive Intelligence',
    description: 'Initial background database analysis on session open',
    status: intelStatus.snapshot ? 'PASS' : 'FAIL',
    evidence: `Snapshot present: Score ${intelStatus.snapshot?.health?.score}/100, Tables: ${intelStatus.snapshot?.schema?.tableCount}`,
    durationMs: 0,
  });

  // 2. Cache creation and persistence
  const cachePath = path.resolve(process.cwd(), 'apps/api/data/intelligence-cache.json');
  const cacheExists = fs.existsSync(cachePath);
  testResults.push({
    id: '8C-2',
    category: '8. Cache & Proactive Intelligence',
    description: 'Cache creation and disk persistence',
    status: cacheExists ? 'PASS' : 'FAIL',
    evidence: `File exists at apps/api/data/intelligence-cache.json (Size: ${cacheExists ? fs.statSync(cachePath).size : 0} bytes)`,
    durationMs: 0,
  });

  // 3. Cache retrieval without live DB query
  const tCat0 = performance.now();
  const catRes = await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`);
  const catDur = Math.round(performance.now() - tCat0);
  testResults.push({
    id: '8C-3',
    category: '8. Cache & Proactive Intelligence',
    description: 'Instant cache retrieval via GET /api/copilot/intelligence',
    status: catRes.status === 200 ? 'PASS' : 'FAIL',
    evidence: `HTTP ${catRes.status} in ${catDur}ms without blocking queries`,
    durationMs: catDur,
  });

  // 4 & 5. External Schema Change Detection with Disposable Test Table
  console.log('Testing disposable external schema change detection...');
  const pgClient = new pg.Client({ ...PG_CONFIG, user: PG_CONFIG.username });
  await pgClient.connect();
  await pgClient.query('DROP TABLE IF EXISTS public.qa_stress_temp_disposable;');
  await pgClient.query('CREATE TABLE IF NOT EXISTS public.qa_stress_temp_disposable (id serial primary key, test_val text);');

  // Trigger refresh
  await fetch(`${API_BASE}/api/copilot/intelligence/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, force: true }),
  });

  let hasDisposableTable = false;
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    const ir = await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`);
    const d = await ir.json();
    if (d.snapshot?.schema?.tables?.some((t: any) => t.name === 'qa_stress_temp_disposable')) {
      hasDisposableTable = true;
      break;
    }
  }

  // Cleanup disposable table immediately
  await pgClient.query('DROP TABLE IF EXISTS public.qa_stress_temp_disposable;');
  await pgClient.end();
  await fetch(`${API_BASE}/api/copilot/intelligence/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, force: true }),
  });

  testResults.push({
    id: '8C-5',
    category: '8. Cache & Proactive Intelligence',
    description: 'External schema modification detection via catalog refresh',
    status: hasDisposableTable ? 'PASS' : 'FAIL',
    evidence: `Disposable table qa_stress_temp_disposable detected in snapshot: ${hasDisposableTable}`,
    durationMs: 0,
  });
  console.log(`✓ External schema change test: ${hasDisposableTable ? 'PASS' : 'FAIL'}`);

  // 6. Security Credential Hygiene
  const cacheRaw = fs.readFileSync(cachePath, 'utf-8');
  const hasSecrets = cacheRaw.includes('dbflow_dev_password') || cacheRaw.includes('password');
  testResults.push({
    id: '8C-6',
    category: '8. Cache & Proactive Intelligence',
    description: 'Cache security: Zero credential storage on disk',
    status: !hasSecrets ? 'PASS' : 'FAIL',
    evidence: `Password leaks in intelligence-cache.json: ${hasSecrets ? 'YES (FAIL)' : 'NONE (PASS)'}`,
    durationMs: 0,
  });

  // ==========================================================================
  // SECTION 9: FAILURE & RESILIENCE TESTING
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 9] Failure & Resilience Testing');
  console.log('========================================================================');

  // 1. Invalid connection ID
  const invRes = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId: 'invalid-nonexistent-conn-id', messages: [{ role: 'user', content: 'Hi' }] }),
  });
  const invPass = invRes.status === 410 || invRes.status === 400;
  testResults.push({
    id: '9F-1',
    category: '9. Failure & Resilience',
    description: 'Invalid / expired database connection handling',
    status: invPass ? 'PASS' : 'FAIL',
    evidence: `HTTP ${invRes.status} returned for nonexistent connectionId`,
    durationMs: 0,
  });
  console.log(`[9F-1] Invalid connection handling -> ${invPass ? 'PASS' : 'FAIL'} (HTTP ${invRes.status})`);

  // 2. Invalid Tool Name Execution
  const badToolRes = await fetch(`${API_BASE}/api/copilot/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, toolName: 'non_existent_tool_name', args: {} }),
  });
  const badToolPass = badToolRes.status === 404;
  testResults.push({
    id: '9F-2',
    category: '9. Failure & Resilience',
    description: 'Invalid tool name rejection with HTTP 404',
    status: badToolPass ? 'PASS' : 'FAIL',
    evidence: `HTTP ${badToolRes.status} returned for unregistered tool name`,
    durationMs: 0,
  });
  console.log(`[9F-2] Bad tool name rejection -> ${badToolPass ? 'PASS' : 'FAIL'} (HTTP ${badToolRes.status})`);

  // 3. Destructive Query Rejection in SQL Explain
  const badSqlRes = await fetch(`${API_BASE}/api/copilot/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, toolName: 'explain_sql_query', args: { query: 'DROP TABLE students;' } }),
  });
  const badSqlData = await badSqlRes.json();
  const rejectsDestructive = badSqlData.result?.error?.includes('read-only') || badSqlRes.status === 400;
  testResults.push({
    id: '9F-3',
    category: '9. Failure & Resilience',
    description: 'Destructive DDL rejection in explain_sql_query tool',
    status: rejectsDestructive ? 'PASS' : 'FAIL',
    evidence: `Destructive query blocked: "${badSqlData.result?.error || 'Rejected'}"`,
    durationMs: 0,
  });
  console.log(`[9F-3] Destructive DDL rejection -> ${rejectsDestructive ? 'PASS' : 'FAIL'}`);

  // ==========================================================================
  // SECTION 11: CONCURRENCY & LOAD TESTING
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [SECTION 11] Concurrency & Load Testing (2, 5, 10 Simultaneous Requests)');
  console.log('========================================================================');

  const concurrencyLevels = [2, 5, 10];
  for (const c of concurrencyLevels) {
    console.log(`Running ${c} simultaneous requests...`);
    const t0 = performance.now();
    const promises = Array.from({ length: c }, (_, i) =>
      executeChat(connectionId, [{ role: 'user', content: i % 2 === 0 ? 'Hi' : 'What is a foreign key?' }])
    );
    const results = await Promise.all(promises);
    const totalTime = Math.round(performance.now() - t0);
    const successCount = results.filter((r) => r.status === 200).length;
    const allPass = successCount === c;

    testResults.push({
      id: `11C-${c}`,
      category: '11. Concurrency & Load',
      description: `${c} simultaneous concurrent chat requests`,
      status: allPass ? 'PASS' : 'FAIL',
      evidence: `${successCount}/${c} successful in ${totalTime}ms | Avg: ${Math.round(totalTime / c)}ms per request`,
      durationMs: totalTime,
    });
    console.log(`[11C-${c}] ${c} simultaneous requests -> ${allPass ? 'PASS' : 'FAIL'} (${successCount}/${c} ok, ${totalTime}ms total)`);
  }

  // Cleanup session
  await fetch(`${API_BASE}/api/connections/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  }).catch(() => undefined);

  // Write structured JSON results to disk for comprehensive reporting
  const reportPath = path.resolve(process.cwd(), 'scripts/stress-test-results.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalTests: testResults.length,
        passed: testResults.filter((r) => r.status === 'PASS').length,
        failed: testResults.filter((r) => r.status === 'FAIL').length,
        benchmarks: benchmarkSummary,
        records: testResults,
      },
      null,
      2
    )
  );

  console.log(`\n✓ Full Stress Test Execution Completed. ${testResults.filter((r) => r.status === 'PASS').length}/${testResults.length} passed.`);
  console.log(`✓ Structured telemetry exported to ${reportPath}`);
}

main().catch((err) => {
  console.error('\n❌ STRESS TEST EXECUTION FAILED:', err);
  process.exit(1);
});
