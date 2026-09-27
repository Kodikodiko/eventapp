/**
 * E-Mail-Versand.
 * - MAIL_TRANSPORT=file (Standard, Entwicklung): Nachrichten werden als .eml-Dateien unter MAIL_OUTBOX_DIR
 *   (Standard data/mail-outbox, nicht im Git) abgelegt und lassen sich in Outlook/Thunderbird öffnen.
 * - MAIL_TRANSPORT=smtp: Versand über SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (Port 465 = TLS, sonst STARTTLS).
 * Ins Log kommen nur Dateinamen bzw. Message-IDs, keine Adressen oder Inhalte.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';

export type MailAttachment = { filename: string; content: Buffer; contentType?: string };
export type MailMessage = { to: string; subject: string; text: string; replyTo?: string | null; attachments?: MailAttachment[] };
export type Mailer = (message: MailMessage) => Promise<void>;

export function mailOutboxDir(): string {
  const custom = process.env.MAIL_OUTBOX_DIR?.trim();
  return custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(process.cwd(), 'data', 'mail-outbox');
}

export function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || 'EventFlow <noreply@localhost>';
}

function toNodemailer(message: MailMessage, from: string, date?: Date) {
  return {
    from,
    to: message.to,
    replyTo: message.replyTo || undefined,
    subject: message.subject,
    text: message.text,
    date,
    messageId: `<${randomUUID()}@eventflow.local>`,
    attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType ?? 'application/pdf' })),
  };
}

/** Vollständige Nachricht im .eml-Format (RFC 5322, UTF-8, Anhänge als multipart/mixed). */
export function toEml(message: MailMessage, from: string, date = new Date()): Promise<string> {
  return new Promise((resolve, reject) => {
    new MailComposer(toNodemailer(message, from, date)).compile().build((error, raw) => (error ? reject(error) : resolve(raw.toString('utf8'))));
  });
}

export const fileMailer: Mailer = async (message) => {
  const dir = mailOutboxDir();
  await mkdir(dir, { recursive: true });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.eml`;
  await writeFile(path.join(dir, name), await toEml(message, mailFrom()), 'utf8');
  console.info(`[mail] Datei-Versand: ${name}`);
};

let smtpTransport: Transporter | undefined;

function smtp(): Transporter {
  if (smtpTransport) return smtpTransport;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) throw new Error('MAIL_TRANSPORT=smtp, aber SMTP_HOST ist nicht gesetzt');
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  smtpTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465 && process.env.SMTP_REQUIRE_TLS !== 'false',
    auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
  });
  return smtpTransport;
}

export const smtpMailer: Mailer = async (message) => {
  const info = await smtp().sendMail(toNodemailer(message, mailFrom()));
  console.info(`[mail] SMTP-Versand: ${info.messageId}`);
};

export function mailTransport(): 'file' | 'smtp' {
  return process.env.MAIL_TRANSPORT?.trim() === 'smtp' ? 'smtp' : 'file';
}

/** Aktueller Versandweg laut MAIL_TRANSPORT. */
export function getMailer(): Mailer {
  return mailTransport() === 'smtp' ? smtpMailer : fileMailer;
}

/** Eine Nachricht senden; Fehler werden protokolliert (ohne Inhalte) und als false gemeldet. */
export async function trySend(message: MailMessage, mailer: Mailer = getMailer()): Promise<boolean> {
  try {
    await mailer(message);
    return true;
  } catch (error) {
    console.error('[mail] Versand fehlgeschlagen', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Mehrere Nachrichten senden; Fehler einzelner Nachrichten brechen nicht ab, sondern werden gezählt. */
export async function sendAll(messages: MailMessage[], mailer: Mailer = getMailer()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const m of messages) {
    if (await trySend(m, mailer)) sent++;
    else failed++;
  }
  return { sent, failed };
}
