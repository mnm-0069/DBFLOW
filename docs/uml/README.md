# DBFlow UML Architecture Documentation

## 1. Executive Summary
**DBFlow** is an intelligent database management and analytics platform engineered with modern developer experience, rigorous query safety, and autonomous AI-assisted database engineering capabilities. This directory contains the complete, academically presentable Unified Modeling Language (UML) documentation package for the DBFlow system, generated directly from the real source code implementation.

Every diagram in this suite is strictly grounded in the codebase across `apps/web`, `apps/api`, and `packages/shared`.

---

## 2. Diagram Catalog & Directory Index

| No. | Diagram Name | Category | Directory | Primary Formats |
| :-: | :--- | :--- | :--- | :--- |
| **01** | [Use Case Diagram](01-use-case/) | Functional Requirements | `01-use-case/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **02** | [Component Diagram](02-component/) | Structural Architecture | `02-component/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **03** | [Class Diagram](03-class/) | Structural & Domain Model | `03-class/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **04** | [Sequence: Database Connection](04-sequence-database-connection/) | Behavioral & Protocols | `04-sequence-database-connection/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **05** | [Sequence: SQL Execution](05-sequence-sql-execution/) | Behavioral & Safety Guards | `05-sequence-sql-execution/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **06** | [Sequence: DBFlow Copilot](06-sequence-copilot/) | Behavioral & AI Agent Loop | `06-sequence-copilot/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **07** | [Activity Diagram](07-activity/) | Workflow & Lifecycle | `07-activity/` | `.mmd`, `.puml`, `.svg`, `.png` |
| **08** | [Deployment Diagram](08-deployment/) | Physical & Runtime Topology | `08-deployment/` | `.mmd`, `.puml`, `.svg`, `.png` |

---

## 3. Architectural Highlights & Verified Design Patterns

### 1. Two-Phase Schema and Mutation Pattern (Preview $\to$ Stored Plan $\to$ Execute)
To eliminate catastrophic accidental data loss, DBFlow never executes raw user-submitted DDL or DML directly from arbitrary buttons. Instead, mutations follow a two-phase transactional contract:
1. **Draft Submission**: Client submits a structured mutation request (`previewCreateTable`, `previewAddColumn`, `previewRecordInsert`, `previewRecordDelete`).
2. **Dry-Run Validation**: Backend tests the modification inside an uncommitted rollback transaction against the live database engine.
3. **Plan Token Generation**: Backend generates a cryptographically random, session-bound `planId` with a 5-minute time-to-live.
4. **Human-in-the-Loop Confirmation**: Frontend displays exact generated SQL and target impact.
5. **Single-Use Execution**: User clicks Confirm, sending `planId`. The API executes the staged plan exactly once and deletes the plan token.

### 2. In-Memory Ephemeral Session Security
- Database credentials (passwords, usernames, hosts) are **never written to persistent disk**, logs, or client-side long-term storage.
- Connections exist as active connection pools (`pg.Pool` / `mysql2.Pool`) in an in-memory session map.
- Sessions automatically expire and drain pool sockets after **15 minutes of idle time**.
- An active session ceiling of **5 concurrent connections** per engine prevents resource exhaustion.
- The API is bound strictly to loopback (`127.0.0.1:4000`), and `DatabaseHostValidator` pins resolved DNS hosts to block SSRF and cloud metadata targets (`169.254.169.254`).

### 3. Read-Only SQL Safety Barrier
Manual query execution in the SQL workspace enforces multi-layered defense-in-depth:
- AST & Lexical Parser verifies only `SELECT` or read-only `WITH ... SELECT` statements are submitted.
- Destructive operations (`DROP`, `ALTER`, `DELETE`, `TRUNCATE`) and stateful functions (`PG_SLEEP`, `LO_EXPORT`, `DBLINK`) are strictly rejected.
- Engine-level enforcement wraps every query in `BEGIN READ ONLY;` with an 8-second statement timeout (`SET statement_timeout = 8000;`).
- Response size cutoff limits results to 1,000 rows and rejects payloads exceeding **2 MB** (HTTP 413).

### 4. Hybrid Conversational AI & Autonomous Agent Architecture (Copilot 2.0)
DBFlow Copilot 2.0 does not force every conversational interaction through slow agent tool loops:
- **Intent Router**: Distinguishes greetings/thanks (Fast Path $< 2\text{ ms}$), general programming chat (Direct Gemini single-turn $< 2\text{ s}$), and database investigations (Autonomous Tool Loop).
- **Autonomous Investigation Loop**: Equipped with 14 specialized database tools (`inspect_database_schema`, `inspect_table_indexes`, `explain_sql_query`, etc.) operating through a multi-turn function calling loop (up to 8 iterations).
- **Deterministic Offline Fallback**: If Gemini is unconfigured or returns HTTP 429 rate limit errors, Copilot switches gracefully to deterministic offline heuristic analysis.

---

## 4. Instructions for Regenerating Diagrams

To recompile and export all UML diagrams after codebase modifications:

```bash
# Run the automated diagram compiler using Node.js & Playwright
node scripts/generate-uml-diagrams.mjs
```

The script will:
1. Validate Mermaid (`.mmd`) and PlantUML (`.puml`) source models.
2. Launch headless Chromium via Playwright.
3. Render high-resolution vector SVGs (`.svg`) and 2x Retina PNGs (`.png`) with crisp white backgrounds and clean typography.
4. Update markdown documentation in each diagram subfolder.
