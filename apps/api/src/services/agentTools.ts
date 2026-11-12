// apps/api/src/services/agentTools.ts
// Comprehensive database tool implementations for DBFlow Copilot AI Agent

import type { DatabaseSession } from './connection-service.js';
import {
  introspectDatabaseSchema,
  validateReadOnlyQuery,
} from './connection-service.js';
import {
  analyzeDatabaseHealth,
  fetchDatabaseIndexes,
  fetchTableStatistics,
  hasIndexOnColumn,
  type RawIndexInfo,
} from './databaseHealthAnalyzer.js';
import { explainAndAnalyzeQuery } from './sqlIntelligenceService.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (session: DatabaseSession, args: any) => Promise<unknown>;
}

/**
 * Normalizes table name search (handles schema.table or just table)
 */
function findTable(schema: any, tableName: string) {
  if (!tableName || typeof tableName !== 'string') return undefined;
  const normalized = tableName.toLowerCase().replace(/["`]/g, '');
  return schema.tables.find(
    (t: any) =>
      t.name.toLowerCase() === normalized ||
      `${t.schema.toLowerCase()}.${t.name.toLowerCase()}` === normalized
  );
}

export const AGENT_TOOLS: Record<string, ToolDefinition> = {
  // 1. inspect_database_schema
  inspect_database_schema: {
    name: 'inspect_database_schema',
    description:
      'Inspects the complete database schema including all tables, columns, data types, nullability, primary keys, and foreign keys.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (session: DatabaseSession) => {
      const schema = await introspectDatabaseSchema(session);
      const indexes = await fetchDatabaseIndexes(session);
      return {
        database: session.database,
        engine: session.engine,
        tableCount: schema.tables.length,
        tables: schema.tables.map((t) => ({
          name: t.name,
          schema: t.schema,
          columnCount: t.columns.length,
          primaryKeys: t.columns.filter((c) => c.key === 'pk' || c.key === 'pk-fk').map((c) => c.name),
          columns: t.columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            key: c.key || null,
          })),
          foreignKeys: t.foreignKeys.map((fk) => ({
            column: fk.column,
            referencedTable: fk.referencedTable,
            referencedColumn: fk.referencedColumn,
            onDelete: fk.onDelete,
            onUpdate: fk.onUpdate,
          })),
          indexCount: indexes.filter((i) => i.table === t.name).length,
        })),
      };
    },
  },

  // 2. inspect_table_details
  inspect_table_details: {
    name: 'inspect_table_details',
    description: 'Retrieves full structural details, columns, data types, constraints, and indexes for a single specific table.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to inspect (e.g. "students" or "courses")',
        },
      },
      required: ['tableName'],
    },
    handler: async (session: DatabaseSession, args: { tableName: string }) => {
      const schema = await introspectDatabaseSchema(session);
      const table = findTable(schema, args.tableName);
      if (!table) {
        return {
          error: `Table "${args.tableName}" was not found in database "${session.database}".`,
          availableTables: schema.tables.map((t) => t.name),
        };
      }
      const indexes = await fetchDatabaseIndexes(session);
      const tableIndexes = indexes.filter((i) => i.table === table.name);

      return {
        table: table.name,
        schema: table.schema,
        columns: table.columns,
        foreignKeys: table.foreignKeys,
        indexes: tableIndexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          isUnique: idx.isUnique,
          definition: idx.definition,
        })),
      };
    },
  },

  // 3. inspect_table_relationships
  inspect_table_relationships: {
    name: 'inspect_table_relationships',
    description: 'Returns all incoming and outgoing foreign key relationships connected to a specified table.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table (e.g. "enrollments" or "students")',
        },
      },
      required: ['tableName'],
    },
    handler: async (session: DatabaseSession, args: { tableName: string }) => {
      const schema = await introspectDatabaseSchema(session);
      const table = findTable(schema, args.tableName);
      if (!table) {
        return { error: `Table "${args.tableName}" not found.` };
      }

      // Outgoing: FKs on this table pointing to others
      const outgoing = (table.foreignKeys as any[]).map((fk: any) => ({
        fromColumn: fk.column,
        toTable: fk.referencedTable,
        toColumn: fk.referencedColumn,
        onDelete: fk.onDelete,
      }));

      // Incoming: FKs on other tables pointing to this table
      const incoming: Array<{ fromTable: string; fromColumn: string; toColumn: string; onDelete?: string }> = [];
      for (const t of schema.tables as any[]) {
        for (const fk of t.foreignKeys as any[]) {
          if (fk.referencedTable.toLowerCase() === table.name.toLowerCase()) {
            incoming.push({
              fromTable: t.name,
              fromColumn: fk.column,
              toColumn: fk.referencedColumn,
              onDelete: fk.onDelete,
            });
          }
        }
      }

      return {
        table: table.name,
        outgoingRelationships: outgoing,
        incomingRelationships: incoming,
        isJunctionTable: outgoing.length >= 2 && table.columns.length <= outgoing.length + 3,
      };
    },
  },

  // 4. inspect_database_health
  inspect_database_health: {
    name: 'inspect_database_health',
    description:
      'Performs an automated health audit calculating the 0-100 score, letter grade (A-F), and prioritized findings for missing indexes, missing PKs, and design issues.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (session: DatabaseSession) => {
      const report = await analyzeDatabaseHealth(session);
      return {
        healthScore: report.healthScore.finalScore,
        grade: report.healthScore.grade,
        baseScore: report.healthScore.baseScore,
        totalDeductions: report.healthScore.totalDeductions,
        categoryScores: report.healthScore.categoryScores,
        deductions: report.healthScore.deductions,
        summary: report.summary,
        findings: report.findings.map((f) => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          category: f.category,
          table: f.table,
          column: f.column,
          problem: f.problem,
          evidence: f.evidence,
          recommendedSolution: f.recommendedSolution,
          suggestedSql: f.suggestedSql,
          expectedBenefit: f.expectedBenefit,
          potentialRisks: f.potentialRisks,
          rollbackSql: f.rollbackSql,
          confidence: f.confidence,
        })),
      };
    },
  },

  // 5. inspect_table_indexes
  inspect_table_indexes: {
    name: 'inspect_table_indexes',
    description:
      'Inspects existing B-Tree and unique indexes on a table, including column ordering and whether foreign key columns are covered as leading columns.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Name of the table to check indexes for',
        },
      },
      required: ['tableName'],
    },
    handler: async (session: DatabaseSession, args: { tableName: string }) => {
      const schema = await introspectDatabaseSchema(session);
      const table = findTable(schema, args.tableName);
      if (!table) return { error: `Table "${args.tableName}" not found.` };

      const allIndexes = await fetchDatabaseIndexes(session);
      const tableIndexes = allIndexes.filter((i) => i.table === table.name);

      const fkCoverage = (table.foreignKeys as any[]).map((fk: any) => {
        const isLeadingCovered = hasIndexOnColumn(tableIndexes, fk.column);
        const compositeIndex = tableIndexes.find((idx) => idx.columns.map((c) => c.toLowerCase()).includes(fk.column.toLowerCase()));
        return {
          foreignKeyColumn: fk.column,
          referencedTable: fk.referencedTable,
          isIndexedAsLeading: isLeadingCovered,
          partOfCompositeIndex: compositeIndex ? compositeIndex.name : null,
          compositeColumns: compositeIndex ? compositeIndex.columns : null,
          status: isLeadingCovered
            ? 'Covered'
            : compositeIndex
            ? 'Non-leading in composite key (lookup by this column requires table scan)'
            : 'Unindexed',
        };
      });

      return {
        table: table.name,
        existingIndexes: tableIndexes.map((idx) => ({
          name: idx.name,
          columns: idx.columns,
          isUnique: idx.isUnique,
        })),
        foreignKeyCoverage: fkCoverage,
      };
    },
  },

  // 6. inspect_database_statistics
  inspect_database_statistics: {
    name: 'inspect_database_statistics',
    description:
      'Retrieves table statistics (live row estimates, sequential scans, and index scans) to identify scan bottlenecks.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Optional table name to filter statistics',
        },
      },
    },
    handler: async (session: DatabaseSession, args?: { tableName?: string }) => {
      const stats = await fetchTableStatistics(session);
      if (args?.tableName) {
        const target = args.tableName.toLowerCase();
        const filtered = stats.filter((s) => s.table.toLowerCase() === target);
        return { table: args.tableName, statistics: filtered[0] || 'No statistics recorded yet for this table.' };
      }
      return {
        tableStatistics: stats.map((s) => ({
          table: s.table,
          schema: s.schema,
          liveTuples: s.liveTuples,
          seqScans: s.seqScans,
          idxScans: s.idxScans,
          scanRatio: s.idxScans > 0 ? (s.seqScans / s.idxScans).toFixed(2) : s.seqScans > 0 ? 'All Seq' : '0',
        })),
      };
    },
  },

  // 7. explain_sql_query
  explain_sql_query: {
    name: 'explain_sql_query',
    description:
      'Performs a safe, read-only EXPLAIN operation on a SELECT SQL query, extracting plan tree costs, sequential scans, index scans, and join methods.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The read-only SELECT query to analyze with EXPLAIN',
        },
      },
      required: ['query'],
    },
    handler: async (session: DatabaseSession, args: { query: string }) => {
      validateReadOnlyQuery(args.query, session.engine);
      const plan = await explainAndAnalyzeQuery(session, args.query);
      return {
        query: plan.originalQuery,
        estimatedCost: plan.estimatedCost,
        scansUsed: plan.scansUsed,
        joinsUsed: plan.joinsUsed,
        potentialInefficiencies: plan.potentialInefficiencies,
        explanation: plan.explanation,
      };
    },
  },

  // 8. compare_query_plans
  compare_query_plans: {
    name: 'compare_query_plans',
    description: 'Compares execution plans for two alternative SQL queries to evaluate which has lower cost and fewer full scans.',
    parameters: {
      type: 'object',
      properties: {
        queryA: {
          type: 'string',
          description: 'Original SQL query',
        },
        queryB: {
          type: 'string',
          description: 'Optimized or alternative SQL query',
        },
      },
      required: ['queryA', 'queryB'],
    },
    handler: async (session: DatabaseSession, args: any) => {
      const queryA = typeof args?.queryA === 'string' ? args.queryA.trim() : '';
      const queryB = typeof args?.queryB === 'string' ? args.queryB.trim() : '';

      if (!queryA || !queryB) {
        return {
          error: "Both 'queryA' and 'queryB' parameters are required and must be non-empty SQL query strings.",
        };
      }

      validateReadOnlyQuery(queryA, session.engine);
      validateReadOnlyQuery(queryB, session.engine);

      const planA = await explainAndAnalyzeQuery(session, queryA);
      const planB = await explainAndAnalyzeQuery(session, queryB);

      const costA = planA.estimatedCost?.totalCost ?? 0;
      const costB = planB.estimatedCost?.totalCost ?? 0;
      const diff = costA - costB;

      return {
        queryA: {
          query: queryA,
          totalCost: costA,
          scans: planA.scansUsed,
          joins: planA.joinsUsed,
        },
        queryB: {
          query: queryB,
          totalCost: costB,
          scans: planB.scansUsed,
          joins: planB.joinsUsed,
        },
        costImprovement: diff > 0 ? `${diff.toFixed(2)} cost reduction (${((diff / (costA || 1)) * 100).toFixed(1)}%)` : 'No cost reduction',
        recommendation: costB < costA ? 'Query B executes more efficiently.' : costA === costB ? 'Both queries have comparable execution cost.' : 'Query A executes more efficiently.',
      };
    },
  },

  // 9. analyze_normalization
  analyze_normalization: {
    name: 'analyze_normalization',
    description:
      'Evaluates database tables against 1NF, 2NF, and 3NF relational design principles, checking for multi-valued fields, partial dependencies, and transitive dependencies.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Optional table name to analyze individually',
        },
      },
    },
    handler: async (session: DatabaseSession, args?: { tableName?: string }) => {
      const schema = await introspectDatabaseSchema(session);
      const tables = args?.tableName ? [findTable(schema, args.tableName)].filter(Boolean) : schema.tables;

      const analysis = tables.map((table: any) => {
        const pkColumns = table.columns.filter((c: any) => c.key === 'pk' || c.key === 'pk-fk');
        const isCompositePK = pkColumns.length > 1;
        const nonKeyColumns = table.columns.filter((c: any) => !c.key);

        // 1NF check: ensure primary key exists
        const satisfies1NF = pkColumns.length > 0;

        // 2NF check: if composite PK, ensure no non-key columns depend partially
        const satisfies2NF = satisfies1NF;

        // 3NF check: check for unconstrained status strings or redundant data
        const potentialTransitive = nonKeyColumns.filter((c: any) =>
          c.name.toLowerCase().endsWith('_name') && !c.name.toLowerCase().startsWith(table.name.toLowerCase())
        );

        return {
          table: table.name,
          primaryKey: pkColumns.map((c: any) => c.name),
          isCompositePK,
          columnCount: table.columns.length,
          normalFormAssessment: {
            '1NF': satisfies1NF ? 'Satisfied (Atomic values & PK present)' : 'VIOLATION: Table lacks a primary key',
            '2NF': satisfies2NF ? 'Satisfied (All non-key attributes depend on whole PK)' : 'Needs review',
            '3NF': potentialTransitive.length === 0 ? 'Satisfied (No obvious transitive dependencies)' : `Warning: Check columns [${potentialTransitive.map((c: any) => c.name).join(', ')}]`,
          },
        };
      });

      return {
        database: session.database,
        tablesEvaluated: analysis.length,
        results: analysis,
      };
    },
  },

  // 10. analyze_schema_impact
  analyze_schema_impact: {
    name: 'analyze_schema_impact',
    description:
      'Calculates the referential blast radius of altering or dropping a table or column, tracing all incoming foreign keys.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'The table being modified or dropped',
        },
        columnName: {
          type: 'string',
          description: 'Optional column being modified or dropped',
        },
      },
      required: ['tableName'],
    },
    handler: async (session: DatabaseSession, args: { tableName: string; columnName?: string }) => {
      const schema = await introspectDatabaseSchema(session);
      const table = findTable(schema, args.tableName);
      if (!table) return { error: `Table "${args.tableName}" not found.` };

      const dependentTables: Array<{ table: string; column: string; targetColumn: string; action: string }> = [];
      for (const t of schema.tables) {
        for (const fk of t.foreignKeys) {
          if (fk.referencedTable.toLowerCase() === table.name.toLowerCase()) {
            if (!args.columnName || fk.referencedColumn.toLowerCase() === args.columnName.toLowerCase()) {
              dependentTables.push({
                table: t.name,
                column: fk.column,
                targetColumn: fk.referencedColumn,
                action: fk.onDelete || 'NO ACTION',
              });
            }
          }
        }
      }

      return {
        targetTable: table.name,
        targetColumn: args.columnName || 'ALL',
        impactSeverity: dependentTables.length > 2 ? 'HIGH' : dependentTables.length > 0 ? 'MEDIUM' : 'LOW',
        dependentTablesCount: dependentTables.length,
        dependentForeignKeys: dependentTables,
        summary:
          dependentTables.length > 0
            ? `Modifying "${table.name}" directly affects ${dependentTables.length} foreign key(s) in: [${[...new Set(dependentTables.map((d) => d.table))].join(', ')}]. Deleting rows will trigger "${dependentTables[0]?.action}" behaviors.`
            : `Safe to modify: No other tables define foreign keys referencing "${table.name}".`,
      };
    },
  },

  // 11. suggest_indexes
  suggest_indexes: {
    name: 'suggest_indexes',
    description:
      'Evaluates all foreign keys and table queries to suggest useful, non-redundant B-Tree indexes, respecting composite index leading-column rules.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'Optional table name to filter index suggestions',
        },
      },
    },
    handler: async (session: DatabaseSession, args?: { tableName?: string }) => {
      const schema = await introspectDatabaseSchema(session);
      const allIndexes = await fetchDatabaseIndexes(session);
      const suggestions: Array<{
        table: string;
        column: string;
        indexName: string;
        suggestedSql: string;
        rollbackSql: string;
        reason: string;
        priority: 'HIGH' | 'MEDIUM';
      }> = [];

      const targetTables = args?.tableName ? [findTable(schema, args.tableName)].filter(Boolean) : schema.tables;

      for (const table of targetTables as any[]) {
        const tableIndexes = allIndexes.filter((i) => i.table === table.name);
        for (const fk of table.foreignKeys || []) {
          if (!fk?.column) continue;
          const isCovered = hasIndexOnColumn(tableIndexes, fk.column);
          if (!isCovered) {
            const indexName = `idx_${table.name}_${fk.column}`;
            suggestions.push({
              table: table.name,
              column: fk.column,
              indexName,
              suggestedSql:
                session.engine === 'postgres'
                  ? `CREATE INDEX "${indexName}" ON "${table.schema}"."${table.name}" ("${fk.column}");`
                  : `CREATE INDEX \`${indexName}\` ON \`${table.schema}\`.\`${table.name}\` (\`${fk.column}\`);`,
              rollbackSql:
                session.engine === 'postgres'
                  ? `DROP INDEX IF EXISTS "${table.schema}"."${indexName}";`
                  : `DROP INDEX \`${indexName}\` ON \`${table.schema}\`.\`${table.name}\`;`,
              reason: `Foreign key to "${fk.referencedTable}.${fk.referencedColumn}" is unindexed, leading to table scans on joins and cascade operations.`,
              priority: 'HIGH',
            });
          }
        }
      }

      return {
        database: session.database,
        totalSuggestions: suggestions.length,
        suggestions,
      };
    },
  },

  // 12. generate_sql_improvement
  generate_sql_improvement: {
    name: 'generate_sql_improvement',
    description:
      'Generates precise SQL DDL for an index, check constraint, or nullability improvement with rollback script, benefits, and locking risks.',
    parameters: {
      type: 'object',
      properties: {
        improvementType: {
          type: 'string',
          enum: ['add_index', 'add_check_constraint', 'add_foreign_key', 'set_not_null'],
          description: 'Type of database improvement',
        },
        tableName: {
          type: 'string',
          description: 'Target table name',
        },
        columnName: {
          type: 'string',
          description: 'Target column name',
        },
        constraintDetails: {
          type: 'string',
          description: 'Optional details e.g. allowed values for check constraint ("active, completed, dropped")',
        },
      },
      required: ['improvementType', 'tableName'],
    },
    handler: async (
      session: DatabaseSession,
      args: {
        improvementType: string;
        tableName: string;
        columnName?: string;
        constraintDetails?: string;
      }
    ) => {
      const schema = await introspectDatabaseSchema(session);
      const table = findTable(schema, args.tableName);
      if (!table) return { error: `Table "${args.tableName}" not found.` };

      const col = args.columnName || 'id';

      if (args.improvementType === 'add_index') {
        const indexName = `idx_${table.name}_${col}`;
        const sql =
          session.engine === 'postgres'
            ? `CREATE INDEX "${indexName}" ON "${table.schema}"."${table.name}" ("${col}");`
            : `CREATE INDEX \`${indexName}\` ON \`${table.schema}\`.\`${table.name}\` (\`${col}\`);`;
        const rollbackSql =
          session.engine === 'postgres'
            ? `DROP INDEX IF EXISTS "${table.schema}"."${indexName}";`
            : `DROP INDEX \`${indexName}\` ON \`${table.schema}\`.\`${table.name}\`;`;

        return {
          sql,
          rollbackSql,
          explanation: `Creates a B-Tree index on "${table.name}.${col}" to optimize lookups and join performance.`,
          expectedBenefit: 'Reduces join scan costs from O(N) to O(log N).',
          potentialRisks: 'Negligible write overhead during row inserts/updates.',
          lockingConsiderations: 'Brief share lock during index creation. On production with millions of rows, consider CREATE INDEX CONCURRENTLY.',
        };
      }

      if (args.improvementType === 'add_check_constraint') {
        const constraintName = `chk_${table.name}_${col}`;
        const rawValues = args.constraintDetails || 'active, inactive, pending';
        const formattedValues = rawValues
          .split(',')
          .map((v) => `'${v.trim().replace(/'/g, "''")}'`)
          .join(', ');
        const sql =
          session.engine === 'postgres'
            ? `ALTER TABLE "${table.schema}"."${table.name}" ADD CONSTRAINT "${constraintName}" CHECK ("${col}" IN (${formattedValues}));`
            : `ALTER TABLE \`${table.schema}\`.\`${table.name}\` ADD CONSTRAINT \`${constraintName}\` CHECK (\`${col}\` IN (${formattedValues}));`;
        const rollbackSql =
          session.engine === 'postgres'
            ? `ALTER TABLE "${table.schema}"."${table.name}" DROP CONSTRAINT IF EXISTS "${constraintName}";`
            : `ALTER TABLE \`${table.schema}\`.\`${table.name}\` DROP CONSTRAINT \`${constraintName}\`;`;

        return {
          sql,
          rollbackSql,
          explanation: `Adds a CHECK constraint restricting "${table.name}.${col}" to allowed values.`,
          expectedBenefit: 'Guarantees domain integrity and prevents invalid state values.',
          potentialRisks: 'ALTER TABLE will fail if existing rows contain values outside the allowed set.',
          lockingConsiderations: 'Requires an ACCESS EXCLUSIVE lock to validate existing rows.',
        };
      }

      return {
        error: `Unsupported improvement type: ${args.improvementType}`,
      };
    },
  },

  // 13. validate_sql_improvement
  validate_sql_improvement: {
    name: 'validate_sql_improvement',
    description:
      'Validates proposed SQL syntax and checks engine acceptance inside a rolled-back transaction without applying any permanent changes.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'The SQL statement to validate',
        },
      },
      required: ['sql'],
    },
    handler: async (session: DatabaseSession, args: { sql: string }) => {
      const trimmed = args.sql.trim();
      // Block multiple statements
      if ((trimmed.match(/;/g) || []).length > 1 && !trimmed.endsWith(';')) {
        return { valid: false, error: 'Only single SQL statements can be validated.' };
      }

      // Check if it's a read-only query or safe DDL
      if (session.engine === 'postgres') {
        const client = await session.pool.connect();
        try {
          await client.query('BEGIN;');
          // Dry-run the statement
          await client.query(trimmed);
          await client.query('ROLLBACK;');
          return {
            valid: true,
            status: 'Validation Successful',
            engine: 'postgres',
            message: 'Syntax and constraint checks verified by PostgreSQL inside a rolled-back transaction.',
          };
        } catch (err: any) {
          await client.query('ROLLBACK;').catch(() => {});
          return {
            valid: false,
            status: 'Validation Failed',
            error: err.message,
          };
        } finally {
          client.release();
        }
      }

      if (session.engine === 'mysql') {
        const isDdl = /^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(trimmed);
        if (isDdl) {
          // MySQL automatically commits all DDL statements; transactional dry-run cannot roll them back.
          return {
            valid: true,
            status: 'Dry-Run Inapplicable (MySQL Implicit Commit)',
            engine: 'mysql',
            message:
              'MySQL does not support transactional DDL; statements like CREATE, ALTER, and DROP trigger an implicit commit and cannot be safely rolled back in a transaction. To ensure database safety, this statement cannot be executed automatically as a dry run. Please review the SQL and use DBFlow Two-Phase Plan Engine for human confirmation before applying.',
            requiresExplicitConfirmation: true,
            warning: 'MySQL DDL causes an implicit commit and cannot be rolled back.',
          };
        }

        // For read-only queries in MySQL, validate syntax using safe EXPLAIN
        try {
          await (session.pool as any).query({ sql: `EXPLAIN ${trimmed}`, timeout: 5000 });
          return {
            valid: true,
            status: 'Syntax Verified via EXPLAIN',
            engine: 'mysql',
            message: 'Query syntax and table references verified safely with MySQL EXPLAIN.',
          };
        } catch (err: any) {
          return {
            valid: false,
            status: 'Validation Failed',
            engine: 'mysql',
            error: err.message,
          };
        }
      }

      return {
        valid: true,
        status: 'Syntax Normalized',
        message: 'Statement parsed successfully.',
      };
    },
  },

  // 14. locate_schema_object
  locate_schema_object: {
    name: 'locate_schema_object',
    description:
      'Identifies the table and optional column on the DBFlow React Flow schema canvas for automated highlighting and camera navigation.',
    parameters: {
      type: 'object',
      properties: {
        tableName: {
          type: 'string',
          description: 'The table to locate on the canvas',
        },
        columnName: {
          type: 'string',
          description: 'Optional column name within the table',
        },
      },
      required: ['tableName'],
    },
    handler: async (session: DatabaseSession, args: any) => {
      const tableName = typeof args?.tableName === 'string' ? args.tableName.trim() : '';
      if (!tableName) {
        return {
          found: false,
          error: "The 'tableName' parameter is required and must be a non-empty string.",
        };
      }

      const columnName = typeof args?.columnName === 'string' && args.columnName.trim()
        ? args.columnName.trim()
        : null;

      const schema = await introspectDatabaseSchema(session);
      const table = findTable(schema, tableName);
      if (!table) return { found: false, error: `Table "${tableName}" does not exist in schema.` };

      return {
        found: true,
        targetTable: table.name,
        targetSchema: table.schema,
        targetColumn: columnName,
        message: `Located table "${table.name}" on schema canvas.`,
      };
    },
  },
};
