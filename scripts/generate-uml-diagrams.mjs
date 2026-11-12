import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(process.cwd());
const UML_BASE = path.join(REPO_ROOT, 'docs', 'uml');

// Ensure all subdirectories exist
const DIRS = [
  '01-use-case',
  '02-component',
  '03-class',
  '04-sequence-database-connection',
  '05-sequence-sql-execution',
  '06-sequence-copilot',
  '07-activity',
  '08-deployment',
];

for (const dir of DIRS) {
  fs.mkdirSync(path.join(UML_BASE, dir), { recursive: true });
}

export const DIAGRAMS = {
  '01-use-case': {
    title: 'Use Case Diagram — DBFlow Intelligent Database Platform',
    name: 'use-case',
    mermaid: `flowchart LR
    %% Actors
    subgraph HumanActors["👤 Human Actors"]
        Dev["👤 Database Developer / Engineer"]
        Analyst["👤 Data Analyst"]
        DBA["👤 Database Administrator (DBA)"]
    end

    subgraph ExternalActors["🤖 External Services"]
        Gemini["☁️ Google Gemini AI Gateway"]
        TargetDB["🗄️ Target Database Engine (PostgreSQL / MySQL)"]
    end

    %% DBFlow System Boundary
    subgraph DBFlowSystem["System Boundary: DBFlow Platform"]
        subgraph SubsystemSessionSchema["🔌 Session & Schema Operations"]
            UC1(["UC1: Manage Database Sessions"])
            UC1_1(["UC1.1: Validate Host & Security"])
            UC1_2(["UC1.2: Session Idle Expiration (15m)"])
            UC2(["UC2: Introspect & Explore Schema"])
            UC2_1(["UC2.1: Render ER Canvas"])
            UC2_2(["UC2.2: Group Tables & Notes"])
            UC3(["UC3: Two-Phase Schema Modification"])
            UC3_1(["UC3.1: Dry-Run Rollback Validation"])
            UC3_2(["UC3.2: Review Generated DDL SQL"])
            UC3_3(["UC3.3: Execute Stored Plan Token"])
        end

        subgraph SubsystemDataSql["📊 Data Explorer & SQL Workspace"]
            UC4(["UC4: Browse & Edit Table Records"])
            UC4_1(["UC4.1: Server-Side Paging & Sorting"])
            UC4_2(["UC4.2: Full-Table Text Search"])
            UC4_3(["UC4.3: Optimistic Concurrency Edit"])
            UC4_4(["UC4.4: Two-Phase Row Insert / Delete"])
            UC4_5(["UC4.5: Export Visible Records as CSV"])
            UC5(["UC5: Execute Read-Only SQL Queries"])
            UC5_1(["UC5.1: AST / Lexical Safety Validation"])
            UC5_2(["UC5.2: 8s Timeout & 2MB Limit"])
            UC6(["UC6: Visually Build Queries"])
        end

        subgraph SubsystemCopilot["🧠 Copilot 2.0 & Continuous Intelligence"]
            UC7(["UC7: Inspect Workload Analytics"])
            UC8(["UC8: Consult DBFlow Copilot 2.0"])
            UC8_1(["UC8.1: Classify Conversational Intent"])
            UC8_2(["UC8.2: NL to SQL Query Generation"])
            UC8_3(["UC8.3: Autonomous Agent Loop (14 Tools)"])
            UC8_4(["UC8.4: EXPLAIN Plan Cost Analysis"])
            UC9(["UC9: Background Continuous Intelligence"])
            UC9_1(["UC9.1: Proactive Health Scoring (A-F)"])
            UC9_2(["UC9.2: Automatic Cache Invalidation"])
        end
        SubsystemSessionSchema ~~~ SubsystemDataSql ~~~ SubsystemCopilot
    end

    %% Actor to Use Case Associations
    Dev --> UC1
    Dev --> UC2
    Dev --> UC3
    Dev --> UC5
    Dev --> UC6
    Dev --> UC8

    Analyst --> UC1
    Analyst --> UC2
    Analyst --> UC4
    Analyst --> UC5
    Analyst --> UC6
    Analyst --> UC7

    DBA --> UC1
    DBA --> UC2
    DBA --> UC3
    DBA --> UC7
    DBA --> UC8
    DBA --> UC9

    %% Includes & Extends
    UC1 -.->|"<<include>>"| UC1_1
    UC1 -.->|"<<extend>>"| UC1_2
    UC2 -.->|"<<include>>"| UC2_1
    UC2 -.->|"<<extend>>"| UC2_2
    UC3 -.->|"<<include>>"| UC3_1
    UC3 -.->|"<<include>>"| UC3_2
    UC3 -.->|"<<include>>"| UC3_3

    UC4 -.->|"<<include>>"| UC4_1
    UC4 -.->|"<<include>>"| UC4_2
    UC4 -.->|"<<extend>>"| UC4_3
    UC4 -.->|"<<extend>>"| UC4_4
    UC4 -.->|"<<extend>>"| UC4_5

    UC5 -.->|"<<include>>"| UC5_1
    UC5 -.->|"<<include>>"| UC5_2

    UC8 -.->|"<<include>>"| UC8_1
    UC8 -.->|"<<extend>>"| UC8_2
    UC8 -.->|"<<extend>>"| UC8_3
    UC8 -.->|"<<extend>>"| UC8_4

    UC9 -.->|"<<include>>"| UC9_1
    UC9 -.->|"<<include>>"| UC9_2

    %% External System Connections
    UC1 -.-> TargetDB
    UC2 -.-> TargetDB
    UC3_3 -.-> TargetDB
    UC4_1 -.-> TargetDB
    UC4_4 -.-> TargetDB
    UC5 -.-> TargetDB
    UC9_1 -.-> TargetDB

    UC8_2 -.-> Gemini
    UC8_3 -.-> Gemini

    classDef actor fill:#f8fafc,stroke:#475569,stroke-width:2px,font-weight:bold;
    classDef usecase fill:#eff6ff,stroke:#2563eb,stroke-width:1.5px,color:#1e3a8a;
    classDef subusecase fill:#f0fdf4,stroke:#16a34a,stroke-width:1px,color:#14532d;
    class Dev,Analyst,DBA,Gemini,TargetDB actor;
    class UC1,UC2,UC3,UC4,UC5,UC6,UC7,UC8,UC9 usecase;
    class UC1_1,UC1_2,UC2_1,UC2_2,UC3_1,UC3_2,UC3_3,UC4_1,UC4_2,UC4_3,UC4_4,UC4_5,UC5_1,UC5_2,UC8_1,UC8_2,UC8_3,UC8_4,UC9_1,UC9_2 subusecase;`,

    plantuml: `@startuml
left to right direction
skinparam packageStyle rectangle
skinparam roundcorner 8
skinparam shadowing false
skinparam monochrome false
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam backgroundColor #FFFFFF

actor "Database Developer / Engineer" as Dev
actor "Data Analyst" as Analyst
actor "Database Administrator (DBA)" as DBA

actor "Google Gemini AI Gateway" as Gemini <<External System>>
actor "Target Database (PG / MySQL)" as TargetDB <<External Database>>

rectangle "DBFlow System" {
  package "Connection & Session Management" {
    usecase "UC1: Manage Database Sessions" as UC1
    usecase "UC1.1: Validate Host & Egress" as UC1_1
    usecase "UC1.2: 15-min Idle Expiry" as UC1_2
  }

  package "Schema Visualization & Guided DDL" {
    usecase "UC2: Introspect & Explore Schema" as UC2
    usecase "UC2.1: Render ER Diagram" as UC2_1
    usecase "UC2.2: Group Tables & Color Coding" as UC2_2
    usecase "UC3: Two-Phase Schema Modification" as UC3
    usecase "UC3.1: Dry-Run Plan Validation" as UC3_1
    usecase "UC3.2: Review Generated DDL" as UC3_2
    usecase "UC3.3: Execute Stored Plan" as UC3_3
    usecase "UC3.4: Dependency Cascade Check" as UC3_4
  }

  package "Data Explorer & Record Manipulation" {
    usecase "UC4: Browse & Manipulate Records" as UC4
    usecase "UC4.1: Server-Side Paging & Sorting" as UC4_1
    usecase "UC4.2: Full-Table Text Search" as UC4_2
    usecase "UC4.3: Optimistic Concurrency Row Edit" as UC4_3
    usecase "UC4.4: Two-Phase Row Insert / Delete" as UC4_4
    usecase "UC4.5: Export Records to CSV" as UC4_5
  }

  package "SQL Workspace & Visual Builder" {
    usecase "UC5: Execute Read-Only SQL" as UC5
    usecase "UC5.1: AST & Syntax Safety Guard" as UC5_1
    usecase "UC5.2: 8s Timeout & 2MB Limit" as UC5_2
    usecase "UC5.3: Session Query History" as UC5_3
    usecase "UC6: Visually Build Queries" as UC6
    usecase "UC6.1: Interactive Table Joins" as UC6_1
    usecase "UC6.2: Synchronize Live SQL" as UC6_2
  }

  package "Analytics, Health & Copilot 2.0" {
    usecase "UC7: Inspect Workload Analytics" as UC7
    usecase "UC8: Consult DBFlow Copilot" as UC8
    usecase "UC8.1: Intent Classification" as UC8_1
    usecase "UC8.2: NL to SQL Generation" as UC8_2
    usecase "UC8.3: Autonomous Agent Tool Loop" as UC8_3
    usecase "UC8.4: EXPLAIN Plan Analysis" as UC8_4
    usecase "UC9: Background Continuous Intelligence" as UC9
    usecase "UC9.1: Health Score Deductions" as UC9_1
    usecase "UC9.2: Cache Invalidation on DDL/DML" as UC9_2
  }
}

Dev --> UC1
Dev --> UC2
Dev --> UC3
Dev --> UC5
Dev --> UC6
Dev --> UC8

Analyst --> UC1
Analyst --> UC2
Analyst --> UC4
Analyst --> UC5
Analyst --> UC6
Analyst --> UC7

DBA --> UC1
DBA --> UC2
DBA --> UC3
DBA --> UC7
DBA --> UC8
DBA --> UC9

UC1 ..> UC1_1 : <<include>>
UC1 ..> UC1_2 : <<extend>>

UC2 ..> UC2_1 : <<include>>
UC2 ..> UC2_2 : <<extend>>

UC3 ..> UC3_1 : <<include>>
UC3 ..> UC3_2 : <<include>>
UC3 ..> UC3_3 : <<include>>
UC3 ..> UC3_4 : <<extend>>

UC4 ..> UC4_1 : <<include>>
UC4 ..> UC4_2 : <<include>>
UC4 ..> UC4_3 : <<extend>>
UC4 ..> UC4_4 : <<extend>>
UC4 ..> UC4_5 : <<extend>>

UC5 ..> UC5_1 : <<include>>
UC5 ..> UC5_2 : <<include>>
UC5 ..> UC5_3 : <<extend>>

UC6 ..> UC6_1 : <<include>>
UC6 ..> UC6_2 : <<include>>

UC8 ..> UC8_1 : <<include>>
UC8 ..> UC8_2 : <<extend>>
UC8 ..> UC8_3 : <<extend>>
UC8 ..> UC8_4 : <<extend>>

UC9 ..> UC9_1 : <<include>>
UC9 ..> UC9_2 : <<include>>

UC8_2 ..> Gemini
UC8_3 ..> Gemini
UC1 ..> TargetDB
UC2 ..> TargetDB
UC3_3 ..> TargetDB
UC4_1 ..> TargetDB
UC4_4 ..> TargetDB
UC5 ..> TargetDB
UC9_1 ..> TargetDB
@enduml`,
  },

  '02-component': {
    title: 'Component Diagram — DBFlow Multi-Tier System Architecture',
    name: 'component',
    mermaid: `flowchart TB
    %% Client Tier
    subgraph ClientTier["Frontend Client Application (apps/web)"]
        direction TB
        AppShell["🖥️ App Shell & View Coordinator<br/>(App.tsx)"]
        
        subgraph FrontendViews["Feature Workspaces"]
            SchemaDesigner["🎨 Schema Designer<br/>(React Flow, Custom Nodes & Edges)"]
            DataExplorer["📊 Data Explorer<br/>(AG Grid, Catalog, Drawers & Modals)"]
            SqlWorkspace["📝 SQL Workspace<br/>(Monaco Editor, History Manager)"]
            QueryBuilder["🧩 Visual Query Builder<br/>(Join Builder, Filters, SQL Sync)"]
            AnalyticsView["📈 Analytics Dashboard<br/>(Performance Metrics & Charts)"]
            CopilotView["🤖 Copilot 2.0 Interface<br/>(Chat, Health Panel, Timeline Drawer)"]
        end

        ApiClient["📡 Web API Client<br/>(Native Fetch & Error Interceptors)"]
        AppShell --> FrontendViews
        FrontendViews --> ApiClient
    end

    %% Shared Contracts Tier
    subgraph SharedTier["Shared Type Library (packages/shared)"]
        SharedTypes["📦 Core TypeScript Contracts<br/>• Connection Models & Protocols<br/>• Schema & Column Definitions<br/>• Copilot & Telemetry Types<br/>• Health Finding & Scoring Models"]
    end
    ClientTier -.->|imports contracts| SharedTier

    %% Backend API Tier
    subgraph BackendTier["Backend API Service (apps/api - Port 4000)"]
        direction TB
        HttpServer["⚙️ Express HTTP Engine<br/>(server.ts - Loopback 127.0.0.1)"]
        
        subgraph MiddlewareLayer["Middleware & Security Guards"]
            CorsGuard["🛡️ CORS Policy & Origin Check"]
            ZodValidator["🔍 Zod Payload Validators"]
            HostGuard["🚫 DatabaseHostValidator (SSRF Guard)"]
            ErrorHandling["⚠️ Global Error Handler Middleware"]
        end

        subgraph RoutingLayer["REST Controllers & Routes"]
            ConnectionsRoute["/api/connections<br/>(connections.ts)"]
            CopilotRoute["/api/copilot<br/>(copilotRoutes.ts)"]
            HealthRoute["/api/health<br/>(health.ts)"]
        end

        subgraph CoreServices["Business Logic & Domain Services"]
            ConnService["🔌 ConnectionService<br/>(Session Lifecycle & In-Memory Pool)"]
            SchemaService["📐 SchemaService<br/>(Introspection, DDL Staging & Plans)"]
            RecordService["📋 RecordMutationService & UpdateService<br/>(Optimistic Locks & Two-Phase Mutations)"]
            AgentEngine["🧠 AgentEngine & CopilotChatService<br/>(Intent Routing, 14 DB Tools, Loop)"]
            HealthService["🩺 DatabaseHealthAnalyzer<br/>(Deductions, Scoring, Index Audits)"]
            SqlIntelService["⚡ SqlIntelligenceService<br/>(EXPLAIN ANALYZE, Plan Cost Scans)"]
            IntelOrchestrator["🔄 IntelligenceOrchestrator<br/>(Debounced Jobs, Schema Fingerprinting)"]
            IntelStore["💾 IntelligenceStore<br/>(In-Memory & JSON Persistence)"]
            AiGateway["🌐 AiProvider Gateway<br/>(GoogleGenAI & Fallback Abstraction)"]
        end

        subgraph DatabaseDrivers["Database Driver Adapters"]
            PgPool["🐘 PostgreSQL Pool<br/>(pg.Pool with SSL/TLS)"]
            MysqlPool["🐬 MySQL Pool<br/>(mysql2/promise.Pool)"]
        end

        HttpServer --> MiddlewareLayer
        MiddlewareLayer --> RoutingLayer
        ConnectionsRoute --> ConnService
        ConnectionsRoute --> SchemaService
        ConnectionsRoute --> RecordService
        CopilotRoute --> AgentEngine
        CopilotRoute --> HealthService
        CopilotRoute --> SqlIntelService
        CopilotRoute --> IntelOrchestrator
        
        AgentEngine --> CoreServices
        IntelOrchestrator --> HealthService
        IntelOrchestrator --> IntelStore
        ConnService --> DatabaseDrivers
        SchemaService --> DatabaseDrivers
        RecordService --> DatabaseDrivers
    end

    %% External Infrastructure Tier
    subgraph ExternalTier["External Infrastructure & Cloud AI"]
        PostgresInstance["🐘 PostgreSQL Database<br/>(Port 5432)"]
        MysqlInstance["🐬 MySQL Database<br/>(Port 3306)"]
        GeminiCloud["☁️ Google Gemini AI Platform<br/>(generativelanguage.googleapis.com)"]
        DiskCache["📁 Local JSON Storage<br/>(intelligence-cache.json, copilot-conversations.json)"]
    end

    %% Inter-Tier Connections
    ApiClient -->|"HTTP / REST (JSON)"| HttpServer
    BackendTier -.->|imports contracts| SharedTier
    PgPool -->|"TCP / TLS Socket"| PostgresInstance
    MysqlPool -->|"TCP / TLS Socket"| MysqlInstance
    AiGateway -->|"HTTPS / REST"| GeminiCloud
    IntelStore -->|File I/O| DiskCache

    classDef client fill:#eff6ff,stroke:#2563eb,stroke-width:1.5px,color:#1e3a8a;
    classDef server fill:#f5f3ff,stroke:#6366f1,stroke-width:1.5px,color:#312e81;
    classDef shared fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f;
    classDef external fill:#ecfdf5,stroke:#059669,stroke-width:1.5px,color:#064e3b;
    class AppShell,FrontendViews,SchemaDesigner,DataExplorer,SqlWorkspace,QueryBuilder,AnalyticsView,CopilotView,ApiClient client;
    class HttpServer,MiddlewareLayer,RoutingLayer,CoreServices,DatabaseDrivers server;
    class SharedTypes shared;
    class PostgresInstance,MysqlInstance,GeminiCloud,DiskCache external;`,

    plantuml: `@startuml
skinparam componentStyle uml2
skinparam roundcorner 8
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam backgroundColor #FFFFFF

package "Client Tier (apps/web)" as ClientTier #EBF8FF {
  [App Shell & Router\n(App.tsx)] as AppShell
  [Schema Designer\n(React Flow Canvas)] as SchemaDesigner
  [Data Explorer\n(AG Grid Community)] as DataExplorer
  [SQL Workspace\n(Monaco Editor)] as SqlWorkspace
  [Visual Query Builder] as QueryBuilder
  [Analytics Dashboard] as AnalyticsView
  [Copilot 2.0 Interface] as CopilotView
  [Web API Client\n(Fetch Adapter)] as ApiClient

  AppShell --> SchemaDesigner
  AppShell --> DataExplorer
  AppShell --> SqlWorkspace
  AppShell --> QueryBuilder
  AppShell --> AnalyticsView
  AppShell --> CopilotView

  SchemaDesigner --> ApiClient
  DataExplorer --> ApiClient
  SqlWorkspace --> ApiClient
  QueryBuilder --> ApiClient
  AnalyticsView --> ApiClient
  CopilotView --> ApiClient
}

package "Shared Contracts (packages/shared)" as SharedTier #FEFCBF {
  interface "Connection Models" as IConnModels
  interface "Schema Models" as ISchemaModels
  interface "Copilot & Telemetry" as ICopilotModels
  interface "Health Scoring" as IHealthModels
}

package "Backend Service (apps/api - Loopback :4000)" as BackendTier #F3E8FF {
  [Express HTTP Engine] as HttpServer
  [Security & Zod Middleware] as Middleware
  [Connections Router\n(/api/connections)] as ConnectionsRouter
  [Copilot Router\n(/api/copilot)] as CopilotRouter
  [Health Router\n(/api/health)] as HealthRouter

  package "Domain Services" {
    [Connection & Session Service] as ConnService
    [Schema Introspection & DDL Service] as SchemaService
    [Record Mutation Service] as RecordService
    [Copilot Agent Engine & 14 Tools] as AgentEngine
    [Database Health Analyzer] as HealthService
    [SQL Intelligence & EXPLAIN Service] as SqlIntelService
    [Intelligence Orchestrator] as IntelOrchestrator
    [Intelligence & Conversation Store] as IntelStore
    [AI Provider Gateway\n(Google GenAI)] as AiGateway
  }

  package "Database Driver Layer" {
    [PostgreSQL Pool (pg.Pool)] as PgPool
    [MySQL Pool (mysql2.Pool)] as MysqlPool
  }

  HttpServer --> Middleware
  Middleware --> ConnectionsRouter
  Middleware --> CopilotRouter
  Middleware --> HealthRouter

  ConnectionsRouter --> ConnService
  ConnectionsRouter --> SchemaService
  ConnectionsRouter --> RecordService
  CopilotRouter --> AgentEngine
  CopilotRouter --> HealthService
  CopilotRouter --> SqlIntelService
  CopilotRouter --> IntelOrchestrator

  AgentEngine --> AiGateway
  AgentEngine --> HealthService
  AgentEngine --> SqlIntelService
  IntelOrchestrator --> HealthService
  IntelOrchestrator --> IntelStore

  ConnService --> PgPool
  ConnService --> MysqlPool
  SchemaService --> PgPool
  RecordService --> PgPool
}

database "PostgreSQL Server\n(:5432)" as PostgresDB #C6F6D5
database "MySQL Server\n(:3306)" as MysqlDB #C6F6D5
cloud "Google Gemini Cloud\n(generativelanguage.googleapis.com)" as GeminiCloud #FED7D7
file "Local JSON Storage\n(intelligence-cache.json)" as DiskCache #EDF2F7

ApiClient ==( HTTP / REST : HttpServer
ClientTier ..> SharedTier : imports
BackendTier ..> SharedTier : imports

PgPool ==( TCP / Socket : PostgresDB
MysqlPool ==( TCP / Socket : MysqlDB
AiGateway ==( HTTPS / REST : GeminiCloud
IntelStore --> DiskCache : file I/O
@enduml`,
  },

  '03-class': {
    title: 'Class Diagram — Core Domain Entities, Services & Error Hierarchy',
    name: 'class',
    mermaid: `classDiagram
    %% Core Connection Entities
    class ConnectionInput {
        +DatabaseEngine engine
        +string host
        +number port
        +string database
        +string username
        +string password
        +boolean ssl
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

    %% Schema Models
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
    PostgresSchemaTable "1" *-- "1..*" SchemaColumn : aggregates

    class CreateTableDraft {
        +string schema
        +string table
        +CreateTableColumnDraft[] columns
        +string[][] uniqueConstraints
        +CreateTableForeignKey[] foreignKeyConstraints
    }

    class CreateTablePlan {
        +string planId
        +string sql
        +number expiresInSeconds
    }

    %% Copilot & Health Models
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
    DatabaseHealthReport "1" *-- "0..*" HealthFinding : contains

    class HealthScoreBreakdown {
        +number baseScore
        +number totalDeductions
        +number finalScore
        +string grade
        +Deduction[] deductions
        +CategoryScores categoryScores
    }
    DatabaseHealthReport "1" *-- "1" HealthScoreBreakdown : evaluates

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
    CopilotChatMessage "1" o-- "0..*" AgentToolCall : tracks

    class ToolDefinition {
        +string name
        +string description
        +ToolParameters parameters
        +handler(session, args) Promise~unknown~
    }

    %% Core Services
    class ConnectionService {
        -Map~string,PostgresSession~ postgresSessions
        -Map~string,MysqlSession~ mysqlSessions
        +testDatabaseConnection(input) Promise~ConnectionTestResponse~
        +openDatabaseSession(input) Promise~ConnectionSessionResult~
        +getDatabaseSession(connectionId) DatabaseSession
        +closeDatabaseSession(connectionId) Promise~void~
        +introspectDatabaseSchema(session) Promise~SchemaResponse~
        +executeDatabaseQuery(session, query) Promise~QueryResult~
        +readDatabaseTablePage(session, schema, table, page, size, sort, search) Promise~RecordPage~
        +validateReadOnlyQuery(query, engine) void
    }
    ConnectionService --> DatabaseSession : manages

    class SchemaService {
        -Map~string,CreateTablePlan~ schemaPlans
        +validateCreateTableDraft(draft, engine) CreateTableDraft
        +generateCreateTableSql(draft, engine) string
        +previewCreateTable(session, connId, draft) Promise~CreateTablePlan~
        +executeCreateTable(session, connId, planId) Promise~TableResult~
        +previewAddColumn(session, connId, sql) Promise~CreateTablePlan~
        +executeAddColumn(session, connId, planId) Promise~ColumnResult~
        +previewForeignKey(session, connId, draft) Promise~CreateTablePlan~
        +executeForeignKey(session, connId, planId) Promise~FkResult~
        +previewDropTable(session, connId, schema, table, behavior) Promise~DropPlan~
        +executeDropTable(session, connId, planId) Promise~DropResult~
    }
    SchemaService --> CreateTablePlan : stages

    class AgentEngine {
        +runCopilotAgent(session, userMessage, history, options) Promise~CopilotChatMessage~
        +classifyUserIntent(userMessage, knownTables, history) string
        +generateLocalResponse(userMessage, intent, db, engine) string
    }
    AgentEngine --> ToolDefinition : executes
    AgentEngine --> CopilotChatMessage : generates

    ConnectionService --> DatabaseSession : manages
    ConnectionService --> PostgresSchemaTable : introspects
    ConnectionService --> DatabaseHealthReport : analyzes
    SchemaService --> CreateTableDraft : validates
    SchemaService --> CreateTablePlan : stages
    AgentEngine --> ToolDefinition : executes
    AgentEngine --> CopilotChatMessage : generates

    %% Error Hierarchy
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
    class SchemaOperationError {
        +number status
    }
    class RecordUpdateError {
        +number status
    }
    class RecordMutationError {
        +number status
    }

    CatalogOrMutationError <|-- PostgresTableNotFoundError
    CatalogOrMutationError <|-- PostgresResultSizeError
    CatalogOrMutationError <|-- SchemaOperationError
    CatalogOrMutationError <|-- RecordUpdateError
    CatalogOrMutationError <|-- RecordMutationError`,

    plantuml: `@startuml
skinparam classAttributeIconSize 0
skinparam roundcorner 6
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam backgroundColor #FFFFFF

package "Connection Models" {
  class ConnectionInput {
    +engine: "postgres" | "mysql"
    +host: string
    +port: number
    +database: string
    +username: string
    +password: string
    +ssl: boolean
  }

  interface DatabaseSession {
    +engine: "postgres" | "mysql"
    +database: string
    +lastUsedAt: number
    +connectionId: string
  }

  class PostgresSession implements DatabaseSession {
    +pool: pg.Pool
    +database: string
    +lastUsedAt: number
    +connectionId: string
  }

  class MysqlSession implements DatabaseSession {
    +pool: mysql.Pool
    +database: string
    +lastUsedAt: number
    +connectionId: string
  }
}

package "Schema & DDL Models" {
  class PostgresSchemaTable {
    +schema: string
    +name: string
    +columns: SchemaColumn[]
    +keyGroups: KeyGroup[]
    +foreignKeys: ForeignKeyMapping[]
  }

  class SchemaColumn {
    +name: string
    +type: string
    +key: "pk" | "fk" | "pk-fk"
    +unique: boolean
    +nullable: boolean
    +hasDefault: boolean
    +generated: boolean
    +identity: boolean
  }

  class CreateTableDraft {
    +schema: string
    +table: string
    +columns: CreateTableColumnDraft[]
    +uniqueConstraints: string[][]
    +foreignKeyConstraints: CreateTableForeignKey[]
  }

  class CreateTablePlan {
    +planId: string
    +sql: string
    +expiresInSeconds: number
  }

  PostgresSchemaTable "1" *-- "1..*" SchemaColumn
}

package "Health & Copilot Models" {
  class DatabaseHealthReport {
    +engine: string
    +database: string
    +analyzedAt: string
    +tableCount: number
    +foreignKeyCount: number
    +indexCount: number
    +healthScore: HealthScoreBreakdown
    +findings: HealthFinding[]
  }

  class HealthFinding {
    +id: string
    +title: string
    +severity: CopilotSeverity
    +category: CopilotCategory
    +table: string
    +problem: string
    +recommendedSolution: string
    +suggestedSql: string
  }

  class HealthScoreBreakdown {
    +baseScore: number
    +totalDeductions: number
    +finalScore: number
    +grade: "A" | "B" | "C" | "D" | "F"
  }

  class CopilotChatMessage {
    +id: string
    +conversationId: string
    +role: "user" | "assistant" | "system"
    +content: string
    +timestamp: string
    +toolCalls: AgentToolCall[]
    +suggestedActions: CopilotAction[]
    +telemetry: CopilotTelemetry
  }

  class AgentToolCall {
    +id: string
    +name: string
    +args: Record<string, unknown>
    +result: unknown
    +status: "running" | "completed" | "failed"
  }

  DatabaseHealthReport "1" *-- "0..*" HealthFinding
  DatabaseHealthReport "1" *-- "1" HealthScoreBreakdown
  CopilotChatMessage "1" o-- "0..*" AgentToolCall
}

package "Core Domain Services" {
  class ConnectionService {
    -postgresSessions: Map<string, PostgresSession>
    -mysqlSessions: Map<string, MysqlSession>
    +testDatabaseConnection(input: ConnectionInput): Promise<ConnectionTestResponse>
    +openDatabaseSession(input: ConnectionInput): Promise<{connectionId: string}>
    +getDatabaseSession(connectionId: string): DatabaseSession
    +closeDatabaseSession(connectionId: string): Promise<void>
    +introspectDatabaseSchema(session: DatabaseSession): Promise<SchemaResponse>
    +executeDatabaseQuery(session: DatabaseSession, query: string): Promise<QueryResult>
    +readDatabaseTablePage(session: DatabaseSession, ...): Promise<RecordPage>
    +validateReadOnlyQuery(query: string, engine: string): void
  }

  class SchemaService {
    -schemaPlans: Map<string, CreateTablePlan>
    +validateCreateTableDraft(draft: CreateTableDraft, engine: string): CreateTableDraft
    +previewCreateTable(session: DatabaseSession, connId: string, draft: CreateTableDraft): Promise<CreateTablePlan>
    +executeCreateTable(session: DatabaseSession, connId: string, planId: string): Promise<TableResult>
    +previewAddColumn(session: DatabaseSession, connId: string, sql: string): Promise<CreateTablePlan>
    +executeAddColumn(session: DatabaseSession, connId: string, planId: string): Promise<ColumnResult>
    +previewDropTable(session: DatabaseSession, ...): Promise<DropPlan>
    +executeDropTable(session: DatabaseSession, connId: string, planId: string): Promise<DropResult>
  }

  class AgentEngine {
    +runCopilotAgent(session: DatabaseSession, userMessage: string, ...): Promise<CopilotChatMessage>
    +classifyUserIntent(userMessage: string, knownTables: string[], history: any[]): string
    +generateLocalResponse(userMessage: string, intent: string, ...): string
  }
}

package "Error Specialization Hierarchy" {
  class Error <<standard>>

  class PostgresSessionLimitError extends Error
  class PostgresTableNotFoundError extends Error
  class PostgresResultSizeError extends Error
  class RecordSortColumnError extends Error
  class ReadOnlyQueryValidationError extends Error
  class DatabaseQueryResultSizeError extends Error
  class DatabaseHostValidationError extends Error
  class SchemaOperationError extends Error {
    +status: number
  }
  class RecordUpdateError extends Error {
    +status: number
  }
  class RecordMutationError extends Error {
    +status: number
  }
}

ConnectionService --> DatabaseSession : manages
SchemaService --> CreateTablePlan : stages
AgentEngine --> CopilotChatMessage : produces
@enduml`,
  },

  '04-sequence-database-connection': {
    title: 'Sequence Diagram — Database Connection & Schema Introspection',
    name: 'sequence-database-connection',
    mermaid: `sequenceDiagram
    autonumber
    actor User as 👤 Developer
    participant App as 🖥️ Web App (App.tsx)
    participant Route as ⚙️ ConnectionsRouter (/api/connections)
    participant HostVal as 🛡️ DatabaseHostValidator
    participant ConnSvc as 🔌 ConnectionService
    participant IntelOrch as 🔄 IntelligenceOrchestrator
    participant TargetDB as 🗄️ PostgreSQL / MySQL DB
    participant Canvas as 🎨 React Flow Canvas

    %% Phase 1: Test Connection
    Note over User,TargetDB: Phase 1: Credential & Network Connectivity Verification
    User->>App: Fills credentials & clicks "Test connection"
    App->>Route: POST /api/connections/test {engine, host, port, database, username, password, ssl}
    Route->>HostVal: resolveDatabaseHost(host)
    alt Invalid Host / SSRF Target Detected (e.g. 169.254.169.254)
        HostVal-->>Route: throw DatabaseHostValidationError("Local API blocks this destination")
        Route-->>App: HTTP 400 {error: "Local API blocks destination"}
        App-->>User: Displays security warning
    else Valid Target Host
        HostVal-->>Route: returns resolved IP & clean hostname
        Route->>ConnSvc: testDatabaseConnection(input)
        ConnSvc->>TargetDB: Opens temporary TCP client socket
        ConnSvc->>TargetDB: Executes SELECT version();
        TargetDB-->>ConnSvc: Returns server version string
        ConnSvc->>TargetDB: Closes temporary client
        ConnSvc-->>Route: returns {success: true, engine, latencyMs, serverVersion}
        Route-->>App: HTTP 200 {success: true, latencyMs: 24, serverVersion: "PostgreSQL 16.3..."}
        App-->>User: Displays green checkmark & server version badge
    end

    %% Phase 2: Open In-Memory Session
    Note over User,TargetDB: Phase 2: Session Establishment & Background Analytics
    User->>App: Clicks "Inspect PostgreSQL schema"
    App->>Route: POST /api/connections/open {engine, host, port, database, username, password, ssl}
    Route->>ConnSvc: openDatabaseSession(input)
    alt Active Session Limit Reached (> 5 active sessions)
        ConnSvc-->>Route: throw PostgresSessionLimitError()
        Route-->>App: HTTP 429 {error: "Maximum active sessions reached (5). Disconnect one and retry."}
        App-->>User: Displays session limit alert
    else Within Session Limits
        ConnSvc->>TargetDB: Initializes connection pool (pg.Pool / mysql2.Pool)
        ConnSvc->>ConnSvc: Generates 64-character crypto hex token (connectionId)
        ConnSvc->>ConnSvc: Stores in postgresSessions Map with 15-min idle TTL
        ConnSvc-->>Route: returns {connectionId, database, engine}
        Route->>IntelOrch: scheduleAnalysis(connectionId, session, {reason: 'connection_opened'})
        Note right of IntelOrch: Asynchronously initiates background<br/>health & index fingerprinting
        Route-->>App: HTTP 200 {connectionId: "a3f8..."}
    end

    %% Phase 3: Schema Introspection
    Note over User,TargetDB: Phase 3: Schema Introspection & Canvas Hydration
    App->>Route: POST /api/connections/introspect {connectionId}
    Route->>ConnSvc: getDatabaseSession(connectionId)
    alt Session Expired / Not Found
        ConnSvc-->>Route: returns undefined
        Route-->>App: HTTP 410 {error: "Database session expired. Test connection again."}
        App-->>User: Prompts to reconnect
    else Active Session Found
        Route->>ConnSvc: introspectDatabaseSchema(session)
        ConnSvc->>TargetDB: Queries information_schema.columns & pg_type
        TargetDB-->>ConnSvc: Returns column definitions, nullability & types
        ConnSvc->>TargetDB: Queries pg_catalog.pg_constraint & key_column_usage
        TargetDB-->>ConnSvc: Returns PK, Unique and Composite keys
        ConnSvc->>TargetDB: Queries information_schema.referential_constraints
        TargetDB-->>ConnSvc: Returns foreign key source & target mappings
        ConnSvc->>ConnSvc: assemblePostgresSchema(cols, pks, fks, uniqueKeys, keyGroups)
        ConnSvc-->>Route: returns {database, engine, tables: PostgresSchemaTable[]}
        Route-->>App: HTTP 200 {database: "dbflow_demo", tables: [...]}
        App->>Canvas: Converts tables to custom TableNodes & relationship FloatingEdges
        Canvas-->>User: Renders interactive Entity-Relationship diagram canvas
    end`,

    plantuml: `@startuml
autonumber
skinparam roundcorner 6
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam backgroundColor #FFFFFF

actor "Developer" as User
participant "Web App (App.tsx)" as App
participant "ConnectionsRouter\n(/api/connections)" as Route
participant "DatabaseHostValidator" as HostVal
participant "ConnectionService" as ConnSvc
participant "IntelligenceOrchestrator" as IntelOrch
database "Target Database\n(PostgreSQL / MySQL)" as TargetDB
participant "React Flow Canvas" as Canvas

== Phase 1: Credential Verification ==
User -> App : Inputs credentials & clicks "Test connection"
App -> Route : POST /api/connections/test\n{engine, host, port, db, user, pass, ssl}
Route -> HostVal : resolveDatabaseHost(host)
alt Invalid Host / SSRF Forbidden
  HostVal --> Route : throw DatabaseHostValidationError()
  Route --> App : HTTP 400 {error: "Target forbidden"}
  App --> User : Shows error dialog
else Valid Destination Host
  HostVal --> Route : returns resolved IP
  Route -> ConnSvc : testDatabaseConnection(input)
  ConnSvc -> TargetDB : Opens temporary TCP connection
  ConnSvc -> TargetDB : SELECT version();
  TargetDB --> ConnSvc : Returns version string
  ConnSvc -> TargetDB : Closes connection
  ConnSvc --> Route : {success: true, engine, latencyMs, serverVersion}
  Route --> App : HTTP 200 {latencyMs: 24, serverVersion: "PostgreSQL 16..."}
  App --> User : Displays green latency indicator
end

== Phase 2: Session Establishment ==
User -> App : Clicks "Inspect PostgreSQL schema"
App -> Route : POST /api/connections/open\n{credentials}
Route -> ConnSvc : openDatabaseSession(input)
alt Session Pool Exceeded (> 5 concurrent)
  ConnSvc --> Route : throw PostgresSessionLimitError()
  Route --> App : HTTP 429 {error: "Session limit reached"}
else Session Available
  ConnSvc -> TargetDB : Initializes pg.Pool / mysql2.Pool
  ConnSvc -> ConnSvc : Generates 64-hex connectionId
  ConnSvc -> ConnSvc : Stores in in-memory session map (15m TTL)
  ConnSvc --> Route : {connectionId, database, engine}
  Route -> IntelOrch : scheduleAnalysis(connectionId, session, 'connection_opened')
  note right of IntelOrch : Background thread computes\nhealth & index statistics
  Route --> App : HTTP 200 {connectionId: "a3f8..."}
end

== Phase 3: Schema Introspection ==
App -> Route : POST /api/connections/introspect\n{connectionId}
Route -> ConnSvc : getDatabaseSession(connectionId)
Route -> ConnSvc : introspectDatabaseSchema(session)
ConnSvc -> TargetDB : SELECT * FROM information_schema.columns
TargetDB --> ConnSvc : Column rows, types, nullability
ConnSvc -> TargetDB : SELECT * FROM pg_catalog.pg_constraint (PK, FK, Unique)
TargetDB --> ConnSvc : Constraint mappings
ConnSvc -> ConnSvc : assemblePostgresSchema(...)
ConnSvc --> Route : {database, engine, tables: [...]}
Route --> App : HTTP 200 {tables: [...]}
App -> Canvas : Maps tables to TableNodes & FloatingEdges
Canvas --> User : Renders ER schema canvas
@enduml`,
  },

  '05-sequence-sql-execution': {
    title: 'Sequence Diagram — Safe Read-Only SQL Execution',
    name: 'sequence-sql-execution',
    mermaid: `sequenceDiagram
    autonumber
    actor User as 👤 Analyst / Developer
    participant Editor as 📝 Monaco Editor (SqlWorkspace)
    participant HistStore as 🗃️ QueryHistory (sessionStorage)
    participant Route as ⚙️ ConnectionsRouter (/api/connections/query)
    participant ConnSvc as 🔌 ConnectionService
    participant Validator as 🛡️ validateReadOnlyQuery()
    participant TargetDB as 🗄️ PostgreSQL Client
    participant AGGrid as 📊 AG Grid Community Viewport

    User->>Editor: Enters SQL (e.g. SELECT id, title, credits FROM courses WHERE department_id = 2)
    User->>Editor: Presses Cmd+Enter or clicks Run Query button
    Editor->>HistStore: appendQueryHistory({query, status: 'running', executedAt})
    Editor->>Route: POST /api/connections/query {connectionId, query}

    Route->>ConnSvc: getDatabaseSession(connectionId)
    alt Session Expired / Missing
        ConnSvc-->>Route: returns null
        Route-->>Editor: HTTP 410 (The database session expired. Test connection again.)
        Editor->>HistStore: updateQueryHistory(id, {status: 'failed', error})
        Editor-->>User: Displays session expiration alert
    else Session Active
        ConnSvc->>ConnSvc: Updates session lastUsedAt timestamp
        Route->>Validator: validateReadOnlyQuery(query, engine)
        
        Note over Validator: Lexical & Syntactic Security Validation
        alt Query exceeds 50,000 characters
            Validator-->>Route: throw ReadOnlyQueryValidationError('Enter a query under 50,000 characters.')
            Route-->>Editor: HTTP 400 (Query exceeds maximum allowed length)
            Editor-->>User: Displays character limit error
        else Destructive DDL/DML or Unsafe Function Detected
            Note right of Validator: Checks for: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE<br/>and functions: PG_SLEEP, PG_TERMINATE_BACKEND, DBLINK, etc.
            Validator-->>Route: throw ReadOnlyQueryValidationError('Data-changing queries are not allowed.')
            Route-->>Editor: HTTP 400 (This statement can change database state and is forbidden in read-only queries.)
            Editor->>HistStore: updateQueryHistory(id, {status: 'failed', error})
            Editor-->>User: Displays safety guard alert banner
        else Semicolon Multi-Statement Detected
            Validator-->>Route: throw ReadOnlyQueryValidationError('Run one statement at a time.')
            Route-->>Editor: HTTP 400 (Run one statement at a time.)
            Editor-->>User: Prompts to execute single statement
        else Query Validated Successfully
            Validator-->>Route: Valid read-only query
            Route->>ConnSvc: executeDatabaseQuery(session, query)
            ConnSvc->>TargetDB: Acquires client from pg.Pool
            ConnSvc->>TargetDB: BEGIN READ ONLY
            ConnSvc->>TargetDB: SET statement_timeout = 8000
            ConnSvc->>TargetDB: Executes parameterized read query with LIMIT 1000
            alt Database Syntax or Execution Error
                TargetDB-->>ConnSvc: Error: column 'credits' does not exist (SQLSTATE 42703)
                ConnSvc->>TargetDB: ROLLBACK
                ConnSvc->>TargetDB: Releases client back to pool
                ConnSvc-->>Route: throws formatted database error
                Route-->>Editor: HTTP 422 (Column does not exist in schema)
                Editor->>HistStore: updateQueryHistory(id, {status: 'failed', error})
                Editor-->>User: Highlights SQL syntax error in Monaco
            else Query Success
                TargetDB-->>ConnSvc: Returns result rows & field column metadata
                ConnSvc->>TargetDB: COMMIT
                ConnSvc->>TargetDB: Releases client back to pool
                
                %% Payload size verification
                Note over ConnSvc: Guard: 2 MB Serialized JSON Limit Check
                alt Response exceeds 2 MB limit
                    ConnSvc-->>Route: throw DatabaseQueryResultSizeError()
                    Route-->>Editor: HTTP 413 (Result exceeds 2 MB response limit. Return fewer columns.)
                    Editor-->>User: Prompts to refine query projection
                else Payload within 2 MB
                    ConnSvc-->>Route: returns {columns: ['id', 'title', 'credits'], rows: [...], rowCount: 42, executionTimeMs: 14}
                    Route-->>Editor: HTTP 200 {columns, rows, rowCount, executionTimeMs}
                    Editor->>HistStore: updateQueryHistory(id, {status: 'success', rowCount, durationMs: 14})
                    Editor->>AGGrid: Hydrates rowData and columnDefs
                    AGGrid-->>User: Renders interactive tabular data with sort & copy
                end
            end
        end
    end`,

    plantuml: `@startuml
autonumber
skinparam roundcorner 6
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam backgroundColor #FFFFFF

actor "Analyst / Developer" as User
participant "Monaco Editor\n(SqlWorkspace.tsx)" as Editor
participant "QueryHistory\n(sessionStorage)" as HistStore
participant "ConnectionsRouter\n(/api/connections/query)" as Route
participant "ConnectionService" as ConnSvc
participant "validateReadOnlyQuery()" as Validator
database "Target PostgreSQL\n(pg.Pool)" as TargetDB
participant "AG Grid Community" as AGGrid

User -> Editor : Enters SQL & presses Cmd+Enter
Editor -> HistStore : appendQueryHistory({query, status: 'running'})
Editor -> Route : POST /api/connections/query\n{connectionId, query}

Route -> ConnSvc : getDatabaseSession(connectionId)
alt Session Expired
  ConnSvc --> Route : null
  Route --> Editor : HTTP 410 {error: "Session expired"}
  Editor --> User : Prompts to reconnect
else Session Active
  Route -> Validator : validateReadOnlyQuery(query, engine)
  alt Contains DDL/DML or Unsafe Function (PG_SLEEP, DBLINK)
    Validator --> Route : throw ReadOnlyQueryValidationError()
    Route --> Editor : HTTP 400 {error: "Data-changing SQL forbidden"}
    Editor -> HistStore : updateQueryHistory(id, {status: 'failed'})
    Editor --> User : Shows safety rejection banner
  else Valid Read-Only Statement
    Validator --> Route : OK
    Route -> ConnSvc : executeDatabaseQuery(session, query)
    ConnSvc -> TargetDB : Acquires client from pool
    ConnSvc -> TargetDB : BEGIN READ ONLY;
    ConnSvc -> TargetDB : SET statement_timeout = 8000;
    ConnSvc -> TargetDB : Executes query (max 1,000 rows)
    alt Execution / SQL Syntax Error
      TargetDB --> ConnSvc : Error (e.g. column not found)
      ConnSvc -> TargetDB : ROLLBACK;
      ConnSvc -> TargetDB : Release client
      ConnSvc --> Route : throws database error
      Route --> Editor : HTTP 422 {error: "Column not found"}
      Editor --> User : Highlights Monaco line error
    else Successful Read
      TargetDB --> ConnSvc : Returns raw rows & field descriptors
      ConnSvc -> TargetDB : COMMIT;
      ConnSvc -> TargetDB : Release client
      alt Serialized JSON > 2 MB
        ConnSvc --> Route : throw DatabaseQueryResultSizeError()
        Route --> Editor : HTTP 413 {error: "Payload exceeds 2 MB"}
      else Safe Payload Size
        ConnSvc --> Route : {columns, rows, rowCount, executionTimeMs}
        Route --> Editor : HTTP 200 {columns, rows, rowCount: 42, executionTimeMs: 14}
        Editor -> HistStore : updateQueryHistory(id, {status: 'success'})
        Editor -> AGGrid : Injects colDefs & rowData
        AGGrid --> User : Displays formatted data grid
      end
    end
  end
end
@enduml`,
  },

  '06-sequence-copilot': {
    title: 'Sequence Diagram — Database Copilot 2.0 Autonomous Agent Loop',
    name: 'sequence-copilot',
    mermaid: `sequenceDiagram
    autonumber
    actor User as 👤 Developer
    participant ChatUI as 💬 CopilotChat (React Component)
    participant Route as ⚙️ CopilotRouter (/api/copilot/chat)
    participant ConvStore as 💾 ConversationStore (copilot-conversations.json)
    participant AgentEng as 🧠 AgentEngine (runCopilotAgent)
    participant IntelStore as 📦 IntelligenceStore (intelligence-cache.json)
    participant AiProv as 🌐 AiProvider Gateway
    participant Gemini as ☁️ Google Gemini 3.8 Flash API
    participant Tools as 🛠️ AgentTools (14 Specialized Tools)
    participant TargetDB as 🗄️ PostgreSQL Database

    User->>ChatUI: Submits question: "Why is query on enrollments slow?"
    ChatUI->>ChatUI: Creates AbortController() instance
    ChatUI->>Route: POST /api/copilot/chat {connectionId, conversationId, messages}

    Route->>ConvStore: addMessageToConversation(conversationId, userMessage)
    Route->>AgentEng: runCopilotAgent(session, userMessage, history, options)

    %% Intent Classification
    Note over AgentEng,IntelStore: Stage 1: Context & Intent Classification
    AgentEng->>IntelStore: getIntelligence(connectionId)
    IntelStore-->>AgentEng: Returns cached schema snapshot & health findings
    AgentEng->>AgentEng: classifyUserIntent(userMessage, knownTables, history)

    alt Branch A: Greeting / Acknowledgement (Fast Path)
        AgentEng->>AgentEng: generateLocalResponse(userMessage, intent)
        Note right of AgentEng: Instant local reply without API call<br/>Telemetry: source="deterministic_local"
        AgentEng-->>Route: returns CopilotChatMessage (latency < 2ms)
    else Branch B: General Conversational / Programming Question
        Note right of AgentEng: Lightweight single-turn call<br/>Telemetry: source="conversational_fast_path"
        AgentEng->>AiProv: getGeminiClient().models.generateContent(promptWithoutTools)
        AiProv->>Gemini: POST /v1beta/models/gemini-3.8-flash:generateContent
        Gemini-->>AiProv: Returns conversational markdown text
        AiProv-->>AgentEng: Text response
        AgentEng-->>Route: returns CopilotChatMessage
    else Branch C: Autonomous Database Specialist Investigation (Loop)
        Note over AgentEng,Gemini: Stage 2: Multi-Turn Function Calling Loop (Max 8 Iterations)
        AgentEng->>AgentEng: Assembles system prompt with DB schema context & 14 Tool Definitions
        AgentEng->>AiProv: Call Gemini with tools: [inspect_table_indexes, explain_sql_query, ...]
        AiProv->>Gemini: POST /v1beta/models/gemini-3.8-flash:generateContent {contents, tools}
        Gemini-->>AiProv: Model response: tool_calls: [inspect_table_indexes({tableName: "enrollments"})]
        AiProv-->>AgentEng: Returns tool call directive

        %% Turn 1 Tool Execution
        AgentEng->>Tools: AGENT_TOOLS["inspect_table_indexes"].handler(session, {tableName: "enrollments"})
        Tools->>TargetDB: SELECT * FROM pg_indexes WHERE tablename = 'enrollments';
        TargetDB-->>Tools: Returns primary key index only (Missing index on foreign key student_id)
        Tools-->>AgentEng: Tool result: {indexes: ["enrollments_pkey"], missingForeignKeys: ["student_id"]}
        
        %% Turn 2 Reflection & EXPLAIN
        AgentEng->>AiProv: Submits tool result back to Gemini
        AiProv->>Gemini: POST /v1beta/models/gemini-3.8-flash:generateContent {role: 'tool', content: ...}
        Gemini-->>AiProv: Model response: tool_calls: [explain_sql_query({query: "SELECT * FROM enrollments..."})]
        AiProv-->>AgentEng: Returns second tool call directive

        AgentEng->>Tools: AGENT_TOOLS["explain_sql_query"].handler(session, args)
        Tools->>TargetDB: EXPLAIN (ANALYZE, FORMAT JSON) SELECT * FROM enrollments WHERE student_id = 101;
        TargetDB-->>Tools: Execution plan with Seq Scan on enrollments (cost=0.00..38.25)
        Tools-->>AgentEng: Tool result: {scanType: "Seq Scan", cost: 38.25, recommendation: "CREATE INDEX..."}

        %% Turn 3 Final Synthesis
        AgentEng->>AiProv: Submits plan result back to Gemini
        AiProv->>Gemini: POST /v1beta/models/gemini-3.8-flash:generateContent (synthesize diagnosis)
        Gemini-->>AiProv: Returns final analysis text with root cause, risk rating & SQL fix
        AiProv-->>AgentEng: Final synthesis text
        
        Note over AgentEng: Stage 3: Message Construction & Telemetry
        AgentEng->>AgentEng: Constructs CopilotChatMessage with:
        Note right of AgentEng: • Tool activities timeline<br/>• Suggested action: preview_plan ("CREATE INDEX...")<br/>• Stage timings & API request telemetry
        AgentEng-->>Route: returns CopilotChatMessage
    end

    Route->>ConvStore: addMessageToConversation(conversationId, assistantResponse)
    Route-->>ChatUI: HTTP 200 CopilotChatMessage JSON
    ChatUI->>ChatUI: Renders markdown message & tool execution badges
    ChatUI-->>User: Displays diagnostic explanation & "Review Migration Plan" button`,

    plantuml: `@startuml
autonumber
skinparam roundcorner 6
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam backgroundColor #FFFFFF

actor "Developer" as User
participant "CopilotChat\n(React UI)" as ChatUI
participant "CopilotRouter\n(/api/copilot/chat)" as Route
participant "ConversationStore" as ConvStore
participant "AgentEngine\n(runCopilotAgent)" as AgentEng
participant "IntelligenceStore" as IntelStore
participant "AiProvider Gateway" as AiProv
cloud "Google Gemini\n3.8 Flash API" as Gemini
participant "AgentTools\n(14 DB Tools)" as Tools
database "PostgreSQL Server" as TargetDB

User -> ChatUI : Sends: "Why is query on enrollments slow?"
ChatUI -> Route : POST /api/copilot/chat\n{connectionId, conversationId, messages}
Route -> ConvStore : addMessageToConversation(userMessage)
Route -> AgentEng : runCopilotAgent(...)

== Stage 1: Intent & Context Retrieval ==
AgentEng -> IntelStore : getIntelligence(connectionId)
IntelStore --> AgentEng : Returns cached schema & health data
AgentEng -> AgentEng : classifyUserIntent(prompt)

alt Intent: Greeting / Gratitude (Fast Path)
  AgentEng -> AgentEng : generateLocalResponse()
  AgentEng --> Route : Instant local response (<2ms)
else Intent: General Conversation (Single Turn)
  AgentEng -> AiProv : Generate content without tools
  AiProv -> Gemini : POST :generateContent
  Gemini --> AiProv : Conversational markdown text
  AiProv --> AgentEng : Text response
  AgentEng --> Route : CopilotChatMessage
else Intent: Database Investigation (Autonomous Tool Loop)
  == Stage 2: Iterative Autonomous Tool Execution ==
  AgentEng -> AiProv : Request Gemini with 14 tool declarations
  AiProv -> Gemini : POST :generateContent {contents, tools}
  Gemini --> AiProv : tool_call: inspect_table_indexes({tableName: "enrollments"})
  AiProv --> AgentEng : Dispatch tool call

  AgentEng -> Tools : inspect_table_indexes(session, args)
  Tools -> TargetDB : SELECT * FROM pg_indexes WHERE tablename='enrollments'
  TargetDB --> Tools : Only enrollments_pkey found (Missing FK index on student_id)
  Tools --> AgentEng : Result: {missingForeignKeys: ["student_id"]}

  AgentEng -> AiProv : Send tool result back to Gemini
  AiProv -> Gemini : POST :generateContent (with tool result)
  Gemini --> AiProv : tool_call: explain_sql_query({query: "..."})
  AiProv --> AgentEng : Dispatch second tool call

  AgentEng -> Tools : explain_sql_query(session, args)
  Tools -> TargetDB : EXPLAIN (ANALYZE, FORMAT JSON) SELECT ...
  TargetDB --> Tools : Execution plan showing Sequential Scan
  Tools --> AgentEng : Result: {scanType: "Seq Scan", cost: 38.25}

  AgentEng -> AiProv : Send plan result back to Gemini
  AiProv -> Gemini : Final synthesis request
  Gemini --> AiProv : Markdown text with diagnosis & "CREATE INDEX idx_enrollments_student..."
  AiProv --> AgentEng : Final synthesis text

  == Stage 3: Packaging & Telemetry ==
  AgentEng -> AgentEng : Constructs CopilotChatMessage with toolCalls & suggestedActions
  AgentEng --> Route : CopilotChatMessage
end

Route -> ConvStore : addMessageToConversation(assistantResponse)
Route --> ChatUI : HTTP 200 CopilotChatMessage
ChatUI --> User : Displays diagnostic findings & "Review Index Plan" action button
@enduml`,
  },

  '07-activity': {
    title: 'Activity Diagram — End-to-End Database Management Workflow',
    name: 'activity',
    mermaid: `flowchart TD
    Start([● Start Workflow]) --> EnterCreds[Enter Database Host, Port, Credentials & SSL]
    EnterCreds --> ValidateHost{Validate Host\n& Security Target}

    ValidateHost -->|Forbidden Target / SSRF| RejectHost[Display Host Validation Error Alert]
    RejectHost --> EnterCreds

    ValidateHost -->|Valid Host| TestConn[Perform Ephemeral Handshake & Ping Database]
    TestConn --> TestSuccess{Connection\nSucceeded?}

    TestSuccess -->|No| ShowConnErr[Display Connection Error & Suggest Port/Host Check]
    ShowConnErr --> EnterCreds

    TestSuccess -->|Yes| OpenSession[Open In-Memory Database Session\nGenerate 64-char Connection ID]
    
    %% Concurrency Fork
    OpenSession --> ForkState1[=== Fork Background & Foreground Processes ===]
    
    %% Background Branch
    ForkState1 --> ScheduleBg[Trigger IntelligenceOrchestrator in Background]
    ScheduleBg --> ComputeFingerprint[Compute Schema Fingerprint MD5]
    ScheduleBg --> RunHealthAudit[Analyze Missing Indexes, FKs & Normalization]
    ComputeFingerprint --> CacheIntel[Persist Snapshot in intelligence-cache.json]
    RunHealthAudit --> CacheIntel

    %% Foreground Branch
    ForkState1 --> IntrospectCatalog[Introspect Information Schema & System Catalogs]
    IntrospectCatalog --> RenderCanvas[Render Interactive React Flow Schema Canvas]

    %% Main Workspace Action Decision
    RenderCanvas --> UserChoice{Select Workspace\nActivity}

    %% Branch 1: Data Explorer
    UserChoice -->|Data Explorer| SelectTable[Select Table from Catalog Tree]
    SelectTable --> LoadPage[Fetch Server-Side Paged Records & Column Metas]
    LoadPage --> RenderGrid[Render Interactive AG Grid Viewport]
    RenderGrid --> RecordAction{Record\nMutation?}
    RecordAction -->|Browse / Sort / Search| RenderGrid
    RecordAction -->|Export CSV| DownloadCsv[Generate & Download Client CSV File]
    RecordAction -->|Insert / Edit / Delete| PrepMutation[Formulate Staged Row Mutation Payload]
    PrepMutation --> TwoPhasePreview[Execute API Preview & Acquire One-Time Plan ID]
    TwoPhasePreview --> UserConfirmRow{User Confirms\nRow Action?}
    UserConfirmRow -->|Cancel| RenderGrid
    UserConfirmRow -->|Confirm| ExecMutation[Execute Staged Mutation Plan]
    ExecMutation --> InvalidateCache1[Notify Data Changed & Invalidate Cache]
    InvalidateCache1 --> LoadPage

    %% Branch 2: SQL Workspace
    UserChoice -->|SQL Workspace| EnterSql[Write SQL Query in Monaco Editor]
    EnterSql --> ValidateSql{Validate\nRead-Only AST}
    ValidateSql -->|Contains DDL/DML/Unsafe Func| RejectSql[Display Safety Violation Error Banner]
    RejectSql --> EnterSql
    ValidateSql -->|Valid Read-Only| ExecSql[Execute inside READ ONLY Transaction with 8s Timeout]
    ExecSql --> CheckSize{Payload\n< 2 MB?}
    CheckSize -->|No| TruncateErr[Display 413 Payload Too Large Error]
    TruncateErr --> EnterSql
    CheckSize -->|Yes| ShowResults[Render Query Results Table in AG Grid]
    ShowResults --> RecordHistory[Append Entry to Tab sessionStorage History]
    RecordHistory --> UserChoice

    %% Branch 3: Guided Schema Designer DDL
    UserChoice -->|Schema Designer DDL| DesignDdl[Configure New Table / Column / Foreign Key]
    DesignDdl --> DdlDryRun[Execute Dry-Run in Rollback Transaction]
    DdlDryRun --> DdlValid{DDL Valid\non Engine?}
    DdlValid -->|No| FixDdl[Show Engine Rejection Error & Highlight Fields]
    FixDdl --> DesignDdl
    DdlValid -->|Yes| ShowSqlReview[Display Formatted SQL Preview Dialog with Plan ID]
    ShowSqlReview --> ConfirmDdl{User Confirms\nExecution?}
    ConfirmDdl -->|Cancel / Dismiss| RenderCanvas
    ConfirmDdl -->|Confirm| ExecDdl[Execute Staged DDL Plan on Target Database]
    ExecDdl --> InvalidateCache2[Invalidate Intelligence Cache & Trigger Re-introspection]
    InvalidateCache2 --> IntrospectCatalog

    %% Branch 4: Copilot 2.0 Investigation
    UserChoice -->|DBFlow Copilot 2.0| AskCopilot[Submit Natural Language Database Prompt]
    AskCopilot --> ClassifyIntent{Classify\nPrompt Intent}
    ClassifyIntent -->|Greeting / Thanks| QuickReply[Return Fast Local Persona Response]
    ClassifyIntent -->|General Tech Chat| DirectGemini[Query Gemini Direct without Database Tools]
    ClassifyIntent -->|Database Specialist| AgentLoop[Run Multi-Turn Autonomous Tool Loop with 14 Tools]
    AgentLoop --> ReviewFindings[Display Root Causes, Health Grade & SQL Recommendations]
    QuickReply --> UserActionAi{Action\nRequested?}
    DirectGemini --> UserActionAi
    ReviewFindings --> UserActionAi
    UserActionAi -->|Apply SQL Fix| EnterSql
    UserActionAi -->|Continue Chat| AskCopilot
    UserActionAi -->|Switch View| UserChoice

    %% Disconnection & Cleanup
    UserChoice -->|Disconnect| Disconnect[Click Disconnect Database]
    Disconnect --> CancelJobs[Cancel Running Background Jobs]
    CancelJobs --> ClosePool[Close pg.Pool / mysql2.Pool Connection Sockets]
    ClosePool --> ClearSession[Evict In-Memory Session Token]
    ClearSession --> End([◉ End Session])

    classDef action fill:#eff6ff,stroke:#2563eb,stroke-width:1.5px,color:#1e3a8a;
    classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f;
    classDef terminal fill:#f8fafc,stroke:#475569,stroke-width:2px,color:#0f172a;
    classDef bg fill:#f0fdf4,stroke:#16a34a,stroke-width:1px,color:#14532d;
    class EnterCreds,TestConn,OpenSession,IntrospectCatalog,RenderCanvas,SelectTable,LoadPage,RenderGrid,PrepMutation,TwoPhasePreview,ExecMutation,EnterSql,ExecSql,ShowResults,RecordHistory,DesignDdl,DdlDryRun,ShowSqlReview,ExecDdl,AskCopilot,QuickReply,DirectGemini,AgentLoop,ReviewFindings,Disconnect,CancelJobs,ClosePool,ClearSession action;
    class ValidateHost,TestSuccess,UserChoice,RecordAction,UserConfirmRow,ValidateSql,CheckSize,DdlValid,ConfirmDdl,ClassifyIntent,UserActionAi decision;
    class Start,End,ForkState1 terminal;
    class ScheduleBg,ComputeFingerprint,RunHealthAudit,CacheIntel,InvalidateCache1,InvalidateCache2 bg;`,

    plantuml: `@startuml
skinparam roundcorner 8
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam backgroundColor #FFFFFF

start
:Enter Database Host, Port, Credentials & SSL;

if (Validate Host & Network Target?) then (forbidden SSRF target)
  :Display Security Host Error;
  stop
else (valid target)
  :Perform Connection Handshake & Ping DB;
  if (Handshake Succeeded?) then (no)
    :Display Connection Error;
    stop
  else (yes)
    :Open In-Memory Database Session\n(Generate 64-char connectionId);
    
    fork
      :Trigger Background IntelligenceOrchestrator;
      :Compute MD5 Schema Fingerprint;
      :Analyze Missing Indexes, FKs & Health;
      :Cache Snapshot in intelligence-cache.json;
    fork again
      :Introspect System Catalogs & Tables;
      :Render Interactive Schema Canvas;
    end fork

    repeat
      switch (Select Workspace Activity?)
      case ( Data Explorer )
        :Select Table from Catalog;
        :Fetch Paged Records & Column Metadatas;
        :Render AG Grid Community Viewport;
        if (Perform Row Mutation?) then (yes)
          :Preview Two-Phase Plan;
          if (User Confirms Plan?) then (yes)
            :Execute Staged Row Mutation;
            :Invalidate Cache & Refresh Records;
          endif
        endif

      case ( SQL Workspace )
        :Write SQL in Monaco Editor;
        if (Validate Read-Only AST?) then (valid read-only)
          :Execute in READ ONLY Txn (8s timeout);
          if (Payload < 2 MB?) then (yes)
            :Display Results in AG Grid;
            :Save to sessionStorage History;
          else (no)
            :Show 413 Payload Limit Error;
          endif
        else (destructive or unsafe)
          :Show Safety Violation Error Banner;
        endif

      case ( Schema Designer DDL )
        :Design Table / Column / Foreign Key;
        :Execute Dry-Run Transaction Rollback;
        if (DDL Valid?) then (yes)
          :Show Generated SQL Confirmation Dialog;
          if (User Confirms DDL?) then (yes)
            :Execute Staged DDL Plan;
            :Invalidate Cache & Re-introspect;
          endif
        else (no)
          :Display Engine Rejection Error;
        endif

      case ( DBFlow Copilot 2.0 )
        :Submit Natural Language Prompt;
        if (Classify Intent) then (greeting/ack)
          :Return Instant Local Response (<2ms);
        elseif (general programming) then (casual chat)
          :Direct Gemini Call without Tools;
        else (database investigation)
          :Run Multi-Turn Autonomous Tool Loop (14 tools);
          :Display Root Causes, Health Grade & SQL Recommendations;
        endif
      endswitch
    repeat while (Continue Using Session?) is (yes)

    :Click Disconnect Database;
    :Cancel Active Background Jobs;
    :Close pg.Pool / mysql2.Pool Sockets;
    :Evict In-Memory Session Token;
    stop
  endif
endif
@enduml`,
  },

  '08-deployment': {
    title: 'Deployment Diagram — Physical & Containerized Runtime Topology',
    name: 'deployment',
    mermaid: `flowchart TB
    %% Client Device
    subgraph ClientDevice["💻 Developer Workstation / Client Device"]
        subgraph BrowserEnvironment["🌐 Modern Web Browser (Chrome, Firefox, Safari)"]
            subgraph WebAppInstance["DBFlow Web Application (apps/web)"]
                ReactBundle["⚛️ React 18 SPA Bundle<br/>(Vite Production Build)"]
                MonacoBundle["📝 Monaco Editor Worker Instance"]
                AGGridBundle["📊 AG Grid Community Data Engine"]
                ReactFlowBundle["🎨 React Flow Interactive Canvas"]
            end
            SessionStorage["💾 Browser sessionStorage<br/>(Tab-scoped Query History & UI State)"]
            ReactBundle --> SessionStorage
        end
    end

    %% Application Server Host
    subgraph AppServerHost["🖥️ Application Server Host (Local Developer Machine / Node Host)"]
        subgraph NodeRuntime["⚙️ Node.js v24.x Runtime Environment"]
            subgraph ApiProcess["DBFlow Express API Service (apps/api - PID: Process)"]
                ExpressApp["🌐 Express HTTP Engine<br/>(Bound to Loopback 127.0.0.1:4000)"]
                
                subgraph MemoryState["In-Memory Ephemeral State"]
                    SessionPool["🔐 Active Database Sessions Map<br/>(Max 5 concurrent, 15-min idle expiry)"]
                    DdlPlanCache["📝 Staged Two-Phase Plans Map<br/>(5-min expiry per DDL/DML token)"]
                    JobQueue["🔄 Background Job Execution Queue<br/>(Debounced Intelligence Workers)"]
                end

                subgraph EmbeddedEngines["Domain Services"]
                    AgentRunner["🧠 Copilot 2.0 Agent Engine<br/>(Iterative Tool Loop Coordinator)"]
                    HealthScorer["🩺 Database Health Analyzer Engine"]
                    SqlSafetyScanner["🛡️ Read-Only SQL AST Scanner"]
                end

                subgraph ClientDrivers["Database Client Drivers"]
                    PgDriver["🐘 node-postgres Driver (pg.Pool)"]
                    MysqlDriver["🐬 mysql2/promise Driver Pool"]
                end

                ExpressApp --> MemoryState
                ExpressApp --> EmbeddedEngines
                EmbeddedEngines --> ClientDrivers
            end

            subgraph LocalDiskStorage["📁 Persistent Local Storage (/apps/api/data)"]
                IntelCacheFile["📄 intelligence-cache.json<br/>(Health scores, index stats, schema hashes)"]
                ConvStoreFile["📄 copilot-conversations.json<br/>(Session consultation histories)"]
            end

            ApiProcess --> LocalDiskStorage
        end
    end

    %% Database Target Tier
    subgraph DatabaseTier["🗄️ Database Server Infrastructure (Local or Containerized)"]
        subgraph PostgresHost["PostgreSQL Server Container / Instance"]
            PgService["🐘 PostgreSQL DBMS Engine (v14 - v18.6)<br/>Port: 5432 (TCP)"]
            PgCatalogs["📚 System Catalogs<br/>(information_schema, pg_catalog, pg_stat)"]
            PgUserDatabases["🗃️ User Databases<br/>(e.g., dbflow_demo, commerce_demo)"]
            PgService --> PgCatalogs
            PgService --> PgUserDatabases
        end

        subgraph MysqlHost["MySQL Server Container / Instance"]
            MysqlService["🐬 MySQL Community Server (v8.0+)<br/>Port: 3306 (TCP)"]
            MysqlCatalogs["📚 System Schemas (information_schema)"]
            MysqlUserDatabases["🗃️ User Databases"]
            MysqlService --> MysqlCatalogs
            MysqlService --> MysqlUserDatabases
        end
    end

    %% External Cloud AI Tier
    subgraph CloudAiTier["☁️ External Cloud AI Services"]
        subgraph GoogleCloud["Google Cloud Platform Infrastructure"]
            GeminiEndpoint["🤖 Google Gemini API Endpoint<br/>(generativelanguage.googleapis.com)"]
            GeminiModels["🧠 Gemini 3.8 Flash / 2.5 Flash Lite<br/>(High-speed multimodal & reasoning models)"]
            GeminiEndpoint --> GeminiModels
        end
    end

    %% Network Interconnections
    ReactBundle -->|"HTTP / REST (JSON) over Port 4000<br/>CORS: http://localhost:5173"| ExpressApp
    PgDriver -->|"TCP / Native Wire Protocol over Port 5432<br/>(Optional TLS / SSL encryption)"| PgService
    MysqlDriver -->|"TCP / Native MySQL Protocol over Port 3306<br/>(Optional TLS / SSL encryption)"| MysqlService
    AgentRunner -->|"HTTPS / REST over Port 443<br/>TLS 1.3 / GEMINI_API_KEY Bearer Auth"| GeminiEndpoint

    classDef client fill:#eff6ff,stroke:#2563eb,stroke-width:1.5px,color:#1e3a8a;
    classDef server fill:#f5f3ff,stroke:#6366f1,stroke-width:1.5px,color:#312e81;
    classDef db fill:#ecfdf5,stroke:#059669,stroke-width:1.5px,color:#064e3b;
    classDef cloud fill:#fff1f2,stroke:#e11d48,stroke-width:1.5px,color:#881337;
    class ClientDevice,BrowserEnvironment,WebAppInstance,ReactBundle,MonacoBundle,AGGridBundle,ReactFlowBundle client;
    class AppServerHost,NodeRuntime,ApiProcess,ExpressApp,MemoryState,EmbeddedEngines,ClientDrivers server;
    class DatabaseTier,PostgresHost,MysqlHost,PgService,MysqlService db;
    class CloudAiTier,GoogleCloud,GeminiEndpoint,GeminiModels cloud;`,

    plantuml: `@startuml
skinparam roundcorner 8
skinparam shadowing false
skinparam defaultFontName Arial
skinparam defaultFontSize 11
skinparam backgroundColor #FFFFFF

node "Developer Workstation" as ClientNode <<device>> #EBF8FF {
  node "Modern Web Browser" as Browser <<execution environment>> {
    artifact "DBFlow React 18 SPA\n(Vite Build)" as WebApp
    artifact "Monaco Editor Worker" as MonacoWorker
    artifact "AG Grid Community Engine" as AGGrid
    database "Browser sessionStorage\n(Tab Query History)" as BrowserStorage
    WebApp --> BrowserStorage
  }
}

node "Application Server Host" as HostNode <<device>> #F3E8FF {
  node "Node.js v24.x Runtime" as NodeEnv <<execution environment>> {
    component "DBFlow API Service\n(Express on 127.0.0.1:4000)" as ApiServer {
      port "HTTP :4000" as HttpPort
      component "Session & Pool Manager\n(15-min idle TTL)" as SessionMgr
      component "Copilot 2.0 Agent Engine" as AgentEngine
      component "Health & SQL Intelligence" as IntelEngine
      component "pg.Pool / mysql2.Pool" as Drivers
    }
    file "Local Storage\n(/apps/api/data/)" as DiskStorage {
      file "intelligence-cache.json" as IntelCache
      file "copilot-conversations.json" as ConvStore
    }
    ApiServer --> DiskStorage
  }
}

node "Database Server Infrastructure" as DbNode <<device>> #C6F6D5 {
  node "PostgreSQL Instance" as PgHost <<execution environment>> {
    database "PostgreSQL 16+ Engine\n(Port 5432)" as PgEngine
    database "System Catalogs\n(information_schema, pg_catalog)" as PgCatalogs
    database "User Schemas\n(dbflow_demo)" as PgUserDb
    PgEngine --> PgCatalogs
    PgEngine --> PgUserDb
  }

  node "MySQL Instance" as MysqlHost <<execution environment>> {
    database "MySQL 8.0+ Engine\n(Port 3306)" as MysqlEngine
  }
}

cloud "Google Cloud Platform" as CloudGCP #FED7D7 {
  node "Gemini AI API Gateway" as GeminiGateway <<cloud service>> {
    component "generativelanguage.googleapis.com\n(Port 443 HTTPS)" as GeminiAPI
    component "Gemini 3.8 Flash / 2.5 Flash Lite" as GeminiModels
    GeminiAPI --> GeminiModels
  }
}

WebApp ==( HTTP / REST (JSON) : HttpPort
Drivers ==( TCP / Socket :5432 : PgEngine
Drivers ==( TCP / Socket :3306 : MysqlEngine
AgentEngine ==( HTTPS / REST :443 : GeminiAPI

note right of HostNode
  **Security Boundary:**
  • Loopback binding (127.0.0.1 only) prevents unauthorized LAN exposure.
  • Database passwords remain strictly in memory pools (never stored on disk).
  • DatabaseHostValidator blocks SSRF targets and cloud metadata addresses.
end note
@enduml`,
  },
};

// Generate documentation README for each subfolder
const EXPLANATIONS = {
  '01-use-case': `# Use Case Diagram — DBFlow Platform

## 1. Overview
The **Use Case Diagram** captures the functional capabilities of the DBFlow Intelligent Database Platform from the perspectives of its human actors and external systems. It models how database developers, data analysts, and database administrators interact with the unified workspace, and how autonomous agents and background intelligence engines collaborate with target databases and external AI providers.

## 2. Actors
- **Database Developer / Engineer**: Performs schema design, writes and tests queries in the SQL workspace, explores relationships on the visual canvas, and uses natural-language query generation.
- **Data Analyst**: Explores tabular datasets using server-side pagination, filters and sorts records, exports CSV reports, and investigates workload metrics.
- **Database Administrator (DBA)**: Audits overall database health, evaluates missing indexes and sequential scan bottlenecks, inspects EXPLAIN plans, and manages controlled table drops and cascade dependencies.
- **Google Gemini AI Gateway (External System)**: External generative AI model (\`gemini-3.8-flash\`, \`gemini-2.5-flash-lite\`) providing autonomous reasoning, NL-to-SQL generation, and function-calling capabilities.
- **Target Database Engine (PostgreSQL / MySQL)**: The underlying database instance managing physical storage, executing read transactions, validating catalog schemas, and applying confirmed DDL/DML migrations.

## 3. Key Use Cases & Subsystems
- **Session & Connection Management**: Includes host security validation (SSRF and metadata link-local protection) and extends to automatic 15-minute idle session termination.
- **Schema Visualization & Guided DDL**: Includes interactive entity-relationship diagram rendering, color-coded table grouping, and two-phase schema migrations (preview rollback transaction, user confirmation, and stored plan execution).
- **Data Explorer**: Provides bounded server-side paging (max 100 rows, 2MB limit), full-table text search, optimistic locking for row updates, and two-phase row insertion/deletion.
- **SQL Workspace & Query Builder**: Enforces a strict read-only AST safety barrier (disallowing data-changing SQL and unsafe functions like \`PG_SLEEP\`), applies an 8-second execution timeout, and stores per-tab query execution histories.
- **DBFlow Copilot 2.0 & Continuous Intelligence**: Includes multi-intent routing (deterministic fast path, conversational path, and autonomous tool loop with 14 tools), health score grading ($A \\to F$), and automatic cache invalidation upon DDL/DML mutations.

## 4. Verification & Source Mapping
- Mapped directly to route definitions in \`apps/api/src/routes/connections.ts\` and \`apps/api/src/routes/copilotRoutes.ts\`.
- Validated against frontend user interfaces in \`apps/web/src/app/App.tsx\`, \`DataExplorerView.tsx\`, \`DatabaseCopilot.tsx\`, and \`VisualQueryBuilder.tsx\`.
`,

  '02-component': `# Component Diagram — System Architecture

## 1. Overview
The **Component Diagram** represents the physical and logical software modularity of DBFlow. It illustrates the high cohesion and loose coupling between the React/Vite web application (\`apps/web\`), the shared contract library (\`packages/shared\`), and the Express/Node.js backend service (\`apps/api\`), along with external database drivers and cloud AI integrations.

## 2. Subsystems & Component Structure
- **Frontend Client (\`apps/web\`)**:
  - \`App Shell & Router\`: Orchestrates tab routing, global state, and modal dialogues.
  - \`Schema Designer\`: Interactive canvas using React Flow, custom \`TableNode\` and \`FloatingEdge\` components, and hierarchical layout calculation.
  - \`Data Explorer\`: High-performance data table powered by AG Grid Community, featuring table catalog tree navigation, Structure drawer, Record Inspect modal, and mutation dialogues.
  - \`SQL Workspace\`: Monaco Editor integration with syntax validation, formatting utilities, and sessionStorage-based query history.
  - \`Visual Query Builder\`: Graphical block builder translating table relationships and filters into live SQL.
  - \`Copilot 2.0 Interface\`: Hybrid conversational chat, health dashboard, tool execution drawer, and actionable recommendation cards.
  - \`Web API Client\`: Centralized REST communication layer with structured error handling.
- **Shared Contracts (\`packages/shared\`)**:
  - Source of truth for TypeScript interfaces, eliminating drift between client and server across connection inputs, schema structures, Copilot messages, telemetry timings, and health scores.
- **Backend API (\`apps/api\`)**:
  - \`Express HTTP Engine\`: Listens exclusively on loopback (\`127.0.0.1:4000\`) for security.
  - \`Security & Validation Middleware\`: Strict Zod schema enforcement, CORS origin filtering, and \`DatabaseHostValidator\` (preventing SSRF).
  - \`Connection & Session Pool Service\`: In-memory session maps for \`pg.Pool\` and \`mysql2.Pool\` with 15-minute idle eviction and 5-session concurrency ceilings.
  - \`Schema & Record Services\`: Introspection queries against \`information_schema\` and \`pg_catalog\`, staging two-phase DDL and DML plans in memory.
  - \`Copilot Agent Engine\`: Coordinates intent classification, multi-turn tool execution across 14 database tools, and interaction with the \`AiProvider\` gateway.
  - \`Intelligence Orchestrator\`: Background job runner performing periodic schema fingerprinting (MD5) and caching health findings to disk.

## 3. Communication Interfaces & Protocols
- Client $\\leftrightarrow$ Server: HTTP/1.1 REST with JSON payloads over loopback \`localhost:4000\`.
- API $\\leftrightarrow$ PostgreSQL: Native PostgreSQL wire protocol via \`pg.Pool\` (TCP :5432).
- API $\\leftrightarrow$ MySQL: Native MySQL binary protocol via \`mysql2/promise\` (TCP :3306).
- API $\\leftrightarrow$ Gemini: HTTPS/TLS 1.3 REST calls to Google Gemini API (\`generativelanguage.googleapis.com\`).
`,

  '03-class': `# Class Diagram — Core Domain Entities, Services & Error Hierarchy

## 1. Overview
The **Class Diagram** models the fundamental TypeScript types, interfaces, service classes, and specialized exception hierarchies that power the DBFlow backend. It reflects the strict typing across database sessions, schema metadata, health reports, agent tools, and two-phase mutation plans.

## 2. Key Domain Class Groups
- **Connection & Session Models**:
  - \`ConnectionInput\`: Plain credential transfer object validated by Zod.
  - \`DatabaseSession\`: Discriminated union between \`PostgresSession\` (holding a \`pg.Pool\`) and \`MysqlSession\` (holding a \`mysql2.Pool\`), tracking \`database\`, \`connectionId\`, and \`lastUsedAt\` timestamps.
- **Schema & DDL Models**:
  - \`PostgresSchemaTable\`: Represents an introspected base table with schema name, columns, composite primary/unique key groups, and foreign key relationships.
  - \`SchemaColumn\`: Encapsulates physical column attributes including type, nullability, default values, identities, and key constraints.
  - \`CreateTableDraft\` & \`CreateTablePlan\`: Captures structured DDL drafts and their resulting 5-minute staged execution plans.
- **Health & Copilot Models**:
  - \`DatabaseHealthReport\`: Contains analyzed timestamps, summary counts, grade breakdown, and a collection of \`HealthFinding\` objects.
  - \`HealthFinding\`: Detailed diagnostic item containing problem statement, technical explanation, empirical evidence, recommended solution, suggested SQL, and confidence levels.
  - \`CopilotChatMessage\`: Rich multi-turn message format containing role, content, tool call executions, telemetry timings, and actionable suggestion pills.
  - \`ToolDefinition\`: Schema and asynchronous handler definition for the 14 agent tools.
- **Error Specialization Hierarchy**:
  - Derives from standard JavaScript \`Error\`.
  - Includes \`PostgresSessionLimitError\`, \`PostgresTableNotFoundError\`, \`PostgresResultSizeError\`, \`RecordSortColumnError\`, \`ReadOnlyQueryValidationError\`, \`DatabaseQueryResultSizeError\`, \`DatabaseHostValidationError\`, \`SchemaOperationError\` (with HTTP status), \`RecordUpdateError\`, and \`RecordMutationError\`.
`,

  '04-sequence-database-connection': `# Sequence Diagram — Database Connection & Schema Introspection

## 1. Overview
This sequence diagram illustrates the three-phase lifecycle when a user connects a PostgreSQL or MySQL database in DBFlow:
1. **Phase 1: Credential Verification (\`POST /api/connections/test\`)** — Ephemeral validation without creating a permanent session.
2. **Phase 2: Session Establishment (\`POST /api/connections/open\`)** — Connection pool initialization, security token issuance, and background intelligence scheduling.
3. **Phase 3: Schema Introspection (\`POST /api/connections/introspect\`)** — Deep catalog discovery and conversion to interactive React Flow diagram models.

## 2. Key Interactions & Safety Boundaries
- **SSRF Prevention**: Before opening any network socket, \`DatabaseHostValidator\` resolves hostnames and blocks private link-local targets (e.g., AWS/GCP metadata IP \`169.254.169.254\`) or invalid hosts.
- **Ephemeral Session Pool**: The API stores no credentials on disk or in the browser; passwords exist only in Node.js heap memory within \`pg.Pool\` / \`mysql2.Pool\` instances.
- **Concurrency & Expiration Limits**: A strict limit of 5 concurrent sessions per engine is enforced (\`PostgresSessionLimitError\`), and sessions expire automatically after 15 minutes of inactivity.
- **Catalog Assembly**: The introspection query queries \`information_schema.columns\`, \`pg_catalog.pg_constraint\`, and \`referential_constraints\`, which \`assemblePostgresSchema()\` transforms into structured schema tables.
`,

  '05-sequence-sql-execution': `# Sequence Diagram — Safe Read-Only SQL Execution

## 1. Overview
This sequence diagram depicts how user-authored SQL travels from the Monaco Editor through security parsing, transaction wrapping, engine execution, response size enforcement, and AG Grid rendering.

## 2. Safety Controls & Execution Flow
- **Monaco Editor & Query History**: Every query trigger is immediately logged to browser \`sessionStorage\` query history with a running timestamp.
- **Lexical & Syntactic Security Validation**: \`validateReadOnlyQuery()\` performs multi-stage checks:
  1. Payload length cutoff (maximum 50,000 characters).
  2. Single-statement enforcement (rejecting multi-statement attacks separated by semicolons).
  3. Data-changing keyword rejection (\`INSERT\`, \`UPDATE\`, \`DELETE\`, \`DROP\`, \`ALTER\`, \`TRUNCATE\`).
  4. Malicious function rejection (\`PG_SLEEP\`, \`PG_TERMINATE_BACKEND\`, \`LO_EXPORT\`, \`DBLINK\`).
  5. Only allows \`SELECT\` or read-only \`WITH ... SELECT\` CTEs.
- **Engine-Level Transaction Guard**: Queries execute inside an explicit \`BEGIN READ ONLY;\` transaction with an 8-second statement timeout (\`SET statement_timeout = 8000;\`).
- **Response Size Guard**: Results are capped at 1,000 rows, and the serialized JSON output must not exceed 2 MB. If it exceeds 2 MB, the API aborts with HTTP 413 (\`DatabaseQueryResultSizeError\`).
- **Client Presentation**: Valid rows and column metadata are passed directly into AG Grid Community for client-side sorting and formatting.
`,

  '06-sequence-copilot': `# Sequence Diagram — Database Copilot 2.0 Autonomous Agent Loop

## 1. Overview
This sequence diagram details the DBFlow Copilot 2.0 hybrid conversational AI architecture. It demonstrates how user inquiries are routed through intent classification into either a deterministic fast path, a conversational path, or an iterative autonomous database agent loop with live tool execution.

## 2. Intent Routing Paths
- **Path A: Deterministic Local Fast Path**:
  - Triggered by greetings, gratitude, goodbyes, and acknowledgements.
  - Resolves instantly locally ($< 2\\text{ ms}$) without invoking external LLM APIs, returning contextual greeting text and suggested starter actions.
- **Path B: Conversational Intelligence**:
  - Triggered by general questions, programming questions, or architectural discussions.
  - Dispatches a lightweight single-turn call to Google Gemini 3.8 Flash without database tool overhead, preserving conversational fluidity.
- **Path C: Autonomous Database Specialist Agent Loop**:
  - Triggered by database inspection, performance diagnostics, index analysis, or schema questions.
  - Injects live catalog metadata and 14 specialized tool declarations.
  - Executes up to 8 autonomous iterations: Gemini requests a tool $\\to$ \`AgentEngine\` runs the live tool handler $\\to$ returns tool results back to Gemini $\\to$ Gemini reflects and decides whether further tools are needed.
  - Synthesizes findings, assigns confidence ratings, and generates structured action buttons (e.g. \`preview_plan\` for one-click index migrations).
`,

  '07-activity': `# Activity Diagram — End-to-End Database Management Workflow

## 1. Overview
The **Activity Diagram** outlines the complete end-to-end operational lifecycle of DBFlow from initial connection establishment to schema visualization, data exploration, safe SQL execution, guided DDL changes, Copilot investigations, and graceful session termination.

## 2. Workflow Decision Nodes & Parallel Branches
- **Connection & Security Gate**: Validates host address against SSRF boundaries; if invalid, branches back with an actionable alert.
- **Concurrency Fork**:
  - **Branch 1 (Background)**: Schedules asynchronous \`IntelligenceOrchestrator\` to compute an MD5 schema fingerprint, analyze missing indexes, and cache findings.
  - **Branch 2 (Foreground)**: Introspects database catalogs and renders the interactive React Flow canvas.
- **Workspace Navigation Decision**:
  - **Data Explorer**: Paged tabular browsing $\\to$ full-table search $\\to$ two-phase row mutations (preview $\\to$ user review $\\to$ execute $\\to$ invalidate cache).
  - **SQL Workspace**: Monaco input $\\to$ read-only AST validation $\\to$ 8s transaction execution $\\to$ 2MB payload guard $\\to$ AG Grid display.
  - **Schema Designer DDL**: Guided table/column/FK creation $\\to$ transaction rollback dry-run $\\to$ SQL review dialog $\\to$ confirmed DDL execution $\\to$ catalog re-introspection.
  - **Copilot 2.0**: Prompt submission $\\to$ 3-way intent routing $\\to$ multi-turn tool execution loop $\\to$ actionable recommendations $\\to$ SQL execution.
- **Disconnection & Eviction**: Explicit user disconnection cleans up running background tasks, drains connection pools, and evicts in-memory tokens.
`,

  '08-deployment': `# Deployment Diagram — Physical & Containerized Runtime Topology

## 1. Overview
The **Deployment Diagram** models the physical and execution environments of the DBFlow platform. It illustrates the distribution of software artifacts across the developer workstation (client), local application server (Node.js/Express), target database infrastructure (PostgreSQL and MySQL), and external cloud AI services (Google Gemini).

## 2. Nodes & Deployment Artifacts
- **Client Device (Developer Workstation)**:
  - Runs a modern web browser hosting the React 18 SPA (Vite production build), Monaco Editor worker thread, AG Grid Community engine, and React Flow canvas.
  - Utilizes browser \`sessionStorage\` for tab-isolated query execution histories.
- **Application Server Host (Local Developer Machine / Host)**:
  - Node.js v24.x runtime hosting the DBFlow Express API service (\`server.ts\`).
  - **Strict Loopback Binding**: Binds exclusively to \`127.0.0.1:4000\`, preventing LAN exposure.
  - **In-Memory State**: Ephemeral session map with 15-minute idle TTL and staged two-phase plan map (5-minute TTL).
  - **Local Persistence**: Stores cache files in \`apps/api/data/\` (\`intelligence-cache.json\` and \`copilot-conversations.json\`).
- **Target Database Tier (Local / Docker Container)**:
  - PostgreSQL 14–18.6 instance listening on TCP port 5432.
  - MySQL 8.0+ instance listening on TCP port 3306.
  - Communicates via native wire protocols with optional TLS/SSL encryption.
- **Cloud AI Services**:
  - Google Gemini API (\`generativelanguage.googleapis.com\`) accessed over outbound HTTPS (port 443) with TLS 1.3 encryption and API key authorization.

## 3. Existing vs. Future Production Deployment Considerations
| Aspect | Current Implementation | Production Target Architecture |
| :--- | :--- | :--- |
| **Hosting Mode** | Local developer workstation / single-node | Multi-container Docker Compose / Kubernetes cluster |
| **API Network Binding** | Loopback only (\`127.0.0.1\`) | Nginx reverse proxy with TLS certificate termination |
| **Authentication** | Ephemeral in-memory session tokens | User accounts, JWT auth, RBAC, and tenant isolation |
| **Credential Storage**| In-memory connection pools (15-min TTL) | HashiCorp Vault / Cloud Secret Manager integration |
| **Database Egress** | \`DatabaseHostValidator\` DNS & IP pinning | Dedicated egress proxies with VPC firewall isolation |
`,
};

// Master README content
const MASTER_README = `# DBFlow UML Architecture Documentation

## 1. Executive Summary
**DBFlow** is an intelligent database management and analytics platform engineered with modern developer experience, rigorous query safety, and autonomous AI-assisted database engineering capabilities. This directory contains the complete, academically presentable Unified Modeling Language (UML) documentation package for the DBFlow system, generated directly from the real source code implementation.

Every diagram in this suite is strictly grounded in the codebase across \`apps/web\`, \`apps/api\`, and \`packages/shared\`.

---

## 2. Diagram Catalog & Directory Index

| No. | Diagram Name | Category | Directory | Primary Formats |
| :-: | :--- | :--- | :--- | :--- |
| **01** | [Use Case Diagram](01-use-case/) | Functional Requirements | \`01-use-case/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **02** | [Component Diagram](02-component/) | Structural Architecture | \`02-component/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **03** | [Class Diagram](03-class/) | Structural & Domain Model | \`03-class/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **04** | [Sequence: Database Connection](04-sequence-database-connection/) | Behavioral & Protocols | \`04-sequence-database-connection/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **05** | [Sequence: SQL Execution](05-sequence-sql-execution/) | Behavioral & Safety Guards | \`05-sequence-sql-execution/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **06** | [Sequence: DBFlow Copilot](06-sequence-copilot/) | Behavioral & AI Agent Loop | \`06-sequence-copilot/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **07** | [Activity Diagram](07-activity/) | Workflow & Lifecycle | \`07-activity/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |
| **08** | [Deployment Diagram](08-deployment/) | Physical & Runtime Topology | \`08-deployment/\` | \`.mmd\`, \`.puml\`, \`.svg\`, \`.png\` |

---

## 3. Architectural Highlights & Verified Design Patterns

### 1. Two-Phase Schema and Mutation Pattern (Preview $\\to$ Stored Plan $\\to$ Execute)
To eliminate catastrophic accidental data loss, DBFlow never executes raw user-submitted DDL or DML directly from arbitrary buttons. Instead, mutations follow a two-phase transactional contract:
1. **Draft Submission**: Client submits a structured mutation request (\`previewCreateTable\`, \`previewAddColumn\`, \`previewRecordInsert\`, \`previewRecordDelete\`).
2. **Dry-Run Validation**: Backend tests the modification inside an uncommitted rollback transaction against the live database engine.
3. **Plan Token Generation**: Backend generates a cryptographically random, session-bound \`planId\` with a 5-minute time-to-live.
4. **Human-in-the-Loop Confirmation**: Frontend displays exact generated SQL and target impact.
5. **Single-Use Execution**: User clicks Confirm, sending \`planId\`. The API executes the staged plan exactly once and deletes the plan token.

### 2. In-Memory Ephemeral Session Security
- Database credentials (passwords, usernames, hosts) are **never written to persistent disk**, logs, or client-side long-term storage.
- Connections exist as active connection pools (\`pg.Pool\` / \`mysql2.Pool\`) in an in-memory session map.
- Sessions automatically expire and drain pool sockets after **15 minutes of idle time**.
- An active session ceiling of **5 concurrent connections** per engine prevents resource exhaustion.
- The API is bound strictly to loopback (\`127.0.0.1:4000\`), and \`DatabaseHostValidator\` pins resolved DNS hosts to block SSRF and cloud metadata targets (\`169.254.169.254\`).

### 3. Read-Only SQL Safety Barrier
Manual query execution in the SQL workspace enforces multi-layered defense-in-depth:
- AST & Lexical Parser verifies only \`SELECT\` or read-only \`WITH ... SELECT\` statements are submitted.
- Destructive operations (\`DROP\`, \`ALTER\`, \`DELETE\`, \`TRUNCATE\`) and stateful functions (\`PG_SLEEP\`, \`LO_EXPORT\`, \`DBLINK\`) are strictly rejected.
- Engine-level enforcement wraps every query in \`BEGIN READ ONLY;\` with an 8-second statement timeout (\`SET statement_timeout = 8000;\`).
- Response size cutoff limits results to 1,000 rows and rejects payloads exceeding **2 MB** (HTTP 413).

### 4. Hybrid Conversational AI & Autonomous Agent Architecture (Copilot 2.0)
DBFlow Copilot 2.0 does not force every conversational interaction through slow agent tool loops:
- **Intent Router**: Distinguishes greetings/thanks (Fast Path $< 2\\text{ ms}$), general programming chat (Direct Gemini single-turn $< 2\\text{ s}$), and database investigations (Autonomous Tool Loop).
- **Autonomous Investigation Loop**: Equipped with 14 specialized database tools (\`inspect_database_schema\`, \`inspect_table_indexes\`, \`explain_sql_query\`, etc.) operating through a multi-turn function calling loop (up to 8 iterations).
- **Deterministic Offline Fallback**: If Gemini is unconfigured or returns HTTP 429 rate limit errors, Copilot switches gracefully to deterministic offline heuristic analysis.

---

## 4. Instructions for Regenerating Diagrams

To recompile and export all UML diagrams after codebase modifications:

\`\`\`bash
# Run the automated diagram compiler using Node.js & Playwright
node scripts/generate-uml-diagrams.mjs
\`\`\`

The script will:
1. Validate Mermaid (\`.mmd\`) and PlantUML (\`.puml\`) source models.
2. Launch headless Chromium via Playwright.
3. Render high-resolution vector SVGs (\`.svg\`) and 2x Retina PNGs (\`.png\`) with crisp white backgrounds and clean typography.
4. Update markdown documentation in each diagram subfolder.
`;

async function compileDiagrams() {
  console.log('Launching headless Chromium for diagram rendering...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  });

  const htmlTemplate = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
      body {
        margin: 0;
        padding: 40px;
        background: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      #render-container {
        display: inline-block;
        background: #ffffff;
      }
      .mermaid {
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <div id="render-container"></div>
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
          clusterBkg: '#f8fafc',
          clusterBorder: '#cbd5e1',
          fontSize: '12px'
        }
      });
      async function renderMermaidDiagram(id, code) {
        const container = document.getElementById('render-container');
        container.innerHTML = '';
        const { svg } = await mermaid.render(id, code);
        container.innerHTML = svg;
        return svg;
      }
    </script>
  </body>
  </html>
  `;

  await page.setContent(htmlTemplate);
  await page.waitForFunction(() => typeof window.mermaid !== 'undefined');

  for (const [dir, data] of Object.entries(DIAGRAMS)) {
    const dirPath = path.join(UML_BASE, dir);
    console.log(`Processing ${dir}: ${data.title}...`);

    // 1. Write Mermaid Source (.mmd)
    const mmdPath = path.join(dirPath, `${data.name}.mmd`);
    fs.writeFileSync(mmdPath, data.mermaid.trim() + '\n', 'utf8');

    // 2. Write PlantUML Source (.puml)
    const pumlPath = path.join(dirPath, `${data.name}.puml`);
    fs.writeFileSync(pumlPath, data.plantuml.trim() + '\n', 'utf8');

    // 3. Render SVG & PNG via Playwright
    try {
      const renderId = `diag_${dir.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const svgContent = await page.evaluate(
        async ({ id, code }) => {
          return await window.renderMermaidDiagram(id, code);
        },
        { id: renderId, code: data.mermaid }
      );

      // Save SVG
      const svgPath = path.join(dirPath, `${data.name}.svg`);
      fs.writeFileSync(svgPath, svgContent, 'utf8');

      // Adjust viewport to element bounding box + margin
      const container = page.locator('#render-container');
      const box = await container.boundingBox();
      if (box) {
        await page.setViewportSize({
          width: Math.max(1200, Math.ceil(box.width) + 80),
          height: Math.max(800, Math.ceil(box.height) + 80),
        });
      }

      // Save high-resolution PNG
      const pngPath = path.join(dirPath, `${data.name}.png`);
      await container.screenshot({ path: pngPath });

      console.log(`  ✓ Successfully generated ${data.name}.mmd, .puml, .svg, and .png`);
    } catch (err) {
      console.error(`  ✗ Error rendering ${dir}:`, err);
    }

    // 4. Write Directory Documentation README.md
    const docPath = path.join(dirPath, 'README.md');
    const docContent =
      EXPLANATIONS[dir] ||
      `# ${data.title}\n\nSee \`${data.name}.svg\` and \`${data.name}.png\` for visual representation.\n`;
    fs.writeFileSync(docPath, docContent.trim() + '\n', 'utf8');
  }

  // Write master README.md
  fs.writeFileSync(path.join(UML_BASE, 'README.md'), MASTER_README.trim() + '\n', 'utf8');
  console.log('✓ Master docs/uml/README.md successfully written.');

  await browser.close();
  console.log('\nAll 8 UML diagrams and documentation generated successfully!');
}

compileDiagrams().catch((err) => {
  console.error('Fatal compilation error:', err);
  process.exit(1);
});
