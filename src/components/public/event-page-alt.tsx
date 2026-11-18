import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgramGrid } from '@/components/program/program-grid';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { mediaUrl } from '@/lib/validation/media';
import { earlyBirdPrice } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { requestDb } from '@/server/db';
import { isOnlinePaymentEnabled } from '@/server/payments/config';
import { listGallery } from '@/server/services/event-page';
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

/** Nur so viele freie Plätze nennen, wenn es knapp wird. */
const FEW_SEATS = 10;

/** Alte öffentliche Eventseite (Stand vor dem UI-Redesign), über den Umschalter „Neue Oberfläche“ wählbar. */
export async function PublicEventPageAlt({ params }: Props) {
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
  const streamCols = streams.map((s) => ({
    position: s.position,
    label: localized(s.name, locale) || `Stream ${s.position}`,
  }));
  const multi = streams.length > 1;
  const streamLabel = (s: PublicSession) =>
    s.stream === 1 && s.streamTo >= streams.length
      ? null
      : [...new Set([s.stream, s.streamTo])].map((n) => streamCols[n - 1]?.label ?? `Stream ${n}`).join('–');
  const speakers = listPublicSpeakers(db, event.id);
  const sponsors = listPublicSponsors(db, event.id);
  const description = localized(event.description, locale);
  const tagline = localized(event.tagline, locale);
  const highlights = (event.highlights ?? []).filter((h) => localized(h.title, locale));
  const gallery = listGallery(db, event.id);
  const heroUrl = mediaUrl(event.heroImagePath);
  const eventName = localized(event.name, locale);
  const people = (s: PublicSession) => [s.speakerName, ...s.coSpeakerNames].filter(Boolean).join(', ');
  const registerHref = `/events/${event.slug}/register`;
  const logoUrl = mediaUrl(event.logoPath);
  const theme = event.theme ?? {};
  // Eventfarben als CSS-Variablen; ohne eigene Farbe gelten die EventFlow-Farben
  const vars = {
    '--ev-primary': theme.primary ?? 'hsl(var(--primary))',
    '--ev-dark': theme.dark ?? 'hsl(249 40% 18%)',
    '--ev-accent': theme.accent ?? 'hsl(var(--primary))',
    '--ev-surface': theme.surface ?? 'hsl(var(--muted))',
  } as React.CSSProperties;
  const surfaceText = theme.surface ? 'text-neutral-900' : 'text-foreground';
  const surfaceCard = theme.surface ? 'bg-white text-neutral-900' : 'bg-background';
  const surfaceMuted = theme.surface ? 'text-neutral-600' : 'text-muted-foreground';
  // Sonderzeilen wie Begrüßung und Empfang kräftig, Pausen dezent
  const rowClass = (s: PublicSession) =>
    s.tag === 'general'
      ? 'border-transparent bg-[var(--ev-primary)] text-white'
      : s.tag === 'break'
        ? 'border-transparent bg-[var(--ev-primary)]/10 text-[var(--ev-primary)]'
        : cn(surfaceCard, 'border-dashed border-neutral-400');
  const rowMuted = (s: PublicSession) => (s.tag === 'general' ? 'text-white/85' : s.tag === 'break' ? 'text-[var(--ev-primary)]/80' : surfaceMuted);
  // neutrale Abschnitte: bei eigenen Farben weiß über die volle Breite, sonst Seitenhintergrund
  const plain = cn(bleed, theme.surface && 'bg-white text-neutral-900');
  const plainMuted = theme.surface ? 'text-neutral-600' : 'text-muted-foreground';
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const canRegister = availability.state === 'open';

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

  const pill = 'rounded-full bg-[var(--ev-accent)] px-6 text-white hover:bg-[var(--ev-accent)]/90';
  const registerLabel = availability.waitlistOnly ? t('joinWaitlist') : t('registerNow');

  return (
    <div style={vars} className="-mt-8 -mb-8">
      <header
        className={cn(bleed, 'overflow-hidden bg-cover bg-bottom text-white')}
        style={{ backgroundImage: heroUrl ? `url(${heroUrl})` : 'linear-gradient(135deg, var(--ev-dark), var(--ev-primary))' }}
      >
        {heroUrl && <div aria-hidden className="absolute inset-0 bg-[var(--ev-primary)] opacity-60" />}
        <div className="relative mx-auto flex min-h-[26rem] max-w-5xl flex-col justify-center gap-4 px-4 py-14 sm:min-h-[32rem]">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-auto self-start sm:h-20" />
          )}
          <h1 className="max-w-3xl text-4xl font-black tracking-tight text-balance sm:text-6xl">{eventName}</h1>
          {tagline && <p className="max-w-3xl text-xl font-semibold text-balance text-white/95 sm:text-3xl">{tagline}</p>}
          <p className="text-lg text-white/90">
            {format.dateTimeRange(start, end, { dateStyle: 'long' })}
            {event.location && <span className="block text-base text-white/80">{event.location}</span>}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {canRegister && (
              <Button asChild size="lg" className={pill}>
                <Link href={registerHref}>{registerLabel}</Link>
              </Button>
            )}
            {days.size > 0 && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#program">{t('toProgram')}</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {(description || event.location) && (
        <section aria-labelledby="about" className={cn(bleed, 'bg-[var(--ev-dark)] text-white')}>
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-[1.5fr_1fr]">
            <div className="space-y-3">
              <h2 id="about" className="text-3xl font-black">
                {t('aboutTitle')}
              </h2>
              {description && <p className="whitespace-pre-line leading-relaxed text-white/90">{description}</p>}
            </div>
            <dl className="space-y-4 self-start rounded-2xl bg-white/10 p-6">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-white/70 uppercase">{t('dateLabel')}</dt>
                <dd className="font-semibold">{format.dateTime(start, { dateStyle: 'full' })}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-white/70 uppercase">{t('timeLabel')}</dt>
                <dd className="font-semibold tabular-nums">
                  {time(event.startsAt)}–{time(event.endsAt)}
                </dd>
              </div>
              {event.location && (
                <div>
                  <dt className="text-xs font-semibold tracking-wide text-white/70 uppercase">{t('locationLabel')}</dt>
                  <dd className="font-semibold">{event.location}</dd>
                </div>
              )}
              {canRegister && (
                <Button asChild className={cn(pill, 'w-full')}>
                  <Link href={registerHref}>{registerLabel}</Link>
                </Button>
              )}
            </dl>
          </div>
        </section>
      )}

      {highlights.length > 0 && (
        <section aria-labelledby="highlights" className={plain}>
          <div className="mx-auto max-w-5xl px-4 py-12">
            <h2 id="highlights" className="mb-8 text-center text-3xl font-black">
              {t('highlights')}
            </h2>
            <ul className="grid gap-8 sm:grid-cols-3">
              {highlights.map((h, i) => {
                const icon = mediaUrl(h.iconPath);
                return (
                  <li key={i} className="flex flex-col items-center text-center">
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" className="mb-4 size-32 rounded-full bg-white object-cover shadow-sm" loading="lazy" />
                    ) : (
                      <span
                        aria-hidden
                        className="mb-4 flex size-16 items-center justify-center rounded-full bg-[var(--ev-primary)] text-2xl font-black text-white"
                      >
                        {i + 1}
                      </span>
                    )}
                    <h3 className="text-lg font-bold">{localized(h.title, locale)}</h3>
                    {localized(h.text, locale) && <p className={cn('mt-1', plainMuted)}>{localized(h.text, locale)}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {days.size > 0 && (
        <section aria-labelledby="program" className={cn(bleed, 'bg-[var(--ev-surface)]', surfaceText)}>
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
            <h2 id="program" className="text-3xl font-black">
              {t('program')}
            </h2>
            {[...days.entries()].map(([day, items]) => (
              <div key={day} className="space-y-3">
                {days.size > 1 && <h3 className="text-lg font-bold">{format.dateTime(new Date(items[0].startsAt), { dateStyle: 'full' })}</h3>}
                <ul className={cn('space-y-2', multi && 'sm:hidden')}>
                  {items.map((s) => (
                    <li key={s.id} className={cn('grid gap-1 rounded-lg border p-3 sm:grid-cols-[8rem_1fr]', rowClass(s))}>
                      <span className={cn('text-sm font-bold tabular-nums', s.tag === 'general' ? 'text-white/90' : 'text-[var(--ev-primary)]')}>
                        {time(s.startsAt)}–{time(s.endsAt)}
                      </span>
                      <span>
                        <span className="font-semibold">{localized(s.title, locale)}</span>
                        {(people(s) || s.location || multi) && (
                          <span className={cn('block text-sm', rowMuted(s))}>
                            {[multi ? streamLabel(s) : null, people(s), s.location].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {s.slidesUrl && (
                          <a
                            href={s.slidesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-[var(--ev-accent)] underline underline-offset-4"
                          >
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
                    timeClassName="font-bold text-[var(--ev-primary)]"
                    timeLabel={time}
                    items={items.map((s) => ({
                      id: s.id,
                      startsAt: s.startsAt,
                      stream: s.stream,
                      streamTo: s.streamTo,
                      className: rowClass(s),
                      content: (
                        <>
                          <span className={cn('block text-xs tabular-nums', rowMuted(s))}>
                            {time(s.startsAt)}–{time(s.endsAt)}
                          </span>
                          <span className="block font-semibold">{localized(s.title, locale)}</span>
                          {(people(s) || s.location) && (
                            <span className={cn('block text-sm', rowMuted(s))}>{[people(s), s.location].filter(Boolean).join(' · ')}</span>
                          )}
                          {s.slidesUrl && (
                            <a
                              href={s.slidesUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-[var(--ev-accent)] underline underline-offset-4"
                            >
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
          </div>
        </section>
      )}

      {speakers.length > 0 && (
        <section aria-labelledby="speakers" className={plain}>
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
            <h2 id="speakers" className="text-3xl font-black">
              {t('speakersTitle')}
            </h2>
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {speakers.map((s) => {
                const bio = localized(s.bio, locale);
                const photo = mediaUrl(s.photoPath);
                return (
                  <li key={s.id} className={cn('overflow-hidden rounded-2xl border', theme.surface ? 'bg-white' : 'bg-card')}>
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    ) : (
                      <span
                        aria-hidden
                        className="flex aspect-square w-full items-center justify-center bg-[var(--ev-surface)] text-4xl font-black text-[var(--ev-primary)]"
                      >
                        {initials(s.name)}
                      </span>
                    )}
                    <div className="space-y-1 p-4">
                      <span className="block font-bold">{s.name}</span>
                      {(s.role || s.company) && <span className={cn('block text-sm', plainMuted)}>{[s.role, s.company].filter(Boolean).join(' · ')}</span>}
                      {bio && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-[var(--ev-accent)] underline-offset-4 hover:underline">
                            {t('moreAbout', { name: s.name })}
                          </summary>
                          <p className={cn('mt-1 whitespace-pre-line', plainMuted)}>{bio}</p>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section aria-labelledby="gallery" className={cn(bleed, 'bg-[var(--ev-surface)]', surfaceText)}>
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
            <h2 id="gallery" className="text-3xl font-black">
              {t('gallery')}
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {gallery.map((g) => (
                <li key={g.id}>
                  <a href={mediaUrl(g.imagePath)!} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(g.imagePath)!}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform hover:scale-105"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="tickets" className={plain}>
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
          <h2 id="tickets" className="text-3xl font-black">
            {t('ticketsTitle')}
          </h2>
          {!free && (earlyNormal !== null || earlyMember !== null) && event.earlyBirdEndsAt && (
            <p className="font-semibold text-[var(--ev-primary)]">
              {t('earlyBirdUntil', { date: format.dateTime(new Date(event.earlyBirdEndsAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
            </p>
          )}
          <ul className="grid gap-4 sm:grid-cols-2">
            {free ? (
              <li className="rounded-2xl border-2 border-[var(--ev-primary)] p-6">
                <span className="block text-sm font-semibold text-muted-foreground uppercase">{t('price')}</span>
                <span className="text-3xl font-black text-[var(--ev-primary)]">{t('free')}</span>
              </li>
            ) : (
              <>
                <li className="rounded-2xl border-2 border-[var(--ev-primary)] p-6">
                  <span className="block text-sm font-semibold text-muted-foreground uppercase">{t('priceNormal')}</span>
                  <span className="text-3xl font-black text-[var(--ev-primary)]">{priceCell(event.priceNormalCents, earlyNormal)}</span>
                </li>
                {(event.priceMemberCents !== event.priceNormalCents || earlyMember !== earlyNormal) && (
                  <li className="rounded-2xl bg-[var(--ev-primary)] p-6 text-white [&_s]:text-white/70">
                    <span className="block text-sm font-semibold text-white/80 uppercase">{t('priceMember')}</span>
                    <span className="text-3xl font-black">{priceCell(event.priceMemberCents, earlyMember)}</span>
                  </li>
                )}
              </>
            )}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {availability.state === 'open' && (
              <>
                <Button asChild size="lg" className={pill}>
                  <Link href={registerHref}>{registerLabel}</Link>
                </Button>
                {availability.waitlistOnly ? (
                  <Badge variant="secondary">{t('waitlistOnly')}</Badge>
                ) : (
                  availability.seatsFree <= FEW_SEATS && <Badge variant="secondary">{t('fewSeats', { count: availability.seatsFree })}</Badge>
                )}
              </>
            )}
            {availability.state === 'notOpenYet' && event.registrationOpensAt && (
              <p>{t('opensAt', { date: format.dateTime(new Date(event.registrationOpensAt), { dateStyle: 'long', timeStyle: 'short' }) })}</p>
            )}
            {availability.state === 'closed' && <p>{t('closed')}</p>}
            {availability.state === 'paused' && <p>{t('paused')}</p>}
            {availability.state === 'unavailable' && <p>{t('unavailable')}</p>}
          </div>
          {(availability.state === 'open' && event.registrationClosesAt) || event.termsDocumentId ? (
            <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
              {availability.state === 'open' && event.registrationClosesAt && (
                <span>{t('closesAt', { date: format.dateTime(new Date(event.registrationClosesAt), { dateStyle: 'long', timeStyle: 'short' }) })}</span>
              )}
              {event.termsDocumentId && (
                <Link href={`/events/${event.slug}/terms`} className="underline underline-offset-4">
                  {t('termsLink')}
                </Link>
              )}
            </p>
          ) : null}
        </div>
      </section>

      {canRegister && (
        <section
          className={cn(bleed, 'overflow-hidden bg-[var(--ev-dark)] bg-cover bg-center text-center text-white')}
          style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
        >
          {heroUrl && <div aria-hidden className="absolute inset-0 bg-[var(--ev-dark)] opacity-80" />}
          <div className="relative mx-auto max-w-3xl px-4 py-16">
            <h2 className="text-3xl font-black">{t('closingTitle')}</h2>
            <p className="mt-2 text-lg text-white/90">{t('closingText', { event: eventName })}</p>
            <Button asChild size="lg" className={cn(pill, 'mt-6')}>
              <Link href={registerHref}>{registerLabel}</Link>
            </Button>
          </div>
        </section>
      )}

      {sponsors.length > 0 && (
        <section aria-labelledby="sponsors" className={cn(bleed, 'bg-[var(--ev-primary)] text-white')}>
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-12">
            <h2 id="sponsors" className="text-center text-3xl font-black">
              {t('sponsorsTitle')}
            </h2>
            {sponsors.map((g) => (
              <div key={g.packageName ? localized(g.packageName, locale) : 'none'} className="space-y-3">
                {g.packageName && sponsors.length > 1 && (
                  <h3 className="text-center text-sm font-semibold tracking-wide text-white/80 uppercase">{localized(g.packageName, locale)}</h3>
                )}
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {g.companies.map((c) => {
                    const logo = mediaUrl(c.logoPath);
                    const tile = (
                      <span className="flex h-28 items-center justify-center rounded-xl bg-white p-4 text-center text-sm font-semibold text-neutral-800">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt={c.name} loading="lazy" className="max-h-full max-w-full object-contain" />
                        ) : (
                          c.name
                        )}
                      </span>
                    );
                    return (
                      <li key={c.name}>
                        {c.website ? (
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('website', { name: c.name })}
                            className="block transition-opacity hover:opacity-85"
                          >
                            {tile}
                          </a>
                        ) : (
                          tile
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Abschnitt über die volle Fensterbreite (das Layout schneidet seitlich ab, siehe overflow-x-clip). */
const bleed = 'relative left-1/2 w-screen -translate-x-1/2';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
