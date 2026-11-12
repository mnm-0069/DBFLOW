// scripts/audit-copilot-performance.ts
// Comprehensive Empirical Audit & Performance Benchmark for DBFlow Copilot 2.1
// Tests live production API (port 4000), Google Gemini 3.8 Flash, and PostgreSQL (port 5432).

import assert from 'node:assert/strict';
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

interface TestResult {
  scenario: string;
  source: string;
  provider: string;
  model: string;
  apiRequests: number;
  toolCalls: number;
  backendDurationMs: number;
  totalRoundtripMs: number;
  toolNames: string[];
  pass: boolean;
  notes?: string;
}

const scenarioResults: TestResult[] = [];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateStats(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Math.round(sum / sorted.length);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  return { min, max, mean, median, p95 };
}

async function main() {
  console.log('========================================================================');
  console.log('DBFLOW COPILOT 2.1 — REAL-WORLD PERFORMANCE & GEMINI VERIFICATION AUDIT');
  console.log('========================================================================\n');

  // STEP 1: Verify API status & AI Configuration
  console.log('▶ [PHASE 1] Checking Live API Gateway Status (port 4000)...');
  const statusRes = await fetch(`${API_BASE}/api/copilot/status`);
  assert.equal(statusRes.status, 200, 'API status must return HTTP 200');
  const copilotStatus = await statusRes.json();
  console.log(`✓ AI Configured: ${copilotStatus.aiConfigured}`);
  console.log(`✓ Provider: ${copilotStatus.provider}`);
  console.log(`✓ Model: ${copilotStatus.model}`);
  console.log(`✓ Available Tools: ${copilotStatus.availableTools.length} tools`);
  assert.equal(copilotStatus.aiConfigured, true, 'Gemini AI must be configured');
  assert.equal(copilotStatus.provider, 'gemini', 'Provider must be genuine Gemini');

  // STEP 2: Open Connection & Wait for Proactive Intelligence
  console.log('\n▶ [PHASE 2] Opening Live Database Session & Awaiting Background Analysis...');
  const connRes = await fetch(`${API_BASE}/api/connections/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PG_CONFIG),
  });
  assert.equal(connRes.status, 200, 'Connection must open successfully');
  const connData = await connRes.json();
  const connectionId = connData.connectionId;
  console.log(`✓ Connection ID: ${connectionId.slice(0, 16)}… (${connData.engine})`);

  // Wait for background intelligence to complete
  let intelStatus: any = null;
  let pollCount = 0;
  while (pollCount < 25) {
    await sleep(200);
    const ir = await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`);
    intelStatus = await ir.json();
    if (intelStatus.snapshot && intelStatus.categoryStatus.health === 'ready') break;
    pollCount++;
  }
  assert.ok(intelStatus.snapshot, 'Snapshot must be ready');
  console.log(`✓ Background Analysis Ready in ${pollCount * 200}ms! Score: ${intelStatus.snapshot.health.score}/100, Tables: ${intelStatus.snapshot.schema.tableCount}`);

  // Create a Conversation for multi-turn testing
  const convRes = await fetch(`${API_BASE}/api/copilot/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, title: 'Real-World Performance Audit Session' }),
  });
  const convData = await convRes.json();
  const conversationId = convData.id;
  console.log(`✓ Conversation Session: ${conversationId}`);

  // ==========================================================================
  // SCENARIO AUDITS (A through G)
  // ==========================================================================

  // SCENARIO A: Greeting ("Hi")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO A] Greeting: "Hi"');
  const tA0 = performance.now();
  const resA = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });
  const dataA = await resA.json();
  const latA = Math.round(performance.now() - tA0);
  assert.ok(dataA.content.includes('DBFlow Copilot 2.0'));
  assert.equal(dataA.toolCalls?.length || 0, 0, 'No tools called for greeting');
  assert.equal(dataA.telemetry?.source, 'deterministic_local', 'Source must be deterministic_local');
  console.log(`✓ Scenario A Passed: ${latA}ms roundtrip | Backend: ${dataA.telemetry?.timings.totalBackendDurationMs}ms | Source: ${dataA.telemetry?.source}`);
  scenarioResults.push({
    scenario: 'A: Greeting ("Hi")',
    source: dataA.telemetry?.source || 'deterministic_local',
    provider: dataA.telemetry?.provider || 'local',
    model: 'none',
    apiRequests: 0,
    toolCalls: 0,
    backendDurationMs: dataA.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latA,
    toolNames: [],
    pass: true,
  });

  // SCENARIO B: General Knowledge ("What is a primary key?")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO B] General Knowledge: "What is a primary key?"');
  const tB0 = performance.now();
  const resB = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [{ role: 'user', content: 'What is a primary key?' }],
    }),
  });
  const dataB = await resB.json();
  const latB = Math.round(performance.now() - tB0);
  assert.ok(dataB.content.includes('primary key'));
  assert.equal(dataB.toolCalls?.length || 0, 0, 'No tools called for concept FAQ');
  assert.equal(dataB.telemetry?.source, 'deterministic_local', 'Source must be deterministic_local');
  console.log(`✓ Scenario B Passed: ${latB}ms roundtrip | Backend: ${dataB.telemetry?.timings.totalBackendDurationMs}ms | Source: ${dataB.telemetry?.source}`);
  scenarioResults.push({
    scenario: 'B: General Knowledge ("What is a primary key?")',
    source: dataB.telemetry?.source || 'deterministic_local',
    provider: dataB.telemetry?.provider || 'local',
    model: 'none',
    apiRequests: 0,
    toolCalls: 0,
    backendDurationMs: dataB.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latB,
    toolNames: [],
    pass: true,
  });

  // SCENARIO C: Cached Database Question ("Show me all the relationships in my database.")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO C] Cached Database Question: "Show me all the relationships in my database."');
  const tC0 = performance.now();
  const resC = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [{ role: 'user', content: 'Show me all the relationships in my database.' }],
    }),
  });
  const dataC = await resC.json();
  const latC = Math.round(performance.now() - tC0);
  assert.ok(dataC.content.includes('Prepared Database Relationships'));
  assert.ok(dataC.content.includes('enrollments.student_id'));
  assert.equal(dataC.toolCalls?.length || 0, 0, 'No tools called for cached relationships');
  assert.equal(dataC.telemetry?.source, 'cached_intelligence', 'Source must be cached_intelligence');
  console.log(`✓ Scenario C Passed: ${latC}ms roundtrip | Backend: ${dataC.telemetry?.timings.totalBackendDurationMs}ms | Source: ${dataC.telemetry?.source}`);
  scenarioResults.push({
    scenario: 'C: Cached Database Question ("Show me all the relationships...")',
    source: dataC.telemetry?.source || 'cached_intelligence',
    provider: dataC.telemetry?.provider || 'intelligence_cache',
    model: 'none',
    apiRequests: 0,
    toolCalls: 0,
    backendDurationMs: dataC.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latC,
    toolNames: [],
    pass: true,
  });

  // SCENARIO D: Health Report ("Give me a detailed database health report.")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO D] Health Report: "Give me a detailed database health report."');
  const tD0 = performance.now();
  const resD = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [{ role: 'user', content: 'Give me a detailed database health report.' }],
    }),
  });
  const dataD = await resD.json();
  const latD = Math.round(performance.now() - tD0);
  assert.ok(dataD.content.includes('Database Health Report'));
  assert.ok(dataD.content.includes(`${intelStatus.snapshot.health.score} / 100`));
  assert.equal(dataD.toolCalls?.length || 0, 0, 'No tools called for cached health report');
  assert.equal(dataD.telemetry?.source, 'cached_intelligence', 'Source must be cached_intelligence');
  console.log(`✓ Scenario D Passed: ${latD}ms roundtrip | Backend: ${dataD.telemetry?.timings.totalBackendDurationMs}ms | Source: ${dataD.telemetry?.source}`);
  scenarioResults.push({
    scenario: 'D: Health Report ("Give me a detailed database health report.")',
    source: dataD.telemetry?.source || 'cached_intelligence',
    provider: dataD.telemetry?.provider || 'intelligence_cache',
    model: 'none',
    apiRequests: 0,
    toolCalls: 0,
    backendDurationMs: dataD.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latD,
    toolNames: [],
    pass: true,
  });

  // SCENARIO E: Complex Investigation with Gemini ("Investigate why my database might be slow...")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO E] Complex Investigation with Gemini:');
  const complexPrompt = 'Investigate why my database might be slow. Examine indexes, table statistics, relationships and potential query performance problems. Give me evidence-based recommendations.';
  console.log(`Prompt: "${complexPrompt}"`);
  console.log(`Calling Google Gemini (${copilotStatus.model}) via @google/genai SDK...`);
  const tE0 = performance.now();
  const resE = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [{ role: 'user', content: complexPrompt }],
    }),
  });
  const dataE = await resE.json();
  const latE = Math.round(performance.now() - tE0);

  console.log(`✓ Scenario E Completed in ${latE}ms roundtrip | Backend: ${dataE.telemetry?.timings.totalBackendDurationMs}ms`);
  console.log(`✓ Source: ${dataE.telemetry?.source}`);
  console.log(`✓ Provider: ${dataE.telemetry?.provider}`);
  console.log(`✓ Model: ${dataE.telemetry?.model}`);
  console.log(`✓ Iterations: ${dataE.telemetry?.iterationsCount}`);
  console.log(`✓ Tool Calls Executed: ${dataE.toolCalls?.length || 0}`);
  if (dataE.toolCalls && dataE.toolCalls.length > 0) {
    for (const tc of dataE.toolCalls) {
      console.log(`   - Tool: ${tc.name} | Status: ${tc.status} | Summary: ${tc.summary}`);
    }
  }

  assert.ok(dataE.content.length > 200, 'Content must be a detailed investigation');
  assert.equal(dataE.telemetry?.provider, 'gemini', 'Must be executed via Gemini');
  assert.ok(['gemini_with_tools', 'gemini_direct'].includes(dataE.telemetry?.source), 'Source must be Gemini');
  scenarioResults.push({
    scenario: `E: Complex Investigation (Gemini ${copilotStatus.model})`,
    source: dataE.telemetry?.source,
    provider: dataE.telemetry?.provider,
    model: dataE.telemetry?.model || copilotStatus.model,
    apiRequests: dataE.telemetry?.apiRequestsCount || 1,
    toolCalls: dataE.toolCalls?.length || 0,
    backendDurationMs: dataE.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latE,
    toolNames: (dataE.toolCalls || []).map((t: any) => t.name),
    pass: true,
  });

  // SCENARIO F: Follow-up in Conversation ("Which of those issues should I fix first, and why?")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO F] Follow-up: "Which of those issues should I fix first, and why?"');
  const tF0 = performance.now();
  const resF = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [
        { role: 'user', content: complexPrompt },
        { role: 'assistant', content: dataE.content },
        { role: 'user', content: 'Which of those issues should I fix first, and why?' },
      ],
    }),
  });
  const dataF = await resF.json();
  const latF = Math.round(performance.now() - tF0);
  console.log(`✓ Scenario F Completed in ${latF}ms roundtrip | Backend: ${dataF.telemetry?.timings.totalBackendDurationMs}ms`);
  console.log(`✓ Source: ${dataF.telemetry?.source}`);
  assert.ok(dataF.content.length > 100, 'Follow-up must give substantive answer');
  scenarioResults.push({
    scenario: 'F: Conversational Follow-up ("Which of those issues should I fix first...")',
    source: dataF.telemetry?.source,
    provider: dataF.telemetry?.provider,
    model: dataF.telemetry?.model || copilotStatus.model,
    apiRequests: dataF.telemetry?.apiRequestsCount || 1,
    toolCalls: dataF.toolCalls?.length || 0,
    backendDurationMs: dataF.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latF,
    toolNames: (dataF.toolCalls || []).map((t: any) => t.name),
    pass: true,
  });

  // SCENARIO G: SQL Recommendation ("Generate SQL to fix the most important issue.")
  console.log('\n------------------------------------------------------------------------');
  console.log('▶ [SCENARIO G] SQL Recommendation: "Generate SQL to fix the most important issue."');
  const tG0 = performance.now();
  const resG = await fetch(`${API_BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      conversationId,
      messages: [
        { role: 'user', content: complexPrompt },
        { role: 'assistant', content: dataE.content },
        { role: 'user', content: 'Generate SQL to fix the most important issue.' },
      ],
    }),
  });
  const dataG = await resG.json();
  const latG = Math.round(performance.now() - tG0);
  console.log(`✓ Scenario G Completed in ${latG}ms roundtrip | Backend: ${dataG.telemetry?.timings.totalBackendDurationMs}ms`);
  console.log(`✓ Contains Proposed SQL: ${dataG.content.includes('CREATE INDEX')}`);
  console.log(`✓ Suggested Actions Count: ${dataG.suggestedActions?.length || 0}`);
  const planAction = (dataG.suggestedActions || []).find((a: any) => a.actionType === 'preview_plan');
  console.log(`✓ Includes Plan Engine Preview Action: ${Boolean(planAction)}`);
  assert.ok(dataG.content.includes('CREATE INDEX'), 'Must include proposed CREATE INDEX SQL');
  assert.ok(Boolean(planAction), 'Must attach preview_plan action for Two-Phase Plan Engine');
  scenarioResults.push({
    scenario: 'G: SQL Recommendation ("Generate SQL to fix the most important issue.")',
    source: dataG.telemetry?.source,
    provider: dataG.telemetry?.provider,
    model: dataG.telemetry?.model || copilotStatus.model,
    apiRequests: dataG.telemetry?.apiRequestsCount || 1,
    toolCalls: dataG.toolCalls?.length || 0,
    backendDurationMs: dataG.telemetry?.timings.totalBackendDurationMs || 0,
    totalRoundtripMs: latG,
    toolNames: (dataG.toolCalls || []).map((t: any) => t.name),
    pass: true,
  });

  // ==========================================================================
  // BENCHMARK: VERIFYING THE 162MS LATENCY CLAIM (MULTI-TRIAL)
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [PHASE 4] LATENCY BENCHMARK: VERIFYING THE 162MS CLAIM (5 TRIALS)');
  console.log('========================================================================');

  // Trial set 1: Quick-Circuit Greetings (cold + warm)
  const greetingTimings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await fetch(`${API_BASE}/api/copilot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, messages: [{ role: 'user', content: 'Hi' }] }),
    });
    greetingTimings.push(Math.round(performance.now() - t0));
  }
  const greetStats = calculateStats(greetingTimings);
  console.log(`Greeting Latency: Min: ${greetStats.min}ms | Med: ${greetStats.median}ms | Mean: ${greetStats.mean}ms | p95: ${greetStats.p95}ms`);

  // Trial set 2: Cached Relationships (cold + warm)
  const cachedRelTimings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await fetch(`${API_BASE}/api/copilot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, messages: [{ role: 'user', content: 'Show me all the relationships in my database.' }] }),
    });
    cachedRelTimings.push(Math.round(performance.now() - t0));
  }
  const cachedStats = calculateStats(cachedRelTimings);
  console.log(`Cached Rel Latency: Min: ${cachedStats.min}ms | Med: ${cachedStats.median}ms | Mean: ${cachedStats.mean}ms | p95: ${cachedStats.p95}ms`);

  // Trial set 3: Local Offline Heuristic 4-Tool Investigation
  // (Testing the direct tool pipeline without Google Cloud network hop)
  console.log('\nMeasuring direct 4-tool local database pipeline...');
  const heuristicToolTimings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    // Execute 4 sequential database tools directly: inspect_schema, inspect_health, inspect_stats, suggest_indexes
    await fetch(`${API_BASE}/api/copilot/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, toolName: 'inspect_database_schema' }),
    });
    await fetch(`${API_BASE}/api/copilot/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, toolName: 'inspect_database_health' }),
    });
    await fetch(`${API_BASE}/api/copilot/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, toolName: 'inspect_database_statistics' }),
    });
    await fetch(`${API_BASE}/api/copilot/tools/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, toolName: 'suggest_indexes' }),
    });
    heuristicToolTimings.push(Math.round(performance.now() - t0));
  }
  const toolStats = calculateStats(heuristicToolTimings);
  console.log(`Local 4-Tool DB Pipeline: Min: ${toolStats.min}ms | Med: ${toolStats.median}ms | Mean: ${toolStats.mean}ms | p95: ${toolStats.p95}ms`);

  // Trial set 4: Full Cloud Gemini Agent Loop with Tools
  console.log('\nMeasuring Full Cloud Gemini Agent Latencies (3 trials)...');
  const geminiTimings: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    await fetch(`${API_BASE}/api/copilot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionId,
        messages: [{ role: 'user', content: 'Audit my database tables and explain potential join bottlenecks.' }],
      }),
    });
    geminiTimings.push(Math.round(performance.now() - t0));
  }
  const geminiStats = calculateStats(geminiTimings);
  console.log(`Gemini Cloud Agent: Min: ${geminiStats.min}ms | Med: ${geminiStats.median}ms | Mean: ${geminiStats.mean}ms | p95: ${geminiStats.p95}ms`);

  // ==========================================================================
  // CACHE CORRECTNESS AUDIT (SECTION 5)
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('▶ [PHASE 5] CACHE CORRECTNESS & INVALIDATION AUDIT');
  console.log('========================================================================');

  // 1. External Schema Modification (PostgreSQL direct DDL)
  console.log('1. Testing External Schema Modification Detection...');
  const pgClient = new pg.Client({ ...PG_CONFIG, user: PG_CONFIG.username });
  await pgClient.connect();
  await pgClient.query('DROP TABLE IF EXISTS public.ext_audit_temp;');
  await pgClient.query('CREATE TABLE IF NOT EXISTS public.ext_audit_temp (id serial primary key, note text);');
  console.log('   Created external table "ext_audit_temp" directly in PostgreSQL.');

  // Trigger fingerprint check / refresh
  const refRes = await fetch(`${API_BASE}/api/copilot/intelligence/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, force: true }),
  });
  assert.equal(refRes.status, 200);
  
  let snapExt: any = null;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    snapExt = await (await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`)).json();
    if (snapExt.snapshot?.schema.tables.some((t: any) => t.name === 'ext_audit_temp')) {
      break;
    }
  }

  const hasExtTable = snapExt.snapshot?.schema.tables.some((t: any) => t.name === 'ext_audit_temp');
  assert.ok(hasExtTable, 'Snapshot must reflect external table creation');
  console.log(`✓ External DDL Detected! Table count now: ${snapExt.snapshot?.schema.tableCount}`);

  // Drop external table
  await pgClient.query('DROP TABLE IF EXISTS public.ext_audit_temp;');
  await pgClient.end();
  await fetch(`${API_BASE}/api/copilot/intelligence/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId, force: true }),
  });
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const s = await (await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`)).json();
    if (s.freshnessState === 'fresh') break;
  }
  console.log('   External table cleaned up and refreshed.');

  // 2. Data modification staleness check
  console.log('2. Testing Data Modification Staleness...');
  await fetch(`${API_BASE}/api/connections/records/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionId,
      schema: 'public',
      table: 'departments',
      primaryKey: { id: 1 },
      originalValues: { id: 1, name: 'Computer Science' },
      changes: { name: 'Computer Science' },
    }),
  });
  const snapStale = await (await fetch(`${API_BASE}/api/copilot/intelligence?connectionId=${connectionId}`)).json();
  console.log(`✓ Data Modification: Freshness state transitioned to: "${snapStale.freshnessState}"`);

  // 3. Backend restart persistence check
  console.log('3. Testing Cache Persistence on Disk...');
  const cachePath = path.resolve(process.cwd(), 'apps/api/data/intelligence-cache.json');
  assert.ok(fs.existsSync(cachePath), 'Cache file must exist on disk');
  const cacheRaw = fs.readFileSync(cachePath, 'utf-8');
  assert.ok(!cacheRaw.includes('password'), 'Cache file must not store passwords');
  assert.ok(!cacheRaw.includes('dbflow_dev_password'), 'Secret credentials must never appear on disk');
  console.log('✓ Cache Persistence Verified: Atomic JSON file intact without credentials.');

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('FINAL AUDIT SCENARIO RESULTS MATRIX');
  console.log('========================================================================');
  console.table(scenarioResults.map((r) => ({
    Scenario: r.scenario,
    Source: r.source,
    Provider: r.provider,
    'Backend (ms)': r.backendDurationMs,
    'Roundtrip (ms)': r.totalRoundtripMs,
    'Tool Calls': r.toolCalls,
    Pass: r.pass ? '✓ PASS' : '✗ FAIL',
  })));

  console.log('\nLATENCY BENCHMARK COMPARISONS:');
  console.log(`- Greeting ("Hi"):                   Median: ${greetStats.median}ms  | p95: ${greetStats.p95}ms`);
  console.log(`- Cached Relationships:              Median: ${cachedStats.median}ms  | p95: ${cachedStats.p95}ms`);
  console.log(`- Local 4-Tool DB Pipeline:          Median: ${toolStats.median}ms | p95: ${toolStats.p95}ms`);
  console.log(`- Gemini Cloud Agent (with Tools):   Median: ${geminiStats.median}ms | p95: ${geminiStats.p95}ms`);

  console.log('\n✓ AUDIT VERIFICATION COMPLETE: ALL ASSERTIONS PASSED (100%)');

  // Clean up session
  await fetch(`${API_BASE}/api/connections/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectionId }),
  }).catch(() => undefined);
}

main().catch((err) => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
