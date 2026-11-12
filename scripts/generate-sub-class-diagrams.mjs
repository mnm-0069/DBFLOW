import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(process.cwd());
const SUB_DIR = path.join(REPO_ROOT, 'docs', 'uml', '03-class', 'sub-diagrams');
fs.mkdirSync(SUB_DIR, { recursive: true });

const SUB_CLASSES = {
  'class-01-connection-session': {
    title: 'Class Diagram Part 1: Connection & Session Management',
    mermaid: `classDiagram
    direction TB
    class ConnectionInput {
        +DatabaseEngine engine
        +string host
        +number port
        +string database
        +string username
        +string password
        +boolean ssl
    }

    class ConnectionTestRequest {
        +DatabaseEngine engine
        +string host
        +number port
        +string database
        +string username
        +string password
        +boolean ssl
    }

    class ConnectionTestResponse {
        +boolean success
        +DatabaseEngine engine
        +number latencyMs
        +string serverVersion
    }

    class DatabaseSession {
        <<interface>>
        +DatabaseEngine engine
        +string database
        +number lastUsedAt
        +string connectionId
    }

    class PostgresSession {
        +Pool pool
        +string database
        +number lastUsedAt
        +string connectionId
    }

    class MysqlSession {
        +mysql.Pool pool
        +string database
        +number lastUsedAt
        +string connectionId
    }

    DatabaseSession <|.. PostgresSession : implements
    DatabaseSession <|.. MysqlSession : implements
    ConnectionInput ..> DatabaseSession : establishes
    ConnectionTestRequest ..> ConnectionTestResponse : produces`,
  },

  'class-02-schema-ddl': {
    title: 'Class Diagram Part 2: Schema Introspection & Two-Phase DDL',
    mermaid: `classDiagram
    direction TB
    class PostgresSchemaTable {
        +string schema
        +string name
        +SchemaColumn[] columns
        +KeyGroup[] keyGroups
        +ForeignKeyMapping[] foreignKeys
    }

    class SchemaColumn {
        +string name
        +string type
        +string key
        +boolean unique
        +boolean nullable
        +boolean hasDefault
        +boolean generated
        +boolean identity
    }

    class KeyGroup {
        +string kind
        +string[] columns
    }

    class ForeignKeyMapping {
        +string column
        +string referencedSchema
        +string referencedTable
        +string referencedColumn
        +string onDelete
        +string onUpdate
    }

    class CreateTableDraft {
        +string schema
        +string table
        +CreateTableColumnDraft[] columns
        +string[][] uniqueConstraints
        +CreateTableForeignKey[] foreignKeyConstraints
    }

    class CreateTableColumnDraft {
        +string name
        +CreateTableColumnType type
        +boolean nullable
        +boolean primaryKey
        +boolean unique
        +CreateTableDefault default
        +CreateTableChecks checks
    }

    class CreateTablePlan {
        +string planId
        +string sql
        +number expiresInSeconds
    }

    PostgresSchemaTable "1" *-- "1..*" SchemaColumn : contains
    PostgresSchemaTable "1" o-- "0..*" KeyGroup : defines
    PostgresSchemaTable "1" o-- "0..*" ForeignKeyMapping : defines
    CreateTableDraft "1" *-- "1..*" CreateTableColumnDraft : contains
    CreateTableDraft ..> CreateTablePlan : generates`,
  },

  'class-03-copilot-health': {
    title: 'Class Diagram Part 3: Copilot 2.0 & Database Health Models',
    mermaid: `classDiagram
    direction TB
    class DatabaseHealthReport {
        +string engine
        +string database
        +string analyzedAt
        +number tableCount
        +number totalColumns
        +number foreignKeyCount
        +number indexCount
        +HealthScoreBreakdown healthScore
        +HealthFinding[] findings
        +HealthSummary summary
    }

    class HealthFinding {
        +string id
        +string title
        +CopilotSeverity severity
        +CopilotCategory category
        +string table
        +string column
        +string problem
        +string explanation
        +string evidence
        +string recommendedSolution
        +string suggestedSql
        +CopilotConfidence confidence
    }

    class HealthScoreBreakdown {
        +number baseScore
        +number totalDeductions
        +number finalScore
        +string grade
        +Deduction[] deductions
        +CategoryScores categoryScores
    }

    class CopilotChatMessage {
        +string id
        +string conversationId
        +string role
        +string content
        +string timestamp
        +boolean isAiGenerated
        +AgentToolCall[] toolCalls
        +CopilotAction[] suggestedActions
        +CopilotTelemetry telemetry
    }

    class AgentToolCall {
        +string id
        +string name
        +Record~string,unknown~ args
        +unknown result
        +string status
        +string startedAt
        +string completedAt
        +string error
    }

    class ToolDefinition {
        +string name
        +string description
        +ToolParameters parameters
        +handler(session, args) Promise~unknown~
    }

    DatabaseHealthReport "1" *-- "1" HealthScoreBreakdown : evaluates
    DatabaseHealthReport "1" *-- "0..*" HealthFinding : collects
    CopilotChatMessage "1" o-- "0..*" AgentToolCall : tracks
    AgentToolCall ..> ToolDefinition : invokes`,
  },

  'class-04-services-errors': {
    title: 'Class Diagram Part 4: Domain Services & Error Specialization Hierarchy',
    mermaid: `classDiagram
    direction TB
    class ConnectionService {
        -Map postgresSessions
        -Map mysqlSessions
        +testDatabaseConnection(input)
        +openDatabaseSession(input)
        +getDatabaseSession(connectionId)
        +closeDatabaseSession(connectionId)
        +introspectDatabaseSchema(session)
        +executeDatabaseQuery(session, query)
        +readDatabaseTablePage(session, ...)
        +validateReadOnlyQuery(query, engine)
    }

    class SchemaService {
        -Map schemaPlans
        +validateCreateTableDraft(draft, engine)
        +previewCreateTable(session, connId, draft)
        +executeCreateTable(session, connId, planId)
        +previewAddColumn(session, connId, sql)
        +executeAddColumn(session, connId, planId)
        +previewForeignKey(session, connId, draft)
        +executeForeignKey(session, connId, planId)
        +previewDropTable(session, connId, ...)
        +executeDropTable(session, connId, planId)
    }

    class AgentEngine {
        +runCopilotAgent(session, msg, history, opts)
        +classifyUserIntent(msg, tables, history)
        +generateLocalResponse(msg, intent, db, eng)
    }

    class Error {
        <<standard>>
        +string message
        +string name
    }

    class ConnectionOrQueryError {
        <<abstract>>
    }
    class CatalogOrMutationError {
        <<abstract>>
    }

    Error <|-- ConnectionOrQueryError
    Error <|-- CatalogOrMutationError

    class DatabaseHostValidationError { }
    class PostgresSessionLimitError { }
    class RecordSortColumnError { }
    class ReadOnlyQueryValidationError { }
    class DatabaseQueryResultSizeError { }

    ConnectionOrQueryError <|-- DatabaseHostValidationError
    ConnectionOrQueryError <|-- PostgresSessionLimitError
    ConnectionOrQueryError <|-- RecordSortColumnError
    ConnectionOrQueryError <|-- ReadOnlyQueryValidationError
    ConnectionOrQueryError <|-- DatabaseQueryResultSizeError

    class PostgresTableNotFoundError { }
    class PostgresResultSizeError { }
    class SchemaOperationError { +number status }
    class RecordUpdateError { +number status }
    class RecordMutationError { +number status }

    CatalogOrMutationError <|-- PostgresTableNotFoundError
    CatalogOrMutationError <|-- PostgresResultSizeError
    CatalogOrMutationError <|-- SchemaOperationError
    CatalogOrMutationError <|-- RecordUpdateError
    CatalogOrMutationError <|-- RecordMutationError`,
  },
};

async function generateSubDiagrams() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
  
  const htmlTemplate = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
      body { margin: 0; padding: 40px; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #container { display: inline-block; background: #ffffff; }
    </style>
  </head>
  <body>
    <div id="container"></div>
    <script>
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        themeVariables: {
          primaryColor: '#eff6ff',
          primaryTextColor: '#1e3a8a',
          primaryBorderColor: '#3b82f6',
          lineColor: '#64748b',
          secondaryColor: '#f5f3ff',
          tertiaryColor: '#f0fdf4',
          background: '#ffffff',
          mainBkg: '#ffffff',
          nodeBorder: '#94a3b8',
          fontSize: '12px'
        }
      });
      async function render(id, code) {
        const c = document.getElementById('container');
        c.innerHTML = '';
        const { svg } = await mermaid.render(id, code);
        c.innerHTML = svg;
        return svg;
      }
    </script>
  </body>
  </html>
  `;

  await page.setContent(htmlTemplate);
  await page.waitForFunction(() => typeof window.mermaid !== 'undefined');

  for (const [key, item] of Object.entries(SUB_CLASSES)) {
    console.log(`Rendering ${key}...`);
    fs.writeFileSync(path.join(SUB_DIR, `${key}.mmd`), item.mermaid.trim() + '\n');
    
    const svg = await page.evaluate(async ({ id, code }) => {
      return await window.render(id, code);
    }, { id: key, code: item.mermaid });

    fs.writeFileSync(path.join(SUB_DIR, `${key}.svg`), svg);

    const container = page.locator('#container');
    const box = await container.boundingBox();
    if (box) {
      await page.setViewportSize({
        width: Math.max(1000, Math.ceil(box.width) + 80),
        height: Math.max(600, Math.ceil(box.height) + 80),
      });
    }
    await container.screenshot({ path: path.join(SUB_DIR, `${key}.png`) });
    console.log(`  ✓ ${key}.svg and ${key}.png generated.`);
  }

  await browser.close();
}

generateSubDiagrams().catch(console.error);
