import { getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { filterAndSort, filterFromSearchParams } from '@/lib/registrations-filter';
import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { writeAudit } from '@/server/services/audit';
import { getEvent } from '@/server/services/events';
import { buildRegistrationsWorkbook, type ExportLabels } from '@/server/services/export';
import { listRegistrations, listRoles } from '@/server/services/registrations';

export const dynamic = 'force-dynamic';

/**
 * Excel-Export der (gefilterten) Teilnehmerliste eines Events.
 * GET /api/export/registrations?event=<id>&locale=de&roles=…&statuses=…&q=…&sort=name:asc
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
  const localeParam = url.searchParams.get('locale');
  const locale = hasLocale(routing.locales, localeParam) ? localeParam : routing.defaultLocale;
  const db = getDb();
  const event = Number.isSafeInteger(eventId) && eventId > 0 ? getEvent(db, eventId) : undefined;
  if (!event) return new Response('Not found', { status: 404 });

  const { filter, sort } = filterFromSearchParams(url.searchParams);
  const rows = filterAndSort(listRegistrations(db, event.id), filter, sort);

  const t = await getTranslations({ locale, namespace: 'attendees' });
  const roleLabels = Object.fromEntries(listRoles(db).map((r) => [r.key, locale === 'en' && r.label.en ? r.label.en : r.label.de]));
  const labels: ExportLabels = {
    sheet: t('export.sheet'),
    columns: {
      lastName: t('export.lastName'),
      firstName: t('export.firstName'),
      email: t('export.email'),
      company: t('export.company'),
      roles: t('export.roles'),
      status: t('export.status'),
      paymentStatus: t('export.paymentStatus'),
      paymentMethod: t('export.paymentMethod'),
      ticketType: t('export.ticketType'),
      price: t('export.price'),
      registered: t('export.registered'),
    },
    roles: roleLabels,
    statuses: {
      reserved: t('status.reserved'),
      confirmed: t('status.confirmed'),
      waitlisted: t('status.waitlisted'),
      cancelled: t('status.cancelled'),
    },
    paymentStatuses: {
      open: t('payment.open'),
      paid: t('payment.paid'),
      partially_refunded: t('payment.partially_refunded'),
      refunded: t('payment.refunded'),
      not_required: t('payment.not_required'),
    },
    paymentMethods: { stripe: t('method.stripe'), invoice: t('method.invoice'), free: t('method.free') },
    ticketTypes: { normal: t('ticket.normal'), member: t('ticket.member') },
  };
  const buffer = await buildRegistrationsWorkbook(rows, labels);

  // Jeder Export personenbezogener Daten wird protokolliert (Spezifikation 7.6)
  writeAudit(db, { userId: session.user.id }, {
    action: 'registrations.exported',
    entity: 'event',
    entityId: event.id,
    eventId: event.id,
    // ohne Suchtext – der kann Namen enthalten (keine Personendaten im Audit-Log)
    summary:
      `Excel-Export: ${rows.length} Zeilen; Rollen: ${filter.roles.join(',') || 'alle'}; ` +
      `Status: ${filter.statuses.join(',') || 'alle'}${filter.search ? '; mit Suchbegriff' : ''}`,
  });

  const fileName = `${t('export.fileName')}-${event.slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
