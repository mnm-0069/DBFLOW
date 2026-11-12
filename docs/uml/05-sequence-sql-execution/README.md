# Sequence Diagram — Safe Read-Only SQL Execution

## 1. Overview
This sequence diagram depicts how user-authored SQL travels from the Monaco Editor through security parsing, transaction wrapping, engine execution, response size enforcement, and AG Grid rendering.

## 2. Safety Controls & Execution Flow
- **Monaco Editor & Query History**: Every query trigger is immediately logged to browser `sessionStorage` query history with a running timestamp.
- **Lexical & Syntactic Security Validation**: `validateReadOnlyQuery()` performs multi-stage checks:
  1. Payload length cutoff (maximum 50,000 characters).
  2. Single-statement enforcement (rejecting multi-statement attacks separated by semicolons).
  3. Data-changing keyword rejection (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`).
  4. Malicious function rejection (`PG_SLEEP`, `PG_TERMINATE_BACKEND`, `LO_EXPORT`, `DBLINK`).
  5. Only allows `SELECT` or read-only `WITH ... SELECT` CTEs.
- **Engine-Level Transaction Guard**: Queries execute inside an explicit `BEGIN READ ONLY;` transaction with an 8-second statement timeout (`SET statement_timeout = 8000;`).
- **Response Size Guard**: Results are capped at 1,000 rows, and the serialized JSON output must not exceed 2 MB. If it exceeds 2 MB, the API aborts with HTTP 413 (`DatabaseQueryResultSizeError`).
- **Client Presentation**: Valid rows and column metadata are passed directly into AG Grid Community for client-side sorting and formatting.
