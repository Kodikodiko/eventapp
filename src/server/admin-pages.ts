/**
 * Laden von Daten für Admin-Seiten (nur Server). Pro Anfrage zwischengespeichert,
 * damit Layout und Seite dasselbe Event nicht doppelt laden.
 */
import 'server-only';
import { notFound } from 'next/navigation';
import { cache } from 'react';
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
