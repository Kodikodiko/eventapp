import { ServiceError } from '@/lib/action-result';
import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { certificatePreviewPdf, certificatesPdf } from '@/server/services/certificates';

export const dynamic = 'force-dynamic';

/**
 * Teilnahmebestätigungen als PDF (nur Admins).
 * GET /api/export/certificates?event=<id>&ids=1,2,3   → eine Seite je bestätigter Anmeldung (Download)
 * GET /api/export/certificates?event=<id>&preview=de  → Vorschau mit Beispielnamen (im Browser)
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await assertAdmin();
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const url = new URL(request.url);
  const eventId = Number(url.searchParams.get('event'));
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response('Not found', { status: 404 });
  const db = getDb();
  const headers = (name: string, download: boolean) => ({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  try {
    const preview = url.searchParams.get('preview');
    if (preview) {
      const pdf = await certificatePreviewPdf(db, eventId, preview === 'en' ? 'en' : 'de');
      return new Response(new Uint8Array(pdf), { headers: headers('teilnahmebestaetigung-vorschau.pdf', false) });
    }
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
    const result = await certificatesPdf(db, { userId: session.user.id }, eventId, ids);
    if (!result) return new Response('Keine bestätigte Anmeldung ausgewählt', { status: 404 });
    return new Response(new Uint8Array(result.pdf), { headers: headers(`teilnahmebestaetigungen-${eventId}.pdf`, true) });
  } catch (e) {
    if (e instanceof ServiceError) return new Response('Not found', { status: 404 });
    throw e;
  }
}
