/**
 * Tests schreiben nie in die lokalen Datenordner: E-Mails und Rechnungs-PDFs landen in einem temporären Ordner
 * (einzelne Tests dürfen INVOICE_DIR selbst setzen).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-test-'));
process.env.MAIL_OUTBOX_DIR = path.join(base, 'mail-outbox');
process.env.INVOICE_DIR = path.join(base, 'invoices');
process.env.MAIL_TRANSPORT = 'file';
