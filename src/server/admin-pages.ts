/**
 * Laden von Daten für Admin-Seiten (nur Server). Pro Anfrage zwischengespeichert,
 * damit Layout und Seite dasselbe Event nicht doppelt laden.
 */
import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { initLocale } from '@/i18n/page';
import type { Locale } from '@/i18n/routing';
import { requireAdminWith2fa } from '@/server/auth/session';
import { requestDb } from '@/server/db';
import { getEvent } from '@/server/services/events';

export type EventParams = { params: Promise<{ locale: string; eventId: string }> };

export const loadEvent = cache(async (eventIdParam: string) => {
  const id = Number(eventIdParam);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const db = await requestDb();
  const event = getEvent(db, id);
  if (!event) notFound();
  return { db, event };
});

/**
 * Einstieg für jede Seite (und jedes Layout) im Admin-Fachbereich: Sprache setzen und Admin mit 2FA verlangen.
 * Die Prüfung im Layout reicht nicht: Bei Navigationen rendert Next.js nur die Segmente unterhalb des
 * gemeinsamen Layouts – ein Layout läuft dann gar nicht, und der Router-State-Header kommt vom Client.
 */
export async function initAdminPage(params: Promise<{ locale: string }>): Promise<Locale> {
  const locale = await initLocale(params);
  await requireAdminWith2fa(locale);
  return locale;
}
