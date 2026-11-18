import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { formatDateOnly, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { variantLabel } from '@/lib/pnl-rows';
import { PLAN_VARIANT_KEYS, type PlanVariant } from '@/lib/validation/pnl';
import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { writeAudit } from '@/server/services/audit';
import { getEvent } from '@/server/services/events';
import { getPnl } from '@/server/services/pnl';
import { buildPnlWorkbook } from '@/server/services/pnl-export';

export const dynamic = 'force-dynamic';

/**
 * Excel-Export der Erfolgsrechnung eines Events.
 * GET /api/export/pnl?event=<id>&locale=de&variant=plan
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
  const variantParam = url.searchParams.get('variant');
  const variant: PlanVariant = PLAN_VARIANT_KEYS.find((v) => v === variantParam) ?? 'plan';
  const db = getDb();
  const event = Number.isSafeInteger(eventId) && eventId > 0 ? getEvent(db, eventId) : undefined;
  if (!event) return new Response('Not found', { status: 404 });

  const now = new Date();
  const pnl = getPnl(db, event, now);
  const t = await getTranslations({ locale, namespace: 'pnl' });
  const tSponsor = await getTranslations({ locale, namespace: 'sponsors' });
  const tExpense = await getTranslations({ locale, namespace: 'expenses' });
  const buffer = await buildPnlWorkbook(pnl, variant, {
    sheet: t('export.sheet'),
    title: `${t('title')} · ${localized(event.name, locale)}`,
    asOf: t('asOf', { date: formatDateOnly(viennaDate(now.toISOString()), locale) }),
    columns: {
      item: t('col.item'),
      status: t('export.status'),
      count: t('col.count'),
      actual: t('col.actual'),
      open: t('col.open'),
      forecast: t('col.forecast'),
      plan: t(`variant.${variant}`),
      deviation: t('col.deviation'),
    },
    compare: pnl.compare.map((c) => localized(c.name, locale)),
    rowLabel: (row) =>
      'text' in row.label
        ? row.label.text
        : 'ticket' in row.label
          ? t(`ticket.${row.label.ticket}`)
          : 'variant' in row.label
            ? variantLabel(row.label.variant, (kind, name) => t(`priceVariant.${kind}`, { name }), (c) => formatEuro(c, locale))
            : t(`row.${row.label.key}`),
    badge: (row) =>
      !row.badge ? '' : 'sponsor' in row.badge ? tSponsor(`payment.${row.badge.sponsor}`) : 'expense' in row.badge ? tExpense(`status.${row.badge.expense}`) : t('compareOnly'),
  });

  writeAudit(db, { userId: session.user.id }, {
    action: 'pnl.exported',
    entity: 'event',
    entityId: event.id,
    eventId: event.id,
    summary: 'Excel-Export: Erfolgsrechnung',
  });

  const fileName = `${t('export.fileName')}-${event.slug}-${now.toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
