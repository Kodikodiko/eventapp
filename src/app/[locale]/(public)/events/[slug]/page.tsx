import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgramGrid } from '@/components/program/program-grid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { earlyBirdPrice } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { requestDb } from '@/server/db';
import { isOnlinePaymentEnabled } from '@/server/payments/config';
import { listStreams } from '@/server/services/program';
import {
  getAvailability,
  getPublicEventBySlug,
  listPublicSessions,
  listPublicSpeakers,
  listPublicSponsors,
  type PublicSession,
} from '@/server/services/public-events';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = getPublicEventBySlug(await requestDb(), slug);
  return event ? { title: localized(event.name, locale === 'en' ? 'en' : 'de') } : {};
}

/** Nur so viele freie Plätze nennen, wenn es knapp wird. */
const FEW_SEATS = 10;

export default async function PublicEventPage({ params }: Props) {
  const locale = await initLocale(params);
  const { slug } = await params;
  const db = await requestDb();
  const event = getPublicEventBySlug(db, slug);
  if (!event) notFound();
  const t = await getTranslations('public');
  const format = await getFormatter();
  const availability = getAvailability(db, event, isOnlinePaymentEnabled());
  const sessions = listPublicSessions(db, event.id);
  const streams = listStreams(db, event.id);
  const streamCols = streams.map((s) => ({ position: s.position, label: localized(s.name, locale) || `Stream ${s.position}` }));
  const multi = streams.length > 1;
  const streamLabel = (s: PublicSession) =>
    s.stream === 1 && s.streamTo >= streams.length
      ? null
      : [...new Set([s.stream, s.streamTo])].map((n) => streamCols[n - 1]?.label ?? `Stream ${n}`).join('–');
  const speakers = listPublicSpeakers(db, event.id);
  const sponsors = listPublicSponsors(db, event.id);
  const description = localized(event.description, locale);

  const days = new Map<string, PublicSession[]>();
  for (const s of sessions) days.set(viennaDate(s.startsAt), [...(days.get(viennaDate(s.startsAt)) ?? []), s]);
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' });
  const free = event.priceNormalCents === 0 && event.priceMemberCents === 0;
  const now = new Date();
  const earlyNormal = earlyBirdPrice(event, 'normal', now);
  const earlyMember = earlyBirdPrice(event, 'member', now);
  const priceCell = (regular: number, early: number | null) =>
    early === null ? (
      formatEuro(regular, locale)
    ) : (
      <>
        <s className="mr-2 font-normal text-muted-foreground">{formatEuro(regular, locale)}</s>
        {formatEuro(early, locale)}
      </>
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">{localized(event.name, locale)}</h1>
          <p className="text-lg text-muted-foreground">
            {format.dateTimeRange(new Date(event.startsAt), new Date(event.endsAt), { dateStyle: 'full', timeStyle: 'short' })}
          </p>
          {event.location && <p className="text-muted-foreground">{event.location}</p>}
        </header>

        {description && <p className="whitespace-pre-line leading-relaxed">{description}</p>}

        {days.size > 0 && (
          <section aria-labelledby="program" className="space-y-4">
            <h2 id="program" className="text-2xl font-semibold">
              {t('program')}
            </h2>
            {[...days.entries()].map(([day, items]) => (
              <div key={day} className="space-y-2">
                {days.size > 1 && <h3 className="font-semibold">{format.dateTime(new Date(items[0].startsAt), { dateStyle: 'full' })}</h3>}
                <ul className={cn('divide-y rounded-lg border', multi && 'sm:hidden')}>
                  {items.map((s) => (
                    <li key={s.id} className="grid gap-1 p-3 sm:grid-cols-[8rem_1fr]">
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {time(s.startsAt)}–{time(s.endsAt)}
                      </span>
                      <span>
                        <span className="font-medium">{localized(s.title, locale)}</span>
                        {(s.speakerName || s.location || multi) && (
                          <span className="block text-sm text-muted-foreground">
                            {[multi ? streamLabel(s) : null, s.speakerName, s.location].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {s.slidesUrl && (
                          <a href={s.slidesUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4">
                            {t('slides')}
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {multi && (
                  <ProgramGrid
                    className="hidden sm:block"
                    streams={streamCols}
                    timeHeader={t('time')}
                    timeLabel={time}
                    items={items.map((s) => ({
                      id: s.id,
                      startsAt: s.startsAt,
                      stream: s.stream,
                      streamTo: s.streamTo,
                      className: s.tag === 'break' ? 'bg-muted/50' : undefined,
                      content: (
                        <>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {time(s.startsAt)}–{time(s.endsAt)}
                          </span>
                          <span className="block font-medium">{localized(s.title, locale)}</span>
                          {(s.speakerName || s.location) && (
                            <span className="block text-sm text-muted-foreground">{[s.speakerName, s.location].filter(Boolean).join(' · ')}</span>
                          )}
                          {s.slidesUrl && (
                            <a href={s.slidesUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-4">
                              {t('slides')}
                            </a>
                          )}
                        </>
                      ),
                    }))}
                  />
                )}
              </div>
            ))}
          </section>
        )}

        {speakers.length > 0 && (
          <section aria-labelledby="speakers" className="space-y-3">
            <h2 id="speakers" className="text-2xl font-semibold">
              {t('speakers')}
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {speakers.map((s) => (
                <li key={`${s.name}-${s.company}`} className="rounded-lg border p-3">
                  <span className="font-medium">{s.name}</span>
                  {s.company && <span className="block text-sm text-muted-foreground">{s.company}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {sponsors.length > 0 && (
          <section aria-labelledby="sponsors" className="space-y-3">
            <h2 id="sponsors" className="text-2xl font-semibold">
              {t('sponsors')}
            </h2>
            {sponsors.map((g) => (
              <div key={g.packageName ? localized(g.packageName, locale) : 'none'}>
                {g.packageName && <h3 className="text-sm font-semibold text-muted-foreground uppercase">{localized(g.packageName, locale)}</h3>}
                <p>{g.companies.join(' · ')}</p>
              </div>
            ))}
          </section>
        )}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{t('registration')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-1 text-sm">
              {free ? (
                <div className="flex justify-between gap-2">
                  <dt>{t('price')}</dt>
                  <dd className="font-medium">{t('free')}</dd>
                </div>
              ) : (
                <>
                  {(earlyNormal !== null || earlyMember !== null) && event.earlyBirdEndsAt && (
                    <div className="pb-1 text-xs font-medium text-primary">
                      {t('earlyBirdUntil', { date: format.dateTime(new Date(event.earlyBirdEndsAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt>{t('priceNormal')}</dt>
                    <dd className="font-medium">{priceCell(event.priceNormalCents, earlyNormal)}</dd>
                  </div>
                  {(event.priceMemberCents !== event.priceNormalCents || earlyMember !== earlyNormal) && (
                    <div className="flex justify-between gap-2">
                      <dt>{t('priceMember')}</dt>
                      <dd className="font-medium">{priceCell(event.priceMemberCents, earlyMember)}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>

            {availability.state === 'open' && (
              <>
                {availability.waitlistOnly ? (
                  <Badge variant="secondary">{t('waitlistOnly')}</Badge>
                ) : (
                  availability.seatsFree <= FEW_SEATS && <Badge variant="secondary">{t('fewSeats', { count: availability.seatsFree })}</Badge>
                )}
                <Button asChild className="w-full">
                  <Link href={`/events/${event.slug}/register`}>{availability.waitlistOnly ? t('joinWaitlist') : t('registerNow')}</Link>
                </Button>
              </>
            )}
            {availability.state === 'notOpenYet' && event.registrationOpensAt && (
              <p className="text-sm">{t('opensAt', { date: format.dateTime(new Date(event.registrationOpensAt), { dateStyle: 'long', timeStyle: 'short' }) })}</p>
            )}
            {availability.state === 'closed' && <p className="text-sm">{t('closed')}</p>}
            {availability.state === 'paused' && <p className="text-sm">{t('paused')}</p>}
            {availability.state === 'unavailable' && <p className="text-sm">{t('unavailable')}</p>}
            {availability.state === 'open' && event.registrationClosesAt && (
              <p className="text-xs text-muted-foreground">
                {t('closesAt', { date: format.dateTime(new Date(event.registrationClosesAt), { dateStyle: 'long', timeStyle: 'short' }) })}
              </p>
            )}
            {event.termsDocumentId && (
              <Link href={`/events/${event.slug}/terms`} className="block text-sm underline underline-offset-4">
                {t('termsLink')}
              </Link>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
