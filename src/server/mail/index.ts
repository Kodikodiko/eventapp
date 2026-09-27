/**
 * E-Mail-Versand. Mit MAIL_TRANSPORT=file (Standard, Entwicklung) werden Nachrichten als .eml-Dateien unter
 * MAIL_OUTBOX_DIR (Standard data/mail-outbox, nicht im Git) abgelegt und lassen sich in Outlook/Thunderbird öffnen.
 * SMTP folgt in Phase 7. Ins Log kommt nur der Dateiname, keine Adressen oder Inhalte.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type MailMessage = { to: string; subject: string; text: string };
export type Mailer = (message: MailMessage) => Promise<void>;

export function mailOutboxDir(): string {
  const custom = process.env.MAIL_OUTBOX_DIR?.trim();
  return custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(process.cwd(), 'data', 'mail-outbox');
}

/** Kopfzeilen mit Umlauten nach RFC 2047 kodieren. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function toEml(message: MailMessage, from: string, date = new Date()): string {
  const body = Buffer.from(message.text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return [
    `From: ${encodeHeader(from)}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${randomUUID()}@eventflow.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '',
  ].join('\r\n');
}

export const fileMailer: Mailer = async (message) => {
  const dir = mailOutboxDir();
  await mkdir(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.eml`;
  const from = process.env.MAIL_FROM?.trim() || 'EventFlow <noreply@localhost>';
  await writeFile(path.join(dir, name), toEml(message, from), 'utf8');
  console.info(`[mail] Datei-Versand: ${name}`);
};

/** Aktueller Versandweg. (SMTP folgt in Phase 7; bis dahin immer Datei.) */
export function getMailer(): Mailer {
  return fileMailer;
}

/** Mehrere Nachrichten senden; Fehler einzelner Nachrichten brechen nicht ab, sondern werden gezählt. */
export async function sendAll(messages: MailMessage[], mailer: Mailer = getMailer()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const m of messages) {
    try {
      await mailer(m);
      sent++;
    } catch (error) {
      failed++;
      console.error('[mail] Versand fehlgeschlagen', error instanceof Error ? error.message : error);
    }
  }
  return { sent, failed };
}
