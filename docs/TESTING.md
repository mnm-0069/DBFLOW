# Testing DBFLOW

## Fast checks

Run API unit tests, type checks, and the production build from the repository root:

```bash
npm run test --workspace @idp/api
npm run typecheck
npm run build
```

## Browser workflow coverage

Install the browser once, then run the end-to-end suite from the repository root:

```bash
npx playwright install chromium
npm run test:e2e
```

The suite runs the actual web app in Chromium and mocks only the local API, so it does not need database credentials or change database contents. It covers connection failure and retry, guided identity/default/unique/check/foreign-key choices, explicit SQL review before table creation, recovery after a schema refresh failure, explicit review before row insertion, and stale-edit conflict recovery.

## PostgreSQL workflow integration check

The integration check connects to an explicitly named test database, creates a uniquely named temporary schema, and drops only that schema when it finishes. The database name must end in `_test`; the check refuses other database names. It exercises schema introspection, reviewed create-table and add-column plans, read-only SQL, sorted and filtered paging, row updates and stale-edit conflicts, identity/default handling, unique and foreign-key failures, reviewed insert/delete plans, stale deletes, and one-use confirmations. GitHub Actions starts PostgreSQL 18.6 and runs this check on every push to `main` and pull request.

Create a dedicated database first. Use a local PostgreSQL administrator for database creation, and give the test account ownership so it can create and drop its temporary schema:

```bash
createdb -O dbflow dbflow_reliability_test
```

Then run the integration check with the dedicated database URL:

```bash
DBFLOW_TEST_DATABASE_URL='postgresql://dbflow:dbflow_local_only@127.0.0.1:5432/dbflow_reliability_test?sslmode=disable' npm run test:integration
```

If no URL is set locally, the integration check is reported as skipped. Never point this variable at a development, shared, or production database. The script does not drop the database; it only removes the temporary schema it created.

## Manual recovery checks

With the web app and API running locally (`npm run dev`):

1. Enter an invalid connection password and confirm the connection dialog gives a safe, actionable error and allows retry.
2. Open a live table, disconnect the API session, and try to reload records. Confirm the app prompts for reconnection instead of presenting old rows as current.
3. Open a row for editing, change it independently in PostgreSQL, then save the stale edit. Confirm DBFLOW reports the conflict and offers **Refresh row**.
4. Insert a duplicate unique value or try to delete a referenced row. Confirm the dialog explains the constraint and lets the user revise or cancel.
5. After a successful row change, simulate a record-refresh failure and confirm **Retry records** reloads the table without repeating the already-completed change.
6. If a schema refresh fails after DDL, confirm the current canvas stays visible, the notice explains what to verify, and **Refresh schema** can be retried.

These checks use disposable local data only. Avoid applying the failure scenarios to a database with important data.
