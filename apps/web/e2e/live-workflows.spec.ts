import { expect, test, type Page, type Route } from '@playwright/test';
import { layoutSchemaTables } from '../src/app/schema-layout.js';

const liveSchema = (withNewColumn = false, withProjects = false) => ({
  engine: 'postgres', database: 'dbflow_test', introspectedAt: '2026-10-19T00:00:00.000Z',
  tables: [{ schema: 'public', name: 'customers', foreignKeys: [], columns: [
    { name: 'id', type: 'integer', key: 'pk', generated: true, identity: true, nullable: false },
    { name: 'name', type: 'text', nullable: false },
    ...(withNewColumn ? [{ name: 'notes', type: 'text', nullable: true }] : []),
  ] }, { schema: 'public', name: 'parent_pairs', foreignKeys: [], keyGroups: [{ kind: 'primary', columns: ['tenant_id', 'id'] }], columns: [
    { name: 'tenant_id', type: 'integer', key: 'pk', nullable: false },
    { name: 'id', type: 'integer', key: 'pk', nullable: false },
  ] }, ...(withProjects ? [{ schema: 'public', name: 'projects', foreignKeys: [], columns: [
    { name: 'id', type: 'integer', key: 'pk', generated: true, identity: true, nullable: false },
    { name: 'name', type: 'text', nullable: false },
  ] }] : [])],
});

const records = { schema: 'public', table: 'customers', page: 0, pageSize: 50, hasMore: false, rows: [{ id: 1, name: 'Ada' }] };
type ApiMock = (route: Route) => Promise<void>;

async function mockApi(page: Page, handlers: Record<string, ApiMock> = {}) {
  await page.route('http://localhost:4000/**', async (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (handlers[key]) return handlers[key]!(route);
    if (key === 'POST /api/connections/open') return route.fulfill({ json: { connectionId: 'test-session', serverVersion: 'PostgreSQL test', latencyMs: 2 } });
    if (key === 'POST /api/connections/introspect') return route.fulfill({ json: liveSchema() });
    if (key === 'POST /api/connections/records') return route.fulfill({ json: records });
    if (key === 'POST /api/connections/schema/preview-create-table') return route.fulfill({ json: { planId: 'create-plan', sql: 'CREATE TABLE public.projects (id integer PRIMARY KEY, name text);', expiresInSeconds: 300 } });
    if (key === 'POST /api/connections/schema/create-table') return route.fulfill({ json: { schema: 'public', table: 'projects' } });
    if (key === 'POST /api/connections/records/preview-insert') return route.fulfill({ json: { planId: 'insert-plan', values: { name: 'Grace' }, expiresInSeconds: 300 } });
    if (key === 'POST /api/connections/records/insert') return route.fulfill({ json: { row: { id: 2, name: 'Grace' } } });
    if (key === 'POST /api/connections/records/update') return route.fulfill({ status: 409, json: { error: 'This row changed after it was loaded. Refresh the row and try again.' } });
    return route.fulfill({ status: 404, json: { error: `Unexpected API request: ${key}` } });
  });
}

async function connectToTestSchema(page: Page) {
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.locator('#main-content').getByRole('button', { name: 'Add connection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect a database' });
  await dialog.getByLabel('Host').fill('localhost');
  await dialog.getByRole('textbox', { name: 'Database' }).fill('dbflow_test');
  await dialog.getByLabel('Username').fill('dbflow_test');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status')).toContainText('Connected successfully');
  await page.getByRole('button', { name: 'Inspect PostgreSQL schema' }).click();
  await expect(page.getByRole('heading', { name: 'Schema designer' })).toBeVisible();
}

test('connection errors can be corrected and retried', async ({ page }) => {
  let openAttempts = 0;
  await mockApi(page, { 'POST /api/connections/open': async (route) => {
    openAttempts++;
    if (openAttempts === 1) return route.fulfill({ status: 502, json: { error: 'Could not connect to the database. Check the host, port, and credentials.' } });
    return route.fulfill({ json: { connectionId: 'test-session', serverVersion: 'PostgreSQL test', latencyMs: 2 } });
  } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.locator('#main-content').getByRole('button', { name: 'Add connection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect a database' });
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert')).toContainText('Check the host, port, and credentials');
  await dialog.getByLabel('Port').fill('5432');
  await dialog.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status')).toContainText('Connected successfully');
  await expect(page.getByRole('button', { name: 'Inspect PostgreSQL schema' })).toBeEnabled();
});

test('DDL is previewed, explicitly confirmed, and schema refresh failures are recoverable', async ({ page }) => {
  let introspections = 0;
  let previewDraft: any;
  await mockApi(page, { 'POST /api/connections/introspect': async (route) => {
    introspections++;
    if (introspections === 2) return route.fulfill({ status: 503, json: { error: 'Schema catalog is temporarily unavailable.' } });
    return route.fulfill({ json: liveSchema(introspections >= 3, introspections >= 3) });
  }, 'POST /api/connections/schema/preview-create-table': async (route) => {
    previewDraft = route.request().postDataJSON().draft;
    return route.fulfill({ json: { planId: 'create-plan', sql: 'CREATE TABLE public.projects (id INTEGER GENERATED ALWAYS AS IDENTITY, name TEXT DEFAULT \'Draft\' UNIQUE, owner_id INTEGER REFERENCES public.customers(id) ON DELETE CASCADE);', expiresInSeconds: 300 } });
  } });
  await page.goto('/');
  await connectToTestSchema(page);
  await page.getByRole('button', { name: 'New table' }).click();
  await page.getByLabel('Table name').fill('projects');
  await page.getByLabel('Column name').fill('id');
  await page.getByLabel('Data type').selectOption('integer');
  await page.getByLabel('Add a rule or constraint').selectOption('primaryKey');
  await page.getByLabel('Add a rule or constraint').selectOption('identity');
  await page.getByLabel('Identity mode').selectOption('always');
  await page.getByRole('dialog').getByRole('button', { name: 'Add column', exact: true }).click();
  await page.getByLabel('Column name').fill('name');
  await page.getByLabel('Add a rule or constraint').selectOption('unique');
  await page.getByLabel('Add a rule or constraint').selectOption('default');
  await page.getByLabel('Literal default value').fill('Draft');
  await page.getByLabel('Add a rule or constraint').selectOption('check');
  await page.getByLabel('Allowed values').fill('Draft\nArchived');
  await page.getByRole('dialog').getByRole('button', { name: 'Add column', exact: true }).click();
  await page.getByLabel('Column name').fill('owner_id');
  await page.getByLabel('Data type').selectOption('integer');
  await page.getByLabel('Add a rule or constraint').selectOption('foreignKey');
  await page.getByLabel('Foreign key target', { exact: true }).selectOption({ label: 'public.customers.id' });
  await page.getByLabel('Foreign key on delete').selectOption('cascade');
  await page.getByRole('dialog').getByRole('button', { name: 'Add column', exact: true }).click();
  await page.getByLabel('Column name').fill('score');
  await page.getByLabel('Data type').selectOption('decimal');
  await page.getByLabel('Add a rule or constraint').selectOption('check');
  await page.getByLabel('Minimum value').fill('0');
  await page.getByLabel('Maximum value').fill('100');
  await page.getByRole('dialog').getByRole('button', { name: 'Add column', exact: true }).click();
  await page.getByText('Unique combinations', { exact: true }).click();
  await page.getByLabel('Choose unique column').selectOption('owner_id');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Choose unique column').selectOption('score');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Make combination unique' }).click();
  await page.getByRole('button', { name: 'Review SQL' }).click();
  await expect(page.getByText('CREATE TABLE public.projects', { exact: false })).toBeVisible();
  await expect.poll(() => previewDraft?.columns?.[0]?.identity).toBe('always');
  expect(previewDraft.columns[1]).toMatchObject({ unique: true, default: { kind: 'literal', value: 'Draft' }, checks: { allowedValues: ['Draft', 'Archived'] } });
  expect(previewDraft.columns[2]).toMatchObject({ name: 'owner_id', type: 'integer', reference: { schema: 'public', table: 'customers', column: 'id', onDelete: 'cascade' } });
  expect(previewDraft.columns[3]).toMatchObject({ name: 'score', type: 'decimal', checks: { minimum: '0', maximum: '100' } });
  expect(previewDraft.uniqueConstraints).toEqual([['owner_id', 'score']]);
  const create = page.getByRole('button', { name: 'Create table' });
  await expect(create).toBeDisabled();
  await page.getByLabel('I reviewed this SQL and want to create the table.').check();
  await create.click();
  await expect(page.getByRole('alert')).toContainText('schema refresh failed: Schema catalog is temporarily unavailable');
  await page.getByRole('alert').getByRole('button', { name: 'Refresh schema' }).click();
  await expect(page.getByText('projects', { exact: true })).toBeVisible();
});

test('table designer maps source columns to a referenced composite key', async ({ page }) => {
  let previewDraft: any;
  await mockApi(page, { 'POST /api/connections/schema/preview-create-table': async (route) => {
    previewDraft = route.request().postDataJSON().draft;
    return route.fulfill({ json: { planId: 'composite-plan', sql: 'CREATE TABLE public.links (...);', expiresInSeconds: 300 } });
  } });
  await page.goto('/');
  await connectToTestSchema(page);
  await page.getByRole('button', { name: 'New table' }).click();
  await page.getByLabel('Table name').fill('links');
  for (const name of ['parent_tenant', 'parent_id']) {
    await page.getByLabel('Column name').fill(name);
    await page.getByLabel('Data type').selectOption('integer');
    await page.getByRole('dialog').getByRole('button', { name: 'Add column', exact: true }).click();
  }
  await page.getByText('Composite relationships', { exact: true }).click();
  await page.getByLabel('Composite foreign key target').selectOption({ label: 'public.parent_pairs · primary key (tenant_id, id)' });
  await page.getByLabel('Source column for tenant_id').selectOption('parent_tenant');
  await page.getByLabel('Source column for id').selectOption('parent_id');
  await page.getByLabel('Composite foreign key on delete').selectOption('cascade');
  await page.getByRole('button', { name: 'Add relationship' }).click();
  await page.getByRole('button', { name: 'Review SQL' }).click();
  await expect.poll(() => previewDraft?.foreignKeyConstraints?.length).toBe(1);
  expect(previewDraft.foreignKeyConstraints[0]).toEqual({
    columns: ['parent_tenant', 'parent_id'],
    reference: { schema: 'public', table: 'parent_pairs', columns: ['tenant_id', 'id'], onDelete: 'cascade', onUpdate: 'no action' },
  });
});

test('schema dialogs trap focus, close with Escape, and restore focus to their opener', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await connectToTestSchema(page);

  const newTable = page.getByRole('button', { name: 'New table' });
  await newTable.click();
  const createDialog = page.getByRole('dialog', { name: 'Create a table' });
  await expect(page.getByLabel('Table name')).toBeFocused();
  await createDialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Tab');
  await expect(createDialog.getByRole('button', { name: 'Close table designer' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(createDialog).toBeHidden();
  await expect(newTable).toBeFocused();

  const addColumn = page.getByRole('button', { name: 'Add column', exact: true });
  await addColumn.click();
  const reviewDialog = page.getByRole('dialog', { name: 'Review schema change' });
  await expect(page.getByLabel('Column change SQL')).toHaveValue('ALTER TABLE "public"."customers" ADD COLUMN "new_column" TEXT;');
  await expect(reviewDialog.getByRole('button', { name: 'Close schema change review' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(reviewDialog.getByRole('button', { name: 'Validate and preview SQL' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(reviewDialog).toBeHidden();
  await expect(addColumn).toBeFocused();
});

test('Schema Designer opens an editable, reviewed Add column draft for the selected table', async ({ page }) => {
  let previewRequest: { connectionId: string; sql: string } | undefined;
  let executionRequested = false;
  await mockApi(page, {
    'POST /api/connections/schema/preview-add-column': async (route) => {
      previewRequest = route.request().postDataJSON();
      return route.fulfill({ json: { planId: 'column-plan', sql: 'ALTER TABLE "public"."customers" ADD COLUMN "notes" TEXT;', expiresInSeconds: 300 } });
    },
    'POST /api/connections/schema/add-column': async (route) => {
      executionRequested = true;
      return route.fulfill({ json: { success: true } });
    },
  });
  await page.goto('/');
  await connectToTestSchema(page);
  await page.getByRole('button', { name: 'Add column', exact: true }).click();

  const reviewDialog = page.getByRole('dialog', { name: 'Review schema change' });
  await expect(page.getByLabel('Column change SQL')).toHaveValue('ALTER TABLE "public"."customers" ADD COLUMN "new_column" TEXT;');
  await page.getByLabel('Column change SQL').fill('ALTER TABLE "public"."customers" ADD COLUMN "notes" TEXT;');
  await reviewDialog.getByRole('button', { name: 'Validate and preview SQL' }).click();
  await expect(page.getByText('Normalized SQL')).toBeVisible();
  await expect.poll(() => previewRequest?.sql).toBe('ALTER TABLE "public"."customers" ADD COLUMN "notes" TEXT;');
  expect(previewRequest?.connectionId).toBe('test-session');
  expect(executionRequested).toBe(false);
});

test('schema layout separates connected layers and avoids overlapping table cards', () => {
  const tables = [
    { schema: 'public', name: 'orders', columns: Array(5).fill({}), foreignKeys: [] },
    { schema: 'public', name: 'customers', columns: Array(3).fill({}), foreignKeys: [] },
    { schema: 'public', name: 'order_items', columns: Array(7).fill({}), foreignKeys: [
      { column: 'order_id', referencedSchema: 'public', referencedTable: 'orders', referencedColumn: 'id' },
    ] },
    { schema: 'public', name: 'payments', columns: Array(2).fill({}), foreignKeys: [
      { column: 'order_id', referencedSchema: 'public', referencedTable: 'orders', referencedColumn: 'id' },
    ] },
    { schema: 'public', name: 'catalog', columns: Array(4).fill({}), foreignKeys: [] },
  ];
  const positions = layoutSchemaTables(tables);
  expect(positions['["public","orders"]']!.x).toBeLessThan(positions['["public","order_items"]']!.x);
  const entries = tables.map((table) => ({
    id: `["${table.schema}","${table.name}"]`,
    position: positions[`["${table.schema}","${table.name}"]`]!,
    height: 90 + table.columns.length * 33,
  }));
  for (let left = 0; left < entries.length; left += 1) for (let right = left + 1; right < entries.length; right += 1) {
    const a = entries[left]!;
    const b = entries[right]!;
    const overlaps = a.position.x < b.position.x + 275 && a.position.x + 275 > b.position.x
      && a.position.y < b.position.y + b.height && a.position.y + a.height > b.position.y;
    expect(overlaps, `${a.id} and ${b.id} should not overlap`).toBe(false);
  }
});

test('row inserts require a review and edits expose a stale-row recovery action', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await connectToTestSchema(page);
  await page.getByRole('button', { name: 'View live records' }).click();
  await expect(page.getByText('Ada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Include name').check();
  await page.getByRole('dialog').locator('input[name="name"]').fill('Grace');
  await page.getByRole('button', { name: 'Review row' }).click();
  await expect(page.getByText('Review these values')).toBeVisible();
  const addRow = page.getByRole('dialog').getByRole('button', { name: 'Add row', exact: true });
  await expect(addRow).toBeDisabled();
  await page.getByLabel('I reviewed these values and want to insert one row.').check();
  await addRow.click();
  await expect(page.getByText('Row added to public.customers')).toBeVisible();

  await page.getByText('Ada', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit row' }).click();
  await page.getByLabel('Save name').check();
  await page.getByRole('dialog').locator('input[name="name"]').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('This row changed after it was loaded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh row' })).toBeVisible();
});
