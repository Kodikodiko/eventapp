import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { formatEuro } from '@/lib/money';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { getCancellationRules, getEventStats, registrationState } from '@/server/services/events';
import { isStripeConfigured } from '@/server/payments/config';
import { currentTerms } from '@/server/services/legal';
import { getAvailability } from '@/server/services/public-events';

export default async function EventOverviewPage({ params }: EventParams) {
  const locale = await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('eventOverview');
  const tState = await getTranslations('registrationState');
  const format = await getFormatter();
  const stats = getEventStats(db, event);
  const rules = getCancellationRules(db, event.id);
  const terms = currentTerms(db, event.id);
  const availability = getAvailability(db, event, isStripeConfigured());
  const state = registrationState(event);
  const dt = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : t('notSet'));
  const usage = event.capacity > 0 ? Math.min(100, Math.round((stats.seatsTaken / event.capacity) * 100)) : 0;
  const methods = [event.allowStripe && t('stripe'), event.allowInvoice && t('invoice')].filter(Boolean).join(', ') || t('none');

  return (
    <div className="space-y-6">
      {availability.issues.length > 0 && (
        <div role="status" className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{t('publicBlocked')}</p>
          <ul className="list-disc pl-5">
            {availability.issues.includes('noTerms') && (
              <li>
                {t('noTerms')}{' '}
                <Link href={`/admin/events/${event.id}/terms`} className="underline">
                  {t('addTerms')}
                </Link>
              </li>
            )}
            {availability.issues.includes('noPrivacy') && (
              <li>
                {t('noPrivacy')}{' '}
                <Link href="/admin/settings" className="underline">
                  {t('toSettings')}
                </Link>
              </li>
            )}
            {availability.issues.includes('noPaymentMethod') && (
              <li>
                {t('noPaymentMethod')}{' '}
                <Link href={`/admin/events/${event.id}/settings`} className="underline">
                  {t('toEventSettings')}
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
      {!event.archivedAt && (
        <p className="text-sm">
          <Link href={`/events/${event.slug}`} target="_blank" className="underline underline-offset-4">
            {t('viewPublic')}
          </Link>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('seats')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {stats.seatsTaken} / {event.capacity}
            </p>
            <div className="mt-2 h-2 rounded bg-muted" role="progressbar" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100} aria-label={t('seats')}>
              <div className="h-2 rounded bg-primary" style={{ width: `${usage}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('seatsFree', { count: stats.seatsFree })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('confirmed')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.confirmed}</p>
            <p className="text-xs text-muted-foreground">{t('reservedCount', { count: stats.reserved })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('waitlisted')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.waitlisted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('cancelled')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.cancelled}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{t('when')}</dt>
            <dd>
              {dt(event.startsAt)} – {dt(event.endsAt)}
            </dd>
            <dt className="text-muted-foreground">{t('where')}</dt>
            <dd>{event.location || t('notSet')}</dd>
            <dt className="text-muted-foreground">{t('registration')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <Badge variant={state === 'open' ? 'default' : 'secondary'}>{tState(state)}</Badge>
              <span>
                {event.registrationOpensAt
                  ? `${dt(event.registrationOpensAt)} – ${dt(event.registrationClosesAt ?? event.startsAt)}`
                  : t('registrationUntil', { date: dt(event.registrationClosesAt ?? event.startsAt) })}
              </span>
            </dd>
            <dt className="text-muted-foreground">{t('prices')}</dt>
            <dd>
              {t('normal')} {formatEuro(event.priceNormalCents, locale)} · {t('member')} {formatEuro(event.priceMemberCents, locale)}
            </dd>
            <dt className="text-muted-foreground">{t('paymentMethods')}</dt>
            <dd>{methods}</dd>
            <dt className="text-muted-foreground">{t('refundMode')}</dt>
            <dd>{event.refundMode === 'automatic' ? t('refundAutomatic') : t('refundApproval')}</dd>
            <dt className="text-muted-foreground">{t('cancellationRules')}</dt>
            <dd>
              {rules.length === 0 ? (
                t('noRules')
              ) : (
                <ul>
                  {rules.map((r) => (
                    <li key={r.id}>{t('ruleLine', { days: r.daysBeforeEvent, percent: r.refundPercent })}</li>
                  ))}
                </ul>
              )}
            </dd>
            <dt className="text-muted-foreground">{t('terms')}</dt>
            <dd>{terms ? t('termsVersion', { version: terms.version, date: format.dateTime(new Date(terms.validFrom), { dateStyle: 'medium' }) }) : t('notSet')}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
