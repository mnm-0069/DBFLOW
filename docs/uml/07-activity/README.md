# Activity Diagram — End-to-End Database Management Workflow

## 1. Overview
The **Activity Diagram** outlines the complete end-to-end operational lifecycle of DBFlow from initial connection establishment to schema visualization, data exploration, safe SQL execution, guided DDL changes, Copilot investigations, and graceful session termination.

## 2. Workflow Decision Nodes & Parallel Branches
- **Connection & Security Gate**: Validates host address against SSRF boundaries; if invalid, branches back with an actionable alert.
- **Concurrency Fork**:
  - **Branch 1 (Background)**: Schedules asynchronous `IntelligenceOrchestrator` to compute an MD5 schema fingerprint, analyze missing indexes, and cache findings.
  - **Branch 2 (Foreground)**: Introspects database catalogs and renders the interactive React Flow canvas.
- **Workspace Navigation Decision**:
  - **Data Explorer**: Paged tabular browsing $\to$ full-table search $\to$ two-phase row mutations (preview $\to$ user review $\to$ execute $\to$ invalidate cache).
  - **SQL Workspace**: Monaco input $\to$ read-only AST validation $\to$ 8s transaction execution $\to$ 2MB payload guard $\to$ AG Grid display.
  - **Schema Designer DDL**: Guided table/column/FK creation $\to$ transaction rollback dry-run $\to$ SQL review dialog $\to$ confirmed DDL execution $\to$ catalog re-introspection.
  - **Copilot 2.0**: Prompt submission $\to$ 3-way intent routing $\to$ multi-turn tool execution loop $\to$ actionable recommendations $\to$ SQL execution.
- **Disconnection & Eviction**: Explicit user disconnection cleans up running background tasks, drains connection pools, and evicts in-memory tokens.
