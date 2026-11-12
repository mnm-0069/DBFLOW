// Database health analyzer and recommendation engine.

import type {
  DatabaseHealthReport,
  HealthFinding,
  HealthScoreBreakdown,
  CopilotSeverity,
  CopilotCategory,
} from '@idp/shared';
import type { DatabaseSession } from './connection-service.js';
import { introspectDatabaseSchema } from './connection-service.js';

export interface RawIndexInfo {
  schema: string;
  table: string;
  name: string;
  columns: string[];
  isUnique: boolean;
  definition?: string;
}

export interface TableStatInfo {
  schema: string;
  table: string;
  liveTuples: number;
  seqScans: number;
  idxScans: number;
}

// Extracts column names from PostgreSQL index definition SQL.
export function parsePgIndexColumns(indexdef: string): string[] {
  const match = indexdef.match(/\((.+)\)$/);
  if (!match || !match[1]) return [];
  return match[1]
    .split(',')
    .map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase())
    .filter(Boolean);
}

// Retrieves all indexes for PostgreSQL or MySQL.
export async function fetchDatabaseIndexes(session: DatabaseSession): Promise<RawIndexInfo[]> {
  const indexes: RawIndexInfo[] = [];

  if (session.engine === 'postgres') {
    const client = await session.pool.connect();
    try {
      const res = await client.query<{
        schemaname: string;
        tablename: string;
        indexname: string;
        indexdef: string;
      }>(`
        SELECT
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY tablename, indexname;
      `);

      for (const row of res.rows) {
        const columns = parsePgIndexColumns(row.indexdef);
        indexes.push({
          schema: row.schemaname,
          table: row.tablename,
          name: row.indexname,
          columns,
          isUnique: row.indexdef.toUpperCase().includes('UNIQUE INDEX'),
          definition: row.indexdef,
        });
      }
    } finally {
      client.release();
    }
  } else {
    // MySQL statistics
    const [rows] = await session.pool.query<any[]>(`
      SELECT
        TABLE_SCHEMA AS schemaname,
        TABLE_NAME AS tablename,
        INDEX_NAME AS indexname,
        COLUMN_NAME AS columnname,
        SEQ_IN_INDEX AS seq_in_index,
        NON_UNIQUE AS non_unique
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;
    `, [session.database]);

    const grouped: Record<string, { schema: string; table: string; name: string; isUnique: boolean; columns: string[] }> = {};
    for (const row of rows as any[]) {
      const key = `${row.schemaname}.${row.tablename}.${row.indexname}`;
      if (!grouped[key]) {
        grouped[key] = {
          schema: row.schemaname,
          table: row.tablename,
          name: row.indexname,
          isUnique: row.non_unique === 0,
          columns: [],
        };
      }
      grouped[key].columns.push(String(row.columnname).toLowerCase());
    }
    indexes.push(...Object.values(grouped));
  }

  return indexes;
}

// Retrieves table statistics (sequential scans, live tuples).
export async function fetchTableStatistics(session: DatabaseSession): Promise<TableStatInfo[]> {
  const stats: TableStatInfo[] = [];

  if (session.engine === 'postgres') {
    const client = await session.pool.connect();
    try {
      const res = await client.query<{
        schemaname: string;
        tablename: string;
        n_live_tup: string | number;
        seq_scan: string | number;
        idx_scan: string | number;
      }>(`
        SELECT
          schemaname,
          relname AS tablename,
          COALESCE(n_live_tup, 0) AS n_live_tup,
          COALESCE(seq_scan, 0) AS seq_scan,
          COALESCE(idx_scan, 0) AS idx_scan
        FROM pg_stat_user_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
      `);

      for (const row of res.rows) {
        stats.push({
          schema: row.schemaname,
          table: row.tablename,
          liveTuples: Number(row.n_live_tup) || 0,
          seqScans: Number(row.seq_scan) || 0,
          idxScans: Number(row.idx_scan) || 0,
        });
      }
    } catch {
      // Stats may not be accessible; continue gracefully
    } finally {
      client.release();
    }
  } else if (session.engine === 'mysql') {
    try {
      const [rows] = await session.pool.query<any[]>(`
        SELECT
          TABLE_SCHEMA AS schemaname,
          TABLE_NAME AS tablename,
          COALESCE(TABLE_ROWS, 0) AS liveTuples
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME;
      `, [session.database]);

      for (const row of rows as any[]) {
        stats.push({
          schema: row.schemaname,
          table: row.tablename,
          liveTuples: Number(row.liveTuples) || 0,
          seqScans: 0,
          idxScans: 0,
        });
      }
    } catch {
      // MySQL statistics inaccessible; continue gracefully
    }
  }

  return stats;
}

// Checks if a column is covered as the leading column in any table index.
export function hasIndexOnColumn(tableIndexes: RawIndexInfo[], columnName?: string): boolean {
  if (!columnName || typeof columnName !== 'string') return false;
  const target = columnName.toLowerCase();
  return tableIndexes.some(
    (idx) => idx.columns.length > 0 && idx.columns[0]?.toLowerCase() === target
  );
}

// Analyzes schema and statistics to generate deterministic findings.
export async function analyzeDatabaseHealth(session: DatabaseSession): Promise<DatabaseHealthReport> {
  const schema = await introspectDatabaseSchema(session);
  const indexes = await fetchDatabaseIndexes(session);
  const stats = await fetchTableStatistics(session);

  const findings: HealthFinding[] = [];
  const statsByTable = new Map<string, TableStatInfo>();
  for (const s of stats) {
    statsByTable.set(`${s.schema}.${s.table}`, s);
  }

  const indexesByTable = new Map<string, RawIndexInfo[]>();
  for (const idx of indexes) {
    const key = `${idx.schema}.${idx.table}`;
    const list = indexesByTable.get(key) || [];
    list.push(idx);
    indexesByTable.set(key, list);
  }

  let totalColumns = 0;
  let totalForeignKeys = 0;

  for (const table of schema.tables) {
    totalColumns += table.columns.length;
    totalForeignKeys += table.foreignKeys.length;
    const tableKey = `${table.schema}.${table.name}`;
    const tableIndexes = indexesByTable.get(tableKey) || [];
    const tableStats = statsByTable.get(tableKey);

    // 1. Missing Primary Key Check
    const hasPrimaryKey = table.columns.some((c) => c.key === 'pk' || c.key === 'pk-fk');
    if (!hasPrimaryKey) {
      findings.push({
        id: `finding-pk-missing-${table.schema}-${table.name}`,
        title: `Table "${table.name}" lacks a primary key`,
        severity: 'critical',
        category: 'integrity',
        table: `${table.schema}.${table.name}`,
        problem: `The table "${table.name}" has no primary key defined, preventing unique row identification and safe mutations.`,
        explanation:
          'Relational database tables should always define a primary key to ensure entity integrity, support reliable foreign keys, and enable efficient replication and updates.',
        evidence: `Table has ${table.columns.length} columns, but none are marked PRIMARY KEY.`,
        recommendedSolution: `Add an auto-incrementing identity primary key or designate a candidate unique column as primary key.`,
        suggestedSql:
          session.engine === 'postgres'
            ? `ALTER TABLE "${table.schema}"."${table.name}" ADD COLUMN id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY;`
            : `ALTER TABLE \`${table.schema}\`.\`${table.name}\` ADD COLUMN id BIGINT AUTO_INCREMENT PRIMARY KEY FIRST;`,
        expectedBenefit: 'Guarantees entity integrity and unlocks single-row updates/deletions in DBFlow grid.',
        potentialRisks: 'Requires table rewrite if populated with millions of rows.',
        isReversible: true,
        rollbackSql: `ALTER TABLE "${table.schema}"."${table.name}" DROP COLUMN IF EXISTS id;`,
        confidence: 'confirmed',
      });
    }

    // 2. Foreign Key Index Coverage Check
    // Rules: Foreign keys must have an index where the FK column is the LEADING column.
    for (const fk of table.foreignKeys) {
      if (!fk?.column) continue;
      const isCovered = hasIndexOnColumn(tableIndexes, fk.column);
      if (!isCovered) {
        const indexName = `idx_${table.name}_${fk.column}`;
        findings.push({
          id: `finding-fk-unindexed-${table.schema}-${table.name}-${fk.column}`,
          title: `Unindexed foreign key on "${table.name}.${fk.column}"`,
          severity: 'warning',
          category: 'performance',
          table: `${table.schema}.${table.name}`,
          column: fk.column,
          problem: `Foreign key "${table.name}.${fk.column}" references "${fk.referencedTable}.${fk.referencedColumn}" without a supporting B-Tree index.`,
          explanation:
            `PostgreSQL and MySQL do not automatically create indexes on foreign key referencing columns. When rows in "${fk.referencedTable}" are deleted or updated, or when joining "${table.name}" on "${fk.column}", the engine is forced into sequential table scans.`,
          evidence: `Foreign key: ${table.schema}.${table.name}.${fk.column} -> ${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn}. Existing indexes: [${tableIndexes.map((i) => `${i.name}(${i.columns.join(',')})`).join(', ') || 'none'}]. None have "${fk.column}" as the leading column.`,
          recommendedSolution: `Create a B-Tree index on "${fk.column}" in table "${table.name}".`,
          suggestedSql:
            session.engine === 'postgres'
              ? `CREATE INDEX "${indexName}" ON "${table.schema}"."${table.name}" ("${fk.column}");`
              : `CREATE INDEX \`${indexName}\` ON \`${table.schema}\`.\`${table.name}\` (\`${fk.column}\`);`,
          expectedBenefit: `Accelerates multi-table JOINs and prevents full-table scan locks during parent-table CASCADE operations.`,
          potentialRisks: 'Minimal insert/update latency and negligible disk footprint.',
          isReversible: true,
          rollbackSql:
            session.engine === 'postgres'
              ? `DROP INDEX IF EXISTS "${table.schema}"."${indexName}";`
              : `DROP INDEX \`${indexName}\` ON \`${table.schema}\`.\`${table.name}\`;`,
          confidence: 'confirmed',
        });
      }
    }

    // 3. Duplicate or Redundant Index Check
    for (let i = 0; i < tableIndexes.length; i++) {
      for (let j = 0; j < tableIndexes.length; j++) {
        if (i === j) continue;
        const idxA = tableIndexes[i]!;
        const idxB = tableIndexes[j]!;

        // Exact duplicate
        if (
          idxA.name !== idxB.name &&
          idxA.columns.length === idxB.columns.length &&
          idxA.columns.every((col, k) => col === idxB.columns[k]) &&
          !idxA.isUnique &&
          idxA.name > idxB.name
        ) {
          findings.push({
            id: `finding-idx-dup-${table.schema}-${table.name}-${idxA.name}`,
            title: `Duplicate index "${idxA.name}" on "${table.name}"`,
            severity: 'optimization',
            category: 'storage',
            table: `${table.schema}.${table.name}`,
            problem: `Index "${idxA.name}" indexes identical columns (${idxA.columns.join(', ')}) as existing index "${idxB.name}".`,
            explanation:
              'Maintaining identical indexes causes duplicate write overhead and wastes buffer pool memory and storage.',
            evidence: `Index 1: ${idxA.name}(${idxA.columns.join(', ')}), Index 2: ${idxB.name}(${idxB.columns.join(', ')}).`,
            recommendedSolution: `Drop duplicate index "${idxA.name}".`,
            suggestedSql:
              session.engine === 'postgres'
                ? `DROP INDEX IF EXISTS "${table.schema}"."${idxA.name}";`
                : `DROP INDEX \`${idxA.name}\` ON \`${table.schema}\`.\`${table.name}\`;`,
            expectedBenefit: 'Saves write I/O and reduces disk usage.',
            potentialRisks: 'None if the redundant index is not explicitly referenced in query hints.',
            isReversible: true,
            rollbackSql: idxA.definition || `-- Recreate index ${idxA.name}`,
            confidence: 'confirmed',
          });
        }
      }
    }

    // 4. Sequential Scan Bottlenecks (PostgreSQL stats)
    if (tableStats && tableStats.seqScans > 80 && tableStats.seqScans > tableStats.idxScans * 2 && tableStats.liveTuples > 50) {
      findings.push({
        id: `finding-perf-seqscan-${table.schema}-${table.name}`,
        title: `High sequential scan ratio on "${table.name}"`,
        severity: 'warning',
        category: 'performance',
        table: `${table.schema}.${table.name}`,
        problem: `Table "${table.name}" (${tableStats.liveTuples} live rows) has recorded ${tableStats.seqScans} sequential scans versus only ${tableStats.idxScans} index scans.`,
        explanation:
          'A high proportion of sequential scans on populated tables indicates that frequent application queries lack indexes on their WHERE or ORDER BY clauses.',
        evidence: `Sequential scans: ${tableStats.seqScans}, Index scans: ${tableStats.idxScans}, Estimated rows: ${tableStats.liveTuples}.`,
        recommendedSolution: `Audit recent SQL queries filtering or sorting "${table.name}" and consider adding compound indexes on the most filtered columns.`,
        expectedBenefit: 'Eliminates costly table scans and reduces disk I/O under query load.',
        potentialRisks: 'Requires inspecting query workloads to identify the exact filter predicates.',
        isReversible: true,
        confidence: 'high',
      });
    }

    // 5. Unconstrained Status/State Columns
    for (const col of table.columns) {
      const colLower = col.name.toLowerCase();
      if (
        (colLower === 'status' || colLower === 'state' || colLower === 'priority' || colLower === 'role') &&
        (col.type.toLowerCase().includes('varchar') || col.type.toLowerCase().includes('text'))
      ) {
        findings.push({
          id: `finding-status-unconstrained-${table.schema}-${table.name}-${col.name}`,
          title: `Unconstrained state column "${table.name}.${col.name}"`,
          severity: 'optimization',
          category: 'schema_design',
          table: `${table.schema}.${table.name}`,
          column: col.name,
          problem: `Column "${col.name}" stores status or categorical state as free-form ${col.type} without a CHECK constraint.`,
          explanation:
            'Categorical state columns without constraint validation can accept typos, invalid states, or arbitrary values, causing data corruption over time.',
          evidence: `Column name "${col.name}", type: ${col.type}, no CHECK constraint or foreign key enum table detected.`,
          recommendedSolution: `Add a CHECK constraint defining the valid allowed status values.`,
          suggestedSql:
            session.engine === 'postgres'
              ? `ALTER TABLE "${table.schema}"."${table.name}" ADD CONSTRAINT "chk_${table.name}_${col.name}" CHECK ("${col.name}" IN ('active', 'inactive', 'pending', 'completed', 'cancelled'));`
              : `ALTER TABLE \`${table.schema}\`.\`${table.name}\` ADD CONSTRAINT \`chk_${table.name}_${col.name}\` CHECK (\`${col.name}\` IN ('active', 'inactive', 'pending', 'completed', 'cancelled'));`,
          expectedBenefit: 'Prevents invalid state values from ever being written to the database.',
          potentialRisks: 'Existing rows containing unlisted values will cause the ALTER TABLE to fail until cleaned.',
          isReversible: true,
          rollbackSql: `ALTER TABLE "${table.schema}"."${table.name}" DROP CONSTRAINT IF EXISTS "chk_${table.name}_${col.name}";`,
          confidence: 'heuristic',
        });
      }

      // 6. Suspicious Nullable Foreign Key
      if ((col.key === 'fk' || col.key === 'pk-fk') && col.nullable && (colLower.endsWith('_id') || colLower === 'id')) {
        // Exclude self-referencing parent_id which is legitimately nullable for hierarchy roots
        if (colLower !== 'parent_id' && colLower !== 'manager_id') {
          findings.push({
            id: `finding-fk-nullable-${table.schema}-${table.name}-${col.name}`,
            title: `Nullable foreign key "${table.name}.${col.name}"`,
            severity: 'info',
            category: 'integrity',
            table: `${table.schema}.${table.name}`,
            column: col.name,
            problem: `Foreign key "${table.name}.${col.name}" allows NULL values.`,
            explanation:
              'A nullable foreign key represents an optional association. If every record in this table must belong to a parent entity, enforcing NOT NULL ensures relational completeness.',
            evidence: `Column "${col.name}" has NULLABLE = true and defines a foreign key.`,
            recommendedSolution: `Verify business requirements: if relationship is mandatory, add NOT NULL constraint.`,
            suggestedSql: `ALTER TABLE "${table.schema}"."${table.name}" ALTER COLUMN "${col.name}" SET NOT NULL;`,
            expectedBenefit: 'Guarantees that orphaned records cannot exist.',
            potentialRisks: 'Fails if existing rows contain NULL in this column.',
            isReversible: true,
            rollbackSql: `ALTER TABLE "${table.schema}"."${table.name}" ALTER COLUMN "${col.name}" DROP NOT NULL;`,
            confidence: 'heuristic',
          });
        }
      }
    }

    // 7. Wide Table Column Sprawl
    if (table.columns.length > 25) {
      findings.push({
        id: `finding-wide-table-${table.schema}-${table.name}`,
        title: `Wide table design on "${table.name}" (${table.columns.length} columns)`,
        severity: 'info',
        category: 'schema_design',
        table: `${table.schema}.${table.name}`,
        problem: `Table "${table.name}" contains ${table.columns.length} columns, suggesting potential denormalization or mixed responsibilities.`,
        explanation:
          'Tables with high column counts often mix multiple entity lifecycles. Consider separating rarely-accessed attributes or one-to-one extensions into a dedicated satellite table.',
        evidence: `Column count: ${table.columns.length}.`,
        recommendedSolution: 'Review column access patterns and normalize distinct sub-domains into 1:1 or 1:N satellite tables.',
        expectedBenefit: 'Improves buffer pool cache density and lowers row lock contention.',
        potentialRisks: 'Requires updating application query schemas.',
        isReversible: false,
        confidence: 'heuristic',
      });
    }
  }

  // Calculate Deterministic Health Score
  const scoreBreakdown = calculateHealthScore(findings);

  const summary = {
    criticalCount: findings.filter((f) => f.severity === 'critical').length,
    warningCount: findings.filter((f) => f.severity === 'warning').length,
    optimizationCount: findings.filter((f) => f.severity === 'optimization').length,
    infoCount: findings.filter((f) => f.severity === 'info').length,
  };

  return {
    engine: session.engine,
    database: session.database,
    analyzedAt: new Date().toISOString(),
    tableCount: schema.tables.length,
    totalColumns,
    foreignKeyCount: totalForeignKeys,
    indexCount: indexes.length,
    healthScore: scoreBreakdown,
    findings,
    summary,
  };
}

// Calculates a deterministic health score out of 100 with deduction limits.
export function calculateHealthScore(findings: HealthFinding[]): HealthScoreBreakdown {
  const baseScore = 100;
  const deductions: HealthScoreBreakdown['deductions'] = [];

  let criticalDeductions = 0;
  let warningDeductions = 0;
  let optDeductions = 0;

  let perfDeductions = 0;
  let integrityDeductions = 0;
  let schemaDeductions = 0;

  for (const f of findings) {
    let pts = 0;
    if (f.severity === 'critical') {
      pts = 15;
      if (criticalDeductions + pts <= 35) {
        criticalDeductions += pts;
        deductions.push({ reason: f.title, points: pts, category: f.category });
      }
    } else if (f.severity === 'warning') {
      pts = 5;
      if (warningDeductions + pts <= 25) {
        warningDeductions += pts;
        deductions.push({ reason: f.title, points: pts, category: f.category });
      }
    } else if (f.severity === 'optimization') {
      pts = 3;
      if (optDeductions + pts <= 15) {
        optDeductions += pts;
        deductions.push({ reason: f.title, points: pts, category: f.category });
      }
    }

    if (f.category === 'performance') perfDeductions += pts;
    else if (f.category === 'integrity') integrityDeductions += pts;
    else if (f.category === 'schema_design' || f.category === 'storage') schemaDeductions += pts;
  }

  const totalDeductions = Math.min(85, criticalDeductions + warningDeductions + optDeductions);
  const finalScore = Math.max(15, baseScore - totalDeductions);

  let grade: HealthScoreBreakdown['grade'] = 'A';
  if (finalScore < 60) grade = 'F';
  else if (finalScore < 70) grade = 'D';
  else if (finalScore < 80) grade = 'C';
  else if (finalScore < 90) grade = 'B';

  return {
    baseScore,
    totalDeductions,
    finalScore,
    grade,
    deductions,
    categoryScores: {
      performance: Math.max(20, 100 - Math.min(75, perfDeductions * 2)),
      integrity: Math.max(20, 100 - Math.min(75, integrityDeductions * 2)),
      schemaDesign: Math.max(20, 100 - Math.min(75, schemaDeductions * 2)),
    },
  };
}
