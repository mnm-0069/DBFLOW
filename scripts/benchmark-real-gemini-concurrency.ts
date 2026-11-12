// scripts/benchmark-real-gemini-concurrency.ts
// Real-world Gemini Concurrency Benchmark Suite for DBFlow Copilot
// Tests genuine model invocation under 2 and 5 simultaneous parallel requests.

import { performance } from 'node:perf_hooks';

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

interface RequestMetric {
  promptIndex: number;
  prompt: string;
  status: number;
  clientSubmittedAt: string;
  clientCompletedAt: string;
  totalRoundtripMs: number;
  provider: string;
  model: string;
  source: string;
  isGenuineGemini: boolean;
  modelInitiatedAt?: string;
  modelResponseAt?: string;
  modelLatencyMs?: number;
  toolCallsCount: number;
  toolCalls?: Array<{ name: string; durationMs?: number }>;
  errorMessage?: string;
}

const BENCHMARK_PROMPTS = [
  'What are the concrete trade-offs between BIGINT and UUID primary keys for the students table in this PostgreSQL schema?',
  'Analyze how adding a partial index on submissions where grade IS NOT NULL affects query and write throughput.',
  'Explain why unindexed foreign keys on enrollments cause row-level locking bottlenecks during parent table updates.',
  'How would table partitioning on attendance by date impact sequential scan reduction in this academic database?',
  'Evaluate whether the current university schema satisfies Boyce-Codd Normal Form (BCNF) or has transitive functional dependencies.',
];

async function runSingleRequest(
  connectionId: string,
  prompt: string,
  index: number
): Promise<RequestMetric> {
  const submittedAt = new Date();
  const t0 = performance.now();

  try {
    const res = await fetch(`${API_BASE}/api/copilot/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionId,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const totalRoundtripMs = Math.round(performance.now() - t0);
    const completedAt = new Date();
    const data = await res.json();

    const telemetry = data.telemetry || {};
    const timings = telemetry.timings || {};

    const modelInitiatedAt = timings.geminiRequestStartedAt;
    const modelResponseAt = timings.geminiResponseReceivedAt;
    const modelLatencyMs =
      modelInitiatedAt && modelResponseAt
        ? new Date(modelResponseAt).getTime() - new Date(modelInitiatedAt).getTime()
        : undefined;

    const source = telemetry.source || 'unknown';
    const provider = telemetry.provider || 'unknown';
    const model = telemetry.model || 'unknown';
    const isGenuineGemini = provider === 'gemini' && (source === 'gemini_direct' || source === 'gemini_with_tools');

    return {
      promptIndex: index + 1,
      prompt,
      status: res.status,
      clientSubmittedAt: submittedAt.toISOString(),
      clientCompletedAt: completedAt.toISOString(),
      totalRoundtripMs,
      provider,
      model,
      source,
      isGenuineGemini,
      modelInitiatedAt,
      modelResponseAt,
      modelLatencyMs,
      toolCallsCount: telemetry.toolCallsCount || 0,
      toolCalls: (data.toolCalls || []).map((tc: any) => ({
        name: tc.name,
      })),
      errorMessage: res.status !== 200 ? data.error : undefined,
    };
  } catch (err: any) {
    const totalRoundtripMs = Math.round(performance.now() - t0);
    return {
      promptIndex: index + 1,
      prompt,
      status: 0,
      clientSubmittedAt: submittedAt.toISOString(),
      clientCompletedAt: new Date().toISOString(),
      totalRoundtripMs,
      provider: 'none',
      model: 'none',
      source: 'network_error',
      isGenuineGemini: false,
      toolCallsCount: 0,
      errorMessage: err.message,
    };
  }
}

async function runConcurrencyBatch(
  connectionId: string,
  batchSize: number,
  prompts: string[]
): Promise<{
  batchSize: number;
  totalBatchDurationMs: number;
  metrics: RequestMetric[];
  genuineGeminiCount: number;
  fallbackCount: number;
  rateLimitedCount: number;
}> {
  console.log(`\n========================================================================`);
  console.log(`▶ Testing ${batchSize} Simultaneous Genuine Model-Powered Requests`);
  console.log(`========================================================================`);

  const selectedPrompts = prompts.slice(0, batchSize);
  const batchStart = performance.now();

  // Launch all requests simultaneously
  const promises = selectedPrompts.map((p, idx) =>
    runSingleRequest(connectionId, p, idx)
  );

  const metrics = await Promise.all(promises);
  const totalBatchDurationMs = Math.round(performance.now() - batchStart);

  let genuineGeminiCount = 0;
  let fallbackCount = 0;
  let rateLimitedCount = 0;

  for (const m of metrics) {
    if (m.isGenuineGemini) genuineGeminiCount++;
    else if (m.status === 429 || m.errorMessage?.includes('429') || m.errorMessage?.includes('quota')) rateLimitedCount++;
    else fallbackCount++;

    console.log(`\n[Req #${m.promptIndex}] "${m.prompt.slice(0, 55)}..."`);
    console.log(`  - Status: HTTP ${m.status} | Client Roundtrip: ${m.totalRoundtripMs}ms`);
    console.log(`  - Provider: ${m.provider} | Model: ${m.model} | Source: ${m.source}`);
    console.log(`  - Genuine Gemini: ${m.isGenuineGemini ? 'YES (Verified)' : 'NO (Fallback/Circuit)'}`);
    if (m.modelInitiatedAt) {
      console.log(`  - Model Request Initiated: ${m.modelInitiatedAt}`);
      console.log(`  - Model Response Received: ${m.modelResponseAt}`);
      console.log(`  - Model Generation Time:   ${m.modelLatencyMs}ms`);
    }
    if (m.toolCallsCount > 0) {
      console.log(`  - Tool Calls Executed (${m.toolCallsCount}): ${m.toolCalls?.map(t => t.name).join(', ')}`);
    }
    if (m.errorMessage) {
      console.log(`  - Error: ${m.errorMessage}`);
    }
  }

  console.log(`\nSummary for ${batchSize} Parallel Requests:`);
  console.log(`  - Total Wall Clock Duration: ${totalBatchDurationMs}ms`);
  console.log(`  - Genuine Gemini Executions:  ${genuineGeminiCount} / ${batchSize}`);
  console.log(`  - Rate-Limited / Quota Exceeded: ${rateLimitedCount} / ${batchSize}`);
  console.log(`  - Heuristic / Offline Fallback:  ${fallbackCount} / ${batchSize}`);

  return {
    batchSize,
    totalBatchDurationMs,
    metrics,
    genuineGeminiCount,
    fallbackCount,
    rateLimitedCount,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('DBFLOW — REAL GEMINI CONCURRENCY BENCHMARK SUITE');
  console.log('========================================================================');

  // Step 1: Open Connection
  console.log('▶ Opening Database Connection...');
  const openRes = await fetch(`${API_BASE}/api/connections/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(PG_CONFIG),
  });
  const openData = await openRes.json();
  const connectionId = openData.connectionId;
  console.log(`✓ Connected: ${connectionId.slice(0, 16)}...`);

  try {
    // Test 1: Concurrency 2
    const batch2 = await runConcurrencyBatch(connectionId, 2, BENCHMARK_PROMPTS);

    // Give a 2-second breathing room for rate limits
    await new Promise((r) => setTimeout(r, 2000));

    // Test 2: Concurrency 5
    const batch5 = await runConcurrencyBatch(connectionId, 5, BENCHMARK_PROMPTS);

    console.log('\n========================================================================');
    console.log('▶ BENCHMARK COMPLETE');
    console.log('========================================================================');
  } finally {
    // Close session
    await fetch(`${API_BASE}/api/connections/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    });
    console.log('✓ Database session closed cleanly.');
  }
}

main().catch(console.error);
