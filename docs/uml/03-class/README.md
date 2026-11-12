# Class Diagram — Core Domain Entities, Services & Error Hierarchy

## 1. Overview
The **Class Diagram** models the fundamental TypeScript types, interfaces, service classes, and specialized exception hierarchies that power the DBFlow backend. It reflects the strict typing across database sessions, schema metadata, health reports, agent tools, and two-phase mutation plans.

## 2. Key Domain Class Groups
- **Connection & Session Models**:
  - `ConnectionInput`: Plain credential transfer object validated by Zod.
  - `DatabaseSession`: Discriminated union between `PostgresSession` (holding a `pg.Pool`) and `MysqlSession` (holding a `mysql2.Pool`), tracking `database`, `connectionId`, and `lastUsedAt` timestamps.
- **Schema & DDL Models**:
  - `PostgresSchemaTable`: Represents an introspected base table with schema name, columns, composite primary/unique key groups, and foreign key relationships.
  - `SchemaColumn`: Encapsulates physical column attributes including type, nullability, default values, identities, and key constraints.
  - `CreateTableDraft` & `CreateTablePlan`: Captures structured DDL drafts and their resulting 5-minute staged execution plans.
- **Health & Copilot Models**:
  - `DatabaseHealthReport`: Contains analyzed timestamps, summary counts, grade breakdown, and a collection of `HealthFinding` objects.
  - `HealthFinding`: Detailed diagnostic item containing problem statement, technical explanation, empirical evidence, recommended solution, suggested SQL, and confidence levels.
  - `CopilotChatMessage`: Rich multi-turn message format containing role, content, tool call executions, telemetry timings, and actionable suggestion pills.
  - `ToolDefinition`: Schema and asynchronous handler definition for the 14 agent tools.
- **Error Specialization Hierarchy**:
  - Derives from standard JavaScript `Error`.
  - Includes `PostgresSessionLimitError`, `PostgresTableNotFoundError`, `PostgresResultSizeError`, `RecordSortColumnError`, `ReadOnlyQueryValidationError`, `DatabaseQueryResultSizeError`, `DatabaseHostValidationError`, `SchemaOperationError` (with HTTP status), `RecordUpdateError`, and `RecordMutationError`.
