# Component Diagram — System Architecture

## 1. Overview
The **Component Diagram** represents the physical and logical software modularity of DBFlow. It illustrates the high cohesion and loose coupling between the React/Vite web application (`apps/web`), the shared contract library (`packages/shared`), and the Express/Node.js backend service (`apps/api`), along with external database drivers and cloud AI integrations.

## 2. Subsystems & Component Structure
- **Frontend Client (`apps/web`)**:
  - `App Shell & Router`: Orchestrates tab routing, global state, and modal dialogues.
  - `Schema Designer`: Interactive canvas using React Flow, custom `TableNode` and `FloatingEdge` components, and hierarchical layout calculation.
  - `Data Explorer`: High-performance data table powered by AG Grid Community, featuring table catalog tree navigation, Structure drawer, Record Inspect modal, and mutation dialogues.
  - `SQL Workspace`: Monaco Editor integration with syntax validation, formatting utilities, and sessionStorage-based query history.
  - `Visual Query Builder`: Graphical block builder translating table relationships and filters into live SQL.
  - `Copilot 2.0 Interface`: Hybrid conversational chat, health dashboard, tool execution drawer, and actionable recommendation cards.
  - `Web API Client`: Centralized REST communication layer with structured error handling.
- **Shared Contracts (`packages/shared`)**:
  - Source of truth for TypeScript interfaces, eliminating drift between client and server across connection inputs, schema structures, Copilot messages, telemetry timings, and health scores.
- **Backend API (`apps/api`)**:
  - `Express HTTP Engine`: Listens exclusively on loopback (`127.0.0.1:4000`) for security.
  - `Security & Validation Middleware`: Strict Zod schema enforcement, CORS origin filtering, and `DatabaseHostValidator` (preventing SSRF).
  - `Connection & Session Pool Service`: In-memory session maps for `pg.Pool` and `mysql2.Pool` with 15-minute idle eviction and 5-session concurrency ceilings.
  - `Schema & Record Services`: Introspection queries against `information_schema` and `pg_catalog`, staging two-phase DDL and DML plans in memory.
  - `Copilot Agent Engine`: Coordinates intent classification, multi-turn tool execution across 14 database tools, and interaction with the `AiProvider` gateway.
  - `Intelligence Orchestrator`: Background job runner performing periodic schema fingerprinting (MD5) and caching health findings to disk.

## 3. Communication Interfaces & Protocols
- Client $\leftrightarrow$ Server: HTTP/1.1 REST with JSON payloads over loopback `localhost:4000`.
- API $\leftrightarrow$ PostgreSQL: Native PostgreSQL wire protocol via `pg.Pool` (TCP :5432).
- API $\leftrightarrow$ MySQL: Native MySQL binary protocol via `mysql2/promise` (TCP :3306).
- API $\leftrightarrow$ Gemini: HTTPS/TLS 1.3 REST calls to Google Gemini API (`generativelanguage.googleapis.com`).
