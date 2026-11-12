# Sequence Diagram — Database Connection & Schema Introspection

## 1. Overview
This sequence diagram illustrates the three-phase lifecycle when a user connects a PostgreSQL or MySQL database in DBFlow:
1. **Phase 1: Credential Verification (`POST /api/connections/test`)** — Ephemeral validation without creating a permanent session.
2. **Phase 2: Session Establishment (`POST /api/connections/open`)** — Connection pool initialization, security token issuance, and background intelligence scheduling.
3. **Phase 3: Schema Introspection (`POST /api/connections/introspect`)** — Deep catalog discovery and conversion to interactive React Flow diagram models.

## 2. Key Interactions & Safety Boundaries
- **SSRF Prevention**: Before opening any network socket, `DatabaseHostValidator` resolves hostnames and blocks private link-local targets (e.g., AWS/GCP metadata IP `169.254.169.254`) or invalid hosts.
- **Ephemeral Session Pool**: The API stores no credentials on disk or in the browser; passwords exist only in Node.js heap memory within `pg.Pool` / `mysql2.Pool` instances.
- **Concurrency & Expiration Limits**: A strict limit of 5 concurrent sessions per engine is enforced (`PostgresSessionLimitError`), and sessions expire automatically after 15 minutes of inactivity.
- **Catalog Assembly**: The introspection query queries `information_schema.columns`, `pg_catalog.pg_constraint`, and `referential_constraints`, which `assemblePostgresSchema()` transforms into structured schema tables.
