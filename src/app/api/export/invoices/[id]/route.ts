import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { invoicePdf } from '@/server/invoices/storage';
import { writeAudit } from '@/server/services/audit';
import { eventIdOfInvoice, getInvoice } from '@/server/services/invoices';

export const dynamic = 'force-dynamic';

/**
 * PDF einer Rechnung/Gutschrift (nur Admins; jeder Abruf wird protokolliert, Spezifikation 7.6).
 * GET /api/export/invoices/<id>        → im Browser anzeigen
 * GET /api/export/invoices/<id>?download=1 → herunterladen
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await assertAdmin();
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const id = Number((await params).id);
  const db = getDb();
  const invoice = Number.isSafeInteger(id) && id > 0 ? getInvoice(db, id) : undefined;
  if (!invoice) return new Response('Not found', { status: 404 });

  const pdf = await invoicePdf(db, invoice);
  writeAudit(db, { userId: session.user.id }, {
    action: 'invoice.downloaded',
    entity: 'invoice',
    entityId: invoice.id,
    eventId: eventIdOfInvoice(db, invoice),
    summary: `PDF ${invoice.number} abgerufen`,
  });
  const download = new URL(request.url).searchParams.get('download') === '1';
  return new Response(new Uint8Array(pdf.content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${pdf.fileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
