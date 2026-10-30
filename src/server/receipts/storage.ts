/**
 * Ablage der Belege zu Ausgaben: RECEIPT_DIR (Standard data/receipts, nicht im Git), Unterordner je Event.
 * Dateinamen sind zufällig; der Originalname steht nur in der Datenbank.
 * Erlaubt sind PDF und Bilder (Endung und Dateiinhalt werden geprüft).
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ServiceError } from '@/lib/action-result';
import { MAX_RECEIPT_BYTES, RECEIPT_TYPES, receiptExtension } from '@/lib/validation/expenses';

export type ReceiptUpload = { fileName: string; data: Buffer };

export type StoredReceipt = { receiptPath: string; receiptName: string; receiptType: string; receiptSize: number };

export function receiptDir(): string {
  const custom = process.env.RECEIPT_DIR?.trim();
  return custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(process.cwd(), 'data', 'receipts');
}

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** Prüft Typ und Größe eines Belegs; wirft ServiceError mit Feldfehler „receipt“. */
export function checkReceipt(upload: ReceiptUpload): { ext: string; type: string } {
  const ext = receiptExtension(upload.fileName);
  if (!ext) throw new ServiceError('INVALID', { receipt: 'receiptType' });
  if (upload.data.length === 0 || upload.data.length > MAX_RECEIPT_BYTES) throw new ServiceError('INVALID', { receipt: 'receiptTooLarge' });
  const type = RECEIPT_TYPES[ext];
  if (!SIGNATURES[type](upload.data)) throw new ServiceError('INVALID', { receipt: 'receiptType' });
  return { ext, type };
}

/** Legt einen Beleg ab und liefert die Angaben für die Datenbank. */
export function storeReceipt(eventId: number, upload: ReceiptUpload): StoredReceipt {
  const { ext, type } = checkReceipt(upload);
  const relative = path.posix.join(String(eventId), `${randomUUID()}.${ext}`);
  const file = path.join(receiptDir(), relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, upload.data, { flag: 'wx' });
  const receiptName = path.basename(upload.fileName.replace(/\\/g, '/')).slice(0, 200) || `beleg.${ext}`;
  return { receiptPath: relative, receiptName, receiptType: type, receiptSize: upload.data.length };
}

function resolveInDir(relative: string): string {
  const base = receiptDir();
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep)) throw new Error(`Ungültiger Belegpfad: ${relative}`);
  return file;
}

export function readReceipt(relative: string): Buffer | null {
  try {
    return fs.readFileSync(resolveInDir(relative));
  } catch {
    return null;
  }
}

export function removeReceipt(relative: string | null | undefined): void {
  if (!relative) return;
  try {
    fs.rmSync(resolveInDir(relative), { force: true });
  } catch (error) {
    console.warn('[receipts] Beleg konnte nicht entfernt werden', relative, error);
  }
}
