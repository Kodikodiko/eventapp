/**
 * Ablage der Beleg-PDFs: INVOICE_DIR (Standard data/invoices, nicht im Git), Unterordner je Jahr.
 * Das PDF wird beim ersten Versand bzw. Download erzeugt und danach unverändert wieder ausgeliefert
 * (Beleg im Originalzustand, § 132 BAO). Fehlt die Datei, wird sie aus den gespeicherten Belegdaten neu erzeugt.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { invoices } from '@/server/db/schema';
import { buildInvoiceDocument } from './document';
import { renderInvoicePdf } from './pdf';

type InvoiceRow = typeof invoices.$inferSelect;

export function invoiceDir(): string {
  const custom = process.env.INVOICE_DIR?.trim();
  return custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(process.cwd(), 'data', 'invoices');
}

export function invoiceDocumentOf(db: Db, invoice: InvoiceRow) {
  const related = invoice.relatedInvoiceId
    ? db.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, invoice.relatedInvoiceId)).get()?.number ?? null
    : null;
  return buildInvoiceDocument(invoice, related);
}

/** PDF eines Belegs liefern (aus der Ablage oder neu erzeugt und abgelegt). */
export async function invoicePdf(db: Db, invoice: InvoiceRow): Promise<{ fileName: string; content: Buffer }> {
  const doc = invoiceDocumentOf(db, invoice);
  const relative = invoice.pdfPath ?? path.posix.join(invoice.number.slice(0, 4), `${invoice.number}.pdf`);
  const file = path.join(invoiceDir(), relative);
  try {
    return { fileName: doc.fileName, content: await fs.readFile(file) };
  } catch {
    // noch nicht erzeugt oder Datei fehlt
  }
  const content = await renderInvoicePdf(doc, { author: invoice.organizer.name });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  if (!invoice.pdfPath) db.update(invoices).set({ pdfPath: relative }).where(eq(invoices.id, invoice.id)).run();
  return { fileName: doc.fileName, content: await fs.readFile(file) };
}
