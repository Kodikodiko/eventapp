import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Erreichbarkeits-Check für die Überwachung – liefert keine Daten, nur den Zustand. */
export function GET() {
  try {
    getDb().get(sql`SELECT 1`);
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
