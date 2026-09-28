import { getFormatter, getTranslations } from 'next-intl/server';
import { CopyLinkField } from '@/components/admin/copy-link-field';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import type { Locale } from '@/i18n/routing';
import { formatEuro } from '@/lib/money';
import { cn } from '@/lib/utils';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { isOnlinePaymentEnabled } from '@/server/payments/config';
import { getCockpit, type CockpitTask } from '@/server/services/admin-overview';
import { getCancellationRules } from '@/server/services/events';
import { currentTerms } from '@/server/services/legal';
import { getAvailability } from '@/server/services/public-events';

type TaskView = { key: string; tone: 'danger' | 'action' | 'warn' | 'muted'; title: string; detail?: string; href: string; action: string; primary?: boolean };

const card = 'rounded-xl border bg-card';

export default async function EventCockpitPage({ params }: EventParams) {
  const locale = (await initLocale(params)) as Locale;
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('cockpit');
  const tO = await getTranslations('eventOverview');
  const format = await getFormatter();
  const now = new Date();
  const c = getCockpit(db, event, now);
  const availability = getAvailability(db, event, isOnlinePaymentEnabled());
  const rules = getCancellationRules(db, event.id);
  const terms = currentTerms(db, event.id);
  const base = `/admin/events/${event.id}`;

  const euro = (cents: number) => formatEuro(cents, locale);
  const euroShort = (cents: number) => format.number(cents / 100, { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
  const relative = (iso: string) => format.relativeTime(new Date(iso), now);
  const dt = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' }) : tO('notSet'));
  const usage = event.capacity > 0 ? Math.min(100, Math.round((c.stats.seatsTaken / event.capacity) * 100)) : 0;

  const tasks: TaskView[] = [];
  if (!event.archivedAt) {
    const issueText = { noTerms: t('taskNoTerms'), noPrivacy: t('taskNoPrivacy'), noPaymentMethod: t('taskNoPayment') } as const;
    const issueHref = { noTerms: `${base}/terms`, noPrivacy: '/admin/settings', noPaymentMethod: `${base}/settings` } as const;
    for (const issue of availability.issues) {
      tasks.push({ key: issue, tone: 'danger', title: t('taskBlocked'), detail: issueText[issue], href: issueHref[issue], action: t('actionFix'), primary: true });
    }
  }
  for (const task of c.tasks) tasks.push(taskView(task));

  function taskView(task: CockpitTask): TaskView {
    switch (task.kind) {
      case 'refundProposed':
        return {
          key: `rp${task.refundId}`,
          tone: 'action',
          title: t('taskRefundProposed', { amount: euro(task.amountCents), name: task.name }),
          detail: [task.reason, task.rulePercent != null ? t('taskRefundRule', { percent: task.rulePercent }) : null].filter(Boolean).join(' · '),
          href: `${base}/refunds`,
          action: t('actionReview'),
          primary: true,
        };
      case 'refundFailed':
        return { key: 'rf', tone: 'danger', title: t('taskRefundFailed', { count: task.count }), detail: t('taskRefundFailedDetail'), href: `${base}/refunds`, action: t('actionView') };
      case 'invoicesOverdue':
        return {
          key: 'io',
          tone: 'danger',
          title: t('taskOverdue', { count: task.count }),
          detail: t('taskOverdueDetail', { amount: euro(task.openCents), reminded: task.reminded }),
          href: `${base}/invoices?state=overdue`,
          action: t('actionView'),
        };
      case 'refundTransfer':
        return {
          key: `rt${task.refundId}`,
          tone: 'warn',
          title: t('taskTransfer', { amount: euro(task.amountCents), name: task.name }),
          detail: task.decidedAt ? t('taskTransferDetail', { date: format.dateTime(new Date(task.decidedAt), { dateStyle: 'medium' }) }) : t('taskTransferDetailNoDate'),
          href: `${base}/refunds`,
          action: t('actionBook'),
        };
      case 'offersOpen':
        return { key: 'of', tone: 'muted', title: t('taskOffers', { count: task.count }), detail: t('taskOffersDetail', { when: relative(task.nextExpiry) }), href: `${base}/attendees?view=waitlisted`, action: t('actionView') };
      case 'reservations':
        return { key: 'rs', tone: 'muted', title: t('taskReservations', { count: task.count }), detail: t('taskReservationsDetail'), href: `${base}/attendees?view=reserved`, action: t('actionView') };
      case 'speakersWithoutSlides':
        return { key: 'sp', tone: 'muted', title: t('taskSpeakers', { count: task.count }), detail: t('taskSpeakersDetail'), href: `${base}/speakers`, action: t('actionOpen') };
    }
  }

  const maxWeek = Math.max(1, ...c.weekly.map((w) => w.count));
  const lastWeek = c.weekly.at(-1)?.count ?? 0;
  const weeklyTotal = c.weekly.reduce((s, w) => s + w.count, 0);
  const pct = (v: number | null) => (v == null ? t('mixNone') : `${v} %`);
  const methods = [event.allowStripe && tO('stripe'), event.allowInvoice && tO('invoice')].filter(Boolean).join(', ') || tO('none');

  return (
    <div className="space-y-5">
      {/* Kennzahlen */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className={cn(card, 'flex flex-col gap-2.5 px-5 py-4')} aria-label={t('kpiSeats')}>
          <span className="text-sm font-medium text-muted-foreground">{t('kpiSeats')}</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">
            {c.stats.seatsTaken} <span className="text-base font-semibold text-muted-foreground">/ {event.capacity}</span>
          </span>
          <div className="h-2 rounded bg-muted" role="progressbar" aria-valuenow={usage} aria-valuemin={0} aria-valuemax={100} aria-label={t('kpiSeats')}>
            <div className="h-2 rounded bg-primary" style={{ width: `${usage}%` }} />
          </div>
          <span className="text-sm text-muted-foreground">{t('kpiSeatsDetail', { free: c.stats.seatsFree, reserved: c.stats.reserved + c.stats.offered })}</span>
        </section>
        <section className={cn(card, 'flex flex-col gap-2.5 px-5 py-4')} aria-label={t('kpiRevenue')}>
          <span className="text-sm font-medium text-muted-foreground">{t('kpiRevenue')}</span>
          <span className="font-display text-3xl font-extrabold tabular-nums" title={euro(c.revenue.paidCents)}>
            {euroShort(c.revenue.paidCents)}
          </span>
          <span className="text-sm text-muted-foreground">
            {c.revenue.sponsorOpenCents > 0
              ? t('kpiSponsorOpen', { amount: euroShort(c.revenue.sponsorOpenCents) })
              : c.revenue.sponsorPaidCents > 0
                ? t('kpiSponsorPaid', { amount: euroShort(c.revenue.sponsorPaidCents) })
                : t('kpiRevenueDetail')}
          </span>
        </section>
        <section className={cn(card, 'flex flex-col gap-2.5 px-5 py-4')} aria-label={t('kpiInvoices')}>
          <span className="text-sm font-medium text-muted-foreground">{t('kpiInvoices')}</span>
          <span className="font-display text-3xl font-extrabold tabular-nums" title={euro(c.invoices.openCents)}>
            {euroShort(c.invoices.openCents)}
          </span>
          {c.invoices.overdueCents > 0 ? (
            <Link href={`${base}/invoices?state=overdue`} className="text-sm font-semibold text-destructive hover:underline">
              {t('kpiOverdue', { amount: euroShort(c.invoices.overdueCents) })}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">{t('kpiInvoicesDetail', { count: c.invoices.openCount })}</span>
          )}
        </section>
        <section className={cn(card, 'flex flex-col gap-2.5 px-5 py-4')} aria-label={t('kpiWaitlist')}>
          <span className="text-sm font-medium text-muted-foreground">{t('kpiWaitlist')}</span>
          <span className="font-display text-3xl font-extrabold tabular-nums">{c.waitlist.count}</span>
          <span className="text-sm text-muted-foreground">
            {c.waitlist.nextExpiry ? t('kpiWaitlistOffers', { count: c.waitlist.offersOpen, when: relative(c.waitlist.nextExpiry) }) : t('kpiWaitlistNone')}
          </span>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Zu erledigen */}
        <section aria-labelledby="todo-heading" className={card}>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 id="todo-heading" className="text-[17px] font-bold">{t('todo')}</h2>
            <span className="text-sm text-muted-foreground">{t('todoCount', { count: tasks.length })}</span>
          </div>
          {tasks.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t('todoEmpty')}</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.key} className="flex items-center gap-3.5 border-b px-5 py-3.5 last:border-b-0">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      task.tone === 'danger' && 'bg-destructive',
                      task.tone === 'action' && 'bg-cta',
                      task.tone === 'warn' && 'bg-[#9A6700]',
                      task.tone === 'muted' && 'bg-muted-foreground/60'
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{task.title}</span>
                    {task.detail && <span className="text-sm text-muted-foreground">{task.detail}</span>}
                  </span>
                  <Link
                    href={task.href}
                    className={cn(
                      'shrink-0 rounded-md px-3.5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      task.primary ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-input bg-card hover:bg-muted'
                    )}
                  >
                    {task.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Anmeldungen pro Woche */}
        <section aria-labelledby="weekly-heading" className={cn(card, 'flex flex-col gap-4 px-5 py-4')}>
          <div className="flex items-center justify-between">
            <h2 id="weekly-heading" className="text-[17px] font-bold">{t('weekly')}</h2>
            <span className="text-sm text-muted-foreground">{t('weeklyTotal', { count: weeklyTotal })}</span>
          </div>
          <div role="img" aria-label={t('weeklyLabel', { last: lastWeek })} className="grid h-44 grid-cols-8 items-end gap-2.5 border-b border-input">
            {c.weekly.map((w, i) => (
              <div key={w.from} className="flex h-full flex-col justify-end" title={`${t('weekOf', { date: format.dateTime(new Date(w.from), { day: '2-digit', month: '2-digit' }) })}: ${w.count}`}>
                {w.count > 0 && <span className="mb-1 text-center text-xs text-muted-foreground tabular-nums">{w.count}</span>}
                <div
                  className={cn('rounded-t', i === c.weekly.length - 1 ? 'bg-primary' : 'bg-chart-2')}
                  style={{ height: `${w.count === 0 ? 2 : Math.max(4, (w.count / maxWeek) * 100)}%`, minHeight: 2 }}
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-8 gap-2.5 text-center text-[11px] text-muted-foreground" aria-hidden>
            {c.weekly.map((w) => (
              <span key={w.from}>{format.dateTime(new Date(w.from), { day: '2-digit', month: '2-digit' })}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{pct(c.mix.memberShare)}</strong> {t('mixMember')}
            </span>
            <span>
              <strong className="text-foreground">{pct(c.mix.onlineShare)}</strong> {t('mixOnline')}
            </span>
            <span>
              <strong className="text-foreground">{c.mix.cancelled}</strong> {t('mixCancelled', { count: c.mix.cancelled })}
            </span>
          </div>
        </section>
      </div>

      {/* Letzte Aktivität */}
      <section aria-labelledby="activity-heading" className={card}>
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 id="activity-heading" className="text-[17px] font-bold">{t('activity')}</h2>
          <Link href={`/admin/audit?event=${event.id}`} className="text-sm font-semibold text-primary hover:underline">
            {t('activityAll')} →
          </Link>
        </div>
        {c.activity.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">{t('activityEmpty')}</p>
        ) : (
          <ul className="divide-y">
            {c.activity.map((a) => (
              <li key={a.id} className="grid gap-x-4 gap-y-0.5 px-5 py-2.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)_180px]">
                <span className="text-muted-foreground tabular-nums">{format.dateTime(new Date(a.at), { dateStyle: 'short', timeStyle: 'short' })}</span>
                <span>{a.summary || a.action}</span>
                <span className="text-muted-foreground sm:text-right">{a.actorName ?? t('system')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Eckdaten und Anmeldelink */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby="facts-heading" className={cn(card, 'px-5 py-4')}>
          <div className="mb-3 flex items-center justify-between">
            <h2 id="facts-heading" className="text-[17px] font-bold">{t('facts')}</h2>
            <Link href={`${base}/settings`} className="text-sm font-semibold text-primary hover:underline">
              {t('factsEdit')} →
            </Link>
          </div>
          <dl className="grid gap-x-8 gap-y-2.5 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">{tO('when')}</dt>
            <dd>
              {dt(event.startsAt)} – {dt(event.endsAt)}
            </dd>
            <dt className="text-muted-foreground">{tO('where')}</dt>
            <dd>{event.location || tO('notSet')}</dd>
            <dt className="text-muted-foreground">{tO('registration')}</dt>
            <dd>
              {event.registrationOpensAt
                ? `${dt(event.registrationOpensAt)} – ${dt(event.registrationClosesAt ?? event.startsAt)}`
                : tO('registrationUntil', { date: dt(event.registrationClosesAt ?? event.startsAt) })}
            </dd>
            <dt className="text-muted-foreground">{tO('prices')}</dt>
            <dd>
              {tO('normal')} {euro(event.priceNormalCents)} · {tO('member')} {euro(event.priceMemberCents)}
            </dd>
            <dt className="text-muted-foreground">{tO('paymentMethods')}</dt>
            <dd>{methods}</dd>
            <dt className="text-muted-foreground">{tO('refundMode')}</dt>
            <dd>{event.refundMode === 'automatic' ? tO('refundAutomatic') : tO('refundApproval')}</dd>
            <dt className="text-muted-foreground">{tO('cancellationRules')}</dt>
            <dd>
              {rules.length === 0 ? (
                tO('noRules')
              ) : (
                <ul>
                  {rules.map((r) => (
                    <li key={r.id}>{tO('ruleLine', { days: r.daysBeforeEvent, percent: r.refundPercent })}</li>
                  ))}
                </ul>
              )}
            </dd>
            <dt className="text-muted-foreground">{tO('terms')}</dt>
            <dd>{terms ? tO('termsVersion', { version: terms.version, date: format.dateTime(new Date(terms.validFrom), { dateStyle: 'medium' }) }) : tO('notSet')}</dd>
          </dl>
        </section>
        {!event.archivedAt && (
          <section aria-labelledby="link-heading" className={cn(card, 'flex flex-col gap-3 px-5 py-4')}>
            <h2 id="link-heading" className="text-[17px] font-bold">{t('link')}</h2>
            <p className="text-sm text-muted-foreground">{t('linkHint')}</p>
            <CopyLinkField path={`/${locale}/events/${event.slug}/register`} />
          </section>
        )}
      </div>
    </div>
  );
}
