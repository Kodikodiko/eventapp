/**
 * Excel-Export der Teilnehmerliste (exceljs). Enthält genau die gefilterten Zeilen.
 */
import ExcelJS from 'exceljs';
import { utcToViennaInput } from '@/lib/dates';
import type { RegistrationListRow } from './registrations';

export type ExportLabels = {
  sheet: string;
  columns: Record<
    'lastName' | 'firstName' | 'email' | 'company' | 'roles' | 'status' | 'paymentStatus' | 'paymentMethod' | 'ticketType' | 'price' | 'registered',
    string
  >;
  roles: Record<string, string>;
  statuses: Record<string, string>;
  paymentStatuses: Record<string, string>;
  paymentMethods: Record<string, string>;
  ticketTypes: Record<string, string>;
};

export async function buildRegistrationsWorkbook(rows: RegistrationListRow[], labels: ExportLabels): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EventFlow';
  const ws = wb.addWorksheet(labels.sheet);
  const c = labels.columns;
  ws.columns = [
    { header: c.lastName, key: 'lastName', width: 18 },
    { header: c.firstName, key: 'firstName', width: 16 },
    { header: c.email, key: 'email', width: 30 },
    { header: c.company, key: 'company', width: 24 },
    { header: c.roles, key: 'roles', width: 22 },
    { header: c.status, key: 'status', width: 14 },
    { header: c.paymentStatus, key: 'paymentStatus', width: 16 },
    { header: c.paymentMethod, key: 'paymentMethod', width: 14 },
    { header: c.ticketType, key: 'ticketType', width: 12 },
    { header: c.price, key: 'price', width: 10, style: { numFmt: '#,##0.00 [$€-de-AT]' } },
    { header: c.registered, key: 'registered', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    ws.addRow({
      lastName: r.lastName,
      firstName: r.firstName,
      email: r.email ?? '',
      company: r.company ?? '',
      roles: r.roles.map((k) => labels.roles[k] ?? k).join(', '),
      status: labels.statuses[r.status] ?? r.status,
      paymentStatus: labels.paymentStatuses[r.paymentStatus] ?? r.paymentStatus,
      paymentMethod: labels.paymentMethods[r.paymentMethod] ?? r.paymentMethod,
      ticketType: labels.ticketTypes[r.ticketType] ?? r.ticketType,
      price: r.priceCents / 100,
      registered: utcToViennaInput(r.createdAt).replace('T', ' '),
    });
  }
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
