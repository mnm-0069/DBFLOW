/**
 * SQL formatting and export utilities for DBFlow
 */

const MAJOR_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'HAVING',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'JOIN',
  'UNION ALL',
  'UNION',
  'VALUES',
  'INSERT INTO',
  'UPDATE',
  'SET',
  'DELETE FROM'
];

/**
 * Cleanly formats a SQL query by aligning major clauses and adding standard indentation
 */
export function formatSql(rawSql: string): string {
  if (!rawSql || !rawSql.trim()) return rawSql;

  let text = rawSql.trim().replace(/\s+/g, ' ');

  // Standardize keyword case for major SQL keywords
  for (const kw of MAJOR_KEYWORDS) {
    const regex = new RegExp(`\\b${kw.replace(' ', '\\s+')}\\b`, 'gi');
    text = text.replace(regex, kw);
  }

  // Insert line breaks before major keywords
  for (const kw of MAJOR_KEYWORDS) {
    if (kw === 'SELECT') continue;
    const regex = new RegExp(`\\s+(${kw})\\b`, 'g');
    text = text.replace(regex, '\n$1');
  }

  // Handle commas in SELECT clause for multi-line readability
  const lines = text.split('\n');
  const formattedLines: string[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const startsWithKeyword = MAJOR_KEYWORDS.some(
      (kw) => line.startsWith(kw) || line.startsWith(kw.toLowerCase())
    );

    if (startsWithKeyword) {
      formattedLines.push(line);
    } else {
      formattedLines.push(`  ${line}`);
    }
  }

  return formattedLines.join('\n');
}

/**
 * Exports tabular results to a downloadable CSV file
 */
export function exportToCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
  filename = 'dbflow_query_results.csv'
): void {
  if (!columns.length) return;

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`;
    }
    return str;
  };

  const headerRow = columns.map(escapeCell).join(',');
  const dataRows = rows.map((row) =>
    columns.map((col) => escapeCell(row[col])).join(',')
  );

  const csvContent = [headerRow, ...dataRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
