import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Database,
  Layers,
  Table2,
  KeyRound,
  Link2,
  Columns3,
  Search,
  Eye,
  GitBranch,
  ShieldCheck,
  Hash
} from 'lucide-react';

export type ExplorerTable = {
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
};

interface DatabaseExplorerProps {
  engine: 'postgres' | 'mysql' | 'demo';
  databaseName: string;
  tables: ExplorerTable[];
  activeTable?: string;
  onSelectTable: (schema: string, table: string, view: 'data' | 'schema') => void;
  onRefresh?: () => void;
}

export function DatabaseExplorer({
  engine,
  databaseName,
  tables,
  activeTable,
  onSelectTable,
}: DatabaseExplorerProps) {
  const [filterText, setFilterText] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'conn-root': true,
    'db-root': false,
  });

  const toggleNode = (nodeId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Group tables by schema
  const schemasMap: Record<string, ExplorerTable[]> = {};
  for (const table of tables) {
    const s = table.schema || 'public';
    if (!schemasMap[s]) schemasMap[s] = [];
    schemasMap[s].push(table);
  }

  const schemaEntries = Object.entries(schemasMap);

  const filteredTables = (tableList: ExplorerTable[]) => {
    if (!filterText.trim()) return tableList;
    const q = filterText.toLowerCase();
    return tableList.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q))
    );
  };

  return (
    <div className="database-explorer-container">
      <div className="explorer-header">
        <div className="explorer-title">
          <Database size={15} className="text-blue-600" />
          <span>Database Explorer</span>
        </div>
        <div className="explorer-badge">
          {engine === 'postgres' ? 'PostgreSQL' : engine === 'mysql' ? 'MySQL' : 'Demo DB'}
        </div>
      </div>

      <div className="explorer-search">
        <Search size={13} className="search-icon" />
        <input
          type="text"
          placeholder="Filter schema objects..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        {filterText && (
          <button className="clear-btn" onClick={() => setFilterText('')}>
            ×
          </button>
        )}
      </div>

      <div className="explorer-tree" role="tree">
        {/* Connection node */}
        <div className="tree-node connection-node">
          <div
            className="node-row"
            onClick={(e) => toggleNode('conn-root', e)}
          >
            <span className="expand-chevron">
              {expandedNodes['conn-root'] ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
            <ShieldCheck size={14} className="node-icon text-emerald-600" />
            <strong className="node-title">
              {engine === 'demo' ? 'Local Demo Session' : `${engine.toUpperCase()} Instance`}
            </strong>
          </div>

          {expandedNodes['conn-root'] && (
            <div className="tree-children">
              {/* Database node */}
              <div className="tree-node database-node">
                <div
                  className="node-row"
                  onClick={(e) => toggleNode('db-root', e)}
                >
                  <span className="expand-chevron">
                    {expandedNodes['db-root'] ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </span>
                  <Database size={13} className="node-icon text-blue-500" />
                  <span className="node-title font-mono">{databaseName}</span>
                  <span className="node-count">({tables.length} tables)</span>
                </div>

                {expandedNodes['db-root'] && (
                  <div className="tree-children">
                    {schemaEntries.map(([schema, schemaTables]) => {
                      const schemaNodeId = `schema-${schema}`;
                      const visibleTables = filteredTables(schemaTables);
                      const isSchemaOpen = expandedNodes[schemaNodeId] ?? true;

                      return (
                        <div className="tree-node schema-node" key={schema}>
                          <div
                            className="node-row"
                            onClick={(e) => toggleNode(schemaNodeId, e)}
                          >
                            <span className="expand-chevron">
                              {isSchemaOpen ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )}
                            </span>
                            <Layers size={13} className="node-icon text-purple-500" />
                            <span className="node-title">{schema}</span>
                            <span className="node-count">({visibleTables.length})</span>
                          </div>

                          {isSchemaOpen && (
                            <div className="tree-children">
                              {visibleTables.length === 0 ? (
                                <div className="tree-empty">No matching objects</div>
                              ) : (
                                visibleTables.map((tbl) => {
                                  const tableKey = `${tbl.schema}.${tbl.name}`;
                                  const tableNodeId = `table-${tableKey}`;
                                  const isTableOpen = expandedNodes[tableNodeId] ?? false;
                                  const isSelected = activeTable === tableKey || activeTable === tbl.name;

                                  return (
                                    <div
                                      className={`tree-node table-node-item ${isSelected ? 'is-selected' : ''}`}
                                      key={tableKey}
                                    >
                                      <div
                                        className="node-row"
                                        onClick={(e) => toggleNode(tableNodeId, e)}
                                      >
                                        <span className="expand-chevron">
                                          {isTableOpen ? (
                                            <ChevronDown size={12} />
                                          ) : (
                                            <ChevronRight size={12} />
                                          )}
                                        </span>
                                        <Table2 size={13} className="node-icon text-slate-600" />
                                        <span className="node-title font-mono font-medium">
                                          {tbl.name}
                                        </span>

                                        <div className="table-quick-actions">
                                          <button
                                            title="View Data Grid"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onSelectTable(tbl.schema, tbl.name, 'data');
                                            }}
                                            className="quick-action-btn"
                                          >
                                            <Eye size={12} />
                                          </button>
                                          <button
                                            title="View in Schema Designer"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onSelectTable(tbl.schema, tbl.name, 'schema');
                                            }}
                                            className="quick-action-btn"
                                          >
                                            <GitBranch size={12} />
                                          </button>
                                        </div>
                                      </div>

                                      {isTableOpen && (
                                        <div className="tree-children column-list">
                                          {tbl.columns.map((col) => (
                                            <div
                                              className="node-row column-row"
                                              key={col.name}
                                              title={`${col.name}: ${col.type}${col.key ? ` (${col.key.toUpperCase()})` : ''}`}
                                            >
                                              <span className="col-indicator">
                                                {col.key === 'pk' ? (
                                                  <KeyRound size={11} className="text-amber-500" />
                                                ) : col.key === 'fk' ? (
                                                  <Link2 size={11} className="text-blue-500" />
                                                ) : col.key === 'pk-fk' ? (
                                                  <KeyRound size={11} className="text-purple-500" />
                                                ) : (
                                                  <Hash size={10} className="text-slate-400" />
                                                )}
                                              </span>
                                              <span className="col-name font-mono">{col.name}</span>
                                              <span className="col-type font-mono">{col.type}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
