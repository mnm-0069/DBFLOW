// Background analysis orchestrator for database intelligence and cache warming.

import { createHash } from 'node:crypto';
import type {
  DatabaseIntelligenceSnapshot,
  IntelligenceCategoryStatus,
  IntelligenceFreshnessState,
  JobLifecycleState,
  TableProfile,
  TableColumnProfile,
  HealthFinding,
} from '@idp/shared';
import type { DatabaseSession } from './connection-service.js';
import { getDatabaseSession, introspectDatabaseSchema } from './connection-service.js';
import {
  analyzeDatabaseHealth,
  fetchDatabaseIndexes,
  fetchTableStatistics,
  hasIndexOnColumn,
  type RawIndexInfo,
} from './databaseHealthAnalyzer.js';
import {
  getIntelligence,
  saveIntelligence,
  updateCategoryStatus,
  deleteIntelligence,
} from './intelligenceStore.js';

const QUERY_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const FINGERPRINT_POLL_INTERVAL_MS = 30000;

interface ActiveJob {
  connectionId: string;
  generation: number;
  state: JobLifecycleState;
  startedAt: string;
  abortController: AbortController;
  retryCount: number;
  pendingRefreshReason?: string;
}

const activeJobs = new Map<string, ActiveJob>();
const connectionGenerations = new Map<string, number>();
let pollingTimer: NodeJS.Timeout | null = null;

export async function computeSchemaFingerprint(session: DatabaseSession): Promise<string> {
  try {
    if (session.engine === 'postgres') {
      const client = await session.pool.connect();
      try {
        await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
        const res = await client.query<{ fp: string }>(`
          SELECT COALESCE(
            md5(string_agg(c.relname || ':' || c.relfilenode::text || ':' || c.relnatts::text, ',' ORDER BY c.relname)),
            'empty'
          ) AS fp
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm');
        `);
        return res.rows[0]?.fp || 'empty';
      } finally {
        client.release();
      }
    } else {
      // MySQL
      const [rows] = await session.pool.query<any[]>(`
        SELECT COALESCE(
          MD5(GROUP_CONCAT(CONCAT(TABLE_NAME, ':', COALESCE(TABLE_ROWS, 0)) ORDER BY TABLE_NAME)),
          'empty'
        ) AS fp
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ?;
      `, [session.database]);
      return (rows as any[])[0]?.fp || 'empty';
    }
  } catch (err) {
    // Fallback: hash current timestamp if catalog query fails
    return createHash('md5').update(`fallback-${Date.now()}`).digest('hex');
  }
}

function computeRelationships(tables: any[]) {
  const graph: Array<{
    fromTable: string;
    fromColumns: string[];
    toTable: string;
    toColumns: string[];
    constraintName: string;
  }> = [];

  const parentChildMappings: Record<string, string[]> = {};
  const referencedTables = new Set<string>();
  const tablesWithFks = new Set<string>();

  for (const table of tables) {
    const fromName = table.name;
    const fks = (table.foreignKeys || []) as any[];
    if (fks.length > 0) {
      tablesWithFks.add(fromName);
    }
    for (const fk of fks) {
      const toName = fk.referencedTable;
      referencedTables.add(toName);
      const fromCols = fk.columns && fk.columns.length > 0 ? fk.columns : [fk.column].filter(Boolean);
      const toCols = fk.referencedColumns && fk.referencedColumns.length > 0 ? fk.referencedColumns : [fk.referencedColumn].filter(Boolean);

      graph.push({
        fromTable: fromName,
        fromColumns: fromCols,
        toTable: toName,
        toColumns: toCols,
        constraintName: fk.constraintName || `fk_${fromName}_${toName}`,
      });

      if (!parentChildMappings[toName]) {
        parentChildMappings[toName] = [];
      }
      if (!parentChildMappings[toName].includes(fromName)) {
        parentChildMappings[toName].push(fromName);
      }
    }
  }

  const allTableNames = tables.map((t) => t.name);
  const rootTables = allTableNames.filter((name) => !tablesWithFks.has(name));
  const leafTables = allTableNames.filter((name) => !referencedTables.has(name));
  const junctionTables = tables
    .filter((t) => {
      const outgoing = (t.foreignKeys || []).length;
      return outgoing >= 2 && t.columns.length <= outgoing + 3;
    })
    .map((t) => t.name);

  return {
    graph,
    rootTables,
    leafTables,
    junctionTables,
    parentChildMappings,
  };
}

function computeIndexIntelligence(tables: any[], allIndexes: RawIndexInfo[], findings: HealthFinding[]) {
  const existingIndexes = allIndexes.map((idx) => ({
    tableName: idx.table,
    indexName: idx.name,
    columns: idx.columns,
    isUnique: idx.isUnique,
    isPrimary: idx.name.toLowerCase().includes('pkey') || idx.name.toLowerCase().includes('primary'),
    definition: idx.definition,
  }));

  const unindexedForeignKeys: Array<{
    tableName: string;
    foreignKeyName: string;
    columns: string[];
    referencedTable: string;
  }> = [];

  for (const table of tables) {
    const tableIndexes = allIndexes.filter((i) => i.table === table.name);
    for (const fk of table.foreignKeys || []) {
      const col = fk.column || fk.columns?.[0];
      if (col && !hasIndexOnColumn(tableIndexes, col)) {
        unindexedForeignKeys.push({
          tableName: table.name,
          foreignKeyName: fk.constraintName || `fk_${table.name}_${col}`,
          columns: fk.columns || [col],
          referencedTable: fk.referencedTable,
        });
      }
    }
  }

  // Redundant indexes
  const redundantIndexes: Array<{
    tableName: string;
    indexName: string;
    coveredByIndex: string;
    reason: string;
  }> = [];

  for (const table of tables) {
    const tableIndexes = allIndexes.filter((i) => i.table === table.name && !i.isUnique);
    for (let i = 0; i < tableIndexes.length; i++) {
      for (let j = 0; j < tableIndexes.length; j++) {
        if (i !== j) {
          const idxA = tableIndexes[i];
          const idxB = tableIndexes[j];
          if (
            idxB.columns.length > idxA.columns.length &&
            idxA.columns.every((col, k) => col.toLowerCase() === idxB.columns[k]?.toLowerCase())
          ) {
            redundantIndexes.push({
              tableName: table.name,
              indexName: idxA.name,
              coveredByIndex: idxB.name,
              reason: `Index "${idxA.name}" (${idxA.columns.join(', ')}) is redundant because "${idxB.name}" (${idxB.columns.join(', ')}) covers its leading columns.`,
            });
          }
        }
      }
    }
  }

  const missingIndexRecommendations = unindexedForeignKeys.map((fk) => ({
    tableName: fk.tableName,
    suggestedIndexName: `idx_${fk.tableName}_${fk.columns.join('_')}`,
    columns: fk.columns,
    reason: `Foreign key constraint on ${fk.tableName}(${fk.columns.join(', ')}) is unindexed. B-Tree index improves JOIN and cascade performance.`,
    suggestedSql: `CREATE INDEX "idx_${fk.tableName}_${fk.columns.join('_')}" ON "${fk.tableName}" ("${fk.columns.join('", "')}");`,
  }));

  return {
    existingIndexes,
    unindexedForeignKeys,
    redundantIndexes,
    missingIndexRecommendations,
  };
}

// Catalog-based lightweight data profiling without full table scans.
async function computeTableProfiles(
  session: DatabaseSession,
  tables: any[]
): Promise<Record<string, TableProfile>> {
  const profiles: Record<string, TableProfile> = {};
  const stats = await fetchTableStatistics(session).catch(() => []);
  const statsMap = new Map(stats.map((s) => [`${s.schema}.${s.table}`, s]));

  // PostgreSQL catalog null statistics from pg_stats (zero table scan)
  const pgStatsMap = new Map<string, { nullFrac: number; nDistinct: number }>();
  if (session.engine === 'postgres') {
    try {
      const client = await session.pool.connect();
      try {
        await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
        const res = await client.query<{
          tablename: string;
          attname: string;
          null_frac: number;
          n_distinct: number;
        }>(`
          SELECT tablename, attname, null_frac, n_distinct
          FROM pg_stats
          WHERE schemaname = 'public';
        `);
        for (const row of res.rows) {
          pgStatsMap.set(`${row.tablename}.${row.attname}`, {
            nullFrac: Number(row.null_frac) || 0,
            nDistinct: Number(row.n_distinct) || 0,
          });
        }
      } finally {
        client.release();
      }
    } catch {}
  }

  for (const table of tables) {
    const tableKey = `${table.schema}.${table.name}`;
    const stat = statsMap.get(tableKey);
    const estimatedRows = stat?.liveTuples ?? 0;

    const columnStats: TableColumnProfile[] = table.columns.map((c: any) => {
      const pgStat = pgStatsMap.get(`${table.name}.${c.name}`);
      const nullPct = pgStat ? Math.round(pgStat.nullFrac * 100) : (c.nullable ? 0 : 0);
      return {
        columnName: c.name,
        dataType: c.type,
        nullable: Boolean(c.nullable),
        nullPercentage: nullPct,
        distinctCountEstimate: pgStat ? Math.abs(Math.round(pgStat.nDistinct)) : undefined,
      };
    });

    profiles[table.name] = {
      tableName: table.name,
      schema: table.schema,
      estimatedRowCount: estimatedRows,
      columnStats,
      scanStats: stat
        ? {
            seqScans: stat.seqScans,
            indexScans: stat.idxScans,
          }
        : undefined,
      lastProfiledAt: new Date().toISOString(),
    };
  }

  return profiles;
}

async function runAnalysisJob(session: DatabaseSession, job: ActiveJob): Promise<void> {
  const { connectionId, generation } = job;

  try {
    job.state = 'running';

    const previousSnapshot = getIntelligence(connectionId);

    const categoryStatus: IntelligenceCategoryStatus = {
      schema: 'running',
      relationships: 'running',
      indexes: 'running',
      health: 'running',
      dataProfiling: 'pending',
    };

    const schemaResult = await introspectDatabaseSchema(session);

    if (connectionGenerations.get(connectionId) !== generation) {
      return;
    }

    const tables = schemaResult.tables || [];
    categoryStatus.schema = 'ready';

    const relationships = computeRelationships(tables);
    categoryStatus.relationships = 'ready';

    const [allIndexes, healthReport] = await Promise.all([
      fetchDatabaseIndexes(session),
      analyzeDatabaseHealth(session),
    ]);

    if (connectionGenerations.get(connectionId) !== generation) {
      return;
    }

    const indexIntelligence = computeIndexIntelligence(tables, allIndexes, healthReport.findings);
    categoryStatus.indexes = 'ready';
    categoryStatus.health = 'ready';

    const fingerprint = await computeSchemaFingerprint(session);

    // Build recommendations list from health report findings
    const recommendations = healthReport.findings.map((f) => ({
      id: f.id,
      title: f.title,
      category: f.category,
      severity: f.severity,
      suggestedSql: f.suggestedSql,
      rollbackSql: f.rollbackSql,
      explanation: f.explanation,
      confidence: f.confidence,
    }));

    // Save Tier 1 Fast Snapshot: Copilot is NOW immediately ready!
    const tier1Snapshot: DatabaseIntelligenceSnapshot = {
      connectionId,
      engine: session.engine,
      database: session.database,
      schemaFingerprint: fingerprint,
      analysisVersion: (previousSnapshot?.analysisVersion || 0) + 1,
      generation,
      freshnessState: 'updating',
      categoryStatus: { ...categoryStatus, dataProfiling: 'running' },
      startedAt: job.startedAt,
      completedAt: new Date().toISOString(),
      lastSuccessfulAnalysisTime: new Date().toISOString(),
      schema: {
        tables: tables.map((t: any) => ({
          name: t.name,
          schema: t.schema,
          columns: t.columns.map((c: any) => ({
            name: c.name,
            type: c.type,
            nullable: Boolean(c.nullable),
            isPrimaryKey: Boolean(c.primaryKey || c.key === 'pk' || c.key === 'pk-fk'),
            isUnique: Boolean(c.unique),
            hasDefault: Boolean(c.hasDefault),
            isGenerated: Boolean(c.identity || c.generated),
          })),
          primaryKey: t.primaryKey || [],
          uniqueConstraints: t.uniqueConstraints || [],
          foreignKeys: (t.foreignKeys || []).map((fk: any) => ({
            constraintName: fk.constraintName || `fk_${t.name}_${fk.column}`,
            columns: fk.columns || [fk.column].filter(Boolean),
            referencedTable: fk.referencedTable,
            referencedColumns: fk.referencedColumns || [fk.referencedColumn].filter(Boolean),
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
          })),
        })),
        views: ((schemaResult as any).views || []).map((v: any) => ({ name: v.name, schema: v.schema })),
        tableCount: tables.length,
      },
      relationships,
      indexes: indexIntelligence,
      health: {
        score: healthReport.healthScore.finalScore,
        grade: healthReport.healthScore.grade,
        categoryScores: healthReport.healthScore.categoryScores,
        findings: healthReport.findings,
      },
      tableProfiles: previousSnapshot?.tableProfiles || {},
      recommendations,
    };

    saveIntelligence(tier1Snapshot);

    // Step 4: Tier 2 Data Profiling (Lightweight, Catalog-based)
    const tableProfiles = await computeTableProfiles(session, tables);

    if (connectionGenerations.get(connectionId) !== generation) {
      return;
    }

    tier1Snapshot.tableProfiles = tableProfiles;
    tier1Snapshot.categoryStatus.dataProfiling = 'ready';
    tier1Snapshot.freshnessState = 'fresh';
    tier1Snapshot.completedAt = new Date().toISOString();
    tier1Snapshot.lastSuccessfulAnalysisTime = new Date().toISOString();

    saveIntelligence(tier1Snapshot);
    job.state = 'completed';
  } catch (err: any) {
    if (connectionGenerations.get(connectionId) !== generation) {
      return;
    }

    console.warn(`[IntelligenceOrchestrator] Analysis failed for connection ${connectionId}:`, err.message);

    // Retry once if bounded attempts allow
    if (job.retryCount < MAX_RETRIES) {
      job.retryCount++;
      return await runAnalysisJob(session, job);
    }

    job.state = 'failed';

    // Keep previous snapshot if available, mark freshness as failed with error message
    const previousSnapshot = getIntelligence(connectionId);
    if (previousSnapshot) {
      previousSnapshot.freshnessState = 'failed';
      previousSnapshot.errorMessage = err.message || 'Background analysis failed';
      saveIntelligence(previousSnapshot);
    } else {
      // Create empty failure placeholder
      const emptySnapshot: DatabaseIntelligenceSnapshot = {
        connectionId,
        engine: session.engine,
        database: session.database,
        schemaFingerprint: 'error',
        analysisVersion: 0,
        generation,
        freshnessState: 'failed',
        categoryStatus: {
          schema: 'failed',
          relationships: 'failed',
          indexes: 'failed',
          health: 'failed',
          dataProfiling: 'failed',
        },
        startedAt: job.startedAt,
        errorMessage: err.message || 'Background analysis failed',
        schema: { tables: [], views: [], tableCount: 0 },
        relationships: { graph: [], rootTables: [], leafTables: [], junctionTables: [], parentChildMappings: {} },
        indexes: { existingIndexes: [], unindexedForeignKeys: [], redundantIndexes: [], missingIndexRecommendations: [] },
        health: { score: 0, grade: 'F', categoryScores: {}, findings: [] },
        tableProfiles: {},
        recommendations: [],
      };
      saveIntelligence(emptySnapshot);
    }
  } finally {
    // Check if another refresh was queued during execution
    const active = activeJobs.get(connectionId);
    if (active && active.pendingRefreshReason) {
      const reason = active.pendingRefreshReason;
      activeJobs.delete(connectionId);
      // Run pending rerun asynchronously
      void scheduleAnalysis(connectionId, session, { reason });
    } else {
      activeJobs.delete(connectionId);
    }
  }
}

export interface ScheduleOptions {
  reason?: string;
  force?: boolean;
}

// Triggers background proactive analysis for a session without blocking.
export function scheduleAnalysis(
  connectionId: string,
  session: DatabaseSession,
  options: ScheduleOptions = {}
): { jobState: JobLifecycleState; generation: number } {
  const existingJob = activeJobs.get(connectionId);
  if (existingJob) {
    if (options.force) {
      existingJob.abortController.abort();
    } else {
      existingJob.pendingRefreshReason = options.reason || 'scheduled_refresh';
      return { jobState: existingJob.state, generation: existingJob.generation };
    }
  }

  const nextGen = (connectionGenerations.get(connectionId) || 0) + 1;
  connectionGenerations.set(connectionId, nextGen);

  const abortController = new AbortController();
  const job: ActiveJob = {
    connectionId,
    generation: nextGen,
    state: 'queued',
    startedAt: new Date().toISOString(),
    abortController,
    retryCount: 0,
  };

  activeJobs.set(connectionId, job);

  updateCategoryStatus(connectionId, {}, 'updating');

  setImmediate(() => {
    void runAnalysisJob(session, job);
  });

  return { jobState: 'queued', generation: nextGen };
}

// Invalidate affected intelligence and schedule an incremental refresh.
export function invalidateAndRefresh(
  connectionId: string,
  options: { reason: string; tableName?: string }
): void {
  const session = getDatabaseSession(connectionId);
  if (!session) return;

  updateCategoryStatus(connectionId, {}, 'stale');
  scheduleAnalysis(connectionId, session, { reason: options.reason, force: true });
}

// Mark table profiling stale after data mutations.
export function notifyDataChanged(connectionId: string, tableName: string): void {
  const snapshot = getIntelligence(connectionId);
  if (snapshot && snapshot.tableProfiles[tableName]) {
    snapshot.freshnessState = 'stale';
    saveIntelligence(snapshot);
  }
}

// Cancels running analysis jobs and clears resources for a connection.
export function cancelAndCleanup(connectionId: string): void {
  const job = activeJobs.get(connectionId);
  if (job) {
    job.abortController.abort();
    activeJobs.delete(connectionId);
  }
  connectionGenerations.delete(connectionId);
  deleteIntelligence(connectionId);
}

// Returns current job and freshness status for a connection.
export function getJobStatus(connectionId: string): {
  status: JobLifecycleState;
  freshnessState: IntelligenceFreshnessState;
  categoryStatus: IntelligenceCategoryStatus;
  lastSuccessfulAnalysisTime?: string;
  errorMessage?: string;
  snapshot?: DatabaseIntelligenceSnapshot;
} {
  const job = activeJobs.get(connectionId);
  const snapshot = getIntelligence(connectionId);

  return {
    status: job ? job.state : snapshot ? (snapshot.freshnessState === 'failed' ? 'failed' : 'completed') : 'idle',
    freshnessState: snapshot?.freshnessState || 'stale',
    categoryStatus: snapshot?.categoryStatus || {
      schema: 'pending',
      relationships: 'pending',
      indexes: 'pending',
      health: 'pending',
      dataProfiling: 'pending',
    },
    lastSuccessfulAnalysisTime: snapshot?.lastSuccessfulAnalysisTime,
    errorMessage: snapshot?.errorMessage,
    snapshot: snapshot || undefined,
  };
}

// Poll active snapshots against live database fingerprints to catch external DDL.
export function startPeriodicFingerprintChecker(): void {
  if (pollingTimer) return;

  pollingTimer = setInterval(async () => {
    const snapshots = getIntelligence;
  }, FINGERPRINT_POLL_INTERVAL_MS);

  pollingTimer.unref?.();
}

export function stopPeriodicFingerprintChecker(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}
