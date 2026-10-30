import type { Node, Edge } from '@xyflow/react';
import type { SchemaTableGroup } from './schema-groups';

type ExportColumn = { name: string; type: string; key?: 'pk' | 'fk' | 'pk-fk'; nullable?: boolean };
type ExportNodeData = { label?: string; subtitle?: string; columns?: ExportColumn[]; groupColor?: string; groupName?: string };

const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const nodeWidth = 275;
const tableHeight = (data: ExportNodeData) => 78 + (data.columns?.length ?? 0) * 42 + 30;

function wrapLabel(value: string, maxChars: number) {
  const result: string[] = [];
  let line = '';
  for (const part of value.split(/\s+/)) {
    const next = line ? `${line} ${part}` : part;
    if (next.length > maxChars && line) { result.push(line); line = part; }
    else line = next;
  }
  if (line) result.push(line);
  return result.slice(0, 4);
}

export function buildSchemaSvg(database: string, engine: string, nodes: Node[], edges: Edge[], groups: SchemaTableGroup[]) {
  const groupByTable = new Map(groups.flatMap((group) => group.tableIds.map((id) => [id, group] as const)));
  const items = nodes.map((node) => {
    const data = node.data as ExportNodeData;
    const group = groupByTable.get(node.id);
    const height = tableHeight(data);
    return { id: node.id, x: node.position.x, y: node.position.y, width: nodeWidth, height, data, group };
  });
  if (!items.length) throw new Error('There are no tables to export.');
  const uniqueGroups = [...new Map(items.filter((item) => item.group).map((item) => [item.group!.id, item.group!])).values()];

  const margin = 70;
  const titleHeight = 82;
  const legendHeight = 46;
  const minX = Math.min(...items.map((node) => node.x));
  const minY = Math.min(...items.map((node) => node.y));
  const maxX = Math.max(...items.map((node) => node.x + node.width));
  const maxY = Math.max(...items.map((node) => node.y + node.height));
  const width = Math.ceil(Math.max(maxX - minX + margin * 2, margin * 2 + 390 + uniqueGroups.length * 128));
  const height = Math.ceil(maxY - minY + margin * 2 + titleHeight + legendHeight);
  const offsetX = margin - minX;
  const offsetY = margin + titleHeight - minY;
  const itemById = new Map(items.map((item) => [item.id, item]));

  const edgeMarkup = edges.flatMap((edge) => {
    const source = itemById.get(edge.source);
    const target = itemById.get(edge.target);
    if (!source || !target) return [];
    const sourceOnRight = target.x >= source.x;
    const x1 = (sourceOnRight ? source.x + source.width : source.x) + offsetX;
    const y1 = source.y + source.height / 2 + offsetY;
    const x2 = (sourceOnRight ? target.x : target.x + target.width) + offsetX;
    const y2 = target.y + target.height / 2 + offsetY;
    const midX = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const label = typeof edge.label === 'string' ? edge.label : '';
    const labelMarkup = distance < 155 || !label ? '' : (() => {
      const maxWidth = Math.max(112, Math.min(340, distance * 0.82));
      const lines = wrapLabel(label, Math.max(14, Math.floor((maxWidth - 18) / 6.2)));
      const boxWidth = Math.min(maxWidth, Math.max(112, Math.max(...lines.map((line) => line.length)) * 6.2 + 18));
      const boxHeight = lines.length * 14 + 10;
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2;
      return `<g transform="translate(${labelX - boxWidth / 2} ${labelY - boxHeight / 2})"><rect width="${boxWidth}" height="${boxHeight}" rx="6" fill="#fff" stroke="#dce4ef"/><text x="${boxWidth / 2}" y="${13}" text-anchor="middle" fill="#344054" font-family="'DM Mono',monospace" font-size="10">${lines.map((line, index) => `<tspan x="${boxWidth / 2}" dy="${index === 0 ? 0 : 13}">${esc(line)}</tspan>`).join('')}</text></g>`;
    })();
    return `<g><path d="${d}" fill="none" stroke="#3569c8" stroke-width="2" marker-end="url(#arrow)"/>${labelMarkup}</g>`;
  }).join('');

  const tableMarkup = items.map((node) => {
    const x = node.x + offsetX;
    const y = node.y + offsetY;
    const data = node.data;
    const groupColor = node.group?.color ?? '#d9e2ef';
    const title = data.label ?? node.id;
    const subtitle = data.subtitle ?? 'table';
    const columns = data.columns ?? [];
    const rows = columns.map((column, index) => {
      const rowY = y + 78 + index * 42;
      const symbol = column.key === 'pk' || column.key === 'pk-fk' ? '◆' : column.key === 'fk' ? '↗' : '•';
      const symbolColor = column.key === 'pk' || column.key === 'pk-fk' ? '#2463c5' : column.key === 'fk' ? '#6486bb' : '#98a2b3';
      return `<line x1="${x + 14}" y1="${rowY + 22}" x2="${x + nodeWidth - 14}" y2="${rowY + 22}" stroke="#f0f2f6"/><text x="${x + 18}" y="${rowY + 17}" fill="${symbolColor}" font-size="12">${symbol}</text><text x="${x + 38}" y="${rowY + 17}" fill="#344054" font-family="'DM Mono',monospace" font-size="12">${esc(column.name)}</text><text x="${x + nodeWidth - 15}" y="${rowY + 17}" text-anchor="end" fill="#7b8798" font-family="'DM Mono',monospace" font-size="11">${esc(column.type)}</text>`;
    }).join('');
    const footY = y + node.height - 30;
    return `<g><rect x="${x}" y="${y}" width="${nodeWidth}" height="${node.height}" rx="10" fill="#fff" stroke="#d7e0eb"/><path d="M ${x + 10} ${y} H ${x + nodeWidth - 10} Q ${x + nodeWidth} ${y} ${x + nodeWidth} ${y + 10} V ${y + 68} H ${x} V ${y + 10} Q ${x} ${y} ${x + 10} ${y}" fill="${esc(groupColor)}" fill-opacity="0.11"/><rect x="${x}" y="${y + 67}" width="${nodeWidth}" height="1" fill="#e5eaf1"/><text x="${x + 16}" y="${y + 29}" fill="#202938" font-family="'DM Mono',monospace" font-size="15" font-weight="700">${esc(title)}</text><text x="${x + 16}" y="${y + 51}" fill="#667085" font-family="'DM Sans',sans-serif" font-size="11">${esc(subtitle)}</text>${node.group ? `<rect x="${x + nodeWidth - 93}" y="${y + 12}" width="77" height="20" rx="10" fill="${esc(groupColor)}" fill-opacity="0.13"/><circle cx="${x + nodeWidth - 81}" cy="${y + 22}" r="3" fill="${esc(groupColor)}"/><text x="${x + nodeWidth - 73}" y="${y + 26}" fill="#475467" font-family="'DM Sans',sans-serif" font-size="9">${esc(node.group.name.slice(0, 13))}</text>` : ''}${rows}<line x1="${x}" y1="${footY}" x2="${x + nodeWidth}" y2="${footY}" stroke="#e5eaf1"/><circle cx="${x + 16}" cy="${footY + 15}" r="3" fill="#70cfa9"/><text x="${x + 26}" y="${footY + 19}" fill="#667085" font-family="'DM Sans',sans-serif" font-size="10">Synced</text><text x="${x + nodeWidth - 14}" y="${footY + 19}" text-anchor="end" fill="#667085" font-family="'DM Sans',sans-serif" font-size="10">${columns.length} columns</text></g>`;
  }).join('');

  const legendItems = [`<circle cx="${margin}" cy="${height - 20}" r="4" fill="#2463c5"/><text x="${margin + 10}" y="${height - 16}" fill="#667085" font-family="'DM Sans',sans-serif" font-size="11">Primary key</text>`, `<circle cx="${margin + 105}" cy="${height - 20}" r="4" fill="#6486bb"/><text x="${margin + 115}" y="${height - 16}" fill="#667085" font-family="'DM Sans',sans-serif" font-size="11">Foreign key</text>`, `<path d="M ${margin + 218} ${height - 20} h 25" stroke="#3569c8" stroke-width="2" marker-end="url(#arrow)"/><text x="${margin + 251}" y="${height - 16}" fill="#667085" font-family="'DM Sans',sans-serif" font-size="11">Relationship</text>`];
  uniqueGroups.forEach((group, index) => {
    const x = margin + 355 + index * 128;
    legendItems.push(`<circle cx="${x}" cy="${height - 20}" r="5" fill="${esc(group.color)}"/><text x="${x + 10}" y="${height - 16}" fill="#667085" font-family="'DM Sans',sans-serif" font-size="11">${esc(group.name.slice(0, 14))}</text>`);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#3569c8"/></marker></defs><rect width="100%" height="100%" fill="#f7f9fc"/><text x="${margin}" y="38" fill="#202938" font-family="'DM Sans',sans-serif" font-size="22" font-weight="700">${esc(database)} · Schema map</text><text x="${margin}" y="60" fill="#667085" font-family="'DM Sans',sans-serif" font-size="12">${esc(engine)} · ${items.length} tables · ${edges.length} relationships</text>${edgeMarkup}${tableMarkup}<line x1="${margin}" y1="${height - 47}" x2="${width - margin}" y2="${height - 47}" stroke="#e4e9f0"/>${legendItems.join('')}</svg>`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSchemaSvg(svg: string, filename: string) {
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function downloadSchemaPng(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    if (canvas.width > 16000 || canvas.height > 16000) throw new Error('This diagram is too large for a PNG export. Use SVG for the full resolution diagram.');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not prepare the PNG export.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The browser could not create the PNG file.')), 'image/png'));
    download(blob, filename);
  } finally { URL.revokeObjectURL(url); }
}

export function printSchemaSvg(svg: string, title: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Allow pop-ups to open the print view.');
  const imageSource = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  printWindow.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>@page{size:landscape;margin:10mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{height:calc(100vh - 20mm);display:grid;place-items:center}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img src="${imageSource}" alt="${esc(title)} schema diagram"><script>window.addEventListener('load',()=>window.print())</script></body></html>`);
  printWindow.document.close();
}
