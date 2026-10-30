export type SchemaLayoutTable = {
  schema: string;
  name: string;
  columns: Array<unknown>;
  foreignKeys: Array<{ column: string; referencedSchema: string; referencedTable: string; referencedColumn: string }>;
};

export type SchemaPosition = { x: number; y: number };

const nodeWidth = 275;
const layerGap = 220;
const rowGap = 100;
const componentGap = 150;
const componentRowWidth = 1800;
const schemaTableId = (schema: string, table: string) => JSON.stringify([schema, table]);
const sortKey = (table: Pick<SchemaLayoutTable, 'schema' | 'name'>) => `${table.schema}.${table.name}`;
const estimatedHeight = (table: SchemaLayoutTable) => 90 + table.columns.length * 33;

/** Lay out related tables in layers, while stacking cards using their estimated rendered height. */
export function layoutSchemaTables(tables: SchemaLayoutTable[]): Record<string, SchemaPosition> {
  const tableById = new Map(tables.map((table) => [schemaTableId(table.schema, table.name), table]));
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  const neighbours = new Map<string, Set<string>>();

  for (const id of tableById.keys()) {
    children.set(id, new Set());
    parents.set(id, new Set());
    neighbours.set(id, new Set());
  }
  for (const table of tables) {
    const child = schemaTableId(table.schema, table.name);
    for (const foreignKey of table.foreignKeys) {
      const parent = schemaTableId(foreignKey.referencedSchema, foreignKey.referencedTable);
      if (!tableById.has(parent)) continue;
      children.get(parent)!.add(child);
      parents.get(child)!.add(parent);
      neighbours.get(parent)!.add(child);
      neighbours.get(child)!.add(parent);
    }
  }

  const components: string[][] = [];
  const visited = new Set<string>();
  for (const start of [...tableById.keys()].sort((a, b) => sortKey(tableById.get(a)!).localeCompare(sortKey(tableById.get(b)!)))) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const id = queue.shift()!;
      component.push(id);
      for (const next of neighbours.get(id)!) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }

  components.sort((left, right) => {
    const bySize = right.length - left.length;
    if (bySize) return bySize;
    return sortKey(tableById.get(left[0]!)!).localeCompare(sortKey(tableById.get(right[0]!)!));
  });

  const positions: Record<string, SchemaPosition> = {};
  let componentX = 50;
  let componentY = 40;
  let componentRowHeight = 0;

  for (const component of components) {
    const componentSet = new Set(component);
    const roots = component.filter((id) => ![...parents.get(id)!].some((parent) => componentSet.has(parent)))
      .sort((left, right) => children.get(right)!.size - children.get(left)!.size || sortKey(tableById.get(left)!).localeCompare(sortKey(tableById.get(right)!)));
    const rootCandidates = roots.length ? roots : [...component].sort((left, right) => neighbours.get(right)!.size - neighbours.get(left)!.size || sortKey(tableById.get(left)!).localeCompare(sortKey(tableById.get(right)!)));
    const depth = new Map<string, number>();
    const queue = rootCandidates.map((id) => ({ id, depth: 0 }));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]!;
      if (depth.has(current.id)) continue;
      depth.set(current.id, current.depth);
      for (const child of [...children.get(current.id)!].sort((a, b) => sortKey(tableById.get(a)!).localeCompare(sortKey(tableById.get(b)!)))) {
        if (!depth.has(child)) queue.push({ id: child, depth: current.depth + 1 });
      }
    }

    let deepestLayer = Math.max(0, ...depth.values());
    for (const id of component.filter((item) => !depth.has(item)).sort((a, b) => sortKey(tableById.get(a)!).localeCompare(sortKey(tableById.get(b)!)))) {
      depth.set(id, deepestLayer + 1);
      deepestLayer += 1;
      const fallbackQueue = [...children.get(id)!].map((child) => ({ id: child, depth: depth.get(id)! + 1 }));
      for (let cursor = 0; cursor < fallbackQueue.length; cursor += 1) {
        const current = fallbackQueue[cursor]!;
        if (depth.has(current.id)) continue;
        depth.set(current.id, current.depth);
        deepestLayer = Math.max(deepestLayer, current.depth);
        for (const child of children.get(current.id)!) fallbackQueue.push({ id: child, depth: current.depth + 1 });
      }
    }

    const layers = new Map<number, string[]>();
    for (const id of component) {
      const layer = depth.get(id) ?? 0;
      const ids = layers.get(layer) ?? [];
      ids.push(id);
      layers.set(layer, ids);
    }

    const order = new Map<string, number>();
    for (let layer = 0; layer <= deepestLayer; layer += 1) {
      const ids = layers.get(layer) ?? [];
      ids.sort((left, right) => {
        const parentOrder = (id: string) => [...parents.get(id)!]
          .filter((parent) => depth.get(parent) === layer - 1)
          .map((parent) => order.get(parent))
          .filter((index): index is number => index !== undefined);
        const leftParents = parentOrder(left);
        const rightParents = parentOrder(right);
        const leftBarycenter = leftParents.length ? leftParents.reduce((sum, value) => sum + value, 0) / leftParents.length : Number.MAX_SAFE_INTEGER;
        const rightBarycenter = rightParents.length ? rightParents.reduce((sum, value) => sum + value, 0) / rightParents.length : Number.MAX_SAFE_INTEGER;
        return leftBarycenter - rightBarycenter || sortKey(tableById.get(left)!).localeCompare(sortKey(tableById.get(right)!));
      });
      ids.forEach((id, index) => order.set(id, index));
      layers.set(layer, ids);
    }

    const layerHeights = [...layers.values()].map((ids) => ids.reduce((total, id) => total + estimatedHeight(tableById.get(id)!) + rowGap, 0));
    const componentHeight = Math.max(0, ...layerHeights);
    const componentWidth = (deepestLayer + 1) * (nodeWidth + layerGap);
    if (componentX > 50 && componentX + componentWidth > componentRowWidth) {
      componentX = 50;
      componentY += componentRowHeight + componentGap;
      componentRowHeight = 0;
    }

    for (let layer = 0; layer <= deepestLayer; layer += 1) {
      let y = componentY;
      for (const id of layers.get(layer) ?? []) {
        positions[id] = { x: componentX + layer * (nodeWidth + layerGap), y };
        y += estimatedHeight(tableById.get(id)!) + rowGap;
      }
    }
    componentX += componentWidth + componentGap;
    componentRowHeight = Math.max(componentRowHeight, componentHeight);
  }

  return positions;
}
