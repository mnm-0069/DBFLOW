# Use Case Diagram — DBFlow Platform

## 1. Overview
The **Use Case Diagram** captures the functional capabilities of the DBFlow Intelligent Database Platform from the perspectives of its human actors and external systems. It models how database developers, data analysts, and database administrators interact with the unified workspace, and how autonomous agents and background intelligence engines collaborate with target databases and external AI providers.

## 2. Actors
- **Database Developer / Engineer**: Performs schema design, writes and tests queries in the SQL workspace, explores relationships on the visual canvas, and uses natural-language query generation.
- **Data Analyst**: Explores tabular datasets using server-side pagination, filters and sorts records, exports CSV reports, and investigates workload metrics.
- **Database Administrator (DBA)**: Audits overall database health, evaluates missing indexes and sequential scan bottlenecks, inspects EXPLAIN plans, and manages controlled table drops and cascade dependencies.
- **Google Gemini AI Gateway (External System)**: External generative AI model (`gemini-3.8-flash`, `gemini-2.5-flash-lite`) providing autonomous reasoning, NL-to-SQL generation, and function-calling capabilities.
- **Target Database Engine (PostgreSQL / MySQL)**: The underlying database instance managing physical storage, executing read transactions, validating catalog schemas, and applying confirmed DDL/DML migrations.

## 3. Key Use Cases & Subsystems
- **Session & Connection Management**: Includes host security validation (SSRF and metadata link-local protection) and extends to automatic 15-minute idle session termination.
- **Schema Visualization & Guided DDL**: Includes interactive entity-relationship diagram rendering, color-coded table grouping, and two-phase schema migrations (preview rollback transaction, user confirmation, and stored plan execution).
- **Data Explorer**: Provides bounded server-side paging (max 100 rows, 2MB limit), full-table text search, optimistic locking for row updates, and two-phase row insertion/deletion.
- **SQL Workspace & Query Builder**: Enforces a strict read-only AST safety barrier (disallowing data-changing SQL and unsafe functions like `PG_SLEEP`), applies an 8-second execution timeout, and stores per-tab query execution histories.
- **DBFlow Copilot 2.0 & Continuous Intelligence**: Includes multi-intent routing (deterministic fast path, conversational path, and autonomous tool loop with 14 tools), health score grading ($A \to F$), and automatic cache invalidation upon DDL/DML mutations.

## 4. Verification & Source Mapping
- Mapped directly to route definitions in `apps/api/src/routes/connections.ts` and `apps/api/src/routes/copilotRoutes.ts`.
- Validated against frontend user interfaces in `apps/web/src/app/App.tsx`, `DataExplorerView.tsx`, `DatabaseCopilot.tsx`, and `VisualQueryBuilder.tsx`.
