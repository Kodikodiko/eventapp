import { assertAttendee, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { invoicePdf } from '@/server/invoices/storage';
import { writeAudit } from '@/server/services/audit';
import { eventIdOfInvoice } from '@/server/services/invoices';
import { ownInvoice } from '@/server/services/portal';

export const dynamic = 'force-dynamic';

/** Eigene Rechnung/Gutschrift als PDF (Teilnehmerportal). Fremde Belege → 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await assertAttendee();
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response('Forbidden', { status: 403 });
    throw e;
  }
  const id = Number((await params).id);
  const db = getDb();
  const invoice = Number.isSafeInteger(id) && id > 0 ? ownInvoice(db, session.user.personId, id) : undefined;
  if (!invoice) return new Response('Not found', { status: 404 });
  const pdf = await invoicePdf(db, invoice);
  writeAudit(db, { userId: session.user.id }, {
    action: 'invoice.downloaded',
    entity: 'invoice',
    entityId: invoice.id,
    eventId: eventIdOfInvoice(db, invoice),
    summary: `PDF ${invoice.number} im Portal abgerufen`,
  });
  return new Response(new Uint8Array(pdf.content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdf.fileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
