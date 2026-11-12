<div align="center">

# DBFLOW

### Intelligent Database Management & Analytics Platform

**A visual-first workspace for exploring database structure, relationships, records, and analytics — with two-phase reviewed schema changes from one unified interface.**

[Getting started](docs/GETTING_STARTED.md) · [Project Report](docs/DBFLOW_PROJECT_REPORT.md) · [Presentation Slides](docs/DBFLOW_PRESENTATION.md) · [Demo Queries](db/postgres/demo_queries.sql)

![Frontend: React 18 and TypeScript](https://img.shields.io/badge/frontend-React%2018%20%2B%20TypeScript-149ECA)
![API: Node.js and Express](https://img.shields.io/badge/API-Node.js%20%2B%20Express-43853D)
![Databases: PostgreSQL and MySQL](https://img.shields.io/badge/databases-PostgreSQL%20%7C%20MySQL-4169E1)
![Tests: 42 Passing](https://img.shields.io/badge/tests-42%20passing-10b981)
![Playwright: 9 Passing](https://img.shields.io/badge/e2e-9%20passing-10b981)
![Typecheck: Clean](https://img.shields.io/badge/typescript-zero%20errors-blue)

</div>

---

## 1. What is DBFlow?

DBFlow is an intelligent, visual-first database management and analytics platform. It changes how developers, data analysts, and DBMS students interact with relational databases by combining:

- **Excel's** spreadsheet familiarity for record exploration and row editing.
- **MongoDB Compass's** intuitive database exploration and schema inspection.
- **Power BI / Metabase's** instant visual analytics and aggregations.
- **VS Code's** professional SQL editing with Monaco Editor and built-in formatting.
- **React Flow's** interactive visual canvas with drag-to-connect relationship editing.
- **An Interactive DBMS Academy** with structured lessons and knowledge check quizzes.
- **DBFlow Copilot AI Assistant** for automated database health scoring (0-100), execution plan query diagnostics, natural language to SQL, and actionable schema recommendations.

---

## 2. Complete Product Feature Matrix

| Feature Module | Technology | Capabilities |
|---|---|---|
| **DBFlow Copilot AI** | OpenAI-Compatible API / Heuristic Engine | Connection-aware conversational chat, deterministic 0–100 database health score with letter grade (A–F), execution plan EXPLAIN parser with scan/join extraction, actionable recommendations with rollback SQL, one-click "Locate in Schema Canvas", Natural Language to SQL, and offline fallback mode. |
| **Visual Schema Designer** | `@xyflow/react` | Draggable tables, column datatypes, primary & foreign keys, cardinality labels (`1:1`, `1:N`, `M:N` junction detection), drag-to-connect relationship creation, table grouping, impact analysis, and vector SVG/PNG export. |
| **Hierarchical Database Explorer** | React Tree Component | Sidebar navigation (`Connection -> Database -> Schema -> Tables -> Columns`), object search filtering, PK/FK indicators, and single-click table routing. |
| **Spreadsheet Data Grid** | AG Grid Community | Bounded server-side pagination (10 to 100 rows), sorting across columns, multi-field search, row insertion, in-place row editing with optimistic concurrency control (`IS NOT DISTINCT FROM`), and reviewed row deletion. |
| **Visual Query Builder** | Custom Query Engine | Visual table selection, column chips, optional `LEFT JOIN` / `INNER JOIN` with foreign key autodiscovery, multi-clause `WHERE` filter builder (`=`, `!=`, `>`, `<`, `LIKE`, `IS NULL`), `ORDER BY`, `LIMIT`, real-time SQL preview, execution, and CSV export. |
| **Visual Analytics Dashboard** | Recharts | KPI metrics cards (students, courses, faculty, enrollments, GPA), Department dual-bar chart, Course capacity utilization chart, Monthly registration trend line, and Attendance donut breakdown chart. Runs live against PostgreSQL. |
| **Monaco SQL Workspace** | Monaco Editor | Read-only SQL execution inside `BEGIN READ ONLY ... ROLLBACK`, one-click **Format SQL** button, pre-populated **Example Queries** dropdown, session query history, execution duration tracking, and CSV export. |
| **Interactive DBMS Academy** | Interactive LMS | Three hands-on lessons (Tables & Primary Keys, Foreign Keys & Relationships, First SQL Relational JOIN), production SQL examples, interactive multiple-choice exercises with instant feedback, and course progress tracking. |
| **University Demo Database** | PostgreSQL 16 | Complete University Management System (departments, professors, students, courses, enrollments, attendance, assignments, submissions) with 120 students, 13 faculty, 22 courses, and 350+ enrollments. |

---

## 3. Quick Start Guide

### Prerequisites
- Node.js **20.18 or newer**
- npm **10 or newer**
- Docker (optional, for local PostgreSQL demo database)

### Installation & Startup

```bash
# Clone the repository
git clone https://github.com/mnm-0069/dbflow.git
cd dbflow

# Install workspace dependencies
npm install

# Start both API (port 4000) and Web Client (port 5173) concurrently
npm run dev
```

Open your browser to: **[http://localhost:5173](http://localhost:5173)**

---

## 4. PostgreSQL Demo Database Setup

DBFlow includes a complete Docker configuration and reproducible SQL seed generator:

### Option A: Using Bundled Docker PostgreSQL
```bash
# 1. Start the PostgreSQL container on port 5433
npm run db:up

# 2. Seed the University Management System dataset (if not automatically initialized)
npm run seed:demo
```

### Option B: Seeding an Existing PostgreSQL Database
```bash
# Configure standard connection environment variables:
export DBFLOW_POSTGRES_HOST=127.0.0.1
export DBFLOW_POSTGRES_PORT=5432
export DBFLOW_POSTGRES_USER=postgres
export DBFLOW_POSTGRES_PASSWORD=your_password
export DBFLOW_POSTGRES_DB=dbflow_demo

# Run the seed script:
npm run seed:demo
```

### Connecting in DBFlow UI
1. Click **Add Connection** in the sidebar.
2. Select **PostgreSQL**.
3. Enter:
   - Host: `127.0.0.1`
   - Port: `5433` (or `5432`)
   - Database: `dbflow_demo`
   - Username: `dbflow` (or your user)
   - Password: `dbflow_local_only`
4. Click **Test & Open Session**. The database schema is introspected automatically.

---

## 5. Recommended 8–10 Minute Demonstration Script

1. **Overview & Connection (1 min):**
   - Open DBFlow at `http://localhost:5173`.
   - Point out the calm, professional white enterprise design system.
   - Connect to `dbflow_demo` on PostgreSQL port 5433.
2. **Database Explorer & Schema Designer (2 mins):**
   - Expand the sidebar **Database Explorer** (`dbflow_demo -> public -> students -> columns`). Show the Primary Key (`PK`) and Foreign Key (`FK`) indicators.
   - Open **Schema Designer**. Inspect the interactive canvas, table cards, and cardinality edge labels (`1 : N`, `M : N`).
   - Demonstrate **Impact Analysis** and **Table Grouping**.
3. **Data Grid & Safe Mutations (2 mins):**
   - Click "View records" on the `students` table.
   - Demonstrate server-side pagination, sorting by GPA, and instant search.
   - Edit a student's GPA in-place. Explain the optimistic concurrency protection (`IS NOT DISTINCT FROM`).
4. **Visual Query Builder (2 mins):**
   - Navigate to **Query Builder**.
   - Select `students` table, choose columns (`first_name`, `last_name`, `gpa`).
   - Enable **Join** to `departments` on `department_id = id`.
   - Add a filter: `gpa >= 3.5`.
   - Inspect the real-time generated SQL in the preview pane.
   - Click **Run Query** and export the result to CSV.
5. **SQL Workspace & Formatting (1.5 mins):**
   - Switch to **SQL Workspace**.
   - Select an analytical query from the **Load example query** dropdown (e.g. *Course Enrollment & Capacity Utilization*).
   - Click **Format SQL** to demonstrate query formatting.
   - Execute the query and inspect execution time in milliseconds.
6. **Analytics Dashboard (1.5 mins):**
   - Navigate to **Analytics**.
   - Show the live KPI cards (Total Students, Active Courses, Faculty, Enrollments, Average GPA).
   - Review the Recharts visualizations (Dual-bar Department staffing, Course capacity utilization, Monthly trend line, and Attendance donut).
7. **Interactive DBMS Academy (1 min):**
   - Open **Learn databases**.
   - Walk through Lesson 1 and Lesson 2 visual principles.
   - Answer an interactive knowledge check question and observe instant verification and progress tracking.

---

## 6. Architecture & Security

- **Monorepo Structure:** `apps/web` (React/Vite), `apps/api` (Express/Node.js), `packages/shared` (TypeScript types).
- **In-Memory Ephemeral Sessions:** Credentials are never persisted to disk or browser storage. Sessions expire after 15 minutes of idle time.
- **SSRF Protection:** Hostnames are resolved and pinned with DNS lookup; link-local and cloud metadata addresses (`169.254.169.254`) are strictly blocked.
- **Read-Only Transaction Isolation:** All free-form queries execute inside `BEGIN READ ONLY ... ROLLBACK` with an 8-second execution timeout and a 2 MB response limit.
- **Two-Phase Schema Changes:** Visual DDL changes generate signed, 5-minute single-use plans verified in a rolled-back transaction before explicit user execution.

---

## 7. Verification & Testing

```bash
# 1. Typecheck the entire monorepo
npm run typecheck

# 2. Run backend test suite (36 tests)
npm run test --workspace @idp/api

# 3. Build production distribution bundles
npm run build
```

---

## 8. Academic Submission Artifacts

- **Complete Academic Project Report:** [`docs/DBFLOW_PROJECT_REPORT.md`](docs/DBFLOW_PROJECT_REPORT.md)
- **Academic Presentation Slide Deck:** [`docs/DBFLOW_PRESENTATION.md`](docs/DBFLOW_PRESENTATION.md)
- **University Management SQL Script:** [`db/postgres/init/002_university_demo.sql`](db/postgres/init/002_university_demo.sql)
- **Pre-Configured Demo Queries:** [`db/postgres/demo_queries.sql`](db/postgres/demo_queries.sql)

---

<div align="center">
<b>DBFlow: Transforming Relational Database Management for Everyone</b><br/>
Prepared for Final Academic Project Submission · November 2026
</div>
