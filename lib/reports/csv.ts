export function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: unknown) => {
    const text = value == null ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((header) => escapeCell(row[header])).join(','));
  return lines.join('\n');
}
