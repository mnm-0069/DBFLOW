import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AgGridReact } from '@ag-grid-community/react';
import type { ColDef, RowDoubleClickedEvent, SelectionChangedEvent, GetRowIdParams } from '@ag-grid-community/core';
import {
  Table2,
  Search,
  Plus,
  Edit3,
  Trash2,
  RefreshCw,
  Download,
  KeyRound,
  Link2,
  LockKeyhole,
  ChevronRight,
  ChevronDown,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  X,
  FileSpreadsheet,
  PanelLeftClose,
  PanelLeft,
  Database,
  Hash,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code2,
  Eye,
  Copy,
  Check,
  Info,
} from 'lucide-react';
import type { ExplorerTable } from './DatabaseExplorer';

export type LiveRecordSort = {
  column: string;
  direction: 'asc' | 'desc';
};

export type LiveRecordsPage = {
  schema: string;
  table: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  rows: Array<Record<string, unknown>>;
};

export type LiveSchemaTable = {
  schema: string;
  name: string;
  columns: Array<{
    name: string;
    type: string;
    key?: 'pk' | 'fk' | 'pk-fk';
    nullable?: boolean;
    identity?: boolean;
    hasDefault?: boolean;
    unique?: boolean;
  }>;
  primaryKey?: string[];
  foreignKeys: Array<{
    column: string;
    referencedSchema: string;
    referencedTable: string;
    referencedColumn: string;
  }>;
};

export type LiveSchema = {
  engine: 'postgres' | 'mysql';
  database: string;
  introspectedAt: string;
  tables: LiveSchemaTable[];
};

interface DataExplorerViewProps {
  liveSchema: LiveSchema | null;
  liveRecords: LiveRecordsPage | null;
  activeTable: string;
  recordsBusy: boolean;
  recordsError: string;
  liveSort: LiveSortState | null;
  searchText: string;
  setSearchText: (text: string) => void;
  selectedLiveRow: Record<string, unknown> | null;
  setSelectedLiveRow: (row: Record<string, unknown> | null) => void;
  loadLiveRecords: (schema: string, table: string, page: number, pageSize?: number, sort?: LiveSortState | null, search?: string) => Promise<unknown>;
  onAddRow: () => void;
  onEditRow: () => void;
  onDeleteRow: () => void;
  onNavigateToSchema?: (tableName?: string) => void;
  onNavigateToSql?: (query?: string) => void;
  demoNodes?: Array<{ id: string; data: { label: string; columns: Array<{ name: string; type: string; key?: string }> } }>;
  demoRows?: Array<Record<string, unknown>>;
  onRefreshSchema?: () => Promise<void>;
  schemaRefreshBusy?: boolean;
}

export type LiveSortState = {
  column: string;
  direction: 'asc' | 'desc';
};

export function DataExplorerView({
  liveSchema,
  liveRecords,
  activeTable,
  recordsBusy,
  recordsError,
  liveSort,
  searchText,
  setSearchText,
  selectedLiveRow,
  setSelectedLiveRow,
  loadLiveRecords,
  onAddRow,
  onEditRow,
  onDeleteRow,
  onNavigateToSchema,
  onNavigateToSql,
  demoNodes = [],
  demoRows = [],
  onRefreshSchema,
  schemaRefreshBusy = false,
}: DataExplorerViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [quickSearchInput, setQuickSearchInput] = useState(searchText);
  const [structureOpen, setStructureOpen] = useState(false);
  const [inspectingRow, setInspectingRow] = useState<Record<string, unknown> | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact>(null);

  const copyFieldValue = (key: string, val: unknown) => {
    const text = typeof val === 'object' && val !== null ? JSON.stringify(val, null, 2) : String(val ?? '');
    void navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // Sync quickSearchInput with parent searchText
  useEffect(() => {
    setQuickSearchInput(searchText);
  }, [searchText]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      if (quickSearchInput !== searchText) {
        setSearchText(quickSearchInput);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [quickSearchInput, searchText, setSearchText]);

  // Current active table schema & name
  const currentTableMeta = useMemo(() => {
    if (liveSchema && liveRecords) {
      return liveSchema.tables.find(
        (t) => t.schema === liveRecords.schema && t.name === liveRecords.table
      );
    }
    if (liveSchema && liveSchema.tables.length > 0) {
      // Find matching table or default to first
      return liveSchema.tables.find(
        (t) => `${t.schema}.${t.name}` === activeTable || t.name === activeTable
      ) || liveSchema.tables[0];
    }
    return null;
  }, [liveSchema, liveRecords, activeTable]);

  // Demo active table fallback
  const demoActiveNode = useMemo(() => {
    return demoNodes.find((n) => n.id === activeTable) || demoNodes[0];
  }, [demoNodes, activeTable]);

  // Primary key columns
  const primaryKeys = useMemo(() => {
    if (currentTableMeta) {
      return currentTableMeta.columns.filter((c) => c.key === 'pk' || c.key === 'pk-fk');
    }
    return demoActiveNode?.data.columns.filter((c) => c.key === 'pk') ?? [];
  }, [currentTableMeta, demoActiveNode]);

  const canDelete = Boolean(
    selectedLiveRow &&
    primaryKeys.length > 0 &&
    Object.values(selectedLiveRow).every(
      (v) => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
    )
  );

  // Group tables by schema for left navigator
  const schemaGroups = useMemo(() => {
    if (!liveSchema) return [];
    const map: Record<string, LiveSchemaTable[]> = {};
    for (const t of liveSchema.tables) {
      const s = t.schema || 'public';
      if (!map[s]) map[s] = [];
      map[s].push(t);
    }
    return Object.entries(map).map(([schema, tables]) => ({
      schema,
      tables: tables.filter((t) =>
        !tableSearch.trim() ||
        t.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
        t.columns.some((c) => c.name.toLowerCase().includes(tableSearch.toLowerCase()))
      ),
    }));
  }, [liveSchema, tableSearch]);

  // Table change handler
  const handleSelectTable = (schema: string, tableName: string) => {
    if (liveSchema) {
      void loadLiveRecords(schema, tableName, 0, liveRecords?.pageSize ?? 50);
    }
  };

  // CSV Export utility
  const handleExportCsv = () => {
    if (gridRef.current?.api) {
      const fileName = liveRecords
        ? `${liveRecords.schema}_${liveRecords.table}_page_${liveRecords.page + 1}.csv`
        : `${demoActiveNode?.id ?? 'export'}.csv`;
      gridRef.current.api.exportDataAsCsv({ fileName });
    }
  };

  // Build AG Grid Column Definitions
  const colDefs: ColDef[] = useMemo(() => {
    if (currentTableMeta) {
      return currentTableMeta.columns.map((column) => {
        const isPk = column.key === 'pk' || column.key === 'pk-fk';
        const isFk = column.key === 'fk' || column.key === 'pk-fk';
        const lowerType = column.type.toLowerCase();

        return {
          field: column.name,
          headerName: column.name,
          minWidth: 140,
          flex: 1,
          sortable: true,
          resizable: true,
          headerComponent: (params: any) => (
            <div
              className="custom-grid-header"
              title={`${column.name} (${column.type})`}
              onClick={(e) => {
                if (typeof params?.progressSort === 'function') {
                  params.progressSort(e.shiftKey);
                }
              }}
            >
              <div className="header-meta-left">
                {isPk && (
                  <span title="Primary Key" className="inline-flex items-center">
                    <KeyRound size={12} className="header-pk-icon" />
                  </span>
                )}
                {isFk && !isPk && (
                  <span title="Foreign Key" className="inline-flex items-center">
                    <Link2 size={12} className="header-fk-icon" />
                  </span>
                )}
                <span className="header-col-name">{column.name}</span>
              </div>
              <span className="header-col-type">{column.type}</span>
            </div>
          ),
          cellRenderer: (params: any) => {
            const val = params.value;
            if (val === null || val === undefined) {
              return <span className="cell-null-tag">NULL</span>;
            }
            if (typeof val === 'boolean') {
              return (
                <span className={`cell-bool-pill ${val ? 'is-true' : 'is-false'}`}>
                  {val ? 'TRUE' : 'FALSE'}
                </span>
              );
            }
            if (lowerType.includes('time') || lowerType.includes('date')) {
              return <span className="cell-date font-mono">{String(val)}</span>;
            }
            if (lowerType.includes('int') || lowerType.includes('num') || lowerType.includes('float') || lowerType.includes('decimal')) {
              return <span className="cell-numeric font-mono">{String(val)}</span>;
            }
            if (lowerType.includes('json') || typeof val === 'object') {
              return (
                <span className="cell-json font-mono" title={JSON.stringify(val)}>
                  {typeof val === 'string' ? val : JSON.stringify(val)}
                </span>
              );
            }
            return <span className="cell-text">{String(val)}</span>;
          },
        };
      });
    }

    // Demo column defs fallback
    if (demoActiveNode) {
      return demoActiveNode.data.columns.map((col) => ({
        field: col.name,
        headerName: col.name,
        minWidth: 140,
        flex: 1,
        sortable: true,
        resizable: true,
        headerComponent: (params: any) => (
          <div
            className="custom-grid-header"
            onClick={(e) => {
              if (typeof params?.progressSort === 'function') {
                params.progressSort(e.shiftKey);
              }
            }}
          >
            <div className="header-meta-left">
              {col.key === 'pk' && <KeyRound size={12} className="header-pk-icon" />}
              {col.key === 'fk' && <Link2 size={12} className="header-fk-icon" />}
              <span className="header-col-name">{col.name}</span>
            </div>
            <span className="header-col-type">{col.type}</span>
          </div>
        ),
        cellRenderer: (params: any) => {
          const val = params.value;
          if (val === null || val === undefined) {
            return <span className="cell-null-tag">NULL</span>;
          }
          if (col.name === 'status') {
            return <span className={`status-pill ${String(val).toLowerCase()}`}>{String(val)}</span>;
          }
          return <span className="cell-text">{String(val)}</span>;
        },
      }));
    }

    return [];
  }, [currentTableMeta, demoActiveNode]);

  // Filtered rows for demo mode
  const demoFilteredRows = useMemo(() => {
    if (!demoRows.length) return [];
    if (!searchText.trim()) return demoRows;
    const q = searchText.toLowerCase();
    return demoRows.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [demoRows, searchText]);

  // Current row data
  const rowData = liveRecords ? liveRecords.rows : demoFilteredRows;

  // On sort changed in grid
  const handleSortChanged = useCallback(
    (event: any) => {
      if (!liveRecords || recordsBusy) return;
      const colState = event.api.getColumnState().find((col: any) => col.sort);
      const nextSort: LiveSortState | null = colState?.sort
        ? { column: colState.colId, direction: colState.sort }
        : null;

      if (JSON.stringify(nextSort) === JSON.stringify(liveSort)) return;
      void loadLiveRecords(
        liveRecords.schema,
        liveRecords.table,
        0,
        liveRecords.pageSize,
        nextSort,
        searchText
      );
    },
    [liveRecords, recordsBusy, liveSort, searchText, loadLiveRecords]
  );

  // On double click row -> open Edit
  const handleRowDoubleClick = (event: RowDoubleClickedEvent) => {
    if (event.data) {
      setSelectedLiveRow(event.data);
      if (primaryKeys.length > 0) {
        onEditRow();
      }
    }
  };

  return (
    <div className="data-explorer-container animate-fade-in">
      {/* 1. Left Table & Object Navigation Sidebar */}
      <aside className={`data-explorer-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="explorer-sidebar-header">
          <div className="sidebar-header-info">
            <Database size={15} className="text-blue-600" />
            <div className="sidebar-db-details">
              <strong>{liveSchema ? liveSchema.database : 'commerce_demo'}</strong>
              <small>{liveSchema ? `${liveSchema.engine.toUpperCase()} Catalog` : 'Demo DB'}</small>
            </div>
          </div>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse table list' : 'Expand table list'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
          </button>
        </div>

        {sidebarOpen && (
          <>
            <div className="explorer-search-box">
              <Search size={13} className="text-slate-400" />
              <input
                type="text"
                placeholder="Filter tables & views…"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
              {tableSearch && (
                <button className="clear-search-btn" onClick={() => setTableSearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="explorer-table-tree" role="tree">
              {liveSchema ? (
                schemaGroups.map(({ schema, tables }) => (
                  <div className="tree-schema-group" key={schema}>
                    <div className="tree-schema-heading">
                      <Layers size={13} className="text-purple-600" />
                      <span>{schema}</span>
                      <span className="tree-count-pill">{tables.length}</span>
                    </div>
                    <div className="tree-tables-list">
                      {tables.length === 0 ? (
                        <div className="tree-empty-notice">No matching tables</div>
                      ) : (
                        tables.map((table) => {
                          const isSelected =
                            currentTableMeta?.schema === table.schema &&
                            currentTableMeta?.name === table.name;
                          return (
                            <button
                              key={`${table.schema}.${table.name}`}
                              className={`tree-table-item ${isSelected ? 'is-active' : ''}`}
                              onClick={() => handleSelectTable(table.schema, table.name)}
                              title={`${table.schema}.${table.name} (${table.columns.length} columns)`}
                            >
                              <Table2 size={13} className="tree-table-icon" />
                              <span className="tree-table-title">{table.name}</span>
                              <span className="tree-col-count">{table.columns.length} cols</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))
              ) : (
                /* Demo mode table list */
                <div className="tree-schema-group">
                  <div className="tree-schema-heading">
                    <Layers size={13} className="text-purple-600" />
                    <span>public</span>
                    <span className="tree-count-pill">{demoNodes.length}</span>
                  </div>
                  <div className="tree-tables-list">
                    {demoNodes.map((node) => {
                      const isSelected = demoActiveNode?.id === node.id;
                      return (
                        <button
                          key={node.id}
                          className={`tree-table-item ${isSelected ? 'is-active' : ''}`}
                          onClick={() => {
                            // In demo mode, table selection handled by parent
                            handleSelectTable('public', node.id);
                          }}
                        >
                          <Table2 size={13} className="tree-table-icon" />
                          <span className="tree-table-title">{node.data.label}</span>
                          <span className="tree-col-count">{node.data.columns.length} cols</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {liveSchema && onRefreshSchema && (
              <div className="explorer-sidebar-footer">
                <button
                  className="sidebar-refresh-btn"
                  onClick={() => void onRefreshSchema()}
                  disabled={schemaRefreshBusy}
                  title="Reload schema from connected database"
                >
                  <RefreshCw size={12} className={schemaRefreshBusy ? 'animate-spin' : ''} />
                  <span>{schemaRefreshBusy ? 'Refreshing…' : 'Refresh Catalog'}</span>
                </button>
              </div>
            )}
          </>
        )}
      </aside>

      {/* 2. Main Data Grid Workspace */}
      <main className="data-explorer-main">
        {/* Main Workspace Header */}
        <header className="data-workspace-header">
          <div className="workspace-header-left">
            {!sidebarOpen && (
              <button
                className="expand-sidebar-pill"
                onClick={() => setSidebarOpen(true)}
                title="Open Table Navigator"
              >
                <PanelLeft size={14} />
                <span>Tables</span>
              </button>
            )}

            <div className="active-table-breadcrumbs">
              <span className="breadcrumb-db">{liveSchema ? liveSchema.database : 'commerce_demo'}</span>
              <ChevronRight size={13} className="breadcrumb-separator" />
              <span className="breadcrumb-schema">
                {currentTableMeta ? currentTableMeta.schema : 'public'}
              </span>
              <ChevronRight size={13} className="breadcrumb-separator" />
              <strong className="breadcrumb-table">
                {currentTableMeta ? currentTableMeta.name : demoActiveNode?.data.label ?? 'orders'}
              </strong>
            </div>

            <div className="table-badge-cluster">
              <span className="table-type-pill">BASE TABLE</span>
              <span className="table-stat-pill">
                {currentTableMeta
                  ? `${currentTableMeta.columns.length} columns`
                  : `${demoActiveNode?.data.columns.length ?? 0} columns`}
              </span>
              {primaryKeys.length > 0 && (
                <span className="table-pk-pill" title={`Primary Key: ${primaryKeys.map((c) => c.name).join(', ')}`}>
                  <KeyRound size={11} />
                  <span>PK: {primaryKeys.map((c) => c.name).join(', ')}</span>
                </span>
              )}
            </div>
          </div>

          <div className="workspace-header-actions">
            {currentTableMeta && (
              <button
                className={`button ${structureOpen ? 'button-primary' : 'button-quiet'} btn-compact`}
                onClick={() => setStructureOpen(!structureOpen)}
                title="Toggle Table Schema & Column Details Drawer"
              >
                <Layers size={13} />
                <span>Structure</span>
                <span className="drawer-count-badge">{currentTableMeta.columns.length}</span>
              </button>
            )}

            {liveSchema && onNavigateToSchema && (
              <button
                className="button button-quiet btn-compact"
                onClick={() => onNavigateToSchema(currentTableMeta?.name)}
                title="Inspect in Schema Designer canvas"
              >
                <ExternalLink size={13} />
                <span>View Schema</span>
              </button>
            )}

            {liveSchema && onNavigateToSql && (
              <button
                className="button button-quiet btn-compact"
                onClick={() =>
                  onNavigateToSql(`SELECT * FROM ${currentTableMeta?.schema}.${currentTableMeta?.name} LIMIT 50;`)
                }
                title="Open table query in SQL Workspace"
              >
                <Code2 size={13} />
                <span>SQL Query</span>
              </button>
            )}

            <button
              className="button button-quiet btn-compact"
              onClick={handleExportCsv}
              title="Download visible page records as CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
          </div>
        </header>

        {/* Action & Filter Command Bar */}
        <div className="data-command-bar">
          <div className="command-search-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="search"
              placeholder={liveSchema ? 'Search all rows in table…' : 'Search sample records…'}
              value={quickSearchInput}
              onChange={(e) => setQuickSearchInput(e.target.value)}
              className="command-search-input"
            />
            {quickSearchInput && (
              <button
                className="clear-search-btn"
                onClick={() => {
                  setQuickSearchInput('');
                  setSearchText('');
                }}
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="command-actions-wrap">
            <button
              className="button button-quiet btn-compact"
              onClick={() => {
                if (liveRecords && currentTableMeta) {
                  void loadLiveRecords(
                    currentTableMeta.schema,
                    currentTableMeta.name,
                    liveRecords.page,
                    liveRecords.pageSize,
                    liveSort,
                    searchText
                  );
                }
              }}
              disabled={recordsBusy}
              title="Refresh current page from database"
            >
              <RefreshCw size={13} className={recordsBusy ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>

            {liveSchema && (
              <>
                <button
                  className="button button-primary btn-compact"
                  onClick={onAddRow}
                  disabled={recordsBusy}
                  title="Insert a new row into this table"
                >
                  <Plus size={14} />
                  <span>Add row</span>
                </button>

                <button
                  className="button button-quiet btn-compact"
                  onClick={() => selectedLiveRow && setInspectingRow(selectedLiveRow)}
                  disabled={!selectedLiveRow}
                  title={!selectedLiveRow ? 'Select a row to inspect' : 'Inspect complete row details and copy values'}
                >
                  <Eye size={13} />
                  <span>Inspect</span>
                </button>

                <button
                  className="button button-quiet btn-compact"
                  onClick={onEditRow}
                  disabled={!selectedLiveRow || primaryKeys.length === 0 || recordsBusy}
                  title={
                    !selectedLiveRow
                      ? 'Select a row to edit'
                      : primaryKeys.length === 0
                      ? 'A primary key is required to update rows'
                      : 'Edit the selected row'
                  }
                >
                  <Edit3 size={13} />
                  <span>Edit row</span>
                </button>

                <button
                  className="button button-danger-quiet btn-compact"
                  onClick={onDeleteRow}
                  disabled={!canDelete || recordsBusy}
                  title={
                    !selectedLiveRow
                      ? 'Select a row to delete'
                      : primaryKeys.length === 0
                      ? 'A primary key is required to delete rows'
                      : !canDelete
                      ? 'This row contains unsupported comparison values'
                      : 'Delete the selected row'
                  }
                >
                  <Trash2 size={13} />
                  <span>Delete row</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Database Error Banner */}
        {recordsError && (
          <div className="data-error-banner animate-fade-in" role="alert">
            <AlertCircle size={16} className="text-red-500" />
            <div className="error-copy">
              <strong>Table Load Error</strong>
              <span>{recordsError}</span>
            </div>
            <button
              className="button button-quiet btn-compact"
              onClick={() => {
                if (currentTableMeta) {
                  void loadLiveRecords(
                    currentTableMeta.schema,
                    currentTableMeta.name,
                    liveRecords?.page ?? 0,
                    liveRecords?.pageSize ?? 50,
                    liveSort,
                    searchText
                  );
                }
              }}
              disabled={recordsBusy}
            >
              Retry
            </button>
          </div>
        )}

        {/* Main Grid + Structure Drawer Split Layout */}
        <div className="data-grid-workspace-layout">
          {/* The Primary AG Grid Data Table */}
          <div className="data-grid-viewport">
            {recordsBusy && (
              <div className="grid-loading-curtain" role="status" aria-live="polite">
                <RefreshCw size={24} className="animate-spin text-blue-600" />
                <span>Querying database records…</span>
              </div>
            )}

            <div className="ag-theme-quartz custom-grid data-explorer-grid">
              <AgGridReact
                ref={gridRef}
                rowData={rowData}
                columnDefs={colDefs}
                defaultColDef={{
                  sortable: true,
                  resizable: true,
                  minWidth: 120,
                }}
                rowSelection={{
                  mode: 'singleRow',
                  checkboxes: false,
                  enableClickSelection: true,
                }}
                getRowId={(params: GetRowIdParams) => {
                  if (primaryKeys.length > 0) {
                    return JSON.stringify(primaryKeys.map((k) => params.data[k.name]));
                  }
                  return JSON.stringify(Object.values(params.data));
                }}
                onSelectionChanged={(event: SelectionChangedEvent) => {
                  const rows = event.api.getSelectedRows();
                  setSelectedLiveRow(rows.length > 0 ? rows[0] : null);
                }}
                onRowDoubleClicked={handleRowDoubleClick}
                onSortChanged={handleSortChanged}
                rowHeight={40}
                headerHeight={40}
                animateRows={false}
                suppressCellFocus={true}
                overlayNoRowsTemplate={
                  searchText
                    ? '<span>No rows match the search query.</span>'
                    : '<span>This table has no records. Click "Add Row" to create the first record.</span>'
                }
              />
            </div>
          </div>

          {/* Collapsible Right Structure Drawer */}
          {structureOpen && currentTableMeta && (
            <aside className="table-structure-drawer animate-fade-in" aria-label="Table Structure Inspector">
              <div className="structure-drawer-header">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-blue-600" />
                  <strong>Table Structure</strong>
                </div>
                <button
                  className="sidebar-toggle-btn"
                  onClick={() => setStructureOpen(false)}
                  title="Close structure drawer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="structure-table-summary">
                <span className="summary-title">{currentTableMeta.schema}.{currentTableMeta.name}</span>
                <span className="summary-details">
                  {currentTableMeta.columns.length} columns · {primaryKeys.length} PK · {currentTableMeta.foreignKeys.length} FK
                </span>
              </div>

              <div className="structure-section">
                <span className="structure-section-heading">COLUMNS</span>
                <div className="structure-col-list">
                  {currentTableMeta.columns.map((col) => {
                    const isPk = col.key === 'pk' || col.key === 'pk-fk';
                    const isFk = col.key === 'fk' || col.key === 'pk-fk';
                    return (
                      <div className="structure-col-item" key={col.name}>
                        <div className="structure-col-main">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isPk && <span title="Primary Key" className="inline-flex"><KeyRound size={11} className="text-amber-500 flex-shrink-0" /></span>}
                            {isFk && !isPk && <span title="Foreign Key" className="inline-flex"><Link2 size={11} className="text-blue-500 flex-shrink-0" /></span>}
                            <strong className="structure-col-name">{col.name}</strong>
                          </div>
                          <span className="structure-col-type">{col.type}</span>
                        </div>
                        <div className="structure-col-tags">
                          {isPk && <span className="struct-tag pk-tag">PK</span>}
                          {isFk && <span className="struct-tag fk-tag">FK</span>}
                          {col.nullable === false ? (
                            <span className="struct-tag not-null-tag">NOT NULL</span>
                          ) : (
                            <span className="struct-tag null-tag">NULL</span>
                          )}
                          {col.identity && <span className="struct-tag id-tag">IDENTITY</span>}
                          {col.unique && !isPk && <span className="struct-tag uniq-tag">UNIQUE</span>}
                          {col.hasDefault && <span className="struct-tag default-tag">DEFAULT</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {currentTableMeta.foreignKeys.length > 0 && (
                <div className="structure-section">
                  <span className="structure-section-heading">FOREIGN KEYS</span>
                  <div className="structure-fk-list">
                    {currentTableMeta.foreignKeys.map((fk, idx) => (
                      <div className="structure-fk-item" key={idx}>
                        <div className="fk-route">
                          <code>{fk.column}</code>
                          <ArrowRight size={11} className="text-slate-400" />
                          <button
                            className="fk-target-link"
                            onClick={() => handleSelectTable(fk.referencedSchema, fk.referencedTable)}
                            title={`Jump to ${fk.referencedSchema}.${fk.referencedTable}`}
                          >
                            {fk.referencedTable}.{fk.referencedColumn}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="structure-drawer-footer">
                {onNavigateToSql && (
                  <button
                    className="button button-quiet w-full justify-center text-xs"
                    onClick={() =>
                      onNavigateToSql(`SELECT * FROM ${currentTableMeta.schema}.${currentTableMeta.name} LIMIT 50;`)
                    }
                  >
                    <Code2 size={13} />
                    <span>Open in SQL Editor</span>
                  </button>
                )}
                {onNavigateToSchema && (
                  <button
                    className="button button-quiet w-full justify-center text-xs"
                    onClick={() => onNavigateToSchema(currentTableMeta.name)}
                  >
                    <ExternalLink size={13} />
                    <span>View in Schema Canvas</span>
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Record Details Inspector Modal */}
        {inspectingRow && (
          <div className="modal-backdrop" onClick={() => setInspectingRow(null)}>
            <div
              className="record-inspect-modal animate-scale-up"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inspect-record-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inspect-modal-header">
                <div>
                  <div className="flex items-center gap-2">
                    <Table2 size={16} className="text-blue-600" />
                    <h3 id="inspect-record-title">
                      Record in <code>{currentTableMeta?.name ?? 'table'}</code>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Inspect complete column values, copy data, or jump to record mutations.
                  </p>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setInspectingRow(null)}
                  aria-label="Close record inspector"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="inspect-modal-body">
                <table className="record-inspect-table">
                  <thead>
                    <tr>
                      <th style={{ width: '200px' }}>Column</th>
                      <th style={{ width: '130px' }}>Type</th>
                      <th>Value</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentTableMeta?.columns ?? Object.keys(inspectingRow).map((k) => ({ name: k, type: typeof inspectingRow[k] }))).map((col) => {
                      const val = inspectingRow[col.name];
                      const isPk = (col as any).key === 'pk' || (col as any).key === 'pk-fk';
                      const isFk = (col as any).key === 'fk' || (col as any).key === 'pk-fk';
                      const isNull = val === null || val === undefined;
                      const isCopied = copiedField === col.name;

                      return (
                        <tr key={col.name}>
                          <td className="col-cell-name">
                            <div className="flex items-center gap-1.5">
                              {isPk && <span title="Primary Key" className="inline-flex"><KeyRound size={12} className="text-amber-500" /></span>}
                              {isFk && <span title="Foreign Key" className="inline-flex"><Link2 size={12} className="text-blue-500" /></span>}
                              <strong className="font-mono text-xs">{col.name}</strong>
                            </div>
                          </td>
                          <td className="col-cell-type font-mono text-xs text-slate-500">{col.type}</td>
                          <td className="col-cell-val">
                            {isNull ? (
                              <span className="cell-null-tag">NULL</span>
                            ) : typeof val === 'boolean' ? (
                              <span className={`cell-bool-pill ${val ? 'is-true' : 'is-false'}`}>
                                {val ? 'TRUE' : 'FALSE'}
                              </span>
                            ) : typeof val === 'object' ? (
                              <pre className="inspect-json-val">{JSON.stringify(val, null, 2)}</pre>
                            ) : (
                              <span className="font-mono text-xs select-all">{String(val)}</span>
                            )}
                          </td>
                          <td className="col-cell-action">
                            {!isNull && (
                              <button
                                className="copy-cell-btn"
                                onClick={() => copyFieldValue(col.name, val)}
                                title={isCopied ? 'Copied!' : 'Copy value'}
                              >
                                {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="inspect-modal-footer">
                <button className="button button-quiet" onClick={() => setInspectingRow(null)}>
                  Close
                </button>
                {primaryKeys.length > 0 && (
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setSelectedLiveRow(inspectingRow);
                      setInspectingRow(null);
                      onEditRow();
                    }}
                  >
                    <Edit3 size={13} />
                    <span>Edit this Record</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Workspace Footer: Pagination & Diagnostics */}
        <footer className="data-workspace-footer">
          <div className="footer-status-info">
            {liveRecords ? (
              <span>
                Page <strong>{liveRecords.page + 1}</strong> ·{' '}
                <strong>{liveRecords.rows.length}</strong> {searchText ? 'matching ' : ''}rows on page
                {liveSort && (
                  <span className="sort-indicator-chip">
                    Sorted by <code>{liveSort.column}</code> {liveSort.direction.toUpperCase()}
                    <button
                      onClick={() => {
                        if (currentTableMeta) {
                          void loadLiveRecords(
                            currentTableMeta.schema,
                            currentTableMeta.name,
                            0,
                            liveRecords.pageSize,
                            null,
                            searchText
                          );
                        }
                      }}
                      title="Clear sort"
                    >
                      <X size={10} />
                    </button>
                  </span>
                )}
              </span>
            ) : (
              <span>Showing <strong>{demoFilteredRows.length}</strong> sample records · Read-only Demo</span>
            )}

            {selectedLiveRow && (
              <span className="selected-row-pill">
                <CheckCircle2 size={12} className="text-blue-500" />
                <span>1 row selected</span>
                <span className="text-slate-400">• Double click row to edit</span>
              </span>
            )}
          </div>

          <div className="footer-pagination-controls">
            {liveRecords ? (
              <>
                <label className="page-size-selector">
                  <span>Rows:</span>
                  <select
                    value={liveRecords.pageSize}
                    disabled={recordsBusy}
                    onChange={(e) => {
                      if (currentTableMeta) {
                        void loadLiveRecords(
                          currentTableMeta.schema,
                          currentTableMeta.name,
                          0,
                          Number(e.target.value),
                          liveSort,
                          searchText
                        );
                      }
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>

                <div className="page-nav-btns">
                  <button
                    className="button button-quiet btn-compact"
                    disabled={recordsBusy || liveRecords.page === 0}
                    onClick={() => {
                      if (currentTableMeta) {
                        void loadLiveRecords(
                          currentTableMeta.schema,
                          currentTableMeta.name,
                          liveRecords.page - 1,
                          liveRecords.pageSize,
                          liveSort,
                          searchText
                        );
                      }
                    }}
                  >
                    Previous
                  </button>

                  <span className="page-number-badge">{liveRecords.page + 1}</span>

                  <button
                    className="button button-quiet btn-compact"
                    disabled={recordsBusy || !liveRecords.hasMore}
                    onClick={() => {
                      if (currentTableMeta) {
                        void loadLiveRecords(
                          currentTableMeta.schema,
                          currentTableMeta.name,
                          liveRecords.page + 1,
                          liveRecords.pageSize,
                          liveSort,
                          searchText
                        );
                      }
                    }}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <span className="demo-badge-footer">Demo Mode</span>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
