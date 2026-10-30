import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AgGridReact } from '@ag-grid-community/react';
import { ModuleRegistry } from '@ag-grid-community/core';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import { Background, Controls, ReactFlow, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Connection, type Edge, type EdgeProps, type Node, type NodeTypes, type ReactFlowInstance, Handle, Position } from '@xyflow/react';
import {
  Activity, ArrowDownUp, ArrowLeftRight, ArrowRight, Braces, Check, ChevronDown,
  ChevronRight, CircleHelp, Clock3, Code2, Command, Database, Ellipsis, Eye,
  Copy, Download, FileCode2, Filter, GitBranch, GraduationCap, Grip, HardDrive, HelpCircle, History, Image, Printer, RotateCcw, AlertTriangle,
  KeyRound, LayoutDashboard, Layers3, Lightbulb, Link2, ListFilter, LockKeyhole, Maximize2, Menu,
  MoreHorizontal, PanelLeftClose, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Table2, TerminalSquare, Trash2, X, Zap,
} from 'lucide-react';
import { CreateTableDialog } from './CreateTableDialog';
import { ReviewAddColumnDialog } from './ReviewAddColumnDialog';
import { ReviewNullabilityDialog } from './ReviewNullabilityDialog';
import { CreateRelationshipDialog } from './CreateRelationshipDialog';
import { DeleteTableDialog } from './DeleteTableDialog';
import { SchemaChangePlan } from './SchemaChangePlan';
import { SchemaGroupsDialog } from './SchemaGroupsDialog';
import { stageSchemaChange, type StagedSchemaChange } from './schema-change-plan';
import { loadSchemaGroups, schemaGroupsStorageKey, type SchemaTableGroup } from './schema-groups';
import { readSchemaPreference, schemaConnectionScope, writeSchemaPreference } from './schema-preferences';
import { buildSchemaSvg, downloadSchemaPng, downloadSchemaSvg, printSchemaSvg } from './schema-export';
import { EditRecordDialog } from './EditRecordDialog';
import { InsertRecordDialog } from './InsertRecordDialog';
import { DeleteRecordDialog } from './DeleteRecordDialog';
import { QueryHistoryPanel } from './QueryHistoryPanel';
import { loadQueryHistory, rememberQuery, saveQueryHistory, type QueryHistoryEntry } from './query-history';
import { layoutSchemaTables, type SchemaPosition } from './schema-layout';

ModuleRegistry.registerModules([ClientSideRowModelModule]);
const Editor = lazy(() => import('@monaco-editor/react'));

type TableNodeData = { label: string; subtitle: string; columns: { name: string; type: string; key?: 'pk' | 'fk' | 'pk-fk'; unique?: boolean; nullable?: boolean; hasDefault?: boolean; identity?: boolean; generated?: boolean }[]; foreignKeys: Array<{ column: string; referencedSchema: string; referencedTable: string; referencedColumn: string }>; accent: string; groupName?: string; groupColor?: string };
const ColumnSelectionContext = createContext<(tableId: string, columnName: string) => void>(() => {});
const EdgeSelectionContext = createContext<(edgeId: string) => void>(() => {});
const GroupToggleContext = createContext<(groupId: string) => void>(() => {});
const TableGroupContext = createContext<{ groups: SchemaTableGroup[]; assign: (tableId: string, groupId: string | null) => void }>({ groups: [], assign: () => {} });
type TableMenuActions = { openData: (tableId: string) => void; openSql: (tableId: string) => void; copyName: (tableId: string) => void; deleteTable: (tableId: string) => void };
const TableMenuContext = createContext<TableMenuActions>({ openData: () => {}, openSql: () => {}, copyName: () => {}, deleteTable: () => {} });
type LiveSchema = {
  engine: 'postgres' | 'mysql';
  database: string;
  introspectedAt: string;
  tables: Array<{
    schema: string;
    name: string;
    columns: Array<{ name: string; type: string; key?: 'pk' | 'fk' | 'pk-fk'; generated?: boolean; identity?: boolean; hasDefault?: boolean; nullable?: boolean; unique?: boolean; referenceable?: boolean }>;
    foreignKeys: Array<{ column: string; referencedSchema: string; referencedTable: string; referencedColumn: string; onDelete?: string; onUpdate?: string }>;
  }>;
};
type LiveRecordsPage = {
  schema: string;
  table: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  rows: Array<Record<string, unknown>>;
};
type LiveRecordSort = { column: string; direction: 'asc' | 'desc' };
type SqlWorkspaceResult = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  source: 'database' | 'demo';
};

function TableNode({ data, id }: { data: any; id: string }) {
  const selectColumn = useContext(ColumnSelectionContext);
  const tableActions = useContext(TableMenuContext);
  const tableGroups = useContext(TableGroupContext);
  const assignedGroup = tableGroups.groups.find((group) => group.tableIds.includes(id));
  const [detail, setDetail] = useState<{ column: TableNodeData['columns'][number]; bounds: DOMRect } | null>(null);
  const [tableMenu, setTableMenu] = useState<{ left: number; top: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const showDetail = (column: TableNodeData['columns'][number], element: HTMLElement) => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    setDetail({ column, bounds: element.getBoundingClientRect() });
  };
  const scheduleClose = () => { closeTimer.current = window.setTimeout(() => setDetail(null), 150); };
  const foreignKey = detail && data.foreignKeys?.find((item: TableNodeData['foreignKeys'][number]) => item.column === detail.column.name);
  const keyConstraints = detail ? [
    ...(detail.column.key === 'pk' || detail.column.key === 'pk-fk' ? ['Primary key'] : []),
    ...(detail.column.key === 'fk' || detail.column.key === 'pk-fk' ? ['Foreign key'] : []),
    ...(detail.column.unique ? ['Unique'] : []),
  ] : [];
  const tooltip = detail ? createPortal(<div className="column-detail-popover" role="tooltip" onMouseEnter={() => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); }} onMouseLeave={scheduleClose} style={{ left: Math.min(detail.bounds.right + 10, window.innerWidth - 282), top: Math.max(12, Math.min(detail.bounds.top - 8, window.innerHeight - 230)) }}>
    <div className="column-detail-heading"><strong>{detail.column.name}</strong><code>{detail.column.type}</code></div>
    <div className="column-detail-list">
      <span><b>Nullable</b>{detail.column.nullable === undefined ? 'Not available' : detail.column.nullable ? 'Yes' : 'No · NOT NULL'}</span>
      <span><b>Default</b>{detail.column.hasDefault === undefined ? 'Not available' : detail.column.hasDefault ? 'Configured' : 'None'}</span>
      <span><b>Key</b>{keyConstraints.length ? keyConstraints.join(' · ') : 'None'}</span>
      <span><b>Generated</b>{detail.column.identity ? 'Identity' : detail.column.generated ? 'Generated' : detail.column.identity === undefined && detail.column.generated === undefined ? 'Not available' : 'No'}</span>
      {foreignKey && <span className="column-detail-reference"><b>References</b>{foreignKey.referencedSchema}.{foreignKey.referencedTable}.{foreignKey.referencedColumn}</span>}
    </div>
  </div>, document.body) : null;
  return <div className={`table-node${assignedGroup ? ' has-table-group' : ''}`} style={assignedGroup ? { '--table-group-color': assignedGroup.color } as React.CSSProperties : undefined}>
    <Handle type="target" position={Position.Left} className="node-handle" />
    <div className="table-node-head"><div className="table-icon"><Table2 size={14} /></div><div className="table-head-copy"><strong>{data.label}</strong><div className="table-meta-row"><span>{data.subtitle}</span>{assignedGroup && <span className="table-group-badge" style={{ '--group-color': assignedGroup.color } as React.CSSProperties}><span className="table-group-badge-dot"/>{assignedGroup.name}</span>}</div></div><button className="table-menu-trigger nodrag nopan" aria-label={`Open actions for ${data.label}`} aria-haspopup="menu" aria-expanded={Boolean(tableMenu)} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setTableMenu((current) => current ? null : { left: Math.min(bounds.right - 190, window.innerWidth - 198), top: bounds.bottom + 7 }); }}><Ellipsis size={17}/></button>
      {tableMenu && createPortal(<div className="table-context-menu" role="menu" aria-label={`${data.label} actions`} style={{ left: Math.max(8, tableMenu.left), top: tableMenu.top }}>
        <button role="menuitem" onClick={(event) => { event.stopPropagation(); setTableMenu(null); tableActions.openData(id); }}><Eye size={14}/> View table data</button>
        <button role="menuitem" onClick={(event) => { event.stopPropagation(); setTableMenu(null); tableActions.openSql(id); }}><FileCode2 size={14}/> Open in SQL workspace</button>
        <button role="menuitem" onClick={(event) => { event.stopPropagation(); setTableMenu(null); tableActions.copyName(id); }}><Copy size={14}/> Copy qualified name</button>
        <div className="table-menu-separator" role="separator"/>
        <div className="table-group-menu" role="group" aria-label="Assign table to group"><small>Move to group</small>{tableGroups.groups.map((group) => <button role="menuitem" key={group.id} onClick={(event) => { event.stopPropagation(); tableGroups.assign(id, group.id); setTableMenu(null); }}><span className="group-color-dot" style={{ '--group-color': group.color } as React.CSSProperties}/>{group.name}{assignedGroup?.id === group.id && <Check size={12}/>}</button>)}<button role="menuitem" onClick={(event) => { event.stopPropagation(); tableGroups.assign(id, null); setTableMenu(null); }}><span className="group-color-dot unassigned"/>Unassigned{!assignedGroup && <Check size={12}/>}</button></div>
        <div className="table-menu-separator" role="separator"/>
        <button className="table-menu-danger" role="menuitem" onClick={(event) => { event.stopPropagation(); setTableMenu(null); tableActions.deleteTable(id); }}><Trash2 size={14}/> Delete table…</button>
      </div>, document.body)}
    </div>
    <div className="table-node-columns">{data.columns.map((col: TableNodeData['columns'][number]) => <div className={`node-column nodrag nopan${data.selectedColumn === col.name ? ' column-selected' : ''}`} key={col.name} role="button" tabIndex={0} aria-pressed={data.selectedColumn === col.name} aria-label={`${col.name}, ${col.type}. Select to inspect column properties.`} onClick={() => selectColumn(id, col.name)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectColumn(id, col.name); } }} onMouseEnter={(event) => showDetail(col, event.currentTarget)} onMouseLeave={scheduleClose} onFocus={(event) => showDetail(col, event.currentTarget)} onBlur={scheduleClose}><span className="column-symbol">{col.key === 'pk-fk' ? <><KeyRound size={10}/><Link2 size={10}/></> : col.key === 'pk' ? <KeyRound size={11}/> : col.key === 'fk' ? <Link2 size={11}/> : <span className="tiny-dot"/>}</span><span className="column-name">{col.name}</span><span className="column-type">{col.type}</span></div>)}</div>
    <div className="table-node-foot"><span><span className="status-dot" /> Synced</span><span>{data.columns.length} columns</span></div>
    <Handle type="source" position={Position.Right} className="node-handle" />
    {tooltip}
  </div>;
}
function TableGroupNode({ id, data }: { id: string; data: { label: string; color: string; count: number } }) {
  const toggle = useContext(GroupToggleContext);
  const groupId = id.replace(/^group:/, '');
  return <div className="table-group-node" role="group" aria-label={`Collapsed group ${data.label}`} style={{ '--group-color': data.color } as React.CSSProperties}><Handle type="target" position={Position.Left} className="group-handle"/><button className="group-node-main nodrag nopan" aria-label={`${data.label}, ${data.count} tables collapsed. Expand group.`} onClick={(event) => { event.stopPropagation(); toggle(groupId); }}><span className="group-node-dot"/><strong>{data.label}</strong><span className="group-node-count">{data.count} tables · collapsed</span><span className="group-expand-button">Expand group</span></button><Handle type="source" position={Position.Right} className="group-handle"/></div>;
}
const nodeTypes: NodeTypes = { tableNode: TableNode, tableGroup: TableGroupNode };
function RelationshipEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, label } = props;
  const selectEdge = useContext(EdgeSelectionContext);
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 });
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
  const labelText = typeof label === 'string' ? label : '';
  const hidden = distance < 155;
  const maxWidth = Math.max(112, Math.min(340, distance * 0.82));
  return <>
    <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd}/>
    {!hidden && labelText && <EdgeLabelRenderer><div className="relationship-edge-label" role="button" tabIndex={0} aria-label={`Inspect relationship: ${labelText}`} title="Click to inspect relationship" style={{ left: labelX, top: labelY, maxWidth }} onClick={(event) => { event.stopPropagation(); selectEdge(id); }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectEdge(id); } }}><span>{labelText}</span></div></EdgeLabelRenderer>}
  </>;
}
const edgeTypes = { relationshipEdge: RelationshipEdge };
const schemaTableId = (schema: string, table: string) => JSON.stringify([schema, table]);

function BrandMark() {
  return <svg aria-hidden="true" viewBox="0 0 36 36" fill="none">
    <path d="M7.25 10.25c0-2.05 4.82-3.72 10.75-3.72s10.75 1.67 10.75 3.72S23.93 14 18 14 7.25 12.3 7.25 10.25Z" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M7.25 10.4v6.1c0 2.05 4.82 3.72 10.75 3.72 1.5 0 2.92-.13 4.18-.36M7.25 16.3c0 2.05 4.82 3.72 10.75 3.72" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M7.25 16.4v6.05c0 2.05 4.82 3.72 10.75 3.72 1.28 0 2.5-.1 3.62-.29" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M18 20.1h3.2c2.1 0 3.8-1.7 3.8-3.8v-1.1h3.5m-2.1-1.8 2.1 1.8-2.1 1.8" stroke="#BDEFD9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

const schemaLayoutKey = (scope: string) => `dbflow.schema-layout.v1:${scope}`;

function loadSchemaLayout(scope: string, legacyScope?: string): Record<string, SchemaPosition> {
  try {
    const legacyKey = legacyScope ? schemaLayoutKey(legacyScope) : undefined;
    const value = JSON.parse(readSchemaPreference(schemaLayoutKey(scope), '{}', legacyKey)) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, position]) => {
      if (!position || typeof position !== 'object') return false;
      const candidate = position as SchemaPosition;
      return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
    })) as Record<string, SchemaPosition>;
  } catch { return {}; }
}

function makeSchemaGraph(schema: LiveSchema, savedPositions: Record<string, SchemaPosition> = {}) {
  const defaultPositions = layoutSchemaTables(schema.tables);
  const nodes: Node[] = schema.tables.map((table, index) => ({
    id: schemaTableId(table.schema, table.name), type: 'tableNode',
    position: savedPositions[schemaTableId(table.schema, table.name)] ?? defaultPositions[schemaTableId(table.schema, table.name)] ?? { x: 50 + index * 495, y: 40 },
    data: { label: table.name, subtitle: `${table.schema} · table`, accent: 'blue', columns: table.columns, foreignKeys: table.foreignKeys },
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const relationships = new Map<string, { source: string; target: string; labels: Set<string> }>();
  for (const table of schema.tables) for (const foreignKey of table.foreignKeys) {
    const source = schemaTableId(foreignKey.referencedSchema, foreignKey.referencedTable);
    const target = schemaTableId(table.schema, table.name);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    const key = JSON.stringify([source, target]);
    const relationship = relationships.get(key) ?? { source, target, labels: new Set<string>() };
    relationship.labels.add(`${foreignKey.column} → ${foreignKey.referencedSchema}.${foreignKey.referencedTable}.${foreignKey.referencedColumn}`);
    relationships.set(key, relationship);
  }
  const edges: Edge[] = [...relationships.values()].map(({ source, target, labels }) => ({
    id: `fk:${source}:${target}`, source, target, type: 'relationshipEdge', label: [...labels].join('   ·   '),
    style: { stroke: '#3569c8', strokeWidth: 1.7 },
  } as Edge));
  return { nodes, edges };
}

function quoteSqlIdentifier(identifier: string, engine: LiveSchema['engine']) {
  return engine === 'postgres' ? `"${identifier.replaceAll('"', '""')}"` : `\`${identifier.replaceAll('`', '``')}\``;
}

function addColumnStarterSql(table: Pick<LiveSchema['tables'][number], 'schema' | 'name'>, engine: LiveSchema['engine']) {
  return `ALTER TABLE ${quoteSqlIdentifier(table.schema, engine)}.${quoteSqlIdentifier(table.name, engine)} ADD COLUMN ${quoteSqlIdentifier('new_column', engine)} TEXT;`;
}

const initialNodes: Node[] = [
  { id: 'users', type: 'tableNode', position: { x: 90, y: 80 }, data: { label: 'users', subtitle: 'public · table', accent: 'violet', columns: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'full_name', type: 'varchar(120)' }, { name: 'email', type: 'varchar(255)' }, { name: 'created_at', type: 'timestamp' }] } },
  { id: 'orders', type: 'tableNode', position: { x: 430, y: 210 }, data: { label: 'orders', subtitle: 'public · table', accent: 'blue', columns: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'user_id', type: 'uuid', key: 'fk' }, { name: 'total', type: 'numeric(10,2)' }, { name: 'status', type: 'varchar(24)' }] } },
  { id: 'order_items', type: 'tableNode', position: { x: 430, y: 80 }, data: { label: 'order_items', subtitle: 'public · table', accent: 'mint', columns: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'order_id', type: 'uuid', key: 'fk' }, { name: 'product_id', type: 'uuid', key: 'fk' }, { name: 'quantity', type: 'integer' }] } },
  { id: 'products', type: 'tableNode', position: { x: 90, y: 380 }, data: { label: 'products', subtitle: 'public · table', accent: 'orange', columns: [{ name: 'id', type: 'uuid', key: 'pk' }, { name: 'name', type: 'varchar(180)' }, { name: 'price', type: 'numeric(10,2)' }, { name: 'stock', type: 'integer' }] } },
];
const initialEdges: Edge[] = [
  { id: 'e1', source: 'users', target: 'orders', label: '1 : N', type: 'smoothstep', animated: false, style: { stroke: '#7771e8', strokeWidth: 1.7 }, labelStyle: { fill: '#b7b5d8', fontSize: 10 }, labelBgStyle: { fill: '#ffffff', fillOpacity: 1 } },
  { id: 'e2', source: 'orders', target: 'order_items', label: '1 : N', type: 'smoothstep', style: { stroke: '#7771e8', strokeWidth: 1.7 }, labelStyle: { fill: '#b7b5d8', fontSize: 10 }, labelBgStyle: { fill: '#ffffff', fillOpacity: 1 } },
  { id: 'e3', source: 'products', target: 'order_items', label: '1 : N', type: 'smoothstep', style: { stroke: '#7771e8', strokeWidth: 1.7 }, labelStyle: { fill: '#b7b5d8', fontSize: 10 }, labelBgStyle: { fill: '#ffffff', fillOpacity: 1 } },
];

const sampleRows = [
  { id: 'ORD-1042', user_id: 'USR-0081', total: 249.99, status: 'completed', created_at: '2026-10-18 09:42:18' },
  { id: 'ORD-1041', user_id: 'USR-0024', total: 89.5, status: 'processing', created_at: '2026-10-18 09:38:03' },
  { id: 'ORD-1040', user_id: 'USR-0145', total: 1299.0, status: 'completed', created_at: '2026-10-18 09:21:47' },
  { id: 'ORD-1039', user_id: 'USR-0019', total: 42.0, status: 'pending', created_at: '2026-10-18 08:56:12' },
  { id: 'ORD-1038', user_id: 'USR-0081', total: 315.75, status: 'completed', created_at: '2026-10-17 22:14:52' },
  { id: 'ORD-1037', user_id: 'USR-0033', total: 78.25, status: 'cancelled', created_at: '2026-10-17 21:50:10' },
  { id: 'ORD-1036', user_id: 'USR-0090', total: 512.0, status: 'processing', created_at: '2026-10-17 21:02:37' },
  { id: 'ORD-1035', user_id: 'USR-0011', total: 159.99, status: 'completed', created_at: '2026-10-17 19:48:21' },
];
const initialSql = `SELECT *\nFROM orders\nLIMIT 100;`;

type Section = 'overview' | 'schema' | 'data' | 'sql' | 'learning';
function App() {
  const [section, setSection] = useState<Section>('schema');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const [activeTable, setActiveTable] = useState('orders');
  const [sql, setSql] = useState(initialSql);
  const [sqlResult, setSqlResult] = useState<SqlWorkspaceResult | null>(null);
  const [sqlBusy, setSqlBusy] = useState(false);
  const [sqlError, setSqlError] = useState('');
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>(() => loadQueryHistory());
  const [searchText, setSearchText] = useState('');
  const [showConnection, setShowConnection] = useState(false);
  const [connectionEngine, setConnectionEngine] = useState<'postgres' | 'mysql'>('postgres');
  const [connectionForm, setConnectionForm] = useState({ host: 'localhost', port: '5432', database: 'postgres', username: 'postgres', password: '', ssl: false });
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionResult, setConnectionResult] = useState('');
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [liveConnectionId, setLiveConnectionId] = useState<string | null>(null);
  const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);
  const [liveRecords, setLiveRecords] = useState<LiveRecordsPage | null>(null);
  const [liveSort, setLiveSort] = useState<LiveRecordSort | null>(null);
  const [selectedLiveRow, setSelectedLiveRow] = useState<Record<string, unknown> | null>(null);
  const [showEditRecord, setShowEditRecord] = useState(false);
  const [showInsertRecord, setShowInsertRecord] = useState(false);
  const [showDeleteRecord, setShowDeleteRecord] = useState(false);
  const [recordsBusy, setRecordsBusy] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const recordsRequestId = useRef(0);
  const requestedRecordsSearch = useRef('');
  const columnInspectorRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState('');
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [schemaFilter, setSchemaFilter] = useState<'all' | 'related' | 'isolated'>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [schemaGroups, setSchemaGroups] = useState<SchemaTableGroup[]>(() => loadSchemaGroups('demo:commerce_demo'));
  const [schemaGroupScope, setSchemaGroupScope] = useState('demo:commerce_demo');
  const [showSchemaGroups, setShowSchemaGroups] = useState(false);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [schemaChangePlan, setSchemaChangePlan] = useState<StagedSchemaChange[]>([]);
  const [showSchemaChangePlan, setShowSchemaChangePlan] = useState(false);
  const [schemaFlow, setSchemaFlow] = useState<ReactFlowInstance | null>(null);
  const [liveSchema, setLiveSchema] = useState<LiveSchema | null>(null);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showAddColumnReview, setShowAddColumnReview] = useState(false);
  const [addColumnSql, setAddColumnSql] = useState('');
  const [showNullabilityReview, setShowNullabilityReview] = useState(false);
  const [nullabilitySql, setNullabilitySql] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<{ tableId: string; name: string } | null>(null);
  const [editingColumn, setEditingColumn] = useState(false);
  const [columnEditProperty, setColumnEditProperty] = useState<'nullability' | 'default'>('nullability');
  const [columnNullableValue, setColumnNullableValue] = useState(true);
  const [columnDefaultAction, setColumnDefaultAction] = useState<'set' | 'remove'>('set');
  const [columnDefaultValue, setColumnDefaultValue] = useState('');
  const [relationshipTables, setRelationshipTables] = useState<{ referenced: string; referencing: string } | null>(null);
  const [deleteTableId, setDeleteTableId] = useState<string | null>(null);
  const [schemaNotice, setSchemaNotice] = useState('');
  const [schemaRefreshTarget, setSchemaRefreshTarget] = useState<{ schema: string; table: string; column?: string } | null>(null);
  const [schemaRefreshBusy, setSchemaRefreshBusy] = useState(false);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const assignTableGroup = (tableId: string, groupId: string | null) => setSchemaGroups((current) => current.map((group) => ({ ...group, tableIds: group.id === groupId ? [...new Set([...group.tableIds, tableId])] : group.tableIds.filter((id) => id !== tableId) })));
  const toggleSchemaGroup = (groupId: string) => setSchemaGroups((current) => current.map((group) => group.id === groupId ? { ...group, collapsed: !group.collapsed } : group));
  const createSchemaGroup = (name: string, color: string) => setSchemaGroups((current) => [...current, { id: crypto.randomUUID(), name, color, tableIds: [], collapsed: false }]);
  const updateSchemaGroup = (groupId: string, patch: Partial<Pick<SchemaTableGroup, 'name' | 'color'>>) => setSchemaGroups((current) => current.map((group) => group.id === groupId ? { ...group, ...patch } : group));
  const deleteSchemaGroup = (groupId: string) => setSchemaGroups((current) => current.filter((group) => group.id !== groupId));
  useEffect(() => { writeSchemaPreference(schemaGroupsStorageKey(schemaGroupScope), JSON.stringify(schemaGroups)); }, [schemaGroupScope, schemaGroups]);
  const stageSchemaPlanEntry = (change: Parameters<typeof stageSchemaChange>[0]) => setSchemaChangePlan((current) => [...current, stageSchemaChange(change)]);
  const applyCompletedSchemaPlan = async (applied: StagedSchemaChange[]) => {
    const completed = new Set(applied.map((change) => change.id));
    setSchemaChangePlan((current) => current.filter((change) => !completed.has(change.id)));
    await refreshLiveSchema();
  };
  const recordQuery = (entry: Parameters<typeof rememberQuery>[1]) => {
    setQueryHistory((current) => {
      const next = rememberQuery(current, entry);
      saveQueryHistory(next);
      return next;
    });
  };
  const selectedLiveTable = liveSchema?.tables.find((table) => schemaTableId(table.schema, table.name) === activeTable);
  const selectedLiveColumn = selectedColumn?.tableId === activeTable ? selectedLiveTable?.columns.find((column) => column.name === selectedColumn.name) : undefined;
  useEffect(() => {
    if (!selectedColumn || !selectedLiveColumn) return;
    const frame = window.requestAnimationFrame(() => columnInspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedColumn, selectedLiveColumn, editingColumn]);
  const liveForeignKeyCount = selectedLiveTable?.foreignKeys.length ?? 0;
  const normalizedSchemaSearch = schemaSearch.trim().toLocaleLowerCase();
  const relationshipSearchNodeIds = new Set(normalizedSchemaSearch ? edges.filter((edge) => {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    const sourceData = source?.data as { label?: string; subtitle?: string } | undefined;
    const targetData = target?.data as { label?: string; subtitle?: string } | undefined;
    return `${String(edge.label ?? '')} ${sourceData?.label ?? ''} ${sourceData?.subtitle ?? ''} ${targetData?.label ?? ''} ${targetData?.subtitle ?? ''}`.toLocaleLowerCase().includes(normalizedSchemaSearch);
  }).flatMap((edge) => [edge.source, edge.target]) : []);
  const matchingSchemaNodes = nodes.filter((node) => {
    const text = normalizedSchemaSearch;
    const table = liveSchema?.tables.find((item) => schemaTableId(item.schema, item.name) === node.id);
    const demoData = node.data as { label?: string; columns?: Array<{ name: string; type: string }> };
    const columns = table?.columns ?? demoData.columns ?? [];
    const matchesSearch = !text || relationshipSearchNodeIds.has(node.id) || `${table?.schema ?? ''} ${table?.name ?? demoData.label ?? ''} ${columns.map((column) => `${column.name} ${column.type}`).join(' ')}`.toLocaleLowerCase().includes(text);
    const related = edges.some((edge) => edge.source === node.id || edge.target === node.id);
    return matchesSearch && (schemaFilter === 'all' || (schemaFilter === 'related' ? related : !related));
  });
  const schemaNodeIds = new Set(matchingSchemaNodes.map((node) => node.id));
  const collapsedSchemaGroups = schemaGroups.filter((group) => group.collapsed && group.tableIds.some((id) => schemaNodeIds.has(id)));
  const collapsedGroupForTable = new Map(collapsedSchemaGroups.flatMap((group) => group.tableIds.map((tableId) => [tableId, group] as const)));
  const visibleSchemaNodes: Node[] = [
    ...matchingSchemaNodes.filter((node) => !collapsedGroupForTable.has(node.id)).map((node) => ({ ...node, data: { ...node.data, groupName: schemaGroups.find((group) => group.tableIds.includes(node.id))?.name, groupColor: schemaGroups.find((group) => group.tableIds.includes(node.id))?.color } })),
    ...collapsedSchemaGroups.map((group) => {
      const members = matchingSchemaNodes.filter((node) => group.tableIds.includes(node.id));
      const position = members.length ? { x: members.reduce((total, node) => total + node.position.x, 0) / members.length, y: members.reduce((total, node) => total + node.position.y, 0) / members.length } : { x: 0, y: 0 };
      return { id: `group:${group.id}`, type: 'tableGroup', position, draggable: false, selectable: false, data: { label: group.name, color: group.color, count: members.length } } as Node;
    }),
  ];
  const visibleSchemaEdges = edges.filter((edge) => schemaNodeIds.has(edge.source) && schemaNodeIds.has(edge.target)).flatMap((edge) => {
    const sourceGroup = collapsedGroupForTable.get(edge.source);
    const targetGroup = collapsedGroupForTable.get(edge.target);
    if (sourceGroup && targetGroup && sourceGroup.id === targetGroup.id) return [];
    return [{ ...edge, source: sourceGroup ? `group:${sourceGroup.id}` : edge.source, target: targetGroup ? `group:${targetGroup.id}` : edge.target }];
  });
  const selectedRelationship = selectedRelationshipId ? edges.find((edge) => edge.id === selectedRelationshipId) : undefined;
  const schemaReviewWarnings = liveSchema ? (() => {
    const tableIds = new Set(liveSchema.tables.map((table) => schemaTableId(table.schema, table.name)));
    const relatedTableIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    return [
      ...liveSchema.tables.filter((table) => !table.columns.some((column) => column.key === 'pk' || column.key === 'pk-fk')).map((table) => ({ kind: 'No primary key', table: `${table.schema}.${table.name}` })),
      ...liveSchema.tables.flatMap((table) => table.foreignKeys.filter((foreignKey) => !tableIds.has(schemaTableId(foreignKey.referencedSchema, foreignKey.referencedTable))).map((foreignKey) => ({ kind: 'Reference not visible', table: `${table.schema}.${table.name} · ${foreignKey.column} → ${foreignKey.referencedSchema}.${foreignKey.referencedTable}` }))),
      ...liveSchema.tables.filter((table) => !relatedTableIds.has(schemaTableId(table.schema, table.name))).map((table) => ({ kind: 'No relationships', table: `${table.schema}.${table.name}` })),
    ];
  })() : [];
  const schemaOverviewTables = liveSchema?.tables ?? nodes.map((node) => ({ columns: (node.data as { columns?: unknown[] }).columns ?? [] }));
  const schemaOverviewColumnCount = schemaOverviewTables.reduce((total, table) => total + table.columns.length, 0);
  const schemaOverviewRelationshipCount = liveSchema ? liveSchema.tables.reduce((total, table) => total + table.foreignKeys.length, 0) : edges.length;
  const selectedRelationshipForeignKeys = selectedRelationship && liveSchema ? liveSchema.tables.flatMap((table) => table.foreignKeys.filter((foreignKey) => schemaTableId(foreignKey.referencedSchema, foreignKey.referencedTable) === selectedRelationship.source && schemaTableId(table.schema, table.name) === selectedRelationship.target).map((foreignKey) => ({ ...foreignKey, referencingSchema: table.schema, referencingTable: table.name }))) : [];
  useEffect(() => {
    if (!liveSchema || !schemaFlow) return;
    const timer = window.setTimeout(() => { void schemaFlow.fitView({ padding: 0.12 }); }, 120);
    return () => window.clearTimeout(timer);
  }, [liveSchema, schemaFlow]);
  const onNodesChange = useCallback((changes: any[]) => {
    setNodes((currentNodes) => {
      let next = currentNodes;
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) next = next.map((node) => node.id === change.id ? { ...node, position: change.position } : node);
        if (change.type === 'select') next = next.map((node) => node.id === change.id ? { ...node, selected: change.selected } : node);
      });
      return next;
    });
    const moved = changes.filter((change) => change.type === 'position' && change.position);
    if (liveSchema && moved.length) {
      const positions = loadSchemaLayout(schemaGroupScope, `${liveSchema.engine}:${liveSchema.database}`);
      for (const change of moved) positions[change.id] = change.position;
      writeSchemaPreference(schemaLayoutKey(schemaGroupScope), JSON.stringify(positions));
    }
  }, [liveSchema, schemaGroupScope]);
  const onEdgesChange = useCallback((changes: any[]) => setEdges((eds) => eds.filter((edge) => !changes.some((change) => change.id === edge.id && change.type === 'remove'))), []);
  const colDefs = useMemo(() => [
    { field: 'id', headerName: 'ORDER ID', minWidth: 140, flex: 1, cellClass: 'mono-cell' },
    { field: 'user_id', headerName: 'USER ID', minWidth: 130, flex: 1, cellClass: 'mono-cell' },
    { field: 'total', headerName: 'TOTAL', minWidth: 100, flex: 0.8, valueFormatter: (p: any) => `$${Number(p.value).toFixed(2)}` },
    { field: 'status', headerName: 'STATUS', minWidth: 125, flex: 0.9, cellRenderer: (p: any) => <span className={`status-pill ${p.value}`}>{p.value}</span> },
    { field: 'created_at', headerName: 'CREATED AT', minWidth: 180, flex: 1.2, cellClass: 'mono-cell' },
  ], []);
  const liveRecordTable = liveRecords && liveSchema?.tables.find((table) => table.schema === liveRecords.schema && table.name === liveRecords.table);
  const livePrimaryKeyColumns = liveRecordTable?.columns.filter((column) => column.key === 'pk' || column.key === 'pk-fk') ?? [];
  const liveDeleteSupported = Boolean(selectedLiveRow && livePrimaryKeyColumns.length && Object.values(selectedLiveRow).every((value) => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))));
  const liveColDefs = useMemo(() => liveRecordTable?.columns.map((column) => ({
    field: column.name,
    headerName: column.name.replaceAll('_', ' ').toUpperCase(),
    minWidth: 130,
    flex: 1,
    cellClass: 'mono-cell',
  })) ?? [], [liveRecordTable]);
  const sqlColDefs = useMemo(() => sqlResult?.columns.map((column) => ({
    field: column,
    headerName: column.replaceAll('_', ' ').toUpperCase(),
    minWidth: 130,
    flex: 1,
    cellClass: 'mono-cell',
  })) ?? [], [sqlResult]);
  const demoFilteredRows = sampleRows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(searchText.toLowerCase())));
  const liveFilteredRows = liveRecords?.rows ?? [];

  const navItems: { key: Section; label: string; icon: any; group: string }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
    { key: 'schema', label: 'Schema designer', icon: GitBranch, group: 'WORKSPACE' },
    { key: 'data', label: 'Data explorer', icon: Table2, group: 'WORKSPACE' },
    { key: 'sql', label: 'SQL workspace', icon: TerminalSquare, group: 'WORKSPACE' },
    { key: 'learning', label: 'Learn databases', icon: GraduationCap, group: 'LEARN' },
  ];
  const title = ({ overview: 'Overview', schema: 'Schema designer', data: 'Data explorer', sql: 'SQL workspace', learning: 'Learn databases' } as Record<Section, string>)[section];
  const runQuery = async () => {
    setSqlError('');
    if (!liveConnectionId || !liveSchema) {
      const demoResult: SqlWorkspaceResult = { columns: Object.keys(sampleRows[0] ?? {}), rows: sampleRows, rowCount: sampleRows.length, truncated: false, elapsedMs: 0, source: 'demo' };
      setSqlResult(demoResult);
      recordQuery({ sql, outcome: 'demo', rowCount: demoResult.rowCount });
      return;
    }
    setSqlBusy(true);
    setSqlResult(null);
    try {
      const response = await fetch('http://localhost:4000/api/connections/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: liveConnectionId, query: sql }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 410) resetLiveDatabase();
        throw new Error(payload.error ?? 'The database rejected this query.');
      }
      const result = { ...payload, source: 'database' } as SqlWorkspaceResult;
      setSqlResult(result);
      recordQuery({ sql, outcome: 'database', rowCount: result.rowCount, truncated: result.truncated });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not run this query.';
      setSqlError(message);
      recordQuery({ sql, outcome: 'error', error: message });
    } finally {
      setSqlBusy(false);
    }
  };
  const updateConnectionField = (field: string, value: string | boolean) => {
    if (pendingConnectionId) {
      void fetch(`http://localhost:4000/api/connections/${pendingConnectionId}`, { method: 'DELETE' }).catch(() => undefined);
      setPendingConnectionId(null);
    }
    setConnectionForm((current) => ({ ...current, [field]: value, ...(field === 'port' && value === '5432' ? { database: current.database } : {}) }));
    setConnectionResult('');
    setConnectionVerified(false);
  };
  const selectConnectionEngine = (engine: 'postgres' | 'mysql') => {
    if (pendingConnectionId) {
      void fetch(`http://localhost:4000/api/connections/${pendingConnectionId}`, { method: 'DELETE' }).catch(() => undefined);
      setPendingConnectionId(null);
    }
    setConnectionEngine(engine);
    setConnectionForm((current) => ({ ...current, port: engine === 'postgres' ? '5432' : '3306' }));
    setConnectionResult('');
    setConnectionVerified(false);
  };
  const submitConnectionTest = async (event: React.FormEvent) => {
    event.preventDefault(); setConnectionBusy(true); setConnectionResult(''); setConnectionVerified(false);
    try {
      const previousPendingConnectionId = pendingConnectionId;
      const response = await fetch('http://localhost:4000/api/connections/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...connectionForm, port: Number(connectionForm.port), engine: connectionEngine }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Connection test failed');
      setConnectionResult(`Connected successfully · ${payload.serverVersion} · ${payload.latencyMs} ms`);
      setPendingConnectionId(payload.connectionId);
      if (previousPendingConnectionId && previousPendingConnectionId !== payload.connectionId) {
        void fetch(`http://localhost:4000/api/connections/${previousPendingConnectionId}`, { method: 'DELETE' }).catch(() => undefined);
      }
      setConnectionVerified(true);
    } catch (error) { setConnectionResult(error instanceof Error ? error.message : 'Could not reach the local API. Start the backend with npm run dev.'); }
    finally { setConnectionBusy(false); }
  };
  const closeConnectionDialog = () => {
    setShowConnection(false);
    setConnectionForm((current) => ({ ...current, username: '', password: '' }));
    setConnectionResult('');
  };
  const resetLiveDatabase = () => {
    const demoScope = 'demo:commerce_demo';
    setLiveConnectionId(null);
    setPendingConnectionId(null);
    setConnectionVerified(false);
    setLiveSchema(null);
    setSchemaNotice('');
    setSchemaRefreshTarget(null);
    setSchemaGroupScope(demoScope);
    setSchemaGroups(loadSchemaGroups(demoScope));
    setSchemaChangePlan([]);
    setShowSchemaChangePlan(false);
    setLiveRecords(null);
    setSelectedLiveRow(null);
    setSqlResult(null);
    setNodes(initialNodes);
    setEdges(initialEdges);
    setActiveTable('orders');
  };
  const disconnectDatabase = async () => {
    const connectionIds = new Set([liveConnectionId, pendingConnectionId].filter((id): id is string => Boolean(id)));
    for (const connectionId of connectionIds) {
      await fetch(`http://localhost:4000/api/connections/${connectionId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    resetLiveDatabase();
    setPendingConnectionId(null);
    setConnectionVerified(false);
    setSection('schema');
    notify('Database session closed · demo schema restored');
  };
  const refreshSchemaAfterCreate = async (schemaName: string, tableName: string) => {
    if (!liveConnectionId) return;
    try {
      const response = await fetch('http://localhost:4000/api/connections/introspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: liveConnectionId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Schema refresh failed');
      const schema = payload as LiveSchema;
      const graph = makeSchemaGraph(schema, loadSchemaLayout(schemaGroupScope, `${schema.engine}:${schema.database}`));
      setSchemaGroups(loadSchemaGroups(schemaGroupScope).map((group) => ({ ...group, tableIds: group.tableIds.filter((id) => schema.tables.some((table) => schemaTableId(table.schema, table.name) === id)) })));
      setLiveSchema(schema); setNodes(graph.nodes); setEdges(graph.edges);
      const createdTableIsVisible = schema.tables.some((table) => table.schema === schemaName && table.name === tableName);
      setActiveTable(createdTableIsVisible ? schemaTableId(schemaName, tableName) : schema.tables[0] ? schemaTableId(schema.tables[0].schema, schema.tables[0].name) : '');
      setLiveRecords(null); setSqlResult(null); setSqlError(''); setRecordsError(''); setSchemaNotice(''); setSection('schema');
      if (createdTableIsVisible) {
        setSchemaRefreshTarget(null);
        notify(`Created and verified ${schemaName}.${tableName}`);
      } else {
        setSchemaNotice(`Created ${schemaName}.${tableName}, but it is not visible in schema introspection. Refresh schema to verify it.`);
        setSchemaRefreshTarget({ schema: schemaName, table: tableName });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'the database could not be read';
      setSchemaNotice(`Created ${schemaName}.${tableName}, but schema refresh failed: ${detail}. Refresh schema to verify the result before retrying the change.`);
      setSchemaRefreshTarget({ schema: schemaName, table: tableName });
    }
  };
  const refreshSchemaAfterColumnChange = async (change: { schema: string; table: string; column: string }) => {
    if (!liveConnectionId) return;
    try {
      const response = await fetch('http://localhost:4000/api/connections/introspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: liveConnectionId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Schema refresh failed');
      const schema = payload as LiveSchema;
      const graph = makeSchemaGraph(schema, loadSchemaLayout(schemaGroupScope, `${schema.engine}:${schema.database}`));
      const updatedTable = schema.tables.find((table) => table.schema === change.schema && table.name === change.table);
      const columnVisible = updatedTable?.columns.some((column) => column.name === change.column) ?? false;
      setLiveSchema(schema); setNodes(graph.nodes); setEdges(graph.edges);
      setActiveTable(updatedTable ? schemaTableId(change.schema, change.table) : schema.tables[0] ? schemaTableId(schema.tables[0].schema, schema.tables[0].name) : '');
      setLiveRecords(null); setSqlResult(null); setSqlError(''); setRecordsError(''); setSection('schema');
      if (columnVisible) { setSchemaNotice(''); setSchemaRefreshTarget(null); notify(`Updated ${change.schema}.${change.table}.${change.column}`); }
      else {
        setSchemaNotice(`Updated ${change.column}, but it is not visible in schema introspection. Refresh schema to verify the change.`);
        setSchemaRefreshTarget({ schema: change.schema, table: change.table, column: change.column });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'the database could not be read';
      setSchemaNotice(`Updated ${change.schema}.${change.table}.${change.column}, but schema refresh failed: ${detail}. Refresh schema to verify the result before retrying the change.`);
      setSchemaRefreshTarget({ schema: change.schema, table: change.table, column: change.column });
      setSection('schema');
    }
  };
  const refreshSchemaAfterTableDrop = async (change: { schema: string; name: string }) => {
    if (!liveConnectionId || !liveSchema) return;
    const layout = loadSchemaLayout(schemaGroupScope, `${liveSchema.engine}:${liveSchema.database}`);
    delete layout[schemaTableId(change.schema, change.name)];
    try {
      const response = await fetch('http://localhost:4000/api/connections/introspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: liveConnectionId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Schema refresh failed');
      const schema = payload as LiveSchema;
      writeSchemaPreference(schemaLayoutKey(schemaGroupScope), JSON.stringify(layout));
      const graph = makeSchemaGraph(schema, layout);
      setLiveSchema(schema); setNodes(graph.nodes); setEdges(graph.edges);
      setSelectedColumn(null); setEditingColumn(false); setActiveTable(schema.tables[0] ? schemaTableId(schema.tables[0].schema, schema.tables[0].name) : '');
      setLiveRecords(null); setSqlResult(null); setSqlError(''); setRecordsError(''); setSection('schema');
      setSchemaNotice(''); setSchemaRefreshTarget(null); notify(`Deleted ${change.schema}.${change.name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'the database could not be read';
      setSchemaNotice(`Deleted ${change.schema}.${change.name}, but schema refresh failed: ${detail}. Refresh schema to verify the result.`);
      setSchemaRefreshTarget({ schema: change.schema, table: change.name }); setSection('schema');
    }
  };
  const refreshLiveSchema = async () => {
    if (!liveConnectionId) { setShowConnection(true); return; }
    setSchemaRefreshBusy(true);
    try {
      const response = await fetch('http://localhost:4000/api/connections/introspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: liveConnectionId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Schema refresh failed');
      const schema = payload as LiveSchema;
      const graph = makeSchemaGraph(schema, loadSchemaLayout(schemaGroupScope, `${schema.engine}:${schema.database}`));
      setLiveSchema(schema); setNodes(graph.nodes); setEdges(graph.edges);
      if (!schema.tables.some((table) => schemaTableId(table.schema, table.name) === activeTable)) setActiveTable(schema.tables[0] ? schemaTableId(schema.tables[0].schema, schema.tables[0].name) : '');
      const refreshedTable = schemaRefreshTarget && schema.tables.find((table) => table.schema === schemaRefreshTarget.schema && table.name === schemaRefreshTarget.table);
      const refreshTargetVisible = Boolean(refreshedTable && (!schemaRefreshTarget?.column || refreshedTable.columns.some((column) => column.name === schemaRefreshTarget.column)));
      if (schemaRefreshTarget && !refreshTargetVisible) {
        setSchemaNotice(`Refreshed schema, but ${schemaRefreshTarget.schema}.${schemaRefreshTarget.table}${schemaRefreshTarget.column ? `.${schemaRefreshTarget.column}` : ''} is not visible. Check database privileges or refresh again.`);
      } else {
        setSchemaNotice(''); setSchemaRefreshTarget(null);
      }
    } catch (error) {
      const previousNotice = schemaNotice.split(';')[0].trim();
      const detail = error instanceof Error ? error.message : 'could not read database schema';
      setSchemaNotice(`${previousNotice ? `${previousNotice} ` : ''}Schema refresh failed: ${detail}. The current view is retained; retry refresh to verify the database state.`);
    } finally { setSchemaRefreshBusy(false); }
  };
  const openTableDesigner = () => {
    if (!liveConnectionId || !liveSchema) {
      notify('Connect PostgreSQL or MySQL before creating a table.');
      setShowConnection(true);
      return;
    }
    setShowCreateTable(true);
  };
  const openAddColumnReview = (statement = sql) => {
    if (!liveConnectionId || !liveSchema) { notify('Connect PostgreSQL or MySQL before changing a schema.'); setShowConnection(true); return; }
    setAddColumnSql(statement);
    setShowAddColumnReview(true);
  };
  const openAddColumnForSelectedTable = () => {
    if (!selectedLiveTable || !liveSchema) return;
    openAddColumnReview(addColumnStarterSql(selectedLiveTable, liveSchema.engine));
  };
  const selectSchemaColumn = (tableId: string, name: string) => {
    setActiveTable(tableId); setSelectedColumn({ tableId, name }); setEditingColumn(false);
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, selectedColumn: node.id === tableId ? name : '' } })));
  };
  const beginColumnEdit = () => {
    if (!selectedLiveColumn) return;
    setColumnEditProperty('nullability'); setColumnNullableValue(selectedLiveColumn.nullable !== false);
    setColumnDefaultAction(selectedLiveColumn.hasDefault ? 'remove' : 'set'); setColumnDefaultValue(''); setEditingColumn(true);
  };
  const reviewColumnEdit = () => {
    if (!selectedLiveTable || !selectedLiveColumn || !liveSchema || liveSchema.engine !== 'postgres') return;
    const tableName = `${quoteSqlIdentifier(selectedLiveTable.schema, 'postgres')}.${quoteSqlIdentifier(selectedLiveTable.name, 'postgres')}`;
    const columnName = quoteSqlIdentifier(selectedLiveColumn.name, 'postgres');
    let change: string;
    if (columnEditProperty === 'nullability') change = columnNullableValue ? 'DROP NOT NULL' : 'SET NOT NULL';
    else if (columnDefaultAction === 'remove') change = 'DROP DEFAULT';
    else {
      const value = columnDefaultValue.trim();
      if (!value) { notify('Enter a default value first.'); return; }
      const type = selectedLiveColumn.type.toLowerCase();
      const numericType = /(?:smallint|integer|bigint|numeric|decimal|real|double precision|serial)/.test(type);
      const booleanType = type === 'boolean';
      const temporalType = /(?:date|time)/.test(type);
      const uuidType = type === 'uuid';
      const expression = numericType && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
        || booleanType && /^(?:true|false)$/i.test(value)
        || temporalType && /^(?:current_timestamp|current_date)$/i.test(value)
        || uuidType && /^gen_random_uuid\(\)$/i.test(value)
        ? (booleanType ? value.toUpperCase() : value)
        : `'${value.replace(/'/g, "''")}'`;
      change = `SET DEFAULT ${expression}`;
    }
    setNullabilitySql(`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} ${change};`);
    setEditingColumn(false); setShowNullabilityReview(true);
  };
  const beginRelationship = (connection: Connection) => {
    if (!liveSchema || liveSchema.engine !== 'postgres' || !connection.source || !connection.target || connection.source === connection.target) return;
    const exists = (id: string) => liveSchema.tables.some((table) => schemaTableId(table.schema, table.name) === id);
    if (!exists(connection.source) || !exists(connection.target)) return;
    // Drag from the referenced table to the table that will store the foreign key.
    setRelationshipTables({ referenced: connection.source, referencing: connection.target });
  };
  const requestTableDeletion = (tableId: string) => {
    if (liveSchema?.engine !== 'postgres' || !liveConnectionId) { notify('Table deletion is currently available for PostgreSQL connections.'); return; }
    setDeleteTableId(tableId);
  };
  const tableForMenu = (tableId: string) => liveSchema?.tables.find((table) => schemaTableId(table.schema, table.name) === tableId) ?? { schema: 'public', name: tableId };
  const openTableDataFromMenu = (tableId: string) => {
    const table = liveSchema?.tables.find((item) => schemaTableId(item.schema, item.name) === tableId);
    if (table) { setActiveTable(tableId); void loadLiveRecords(table.schema, table.name, 0); }
    else { setActiveTable(tableId); setSection('data'); }
  };
  const openTableSqlFromMenu = (tableId: string) => {
    const table = tableForMenu(tableId); const engine = liveSchema?.engine ?? 'postgres';
    setSql(`SELECT *\nFROM ${quoteSqlIdentifier(table.schema, engine)}.${quoteSqlIdentifier(table.name, engine)}\nLIMIT 100;`);
    setSqlResult(null); setSqlError(''); setSection('sql');
  };
  const copyTableNameFromMenu = (tableId: string) => {
    const table = tableForMenu(tableId); const engine = liveSchema?.engine ?? 'postgres';
    void navigator.clipboard.writeText(`${quoteSqlIdentifier(table.schema, engine)}.${quoteSqlIdentifier(table.name, engine)}`).then(() => notify('Qualified table name copied')).catch(() => notify('Could not copy the table name.'));
  };
  const autoArrangeSchema = (message = 'Tables arranged by their relationships') => {
    const tables = liveSchema?.tables ?? nodes.map((node) => {
      const data = node.data as { label?: string; subtitle?: string; columns?: Array<unknown>; foreignKeys?: TableNodeData['foreignKeys'] };
      const [schema = 'public'] = (data.subtitle ?? 'public · table').split('·').map((part) => part.trim());
      return {
        schema,
        name: data.label ?? node.id,
        columns: data.columns ?? [],
        foreignKeys: edges.filter((edge) => edge.target === node.id).map((edge) => ({ column: '', referencedSchema: schema, referencedTable: nodes.find((candidate) => candidate.id === edge.source)?.data.label as string ?? edge.source, referencedColumn: '' })),
      };
    });
    const positions = layoutSchemaTables(tables);
    const positionsByNodeId = liveSchema ? positions : Object.fromEntries(nodes.map((node) => {
      const data = node.data as { label?: string; subtitle?: string };
      const [schema = 'public'] = (data.subtitle ?? 'public · table').split('·').map((part) => part.trim());
      return [node.id, positions[schemaTableId(schema, data.label ?? node.id)]];
    }));
    setNodes((current) => current.map((node) => ({ ...node, position: positionsByNodeId[node.id] ?? node.position } as Node)));
    if (liveSchema) writeSchemaPreference(schemaLayoutKey(schemaGroupScope), JSON.stringify(positions));
    window.requestAnimationFrame(() => { void schemaFlow?.fitView({ padding: 0.16, duration: 350 }); });
    notify(message);
  };
  const exportSchema = async (format: 'svg' | 'png' | 'print') => {
    try {
      const database = liveSchema?.database ?? 'commerce_demo';
      const engine = liveSchema?.engine === 'mysql' ? 'MySQL' : 'PostgreSQL';
      const safeDatabase = database.replace(/[^a-z0-9_-]+/gi, '_');
      const svg = buildSchemaSvg(database, engine, nodes, edges, schemaGroups);
      if (format === 'svg') downloadSchemaSvg(svg, `${safeDatabase}-schema.svg`);
      else if (format === 'png') await downloadSchemaPng(svg, `${safeDatabase}-schema.png`);
      else printSchemaSvg(svg, `${database} schema map`);
      setShowExportMenu(false);
      if (format !== 'print') notify(`Schema diagram exported as ${format.toUpperCase()}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not export the schema diagram.');
    }
  };
  const inspectSchema = async () => {
    const connectionId = pendingConnectionId ?? liveConnectionId;
    if (!connectionId) {
      setConnectionResult(`Test the ${connectionEngine === 'postgres' ? 'PostgreSQL' : 'MySQL'} connection again to open a workspace session.`);
      setConnectionVerified(false);
      return;
    }
    setConnectionBusy(true);
    setConnectionResult(`Reading visible ${connectionEngine === 'postgres' ? 'PostgreSQL' : 'MySQL'} schema metadata…`);
    try {
      const response = await fetch('http://localhost:4000/api/connections/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 410) {
          if (pendingConnectionId) setPendingConnectionId(null);
          else {
            resetLiveDatabase();
            setSection('schema');
          }
          setConnectionVerified(false);
        }
        throw new Error(payload.error ?? 'Schema inspection failed');
      }
      const schema = payload as LiveSchema;
      const legacyScope = `${schema.engine}:${schema.database}`;
      const groupScope = schemaConnectionScope(connectionEngine, connectionForm);
      const graph = makeSchemaGraph(schema, loadSchemaLayout(groupScope, legacyScope));
      setSchemaGroupScope(groupScope);
      setSchemaGroups(loadSchemaGroups(groupScope, legacyScope).map((group) => ({ ...group, tableIds: group.tableIds.filter((id) => schema.tables.some((table) => schemaTableId(table.schema, table.name) === id)) })));
      setLiveSchema(schema);
      setLiveConnectionId(connectionId);
      setPendingConnectionId(null);
      if (liveConnectionId && liveConnectionId !== connectionId) {
        void fetch(`http://localhost:4000/api/connections/${liveConnectionId}`, { method: 'DELETE' }).catch(() => undefined);
      }
      setLiveRecords(null);
      setSqlResult(null);
      setSqlError('');
      setRecordsError('');
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setActiveTable(schema.tables[0] ? schemaTableId(schema.tables[0].schema, schema.tables[0].name) : '');
      setSchemaNotice('');
      setSchemaRefreshTarget(null);
      setSection('schema');
      closeConnectionDialog();
      notify(`Loaded ${schema.tables.length} ${schema.engine === 'postgres' ? 'PostgreSQL' : 'MySQL'} tables · metadata only`);
    } catch (error) {
      setConnectionResult(error instanceof Error ? error.message : 'Could not inspect this database schema.');
    } finally {
      setConnectionBusy(false);
    }
  };
  const loadLiveRecords = async (schema: string, table: string, page: number, pageSize = 50, sort: LiveRecordSort | null = liveSort, search = searchText): Promise<LiveRecordsPage | null> => {
    const sameTable = liveRecords?.schema === schema && liveRecords.table === table;
    const requestedSort = sameTable ? sort : null;
    const requestedSearch = sameTable ? search : '';
    const requestId = ++recordsRequestId.current;
    requestedRecordsSearch.current = requestedSearch;
    if (!liveConnectionId) {
      setRecordsError('The database session is unavailable. Test the connection again before browsing records.');
      setLiveSort(null);
      setLiveRecords({ schema, table, page, pageSize, hasMore: false, rows: [] });
      setSection('data');
      return null;
    }
    setRecordsBusy(true);
    setRecordsError('');
    if (!sameTable) setSearchText('');
    setSelectedLiveRow(null);
    setLiveSort(requestedSort);
    setLiveRecords({ schema, table, page, pageSize, hasMore: false, rows: [] });
    try {
      const response = await fetch('http://localhost:4000/api/connections/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: liveConnectionId, schema, table, page, pageSize, search: requestedSearch, ...(requestedSort ? { sort: requestedSort } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 410) {
          resetLiveDatabase();
          setSection('schema');
          setShowConnection(true);
          notify('Database session expired. Connect again to continue browsing.');
        }
        throw new Error(payload.error ?? 'Could not load this table page.');
      }
      if (requestId !== recordsRequestId.current) return null;
      const nextPage = { schema, table, ...payload } as LiveRecordsPage;
      setLiveRecords(nextPage);
      setActiveTable(schemaTableId(schema, table));
      setSection('data');
      return nextPage;
    } catch (error) {
      if (requestId === recordsRequestId.current) setRecordsError(error instanceof Error ? error.message : 'Could not load this table page.');
      return null;
    } finally {
      if (requestId === recordsRequestId.current) setRecordsBusy(false);
    }
  };
  useEffect(() => {
    if (section !== 'data' || !liveRecords || recordsBusy) return;
    if (searchText === requestedRecordsSearch.current) return;
    const timer = window.setTimeout(() => {
      void loadLiveRecords(liveRecords.schema, liveRecords.table, 0, liveRecords.pageSize, liveSort, searchText);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchText, recordsBusy]);
  const refreshAfterInsert = async () => {
    if (!liveRecords) return;
    setSearchText('');
    const refreshed = await loadLiveRecords(liveRecords.schema, liveRecords.table, 0, liveRecords.pageSize, liveSort, '');
    notify(refreshed ? `Row added to ${liveRecords.schema}.${liveRecords.table}` : 'Row added, but the table did not refresh. Use Retry to verify it.');
  };
  const refreshAfterDelete = async () => {
    if (!liveRecords) return;
    let refreshed = await loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page, liveRecords.pageSize, liveSort, searchText);
    if (refreshed?.rows.length === 0 && liveRecords.page > 0) {
      refreshed = await loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page - 1, liveRecords.pageSize, liveSort, searchText);
    }
    notify(refreshed ? `Row deleted from ${liveRecords.schema}.${liveRecords.table}` : 'Row deleted, but the table did not refresh. Use Retry to verify it.');
  };
  const renderContent = () => {
    if (section === 'schema') return <>
      <div className="page-heading"><div><div className="eyebrow">DATABASE DESIGN</div><h1>Schema designer <span className="beta-tag">BETA</span></h1><p>{liveSchema ? `Browse and create tables in this ${liveSchema.engine === 'postgres' ? 'PostgreSQL' : 'MySQL'} database. Table creation requires SQL review and confirmation.` : 'See how your data connects. Drag tables around to make the structure your own.'}</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => setSection('sql')}><Code2 size={15}/> Open SQL workspace</button><button className="button button-primary" onClick={openTableDesigner}><Plus size={16}/> New table</button></div></div>
      {schemaNotice && <div className="schema-refresh-alert" role="alert"><span>{schemaNotice}</span><button className="button button-quiet" onClick={() => void refreshLiveSchema()} disabled={schemaRefreshBusy}>{schemaRefreshBusy ? 'Refreshing…' : 'Refresh schema'}</button></div>}
      <div className="schema-toolbar">
        <div className="schema-toolbar-top"><div className="schema-crumb"><span className="crumb-icon"><Database size={14}/></span><span>{liveSchema?.database ?? 'commerce_demo'}</span><ChevronRight size={13}/><span>{selectedLiveTable?.schema ?? (liveSchema ? 'All schemas' : 'public')}</span><ChevronRight size={13}/><strong>Schema map</strong></div><div className="schema-toolbar-status"><span className="sync-indicator"><span className="status-dot"/> {liveSchema ? `Live ${liveSchema.engine === 'postgres' ? 'PostgreSQL' : 'MySQL'}` : 'Demo data'}</span><button className="icon-button" title="Fit view" aria-label="Fit schema to view" onClick={() => { void schemaFlow?.fitView({ padding: 0.16 }); }}><Maximize2 size={15}/></button></div></div>
        <div className="schema-ribbon" role="toolbar" aria-label="Schema designer commands">
          <div className="schema-ribbon-group" role="group" aria-label="Layout actions"><span>Layout</span><div className="schema-ribbon-controls"><button className="button button-quiet" onClick={() => setShowSchemaGroups(true)} title="Create and organize table groups"><Layers3 size={14}/> Groups{schemaGroups.length ? ` · ${schemaGroups.length}` : ''}</button><button className="button button-quiet" onClick={() => autoArrangeSchema()} title="Arrange tables by foreign-key relationships"><Sparkles size={14}/> Auto arrange</button><button className="button button-quiet" onClick={() => autoArrangeSchema('Layout reset to the default arrangement')} title="Replace saved positions with the default layout"><RotateCcw size={13}/> Reset layout</button></div></div>
          <div className="schema-ribbon-group" role="group" aria-label="View actions"><span>View</span><div className="schema-ribbon-controls"><button className="button button-quiet" onClick={() => { void schemaFlow?.fitView({ padding: 0.16, duration: 350 }); }} title="Fit all visible tables in the canvas"><Maximize2 size={13}/> Fit all</button></div></div>
          <div className="schema-ribbon-group" role="group" aria-label="Share actions"><span>Share</span><div className="schema-ribbon-controls schema-export-controls"><button className="button button-quiet" onClick={() => void exportSchema('svg')} title="Download the full schema map as SVG"><Download size={13}/> SVG</button><button className="button button-quiet" onClick={() => void exportSchema('png')} title="Download a high-resolution PNG"><Image size={13}/> PNG</button><button className="button button-quiet" onClick={() => void exportSchema('print')} title="Open a print-friendly schema view"><Printer size={13}/> Print</button></div></div>
          {liveSchema && <><div className="schema-ribbon-group" role="group" aria-label="Change actions"><span>Changes</span><div className="schema-ribbon-controls"><button className={`button ${schemaChangePlan.length ? 'button-primary' : 'button-quiet'}`} onClick={() => setShowSchemaChangePlan(true)} title="Review staged schema changes"><FileCode2 size={14}/> Change plan{schemaChangePlan.length ? ` · ${schemaChangePlan.length}` : ''}</button></div></div><div className="schema-ribbon-group" role="group" aria-label="Database actions"><span>Database</span><div className="schema-ribbon-controls"><button className="button button-quiet" onClick={() => void refreshLiveSchema()} disabled={schemaRefreshBusy}>{schemaRefreshBusy ? 'Refreshing…' : <><ArrowDownUp size={13}/> Refresh schema</>}</button><button className="button button-quiet" onClick={disconnectDatabase}><X size={13}/> Disconnect</button></div></div></>}
        </div>
      </div>
      <div className="schema-explorer-bar"><label className="schema-search"><Search size={15}/><input type="search" aria-label="Search tables, columns, and relationships" placeholder="Search tables, columns, or relationships…" value={schemaSearch} onChange={(event) => setSchemaSearch(event.target.value)}/>{schemaSearch && <button type="button" aria-label="Clear search" onClick={() => setSchemaSearch('')}><X size={13}/></button>}</label><div className="schema-filter-group" role="group" aria-label="Filter tables">{([['all', 'All tables'], ['related', 'With relationships'], ['isolated', 'No relationships']] as const).map(([value, label]) => <button type="button" key={value} className={schemaFilter === value ? 'active' : ''} aria-pressed={schemaFilter === value} onClick={() => setSchemaFilter(value)}>{label}</button>)}</div><span className="schema-result-count">{schemaNodeIds.size} of {nodes.length} tables</span></div>
      <section className="schema-review-overview" aria-label="Schema overview">
        <div className="schema-review-metrics"><div><strong>{schemaOverviewTables.length}</strong><span>Tables</span></div><div><strong>{schemaOverviewColumnCount}</strong><span>Columns</span></div><div><strong>{schemaOverviewRelationshipCount}</strong><span>Foreign keys</span></div><div className={schemaReviewWarnings.length ? 'has-warnings' : 'is-clear'}><strong>{schemaReviewWarnings.length}</strong><span>Review items</span></div></div>
        {schemaReviewWarnings.length > 0 && <div className="schema-review-warnings" role="status"><AlertTriangle size={14}/><div><strong>{schemaReviewWarnings.length} items to review</strong><span>{schemaReviewWarnings.slice(0, 3).map((warning) => `${warning.kind}: ${warning.table}`).join(' · ')}{schemaReviewWarnings.length > 3 ? ` · +${schemaReviewWarnings.length - 3} more` : ''}</span></div></div>}
      </section>
      <div className="schema-map-legend" role="group" aria-label="Schema map legend"><span><KeyRound size={11}/> Primary key</span><span><Link2 size={11}/> Foreign key</span><span><span className="legend-line"/> Relationship</span></div>
      <div className="schema-canvas"><TableMenuContext.Provider value={{ openData: openTableDataFromMenu, openSql: openTableSqlFromMenu, copyName: copyTableNameFromMenu, deleteTable: requestTableDeletion }}><TableGroupContext.Provider value={{ groups: schemaGroups, assign: assignTableGroup }}><GroupToggleContext.Provider value={toggleSchemaGroup}><ColumnSelectionContext.Provider value={selectSchemaColumn}><EdgeSelectionContext.Provider value={setSelectedRelationshipId}><ReactFlow nodes={visibleSchemaNodes} edges={visibleSchemaEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onEdgeClick={(_event, edge) => setSelectedRelationshipId(edge.id)} onPaneClick={() => setSelectedRelationshipId(null)} onNodeClick={(event, node) => { if (node.type === 'tableGroup') { toggleSchemaGroup(node.id.replace(/^group:/, '')); return; } setSelectedRelationshipId(null); setActiveTable(node.id); if (!(event.target instanceof Element) || !event.target.closest('.node-column')) { setSelectedColumn(null); setEditingColumn(false); setNodes((current) => current.map((item) => ({ ...item, data: { ...item.data, selectedColumn: '' } }))); } }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={beginRelationship} isValidConnection={(connection) => Boolean(liveSchema?.engine === 'postgres' && connection.source && connection.target && connection.source !== connection.target)} onInit={(instance) => { setSchemaFlow(instance); window.setTimeout(() => { void instance.fitView({ padding: 0.12 }); }, 120); }} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.3} maxZoom={1.6}><Background color="#d7dee8" gap={24} size={1}/><Controls showInteractive={false}/></ReactFlow></EdgeSelectionContext.Provider></ColumnSelectionContext.Provider></GroupToggleContext.Provider></TableGroupContext.Provider></TableMenuContext.Provider>{liveSchema?.tables.length === 0 && <div className="schema-empty-state"><strong>No visible tables found</strong><span>This account can connect, but no base tables were returned from the accessible schemas.</span></div>}{visibleSchemaNodes.length === 0 && nodes.length > 0 && <div className="schema-empty-state"><strong>No matching tables</strong><span>Adjust the search or choose a different relationship filter.</span><button className="button button-quiet" onClick={() => { setSchemaSearch(''); setSchemaFilter('all'); }}>Clear filters</button></div>}{selectedRelationship && <aside className="relationship-inspector" aria-label="Relationship details"><div className="relationship-inspector-heading"><div><span className="eyebrow">FOREIGN KEY RELATIONSHIP</span><strong>{selectedRelationshipForeignKeys.length} mapping{selectedRelationshipForeignKeys.length === 1 ? '' : 's'}</strong></div><button className="icon-button" aria-label="Close relationship details" onClick={() => setSelectedRelationshipId(null)}><X size={15}/></button></div>{selectedRelationshipForeignKeys.length ? <ul>{selectedRelationshipForeignKeys.map((foreignKey, index) => <li key={`${foreignKey.referencingSchema}.${foreignKey.referencingTable}.${foreignKey.column}-${index}`}><strong>{foreignKey.referencingSchema}.{foreignKey.referencingTable}</strong><span>{foreignKey.column} <ArrowRight size={12}/> {foreignKey.referencedSchema}.{foreignKey.referencedTable}.{foreignKey.referencedColumn}</span><small>On delete: {foreignKey.onDelete ?? 'Unknown'} · On update: {foreignKey.onUpdate ?? 'Unknown'}</small></li>)}</ul> : <p>Select a live relationship to inspect its foreign-key columns.</p>}</aside>}<div className="canvas-tip"><Grip size={13}/>{liveSchema?.engine === 'postgres' ? 'Drag a table dot to another table to create a relationship · click a relationship to inspect' : 'Drag nodes to rearrange'}</div></div>
      <div ref={columnInspectorRef} className={`bottom-inspector${selectedLiveColumn ? ' has-selected-column' : ''}`}>
        <div className="inspector-overview">
          <div className="inspector-title"><div className="table-icon small"><Table2 size={13}/></div><div><strong>{selectedLiveTable ? `${selectedLiveTable.schema}.${selectedLiveTable.name}` : liveSchema ? 'No table selected' : activeTable}</strong><span>{selectedLiveColumn ? `Selected column · ${selectedLiveColumn.type}` : liveSchema ? `${liveSchema.engine === 'postgres' ? 'PostgreSQL' : 'MySQL'} catalog metadata` : 'Selected table · public schema'}</span></div></div>
          <div className="inspector-metrics"><div><span>COLUMNS</span><strong>{selectedLiveTable?.columns.length ?? (liveSchema ? 0 : 4)}</strong></div><div><span>FOREIGN KEYS</span><strong>{liveSchema ? liveForeignKeyCount : activeTable === 'orders' ? 2 : 1}</strong></div><div><span>LAST INSPECTED</span><strong>{liveSchema ? new Date(liveSchema.introspectedAt).toLocaleTimeString() : 'Demo'}</strong></div></div>
          <div className="inspector-actions">{liveSchema && selectedLiveTable && <button className="button button-quiet" onClick={openAddColumnForSelectedTable}><Plus size={14}/> Add column</button>}<button className="button button-quiet" onClick={() => selectedLiveTable ? void loadLiveRecords(selectedLiveTable.schema, selectedLiveTable.name, 0) : setSection('data')}><Eye size={14}/> {liveSchema ? 'View live records' : 'View records'} <ArrowRight size={14}/></button></div>
        </div>
        {selectedLiveColumn && selectedLiveTable && <section className="column-properties-panel" aria-label="Selected column properties">
          <div className="column-properties-heading"><div><span className="eyebrow">SELECTED COLUMN</span><strong>{selectedLiveColumn.name}</strong><code>{selectedLiveColumn.type}</code></div><div className="column-property-chips"><span>{selectedLiveColumn.nullable === false ? 'Required' : selectedLiveColumn.nullable === true ? 'Nullable' : 'Nullability unknown'}</span><span>{selectedLiveColumn.hasDefault === true ? 'Default configured' : selectedLiveColumn.hasDefault === false ? 'No default' : 'Default unknown'}</span><span>{selectedLiveColumn.key === 'pk' || selectedLiveColumn.key === 'pk-fk' ? 'Primary key' : selectedLiveColumn.key === 'fk' ? 'Foreign key' : selectedLiveColumn.unique ? 'Unique' : 'No key'}</span></div><div className="column-property-actions">{liveSchema?.engine === 'postgres' && <button className="button button-quiet" onClick={beginColumnEdit}>Edit column</button>}</div></div>
          {editingColumn && liveSchema?.engine === 'postgres' && <form className="column-edit-form" onSubmit={(event) => { event.preventDefault(); reviewColumnEdit(); }}><label>Property<select value={columnEditProperty} onChange={(event) => setColumnEditProperty(event.target.value as 'nullability' | 'default')}><option value="nullability">Nullability</option><option value="default">Default</option></select></label>{columnEditProperty === 'nullability' ? <label>Allow NULL<select value={columnNullableValue ? 'yes' : 'no'} onChange={(event) => setColumnNullableValue(event.target.value === 'yes')}><option value="yes">Yes · allow NULL values</option><option value="no">No · require a value</option></select></label> : <><label>Default action<select value={columnDefaultAction} onChange={(event) => setColumnDefaultAction(event.target.value as 'set' | 'remove')}><option value="set">Set a default</option><option value="remove">Remove the default</option></select></label>{columnDefaultAction === 'set' && <label className="column-default-field">Default value<input value={columnDefaultValue} onChange={(event) => setColumnDefaultValue(event.target.value)} placeholder="Text, 0, TRUE, CURRENT_TIMESTAMP…"/><small>Text is quoted automatically. Supported expressions are validated before review.</small></label>}</>}<div className="column-edit-actions"><button className="button button-primary" type="submit">Review change</button><button className="button button-quiet" type="button" onClick={() => setEditingColumn(false)}>Cancel</button></div></form>}
        </section>}
      </div>
    </>;
    if (section === 'data') return <>
      <div className="page-heading"><div><div className="eyebrow">{liveRecords ? 'LIVE TABLE' : 'EXPLORE YOUR DATA'}</div><h1>{liveRecords ? liveRecords.table : 'Data explorer'}</h1><p>{liveRecords ? `Records from ${liveRecords.schema}.${liveRecords.table}. Showing up to ${liveRecords.pageSize} rows per page.` : 'Inspect records in a familiar grid. This preview uses sample data, not a live database.'}</p></div><div className="heading-actions">{liveRecords ? <><span className="read-only-label"><LockKeyhole size={12}/> {liveSchema?.engine === 'mysql' ? 'MySQL' : 'PostgreSQL'} · {livePrimaryKeyColumns.length ? 'reviewed row changes' : 'insert only · no primary key'}</span><button className="button button-quiet" onClick={() => setSection('schema')}><GitBranch size={14}/> Back to schema</button></> : <span className="read-only-label"><Eye size={12}/> Demo data · read only</span>}</div></div>
      <div className="data-toolbar"><div className="table-select"><Table2 size={15}/>{liveSchema && liveRecords ? <select aria-label="Select table to browse" value={schemaTableId(liveRecords.schema, liveRecords.table)} disabled={recordsBusy} onChange={(event) => { const table = liveSchema.tables.find((item) => schemaTableId(item.schema, item.name) === event.target.value); if (table) void loadLiveRecords(table.schema, table.name, 0); }}>{liveSchema.tables.map((table) => <option key={schemaTableId(table.schema, table.name)} value={schemaTableId(table.schema, table.name)}>{table.schema}.{table.name}</option>)}</select> : <strong>{liveRecords ? `${liveRecords.schema}.${liveRecords.table}` : activeTable}</strong>}</div><div className="search-box"><Search size={14}/><input type="search" name={liveRecords ? 'record-search' : 'sample-search'} autoComplete="off" maxLength={200} aria-label={liveRecords ? 'Search all records in this table' : 'Search sample records'} value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={liveRecords ? 'Search all rows…' : 'Search sample records…'}/></div>{liveRecords && <div className="record-actions"><button className="button button-quiet" onClick={() => setShowInsertRecord(true)} disabled={recordsBusy}><Plus size={14}/> Add row</button><button className="button button-quiet" onClick={() => setShowEditRecord(true)} disabled={!selectedLiveRow || !livePrimaryKeyColumns.length || recordsBusy}><Check size={14}/> Edit row</button><button className="button button-danger-quiet" onClick={() => setShowDeleteRecord(true)} disabled={!liveDeleteSupported || recordsBusy} title={!livePrimaryKeyColumns.length ? 'A primary key is required' : !liveDeleteSupported && selectedLiveRow ? 'This row contains values that cannot be compared safely' : 'Select a row to delete'}><Trash2 size={14}/> Delete row</button></div>}</div>
      {recordsError && liveRecords && <div className="record-alert" role="alert"><span>{recordsError}</span><button className="button button-quiet" onClick={() => {
        if (recordsError.startsWith('That table is no longer visible')) { setSection('schema'); void refreshLiveSchema(); }
        else void loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page, liveRecords.pageSize, liveSort, searchText);
      }} disabled={recordsBusy || schemaRefreshBusy}>{recordsError.startsWith('That table is no longer visible') ? 'Refresh schema' : 'Retry records'}</button></div>}
      {recordsBusy && liveRecords && <div className="record-loading" role="status" aria-live="polite">Loading records…</div>}
      <div className={`grid-wrap${recordsError || recordsBusy ? ' grid-wrap-suppress-empty-overlay' : ''}`}><div className="ag-theme-quartz custom-grid"><AgGridReact rowData={liveRecords ? liveFilteredRows : demoFilteredRows} columnDefs={(liveRecords ? liveColDefs : colDefs) as any} defaultColDef={{ sortable: true, resizable: true }} onSortChanged={(event) => {
        if (!liveRecords || recordsBusy) return;
        const activeSort = event.api.getColumnState().find((column) => column.sort);
        const nextSort: LiveRecordSort | null = activeSort?.sort ? { column: activeSort.colId, direction: activeSort.sort } : null;
        if (JSON.stringify(nextSort) === JSON.stringify(liveSort)) return;
        void loadLiveRecords(liveRecords.schema, liveRecords.table, 0, liveRecords.pageSize, nextSort);
      }} rowSelection={liveRecords ? { mode: 'singleRow', checkboxes: false, enableClickSelection: true } : undefined} getRowId={(params) => livePrimaryKeyColumns.length ? JSON.stringify(livePrimaryKeyColumns.map((column) => params.data[column.name])) : JSON.stringify(Object.values(params.data))} onSelectionChanged={(event) => setSelectedLiveRow(liveRecords ? event.api.getSelectedRows()[0] ?? null : null)} rowHeight={47} headerHeight={42} animateRows={!liveRecords} suppressCellFocus={true} overlayNoRowsTemplate={liveRecords ? (searchText ? '<span>No rows match your search.</span>' : '<span>This table has no rows.</span>') : undefined}/></div></div>
      {liveRecords ? <div className="grid-footer live-grid-footer"><span>Page <strong>{liveRecords.page + 1}</strong> · {liveRecords.rows.length} {searchText ? 'matching ' : ''}rows shown{liveSort ? ` · sorted by ${liveSort.column} ${liveSort.direction.toUpperCase()}` : ''}{searchText ? ' · search covers all table rows' : ''}</span><span className="pagination-controls"><label>Rows<select aria-label="Rows per page" value={liveRecords.pageSize} disabled={recordsBusy} onChange={(event) => void loadLiveRecords(liveRecords.schema, liveRecords.table, 0, Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><button className="button button-quiet" disabled={recordsBusy || liveRecords.page === 0} onClick={() => void loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page - 1, liveRecords.pageSize)}>Previous</button><button className="button button-quiet" disabled={recordsBusy || !liveRecords.hasMore} onClick={() => void loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page + 1, liveRecords.pageSize)}>Next</button></span></div> : <div className="grid-footer"><span>Showing <strong>{demoFilteredRows.length}</strong> sample records</span><span>Demo mode · Read only <span className="footer-dot"/></span></div>}
    </>;
    if (section === 'sql') return <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUERY EDITOR</div>
          <h1>SQL workspace</h1>
          <p>{liveConnectionId && liveSchema ? 'Run SELECT queries in a read-only transaction. Reuse recent queries from this tab, then run them again explicitly. Review a supported ADD COLUMN change separately. Query results are capped at 1,000 rows.' : 'Write SQL here, then preview clearly labeled sample rows. Recent queries stay in this tab so you can reuse them. No query is sent until a database is connected.'}</p>
        </div>
        <div className="heading-actions">
          <span className="read-only-label"><LockKeyhole size={12}/> {liveConnectionId && liveSchema ? `${liveSchema.engine === 'postgres' ? 'PostgreSQL' : 'MySQL'} · SELECT mode` : 'Demo connection'}</span>
          {liveConnectionId && liveSchema && <button className="button button-quiet" onClick={() => openAddColumnReview(sql)} disabled={sqlBusy}>Review schema change</button>}
          <button className="button button-primary" onClick={() => void runQuery()} disabled={sqlBusy}>
            <Eye size={14}/>{sqlBusy ? 'Running query…' : liveConnectionId && liveSchema ? 'Run read-only query' : 'Preview demo rows'}
          </button>
        </div>
      </div>
      <div className="sql-layout">
        <QueryHistoryPanel
          entries={queryHistory}
          activeSql={sql}
          onReuse={(nextSql) => { setSql(nextSql); setSqlResult(null); setSqlError(''); }}
          onClear={() => { setQueryHistory([]); saveQueryHistory([]); }}
        />
        <div className="editor-panel">
          <div className="editor-tabs">
            <div className="editor-tab active"><FileCode2 size={14}/> query.sql <span className="unsaved-dot"/></div>
            <button className="editor-tab-add" aria-label="Open a sample query" onClick={() => { setSql('SELECT *\nFROM orders\nLIMIT 100;'); setSqlResult(null); setSqlError(''); }}><Plus size={15}/></button>
            <div className="editor-tab-spacer"/>
            <span className="editor-language">{liveSchema ? liveSchema.engine.toUpperCase() : 'SQL'}</span>
          </div>
          <div className="monaco-wrap"><Suspense fallback={<div className="editor-loading" role="status" aria-live="polite">Loading SQL editor…</div>}><Editor height="100%" language="sql" theme="vs" value={sql} onChange={(value) => { setSql(value ?? ''); setSqlResult(null); setSqlError(''); }} options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: 'JetBrains Mono, SFMono-Regular, Menlo, monospace', lineNumbers: 'on', padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', suggestOnTriggerCharacters: true, renderLineHighlight: 'gutter' }}/></Suspense></div>
          <div className="editor-status"><span><span className="status-dot"/> {sqlBusy ? 'Running' : 'Ready'}</span><span>UTF-8</span><span>SQL</span></div>
        </div>
        <div className="results-panel">
          <div className="results-header">
            <div><span className="results-title">Results</span><span className="results-subtitle">{sqlResult ? `${sqlResult.rowCount} rows${sqlResult.source === 'database' ? ` · ${sqlResult.elapsedMs} ms` : ' · demo sample'}` : 'Query output appears here'}</span></div>
          </div>
          {sqlError && <div className="query-error" role="alert">{sqlError}</div>}
          {sqlBusy && <div className="query-loading" role="status" aria-live="polite">Running a read-only query…</div>}
          {sqlResult && <>
            <div className={sqlResult.source === 'database' ? 'result-success' : 'result-preview'}>
              {sqlResult.source === 'database' ? <LockKeyhole size={14}/> : <Eye size={14}/>}
              {sqlResult.source === 'database' ? `Read-only database result${sqlResult.truncated ? ' · showing first 1,000 rows' : ''}` : 'Demo sample rows · SQL was not sent'}
            </div>
            <div className="sql-results-grid ag-theme-quartz custom-grid">
              <AgGridReact rowData={sqlResult.rows} columnDefs={sqlColDefs as any} defaultColDef={{ sortable: true, resizable: true, minWidth: 110 }} rowHeight={42} headerHeight={40} suppressCellFocus={true}/>
            </div>
          </>}
          {!sqlResult && !sqlError && !sqlBusy && <div className="empty-results">
            <div className="empty-result-icon"><TerminalSquare size={21}/></div>
            <strong>{liveConnectionId ? 'Ready to run a read-only query' : 'Preview sample rows'}</strong>
            <span>{liveConnectionId ? 'Queries accept one read-only SELECT. Review schema change supports one ALTER TABLE … ADD COLUMN operation.' : 'Connect a database to run SQL. The demo preview does not execute this editor text.'}</span>
          </div>}
        </div>
      </div>
    </>;
    if (section === 'learning') return <>
      <div className="page-heading"><div><div className="eyebrow">LEARN BY DOING</div><h1>Learn databases</h1><p>Build database intuition with visual, hands-on lessons. Learning modules are coming soon.</p></div><div className="heading-actions"><span className="read-only-label"><GraduationCap size={14}/> Beginner friendly</span></div></div><div className="learning-hero"><div className="learning-copy"><span className="learning-kicker"><Sparkles size={13}/> YOUR DATABASE JOURNEY</span><h2>Understand databases.<br/><span>Don't just memorize them.</span></h2><p>Explore relationships, experiment with SQL, and see how the pieces fit together — at your own pace.</p></div><div className="learning-graphic"><div className="learning-orbit orbit-one"/><div className="learning-orbit orbit-two"/><div className="learning-core"><Database size={38}/></div><div className="orbit-chip chip-one"><KeyRound size={15}/></div><div className="orbit-chip chip-two"><Link2 size={15}/></div><div className="orbit-chip chip-three"><Braces size={15}/></div></div></div><div className="lesson-grid"><div className="lesson-card"><div className="lesson-icon violet"><Table2 size={18}/></div><span className="lesson-level">LESSON 01 · 8 MIN</span><h3>Tables & columns</h3><p>Understand how databases organize information into structured records.</p><div className="lesson-progress"><span style={{ width: '0%' }}/></div><span className="lesson-bottom">Not started <ArrowRight size={13}/></span></div><div className="lesson-card"><div className="lesson-icon blue"><Link2 size={18}/></div><span className="lesson-level">LESSON 02 · 12 MIN</span><h3>Keys & relationships</h3><p>Connect tables and understand primary and foreign keys visually.</p><div className="lesson-progress"><span style={{ width: '0%' }}/></div><span className="lesson-bottom">Not started <ArrowRight size={13}/></span></div><div className="lesson-card"><div className="lesson-icon mint"><TerminalSquare size={18}/></div><span className="lesson-level">LESSON 03 · 15 MIN</span><h3>Your first SQL query</h3><p>Learn SELECT, WHERE, and ORDER BY using a safe demo database.</p><div className="lesson-progress"><span style={{ width: '0%' }}/></div><span className="lesson-bottom">Not started <ArrowRight size={13}/></span></div></div>
    </>;
    return <>
      <div className="page-heading"><div><div className="eyebrow">DATABASE WORKSPACE</div><h1>Explore your data</h1><p>Open the sample workspace or test a connection to your own database.</p></div><div className="heading-actions"><button className="button button-primary" onClick={() => setShowConnection(true)}><Plus size={15}/> Add connection</button></div></div>
      <div className="overview-workspace"><section className="overview-environment"><span className="overview-section-label">ACTIVE ENVIRONMENT</span><div className="overview-name"><Database size={19}/><h2>{liveSchema?.database ?? 'commerce_demo'}</h2><span className="demo-badge">{liveSchema ? liveSchema.engine.toUpperCase() : 'DEMO'}</span></div><p>{liveSchema ? 'Live schema, records, and read-only SQL queries are available. Data-changing SQL remains disabled.' : 'Read-only sample data for exploring the interface.'}</p><div className="overview-details"><span><strong>{liveSchema?.tables.length ?? initialNodes.length}</strong> {liveSchema ? 'visible tables' : 'tables'}</span><span><strong>{liveSchema ? edges.length : initialEdges.length}</strong> relationships</span></div><div className="overview-actions"><button className="button button-primary" onClick={() => setSection('schema')}><GitBranch size={15}/> Open schema designer</button><button className="button button-quiet" onClick={() => setSection('data')}><Table2 size={15}/> Browse sample records</button></div></section><section className="overview-connect"><span className="overview-section-label">YOUR DATABASE</span><h2>{liveSchema ? 'Inspect another schema' : 'Connect PostgreSQL or MySQL'}</h2><p>{liveSchema ? 'The API keeps credentials in an expiring in-memory session; no profile is saved.' : 'Connect through the local API to inspect schemas and browse read-only records.'}</p><button className="text-button" onClick={() => setShowConnection(true)}>{liveSchema ? 'Inspect database' : 'Set up a connection'} <ArrowRight size={14}/></button></section></div>
    </>;
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a><aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}><div className="brand-row"><div className="brand-mark"><BrandMark/></div>{sidebarOpen && <div className="brand-copy"><strong>DBFLOW</strong><small>DATABASE WORKSPACE</small></div>}<button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar" aria-label="Toggle sidebar" aria-expanded={sidebarOpen}><PanelLeftClose size={16}/></button></div>
      {sidebarOpen && <div className="workspace-switcher"><div className="workspace-avatar">C</div><div className="workspace-name"><strong>Commerce workspace</strong><span>Personal workspace</span></div><ChevronDown size={14}/></div>}
      <div className="sidebar-nav">
        {['WORKSPACE', 'LEARN'].map((group) => (
          <div className="nav-group" key={group}>
            <div className="nav-group-label">{sidebarOpen ? group : '···'}</div>
            {navItems.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} className={`nav-item ${section === item.key ? 'active' : ''}`} onClick={() => setSection(item.key)} title={!sidebarOpen ? item.label : undefined}>
                  <Icon size={18} />
                  {sidebarOpen && <span className="nav-label-wrap"><span>{item.label}</span>{item.key === 'learning' && <span className="nav-new">NEW</span>}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {sidebarOpen && <div className="sidebar-connections"><div className="connection-heading"><span>CONNECTIONS</span><button onClick={() => setShowConnection(true)} title="Add connection" aria-label="Add connection"><Plus size={14}/></button></div><button className="connection-item" onClick={() => setShowConnection(true)}><span className="connection-db-icon"><Database size={14}/></span><span className="connection-info"><strong>{liveSchema?.database ?? 'commerce_demo'}</strong><small><i/> {liveSchema ? `Connected · ${liveSchema.engine === 'postgres' ? 'PostgreSQL' : 'MySQL'}` : 'Demo database'}</small></span><span className="demo-badge">{liveSchema ? 'PG' : 'DEMO'}</span></button><button className="add-connection" onClick={() => setShowConnection(true)}><Plus size={14}/> Add connection</button></div>}
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => notify('Settings will be available as the app grows.')}><Settings2 size={17}/>{sidebarOpen && <span>Settings</span>}</button><button className="nav-item" onClick={() => notify('Help documentation is being prepared.')}><CircleHelp size={17}/>{sidebarOpen && <span>Help & feedback</span>}</button>{sidebarOpen && <div className="user-card"><div className="user-avatar">M</div><div className="user-copy"><strong>My workspace</strong><span>Free plan · Local demo</span></div><MoreHorizontal size={16}/></div>}</div>
    </aside>
    <main id="main-content" className="main-area" tabIndex={-1}><header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={18}/></button><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{title}</strong></div></div><div className="topbar-right"><div className="connection-status"><span className="status-dot"/><span>{liveSchema ? `${liveSchema.engine} · ${liveSchema.database}` : 'Demo environment'}</span><ChevronDown size={12}/></div><button className="top-icon" onClick={() => notify('Keyboard shortcuts are coming soon.')} title="Shortcuts" aria-label="Shortcuts"><Command size={16}/></button><button className="top-icon" onClick={() => notify('Help center coming soon.')} title="Help" aria-label="Help"><HelpCircle size={16}/></button><div className="top-avatar">M</div></div></header><div className={`page-content ${section === 'schema' ? 'schema-page' : ''}`}>{renderContent()}<footer className="app-footer"><span><span className="footer-brand-dot"/> DBFLOW <span className="footer-version">v0.1.0</span></span><span>Built for clarity <span className="footer-heart">✳</span></span></footer></div></main>
    {showConnection && <div className="modal-backdrop" onClick={closeConnectionDialog}><div className="connection-modal" role="dialog" aria-modal="true" aria-labelledby="connect-dialog-title" aria-describedby="connect-dialog-description" onClick={(e) => e.stopPropagation()}><div className="modal-heading"><div className="modal-icon"><Database size={19}/></div><button className="icon-button" aria-label="Close connection dialog" onClick={closeConnectionDialog}><X size={17}/></button></div><h2 id="connect-dialog-title">Connect a database</h2><p id="connect-dialog-description">Credentials are sent to the local API to open an expiring in-memory session; the form fields clear when this dialog closes.</p><div className="engine-toggle"><button type="button" className={connectionEngine === 'postgres' ? 'selected' : ''} aria-pressed={connectionEngine === 'postgres'} onClick={() => selectConnectionEngine('postgres')}>PostgreSQL</button><button type="button" className={connectionEngine === 'mysql' ? 'selected' : ''} aria-pressed={connectionEngine === 'mysql'} onClick={() => selectConnectionEngine('mysql')}>MySQL</button></div><form className="connection-form" onSubmit={submitConnectionTest}><label>Host<input required value={connectionForm.host} onChange={(e) => updateConnectionField('host', e.target.value)} placeholder="localhost"/></label><div className="form-two-col"><label>Port<input required type="number" min="1" max="65535" value={connectionForm.port} onChange={(e) => updateConnectionField('port', e.target.value)}/></label><label>Database<input required value={connectionForm.database} onChange={(e) => updateConnectionField('database', e.target.value)} placeholder="database_name"/></label></div><label>Username<input required value={connectionForm.username} onChange={(e) => updateConnectionField('username', e.target.value)} placeholder="database user"/></label><label>Password<input type="password" value={connectionForm.password} onChange={(e) => updateConnectionField('password', e.target.value)} placeholder="Password (if required)" autoComplete="new-password"/></label><label className="ssl-checkbox"><input type="checkbox" checked={connectionForm.ssl} onChange={(e) => updateConnectionField('ssl', e.target.checked)}/> Require SSL with certificate validation</label>{connectionResult && <div className={`connection-result ${connectionResult.startsWith('Connected') ? 'success' : connectionResult.startsWith('Reading') ? 'pending' : 'error'}`} role={connectionResult.startsWith('Connected') || connectionResult.startsWith('Reading') ? 'status' : 'alert'} aria-live="polite">{connectionResult.startsWith('Connected') ? <Check size={14}/> : connectionResult.startsWith('Reading') ? <Clock3 size={14}/> : <CircleHelp size={14}/>}<span>{connectionResult}</span></div>}<div className="modal-note"><ShieldCheck size={15}/><span>Local development only. Browsing is read-only; record changes require separate review and confirmation. Credentials remain in the API memory pool for up to 15 idle minutes; Disconnect closes the session. The form clears when this dialog closes.</span></div><button className="button button-primary full-button" type="submit" disabled={connectionBusy}>{connectionBusy ? (connectionResult.startsWith('Reading') ? 'Inspecting schema…' : 'Testing connection…') : 'Test connection'} <ArrowRight size={14}/></button>{connectionVerified && (pendingConnectionId || liveConnectionId) && <button className="button button-quiet full-button" type="button" onClick={inspectSchema} disabled={connectionBusy}>{connectionBusy ? 'Inspecting schema…' : pendingConnectionId ? `Inspect ${connectionEngine === 'postgres' ? 'PostgreSQL' : 'MySQL'} schema` : `Refresh ${connectionEngine === 'postgres' ? 'PostgreSQL' : 'MySQL'} schema`} <Database size={14}/></button>}</form></div></div>}
    {showEditRecord && liveConnectionId && liveRecords && selectedLiveRow && liveRecordTable && <EditRecordDialog connectionId={liveConnectionId} schema={liveRecords.schema} table={liveRecords.table} row={selectedLiveRow} columns={liveRecordTable.columns} onClose={() => setShowEditRecord(false)} onRefresh={() => loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page, liveRecords.pageSize, liveSort, searchText)} onSaved={async () => { const refreshed = await loadLiveRecords(liveRecords.schema, liveRecords.table, liveRecords.page, liveRecords.pageSize); notify(refreshed ? 'Row saved to the database' : 'Row saved, but the table did not refresh. Use Retry to verify it.'); }} />}
    {showInsertRecord && liveConnectionId && liveRecords && liveRecordTable && <InsertRecordDialog connectionId={liveConnectionId} schema={liveRecords.schema} table={liveRecords.table} columns={liveRecordTable.columns} onClose={() => setShowInsertRecord(false)} onInserted={refreshAfterInsert} />}
    {showDeleteRecord && liveConnectionId && liveRecords && selectedLiveRow && liveRecordTable && <DeleteRecordDialog connectionId={liveConnectionId} schema={liveRecords.schema} table={liveRecords.table} row={selectedLiveRow} columns={liveRecordTable.columns} onClose={() => setShowDeleteRecord(false)} onDeleted={refreshAfterDelete} />}
    {showCreateTable && liveConnectionId && liveSchema && <CreateTableDialog connectionId={liveConnectionId} engine={liveSchema.engine} references={liveSchema.tables} initialSchema={liveSchema.engine === 'mysql' ? liveSchema.database : selectedLiveTable?.schema ?? liveSchema.tables[0]?.schema ?? 'public'} onClose={() => setShowCreateTable(false)} onPlanned={stageSchemaPlanEntry}/>}
    {showAddColumnReview && liveConnectionId && <ReviewAddColumnDialog connectionId={liveConnectionId} sql={addColumnSql} onClose={() => setShowAddColumnReview(false)} onPlanned={stageSchemaPlanEntry}/>}
    {showNullabilityReview && liveConnectionId && <ReviewNullabilityDialog connectionId={liveConnectionId} sql={nullabilitySql} onClose={() => setShowNullabilityReview(false)} onPlanned={stageSchemaPlanEntry}/>}
    {relationshipTables && liveSchema && liveConnectionId && (() => { const referenced = liveSchema.tables.find((table) => schemaTableId(table.schema, table.name) === relationshipTables.referenced); const referencing = liveSchema.tables.find((table) => schemaTableId(table.schema, table.name) === relationshipTables.referencing); return referenced && referencing ? <CreateRelationshipDialog connectionId={liveConnectionId} referencedTable={referenced} referencingTable={referencing} onClose={() => setRelationshipTables(null)} onPlanned={stageSchemaPlanEntry}/> : null; })()}
    {showSchemaChangePlan && liveConnectionId && <SchemaChangePlan connectionId={liveConnectionId} changes={schemaChangePlan} onRemove={(id) => setSchemaChangePlan((current) => current.filter((change) => change.id !== id))} onClose={() => setShowSchemaChangePlan(false)} onApplied={applyCompletedSchemaPlan}/>}
    {showSchemaGroups && <SchemaGroupsDialog groups={schemaGroups} onClose={() => setShowSchemaGroups(false)} onCreate={createSchemaGroup} onRename={(id, name) => updateSchemaGroup(id, { name })} onColor={(id, color) => updateSchemaGroup(id, { color })} onToggle={toggleSchemaGroup} onDelete={deleteSchemaGroup}/>}
    {deleteTableId && liveSchema && liveConnectionId && (() => { const table = liveSchema.tables.find((item) => schemaTableId(item.schema, item.name) === deleteTableId); return table ? <DeleteTableDialog connectionId={liveConnectionId} table={table} onClose={() => setDeleteTableId(null)} onDeleted={refreshSchemaAfterTableDrop} onReconnect={() => { setDeleteTableId(null); setShowConnection(true); }}/> : null; })()}
    {toast && <div className="toast" role="status" aria-live="polite"><Check size={15}/>{toast}</div>}
  </div>;
}
export default App;
