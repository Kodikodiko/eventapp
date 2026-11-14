import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { writeAudit } from '@/server/services/audit';
import { buildPersonWorkbook, personDataExport } from '@/server/services/gdpr';

export const dynamic = 'force-dynamic';

/**
 * DSGVO-Auskunft einer Person (Art. 15/20): alle gespeicherten Daten als JSON oder Excel.
 * GET /api/export/person?person=<id>&format=json|xlsx&locale=de|en
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
  const personId = Number(url.searchParams.get('person'));
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'json';
  const locale = url.searchParams.get('locale') === 'en' ? 'en' : 'de';
  if (!Number.isSafeInteger(personId) || personId <= 0) return new Response('Not found', { status: 404 });
  const db = getDb();
  const data = personDataExport(db, personId);
  if (!data) return new Response('Not found', { status: 404 });

  // Jeder Export personenbezogener Daten wird protokolliert (Spezifikation 7.6)
  writeAudit(db, { userId: session.user.id }, {
    action: 'person.exported',
    entity: 'person',
    entityId: personId,
    summary: `DSGVO-Auskunft als ${format.toUpperCase()}`,
  });

  const fileName = `${locale === 'en' ? 'data-export' : 'datenauskunft'}-${personId}-${data.generatedAt.slice(0, 10)}`;
  if (format === 'json') {
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const buffer = await buildPersonWorkbook(data, locale);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
