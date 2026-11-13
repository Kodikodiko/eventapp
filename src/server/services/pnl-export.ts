/**
 * Excel-Export der Erfolgsrechnung (exceljs): dieselben Zeilen wie die Tabelle, inklusive Einzelposten,
 * Plan der gewählten Variante und Vergleichs-Events.
 */
import ExcelJS from 'exceljs';
import { buildPnlRows, forecastOf, type PnlRow } from '@/lib/pnl-rows';
import type { PlanVariant } from '@/lib/validation/pnl';
import type { Pnl } from './pnl';

export type PnlExportLabels = {
  sheet: string;
  title: string;
  asOf: string;
  columns: { item: string; status: string; count: string; actual: string; open: string; forecast: string; plan: string; deviation: string };
  /** Namen der Vergleichs-Events in der Reihenfolge von pnl.compare */
  compare: string[];
  rowLabel: (row: PnlRow) => string;
  badge: (row: PnlRow) => string;
};

const EURO = '#,##0.00;[Red]-#,##0.00';

export async function buildPnlWorkbook(pnl: Pnl, variant: PlanVariant, labels: PnlExportLabels): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EventFlow';
  const ws = wb.addWorksheet(labels.sheet);
  const c = labels.columns;
  const header = [c.item, c.status, c.count, c.actual, c.open, c.forecast, c.plan, c.deviation, ...labels.compare];
  ws.columns = header.map((_, i) => ({ width: i === 0 ? 44 : i === 1 ? 14 : i === 2 ? 9 : 16, style: i >= 3 ? { numFmt: EURO } : {} }));

  ws.addRow([labels.title]).font = { bold: true, size: 14 };
  ws.addRow([labels.asOf]).font = { color: { argb: 'FF666666' } };
  ws.addRow([]);
  const head = ws.addRow(header);
  head.font = { bold: true };
  head.eachCell((cell, col) => {
    cell.border = { bottom: { style: 'thin' } };
    if (col >= 3) cell.alignment = { horizontal: 'right' };
  });
  ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 1 }];

  const value = (cents: number | null | undefined) => (cents == null ? null : cents / 100);
  for (const row of buildPnlRows(pnl, variant)) {
    const name = labels.rowLabel(row);
    if (row.kind === 'section' || row.kind === 'heading') {
      if (row.kind === 'section') ws.addRow([]);
      ws.addRow([name]).font = { bold: true, size: row.kind === 'section' ? 12 : 11 };
      continue;
    }
    const hasValues = row.actual != null || row.open != null;
    const added = ws.addRow([
      row.kind === 'item' ? `    ${row.date ? `${row.date}  ` : ''}${name}` : name,
      labels.badge(row),
      row.count ?? null,
      value(row.actual),
      value(row.open),
      hasValues ? forecastOf(row) / 100 : null,
      row.kind === 'item' ? null : value(row.plan),
      row.deviation === undefined ? null : row.deviation / 100,
      ...pnl.compare.map((_, i) => value(row.compare?.[i])),
    ]);
    if (row.kind === 'subtotal' || row.kind === 'total' || row.kind === 'result') {
      added.font = { bold: true };
      added.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: row.kind === 'result' ? 'medium' : 'thin' } };
      });
    }
    if (row.kind === 'item') added.font = { color: { argb: 'FF666666' } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
