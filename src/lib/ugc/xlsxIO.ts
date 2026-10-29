/* xlsx in and out for the UGC page (exceljs, loaded only when a file is made or read — it is large).
 * Writing: the lead export. Reading: her workbook for "Upload updated pitch log" (tab name → rows of text). */

type Cell = unknown;

/** One cell value as plain text: rich text joined, formula results, dates as yyyy-mm-dd. */
export function cellText(v: Cell): string {
  if (v == null) return '';
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: string };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
    if ('result' in o) return cellText(o.result);
    if (o.text != null) return cellText(o.text);
    return '';
  }
  return String(v);
}

export async function buildXlsx(sheetName: string, rows: readonly (readonly string[])[]): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow([...r]));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns.forEach((c, i) => { c.width = [5, 28, 18, 8, 9, 12, 34, 18, 16, 20, 12, 18, 18, 12, 44, 40, 44, 20, 28, 34, 14, 10, 10][i] ?? 16; });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** A workbook's tabs → tab name → rows of text (first row = headers), as rowsFromWorkbook expects. */
export async function readWorkbookSheets(data: ArrayBuffer | Uint8Array): Promise<Record<string, string[][]>> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const out: Record<string, string[][]> = {};
  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values as Cell[];
      rows.push(Array.from({ length: Math.max(0, vals.length - 1) }, (_, i) => cellText(vals[i + 1])));
    });
    out[ws.name] = rows;
  }
  return out;
}
