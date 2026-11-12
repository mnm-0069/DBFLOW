// SQL execution plan explanation, query diagnosis, and NL-to-SQL generation.

import type {
  ExplainQueryResponse,
  NlToSqlResponse,
  QueryScanInfo,
  QueryJoinInfo,
} from '@idp/shared';
import type { DatabaseSession } from './connection-service.js';
import { validateReadOnlyQuery, introspectDatabaseSchema } from './connection-service.js';
import { isAiConfigured, callAiChatCompletion } from './aiProvider.js';

// Traverses PostgreSQL JSON explain tree to extract scan and join details.
export function extractPlanNodes(planNode: any, scans: QueryScanInfo[] = [], joins: QueryJoinInfo[] = []): { scans: QueryScanInfo[]; joins: QueryJoinInfo[] } {
  if (!planNode) return { scans, joins };

  const nodeType = String(planNode['Node Type'] || '');
  const relationName = planNode['Relation Name'] || planNode['Alias'];

  if (nodeType.includes('Scan') && relationName) {
    scans.push({
      table: relationName,
      scanType: nodeType,
      isSequential: nodeType === 'Seq Scan',
      filterCondition: planNode['Filter'],
    });
  }

  const joinType = planNode['Join Type'];
  if (nodeType.includes('Join') || nodeType === 'Nested Loop' || joinType) {
    joins.push({
      type: nodeType,
      condition: planNode['Hash Cond'] || planNode['Join Filter'] || planNode['Index Cond'],
    });
  }

  if (Array.isArray(planNode.Plans)) {
    for (const subPlan of planNode.Plans) {
      extractPlanNodes(subPlan, scans, joins);
    }
  }

  return { scans, joins };
}

// Runs EXPLAIN inside a read-only transaction.
export async function explainAndAnalyzeQuery(
  session: DatabaseSession,
  query: string
): Promise<ExplainQueryResponse> {
  validateReadOnlyQuery(query, session.engine);

  let rawPlan = '';
  let startupCost: number | undefined;
  let totalCost: number | undefined;
  let planRows: number | undefined;
  let planWidth: number | undefined;
  const scans: QueryScanInfo[] = [];
  const joins: QueryJoinInfo[] = [];

  if (session.engine === 'postgres') {
    const client = await session.pool.connect();
    try {
      await client.query('BEGIN READ ONLY;');
      const explainRes = await client.query(`EXPLAIN (FORMAT JSON) ${query}`);
      await client.query('ROLLBACK;');

      const planJson = explainRes.rows?.[0]?.[0] || explainRes.rows?.[0]?.['QUERY PLAN']?.[0];
      if (planJson && planJson.Plan) {
        startupCost = Number(planJson.Plan['Startup Cost']);
        totalCost = Number(planJson.Plan['Total Cost']);
        planRows = Number(planJson.Plan['Plan Rows']);
        planWidth = Number(planJson.Plan['Plan Width']);

        extractPlanNodes(planJson.Plan, scans, joins);
        rawPlan = JSON.stringify(planJson, null, 2);
      }
    } catch (err: any) {
      await client.query('ROLLBACK;').catch(() => {});
      throw new Error(`EXPLAIN failed: ${err.message}`);
    } finally {
      client.release();
    }
  } else {
    // MySQL explain
    try {
      const [rows] = await session.pool.query<any[]>(`EXPLAIN ${query}`);
      rawPlan = JSON.stringify(rows, null, 2);
      if (Array.isArray(rows)) {
        for (const r of rows) {
          scans.push({
            table: r.table || r.TABLE || 'unknown',
            scanType: r.type || 'ALL',
            isSequential: (r.type || '').toUpperCase() === 'ALL',
            filterCondition: r.rows ? `Est. rows: ${r.rows}` : undefined,
          });
        }
      }
    } catch (err: any) {
      throw new Error(`MySQL EXPLAIN failed: ${err.message}`);
    }
  }

  // Identify potential inefficiencies deterministically
  const inefficiencies: string[] = [];
  const trimmed = query.trim();

  if (/\bSELECT\s+\*\b/i.test(trimmed)) {
    inefficiencies.push('SELECT * retrieves all columns; explicitly specifying only required columns reduces buffer pool and network overhead.');
  }

  const seqScans = scans.filter((s) => s.isSequential);
  if (seqScans.length > 0) {
    const tables = [...new Set(seqScans.map((s) => s.table))].join(', ');
    const isSmallVolume = (totalCost !== undefined && totalCost < 25) || ((planRows ?? 0) < 50);
    if (isSmallVolume) {
      inefficiencies.push(
        `Sequential scan on [${tables}] (est. cost: ${totalCost ?? 'N/A'}, est. rows: ${planRows ?? 'N/A'}) is expected and cost-effective here because the table/result size is small, where sequential page reads avoid random index seek overhead. If this table grows into thousands of rows, consider adding an index.`
      );
    } else {
      inefficiencies.push(
        `Sequential full-table scan on populated table [${tables}] (est. cost: ${totalCost ?? 'N/A'}, est. rows: ${planRows ?? 'N/A'}). An index matching the filter or join predicate will significantly reduce scan cost as table volume grows.`
      );
    }
  }

  if (!/\bLIMIT\b/i.test(trimmed) && (planRows ?? 0) > 100) {
    inefficiencies.push('Query has no LIMIT clause. Large result sets consume excess memory and client transfer time.');
  }

  if (/\bLIKE\s+['"]%[a-zA-Z0-9]/i.test(trimmed)) {
    inefficiencies.push('Leading wildcard in LIKE clause ("%keyword") prevents standard B-Tree index utilization.');
  }

  // Base deterministic explanation
  let explanation = `The query executes as a ${joins.length > 0 ? joins.map((j) => j.type).join(' + ') : 'single-table query'} with an estimated cost of ${totalCost !== undefined ? totalCost : 'N/A'}. `;
  if (scans.length > 0) {
    explanation += `It reads from ${scans.length} table scan(s): ${scans.map((s) => `${s.table} (${s.scanType})`).join(', ')}.`;
  }

  let suggestedSql: string | undefined;
  let suggestedSqlExplanation: string | undefined;

  // Simple deterministic optimization: rewrite SELECT * to explicit or add LIMIT if needed
  if (/\bSELECT\s+\*\b/i.test(trimmed) && !/\bLIMIT\b/i.test(trimmed)) {
    suggestedSql = trimmed.replace(/;\s*$/, '') + '\nLIMIT 100;';
    suggestedSqlExplanation = 'Added bounded LIMIT 100 to prevent unbounded result sets.';
  }

  // If AI Provider is configured, enhance explanation and suggested SQL
  let isAiEnhanced = false;
  if (isAiConfigured()) {
    try {
      const aiPrompt = `You are DBFlow Copilot database performance expert.
Analyze this SQL query and its execution plan:

SQL:
${query}

Execution Plan Nodes:
${JSON.stringify({ scans, joins, totalCost, planRows }, null, 2)}

Provide:
1. A concise, clear explanation of how the query executes.
2. The key bottleneck or inefficiency (if any).
3. An optimized version of the SQL query.
4. An explanation of what changed in the optimized SQL.

Format your response as valid JSON with keys:
"explanation": string,
"suggestedSql": string,
"suggestedSqlExplanation": string
`;

      const aiRes = await callAiChatCompletion(
        [
          { role: 'system', content: 'You are an expert DBA. Always return pure JSON matching the requested schema.' },
          { role: 'user', content: aiPrompt },
        ],
        { maxTokens: 800, temperature: 0.1 }
      );

      // Clean markdown code fence if wrapped
      const cleaned = aiRes.content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.explanation) explanation = parsed.explanation;
      if (parsed.suggestedSql) suggestedSql = parsed.suggestedSql;
      if (parsed.suggestedSqlExplanation) suggestedSqlExplanation = parsed.suggestedSqlExplanation;
      isAiEnhanced = true;
    } catch {
      // Fallback to deterministic analysis without error
      isAiEnhanced = false;
    }
  }

  return {
    originalQuery: query,
    estimatedCost: {
      startupCost,
      totalCost,
      planRows,
      planWidth,
    },
    scansUsed: scans,
    joinsUsed: joins,
    explanation,
    potentialInefficiencies: inefficiencies,
    suggestedSql,
    suggestedSqlExplanation,
    executionPlanRaw: rawPlan,
    isAiEnhanced,
  };
}

// Generates SQL queries from natural language prompts.
export async function generateSqlFromPrompt(
  session: DatabaseSession,
  userPrompt: string
): Promise<NlToSqlResponse> {
  const schema = await introspectDatabaseSchema(session);

  const schemaSummary = schema.tables.map((t) => ({
    table: `${t.schema}.${t.name}`,
    columns: t.columns.map((c) => `${c.name} (${c.type}${c.key ? ` - ${c.key}` : ''})`),
    foreignKeys: t.foreignKeys.map((fk) => `${fk.column} -> ${fk.referencedTable}.${fk.referencedColumn}`),
  }));

  if (isAiConfigured()) {
    try {
      const systemPrompt = `You are DBFlow Copilot SQL Generator.
The user wants a SQL query for their ${session.engine} database based on this schema:
${JSON.stringify(schemaSummary, null, 2)}

Rules:
1. Output ONLY a valid, read-only SELECT statement. Never output DDL or mutations.
2. Quote table and column names appropriately when needed.
3. Return response in pure JSON with keys:
"sql": string,
"explanation": string,
"assumptions": string[],
"targetTables": string[]
`;

      const aiRes = await callAiChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 600, temperature: 0.1 }
      );

      const cleaned = aiRes.content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.sql) {
        validateReadOnlyQuery(parsed.sql, session.engine);
        return {
          sql: parsed.sql.trim(),
          explanation: parsed.explanation || 'Query generated from natural language request.',
          assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
          targetTables: Array.isArray(parsed.targetTables) ? parsed.targetTables : [],
          isAiGenerated: true,
        };
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Deterministic fallback based on keyword and schema table matching
  const promptLower = userPrompt.toLowerCase();
  const matchedTables = schema.tables.filter((t) => promptLower.includes(t.name.toLowerCase()));
  const primaryTable = matchedTables[0] || schema.tables[0];

  if (!primaryTable) {
    return {
      sql: 'SELECT 1;',
      explanation: 'No tables found in introspected schema.',
      assumptions: [],
      targetTables: [],
      isAiGenerated: false,
    };
  }

  const cols = primaryTable.columns.slice(0, 5).map((c) => `"${c.name}"`).join(', ');
  let generatedSql = `SELECT ${cols}\nFROM "${primaryTable.schema}"."${primaryTable.name}"`;

  if (primaryTable.columns.some((c) => c.name.toLowerCase() === 'created_at')) {
    generatedSql += `\nORDER BY "created_at" DESC`;
  } else if (primaryTable.columns.some((c) => c.key === 'pk')) {
    const pk = primaryTable.columns.find((c) => c.key === 'pk')!.name;
    generatedSql += `\nORDER BY "${pk}" DESC`;
  }

  generatedSql += `\nLIMIT 50;`;

  return {
    sql: generatedSql,
    explanation: `Generated query selecting primary columns from "${primaryTable.schema}.${primaryTable.name}".`,
    assumptions: ['Defaulted to top 50 rows', 'Ordered by primary identifier or timestamp'],
    targetTables: [`${primaryTable.schema}.${primaryTable.name}`],
    isAiGenerated: false,
  };
}
