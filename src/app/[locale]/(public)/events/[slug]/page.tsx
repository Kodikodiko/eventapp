import type { Metadata } from 'next';
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = getPublicEventBySlug(await requestDb(), slug);
  return event ? { title: localized(event.name, locale === 'en' ? 'en' : 'de') } : {};
}

/** Nur so viele freie Plätze nennen, wenn es knapp wird. */
const FEW_SEATS = 10;

/**
 * Öffentliche Eventseite – Vorlage für alle Events (UI-Redesign 18.11.2026).
 * Farben kommen ausschließlich aus dem Event-Theme (CSS-Variablen --ev-*), Inhalte aus den vorhandenen Feldern.
 */
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
  const streamCols = streams.map((s) => ({
    position: s.position,
    label: localized(s.name, locale) || `Stream ${s.position}`,
  }));
  const multi = streams.length > 1;
  /** Punkt über alle Streams (Plenum) */
  const spansAll = (s: PublicSession) => s.stream === 1 && s.streamTo >= streams.length;
  const streamLabel = (s: PublicSession) =>
    spansAll(s) ? null : [...new Set([s.stream, s.streamTo])].map((n) => streamCols[n - 1]?.label ?? `Stream ${n}`).join('–');
  /** Vortrag im Plenum: wird als Höhepunkt gezeigt (z. B. Keynote) */
  const isPlenaryTalk = (s: PublicSession) => multi && spansAll(s) && (s.tag === 'talk' || s.tag === 'workshop');
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
    // Schrift auf der Akzentfarbe: bei eigener Akzentfarbe (meist hell) dunkel, sonst weiß
    '--ev-on-accent': theme.accent ? (theme.dark ?? '#111') : '#fff',
  } as React.CSSProperties;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const now = new Date();
  const isPast = end < now;
  const canRegister = availability.state === 'open';

  const days = new Map<string, PublicSession[]>();
  for (const s of sessions) days.set(viennaDate(s.startsAt), [...(days.get(viennaDate(s.startsAt)) ?? []), s]);
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short' });
  const free = event.priceNormalCents === 0 && event.priceMemberCents === 0;
  const earlyNormal = earlyBirdPrice(event, 'normal', now);
  const earlyMember = earlyBirdPrice(event, 'member', now);
  const priceCell = (regular: number, early: number | null, onDark = false) =>
    early === null ? (
      formatEuro(regular, locale)
    ) : (
      <>
        <s className={cn('mr-2 text-xl font-normal', onDark ? 'text-white/70' : 'text-neutral-500')}>{formatEuro(regular, locale)}</s>
        {formatEuro(early, locale)}
      </>
    );

  // Keynote-Speaker: wer einen Vortrag im Plenum hält, wird größer gezeigt
  const plenaryNames = new Set(sessions.filter(isPlenaryTalk).flatMap((s) => [s.speakerName, ...s.coSpeakerNames].filter(Boolean)));
  const keynoteSpeakers = speakers.filter((s) => plenaryNames.has(s.name));
  const otherSpeakers = speakers.filter((s) => !plenaryNames.has(s.name));
  const programCount = sessions.filter((s) => s.tag === 'talk' || s.tag === 'workshop').length;

  // Knöpfe: auf Hell in der Primärfarbe, auf Dunkel in der Akzentfarbe mit dunkler Schrift (Kontrast)
  const btnLight = 'h-12 rounded-full bg-[var(--ev-primary)] px-7 text-base font-semibold text-white shadow-sm hover:bg-[var(--ev-primary)]/90';
  const btnDark = 'h-12 rounded-full bg-[var(--ev-accent)] px-7 text-base font-semibold text-[var(--ev-on-accent)] shadow-sm hover:bg-[var(--ev-accent)]/90';
  const btnGhostDark =
    'h-12 rounded-full border-white/60 bg-transparent px-7 text-base font-semibold text-white hover:bg-white/10 hover:text-white';
  const registerLabel = availability.waitlistOnly ? t('joinWaitlist') : t('registerNow');
  const sectionTitle = 'font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl';
  const link = 'font-medium text-[var(--ev-primary)] underline decoration-[var(--ev-primary)]/40 underline-offset-4 hover:decoration-[var(--ev-primary)]';

  const statusLine = isPast
    ? t('pastNote', { date: format.dateTime(start, { dateStyle: 'long' }) })
    : availability.state === 'notOpenYet' && event.registrationOpensAt
      ? t('opensAt', { date: format.dateTime(new Date(event.registrationOpensAt), { dateStyle: 'long', timeStyle: 'short' }) })
      : availability.state === 'closed'
        ? t('closed')
        : availability.state === 'paused'
          ? t('paused')
          : availability.state === 'unavailable'
            ? t('unavailable')
            : null;

  const facts = [
    format.dateTimeRange(start, end, { dateStyle: 'long' }),
    speakers.length > 0 ? t('factSpeakers', { count: speakers.length }) : null,
    programCount > 0 ? t('factSessions', { count: programCount }) : null,
    multi ? t('factStreams', { count: streams.length }) : null,
  ].filter(Boolean) as string[];

  const navItems = [
    days.size > 0 && { href: '#program', label: t('program') },
    speakers.length > 0 && { href: '#speakers', label: t('speakers') },
    gallery.length > 0 && { href: '#gallery', label: t('gallery') },
    !isPast && { href: '#tickets', label: t('ticketsTitle') },
    sponsors.length > 0 && { href: '#sponsors', label: t('sponsors') },
  ].filter(Boolean) as { href: string; label: string }[];

  // Programmzeilen: Vorträge klar, Plenum kräftig, Organisatorisches ruhig, Pausen als schmale Zeile
  const rowClass = (s: PublicSession) =>
    isPlenaryTalk(s)
      ? 'border-transparent bg-[var(--ev-dark)] text-white shadow-md'
      : s.tag === 'general'
        ? 'border-[var(--ev-primary)]/25 bg-[var(--ev-primary)]/[0.07] text-neutral-900'
        : s.tag === 'break'
          ? 'border-transparent bg-transparent py-1.5 text-neutral-600'
          : 'border-neutral-200 bg-white text-neutral-900 shadow-sm';
  const rowMuted = (s: PublicSession) => (isPlenaryTalk(s) ? 'text-white/80' : 'text-neutral-600');
  const timeTone = (s: PublicSession) => (isPlenaryTalk(s) ? 'text-white/80' : s.tag === 'break' ? 'text-neutral-500' : 'text-[var(--ev-primary)]');
  const slidesLink = (s: PublicSession) =>
    s.slidesUrl && (
      <a
        href={s.slidesUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('mt-1 inline-block text-sm', isPlenaryTalk(s) ? 'font-medium text-white underline underline-offset-4' : link)}
      >
        {t('slides')}
      </a>
    );
  const sessionBody = (s: PublicSession, withTime: boolean) =>
    s.tag === 'break' ? (
      <span className="flex flex-wrap items-baseline gap-x-3 text-sm">
        {withTime && (
          <span className="tabular-nums text-neutral-500">
            {time(s.startsAt)}–{time(s.endsAt)}
          </span>
        )}
        <span className="font-medium">{localized(s.title, locale)}</span>
        {s.location && <span className="text-neutral-500">{s.location}</span>}
      </span>
    ) : (
      <>
        {withTime && (
          <span className={cn('block text-xs font-semibold tabular-nums', timeTone(s))}>
            {time(s.startsAt)}–{time(s.endsAt)}
            {isPlenaryTalk(s) && <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px] tracking-wide uppercase">{t('plenary')}</span>}
          </span>
        )}
        <span className={cn('mt-1 block leading-snug font-semibold text-pretty', isPlenaryTalk(s) && 'font-display text-lg')}>{localized(s.title, locale)}</span>
        {(people(s) || s.location) && (
          <span className={cn('mt-1 block text-sm', rowMuted(s))}>{[people(s), s.location].filter(Boolean).join(' · ')}</span>
        )}
        {slidesLink(s)}
      </>
    );

  return (
    <div style={vars} className="-mt-8 -mb-8 text-neutral-900 selection:bg-[var(--ev-primary)] selection:text-white">
      {/* Hero */}
      <header
        className={cn(bleed, 'overflow-hidden bg-[var(--ev-dark)] bg-cover bg-center text-white')}
        style={{
          backgroundImage: heroUrl
            ? `linear-gradient(100deg, color-mix(in oklab, var(--ev-dark) 94%, transparent) 0%, color-mix(in oklab, var(--ev-dark) 78%, transparent) 42%, color-mix(in oklab, var(--ev-primary) 35%, transparent) 100%), url(${heroUrl})`
            : 'linear-gradient(120deg, var(--ev-dark), var(--ev-primary))',
        }}
      >
        <div className="relative mx-auto flex min-h-[30rem] max-w-6xl flex-col justify-end gap-6 px-4 pt-16 pb-12 sm:min-h-[36rem] sm:px-6 sm:pb-16">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-12 w-auto self-start sm:h-16" />
          )}
          <div className="space-y-4">
            {isPast && (
              <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-semibold backdrop-blur-sm">{t('pastBadge')}</span>
            )}
            <h1 className="max-w-4xl font-display text-5xl leading-[0.95] font-extrabold tracking-[-0.03em] text-balance sm:text-7xl">{eventName}</h1>
            {tagline && <p className="max-w-3xl text-xl font-semibold text-balance text-[var(--ev-accent)] sm:text-2xl">{tagline}</p>}
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-base text-white/90 sm:text-lg">
            {facts.map((f, i) => (
              <li key={i} className={cn(i > 0 && 'sm:border-l sm:border-white/30 sm:pl-6')}>
                {f}
              </li>
            ))}
          </ul>
          {event.location && <p className="-mt-3 max-w-3xl text-sm text-white/75 sm:text-base">{event.location}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {canRegister && (
              <Button asChild size="lg" className={btnDark}>
                <Link href={registerHref}>{registerLabel}</Link>
              </Button>
            )}
            {days.size > 0 && (
              <Button asChild size="lg" variant="outline" className={btnGhostDark}>
                <a href="#program">{t('toProgram')}</a>
              </Button>
            )}
            {isPast && gallery.length > 0 && (
              <Button asChild size="lg" variant="outline" className={btnGhostDark}>
                <a href="#gallery">{t('toGallery')}</a>
              </Button>
            )}
            {!canRegister && !isPast && statusLine && <p className="text-sm text-white/85">{statusLine}</p>}
          </div>
        </div>
      </header>

      {/* Abschnittsnavigation, bleibt beim Scrollen stehen */}
      {navItems.length > 1 && (
        <nav aria-label={t('sectionNav')} className={cn(bleedSticky, 'border-b border-neutral-200 bg-white/90 backdrop-blur-md')}>
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 sm:px-6">
            <ul className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto py-2 text-sm font-medium [scrollbar-width:none]">
              {navItems.map((n) => (
                <li key={n.href} className="shrink-0">
                  <a
                    href={n.href}
                    className="block rounded-full px-3 py-1.5 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-[var(--ev-primary)]"
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            {canRegister && (
              <Button asChild size="sm" className="hidden h-9 shrink-0 rounded-full bg-[var(--ev-primary)] px-4 font-semibold text-white hover:bg-[var(--ev-primary)]/90 sm:inline-flex">
                <Link href={registerHref}>{registerLabel}</Link>
              </Button>
            )}
          </div>
        </nav>
      )}

      {/* Über das Event */}
      {(description || event.location || highlights.length > 0) && (
        <section aria-labelledby="about" className={cn(bleed, 'bg-white')}>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className={cn('grid gap-10 md:gap-16', description ? 'md:grid-cols-[1.6fr_1fr]' : 'md:grid-cols-2 md:items-start')}>
              <div className="space-y-5">
                <h2 id="about" className={sectionTitle}>
                  {t('aboutTitle')}
                </h2>
                {description && <p className="max-w-[65ch] text-lg leading-relaxed whitespace-pre-line text-pretty text-neutral-700">{description}</p>}
              </div>
              <dl className="grid gap-5 self-start rounded-2xl bg-[var(--ev-dark)] p-7 text-white shadow-lg">
                <div>
                  <dt className="text-sm text-white/70">{t('dateLabel')}</dt>
                  <dd className="text-lg font-semibold">{format.dateTime(start, { dateStyle: 'full' })}</dd>
                </div>
                <div>
                  <dt className="text-sm text-white/70">{t('timeLabel')}</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {time(event.startsAt)}–{time(event.endsAt)}
                  </dd>
                </div>
                {event.location && (
                  <div>
                    <dt className="text-sm text-white/70">{t('locationLabel')}</dt>
                    <dd className="font-semibold">{event.location}</dd>
                  </div>
                )}
                {canRegister && (
                  <Button asChild className={cn(btnDark, 'mt-1 w-full')}>
                    <Link href={registerHref}>{registerLabel}</Link>
                  </Button>
                )}
              </dl>
            </div>

            {highlights.length > 0 && (
              <div className="mt-16 border-t border-neutral-200 pt-12">
                <h3 id="highlights" className="font-display text-2xl font-bold tracking-tight">
                  {t('highlights')}
                </h3>
                <ul className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-3">
                  {highlights.map((h, i) => {
                    const icon = mediaUrl(h.iconPath);
                    return (
                      <li key={i} className="flex gap-4">
                        {icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={icon} alt="" className="size-16 shrink-0 rounded-full bg-[var(--ev-surface)] object-cover" loading="lazy" />
                        ) : (
                          <span
                            aria-hidden
                            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--ev-primary)] font-display text-lg font-extrabold text-white"
                          >
                            {i + 1}
                          </span>
                        )}
                        <div>
                          <h4 className="font-semibold">{localized(h.title, locale)}</h4>
                          {localized(h.text, locale) && <p className="mt-1 text-pretty text-neutral-600">{localized(h.text, locale)}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Programm */}
      {days.size > 0 && (
        <section aria-labelledby="program" className={cn(bleed, 'scroll-mt-14 bg-[var(--ev-surface)]')}>
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6 sm:py-20">
            <h2 id="program" className={cn(sectionTitle, 'scroll-mt-20')}>
              {t('program')}
            </h2>
            {[...days.entries()].map(([day, items]) => (
              <div key={day} className="space-y-4">
                {days.size > 1 && <h3 className="font-display text-xl font-bold">{format.dateTime(new Date(items[0].startsAt), { dateStyle: 'full' })}</h3>}
                <ul className={cn('space-y-2', multi && 'md:hidden')}>
                  {items.map((s) => (
                    <li key={s.id} className={cn('rounded-xl border p-4', rowClass(s), s.tag === 'break' && 'px-1')}>
                      {s.tag === 'break' ? (
                        sessionBody(s, true)
                      ) : (
                        <>
                          {sessionBody(s, true)}
                          {multi && streamLabel(s) && <span className={cn('mt-1 block text-xs', rowMuted(s))}>{streamLabel(s)}</span>}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {multi && (
                  <ProgramGrid
                    className="hidden md:block"
                    streams={streamCols}
                    timeHeader={t('time')}
                    timeClassName="font-semibold text-[var(--ev-primary)]"
                    timeLabel={time}
                    items={items.map((s) => ({
                      id: s.id,
                      startsAt: s.startsAt,
                      stream: s.stream,
                      streamTo: s.streamTo,
                      className: cn('rounded-xl p-4', rowClass(s), s.tag === 'break' && 'px-1'),
                      content: sessionBody(s, true),
                    }))}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Speaker */}
      {speakers.length > 0 && (
        <section aria-labelledby="speakers" className={cn(bleed, 'bg-white')}>
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6 sm:py-20">
            <h2 id="speakers" className={cn(sectionTitle, 'scroll-mt-20')}>
              {t('speakersTitle')}
            </h2>
            {keynoteSpeakers.length > 0 && (
              <div className="space-y-5">
                <h3 className="font-display text-xl font-bold">{t('keynotesTitle')}</h3>
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {keynoteSpeakers.map((s) => (
                    <SpeakerCard key={s.id} speaker={s} locale={locale} large moreLabel={t('moreAbout', { name: s.name })} linkClass={link} />
                  ))}
                </ul>
              </div>
            )}
            {otherSpeakers.length > 0 && (
              <div className="space-y-5">
                {keynoteSpeakers.length > 0 && <h3 className="font-display text-xl font-bold">{t('moreSpeakers')}</h3>}
                <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                  {otherSpeakers.map((s) => (
                    <SpeakerCard key={s.id} speaker={s} locale={locale} moreLabel={t('moreAbout', { name: s.name })} linkClass={link} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Impressionen */}
      {gallery.length > 0 && (
        <section aria-labelledby="gallery" className={cn(bleed, 'bg-[var(--ev-dark)] text-white')}>
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6 sm:py-20">
            <h2 id="gallery" className={cn(sectionTitle, 'scroll-mt-20')}>
              {t('gallery')}
            </h2>
            <ul className="grid auto-rows-[9rem] grid-cols-2 gap-2 sm:auto-rows-[11rem] sm:grid-cols-4">
              {gallery.map((g, i) => (
                <li key={g.id} className={galleryCell(i, gallery.length)}>
                  <a
                    href={mediaUrl(g.imagePath)!}
                    target="_blank"
                    rel="noopener"
                    className="block size-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mediaUrl(g.imagePath)!}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-500 ease-out hover:scale-[1.04]"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Tickets bzw. Hinweis nach dem Event */}
      <section aria-labelledby="tickets" className={cn(bleed, 'bg-white')}>
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6 sm:py-20">
          <h2 id="tickets" className={cn(sectionTitle, 'scroll-mt-20')}>
            {isPast ? t('pastBadge') : t('ticketsTitle')}
          </h2>
          {isPast ? (
            <p className="max-w-[65ch] text-lg text-neutral-700">{statusLine}</p>
          ) : (
            <>
              {!free && (earlyNormal !== null || earlyMember !== null) && event.earlyBirdEndsAt && (
                <p className="inline-flex rounded-full bg-[var(--ev-primary)]/10 px-4 py-1.5 font-semibold text-[var(--ev-primary)]">
                  {t('earlyBirdUntil', { date: format.dateTime(new Date(event.earlyBirdEndsAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
                </p>
              )}
              <ul className="grid max-w-3xl gap-4 sm:grid-cols-2">
                {free ? (
                  <li className="rounded-2xl border border-neutral-200 p-7 shadow-sm">
                    <span className="block text-sm font-medium text-neutral-600">{t('price')}</span>
                    <span className="mt-1 block font-display text-4xl font-extrabold text-[var(--ev-primary)]">{t('free')}</span>
                  </li>
                ) : (
                  <>
                    <li className="rounded-2xl border border-neutral-200 p-7 shadow-sm">
                      <span className="block text-sm font-medium text-neutral-600">{t('priceNormal')}</span>
                      <span className="mt-1 block font-display text-4xl font-extrabold tabular-nums">{priceCell(event.priceNormalCents, earlyNormal)}</span>
                    </li>
                    {(event.priceMemberCents !== event.priceNormalCents || earlyMember !== earlyNormal) && (
                      <li className="rounded-2xl bg-[var(--ev-primary)] p-7 text-white shadow-md">
                        <span className="block text-sm font-medium text-white/80">{t('priceMember')}</span>
                        <span className="mt-1 block font-display text-4xl font-extrabold tabular-nums">{priceCell(event.priceMemberCents, earlyMember, true)}</span>
                      </li>
                    )}
                  </>
                )}
              </ul>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {canRegister ? (
                  <>
                    <Button asChild size="lg" className={btnLight}>
                      <Link href={registerHref}>{registerLabel}</Link>
                    </Button>
                    {availability.waitlistOnly ? (
                      <Badge variant="secondary">{t('waitlistOnly')}</Badge>
                    ) : (
                      availability.seatsFree <= FEW_SEATS && <Badge variant="secondary">{t('fewSeats', { count: availability.seatsFree })}</Badge>
                    )}
                  </>
                ) : (
                  statusLine && <p className="text-neutral-700">{statusLine}</p>
                )}
              </div>
            </>
          )}
          {(!isPast && canRegister && event.registrationClosesAt) || event.termsDocumentId ? (
            <p className="flex flex-wrap gap-x-4 text-sm text-neutral-600">
              {!isPast && canRegister && event.registrationClosesAt && (
                <span>{t('closesAt', { date: format.dateTime(new Date(event.registrationClosesAt), { dateStyle: 'long', timeStyle: 'short' }) })}</span>
              )}
              {event.termsDocumentId && (
                <Link href={`/events/${event.slug}/terms`} className="underline underline-offset-4 hover:text-neutral-900">
                  {t('termsLink')}
                </Link>
              )}
            </p>
          ) : null}
        </div>
      </section>

      {/* Abschluss-Aufruf */}
      {canRegister && (
        <section
          className={cn(bleed, 'overflow-hidden bg-[var(--ev-dark)] bg-cover bg-center text-white')}
          style={
            heroUrl
              ? { backgroundImage: `linear-gradient(color-mix(in oklab, var(--ev-dark) 88%, transparent), color-mix(in oklab, var(--ev-dark) 88%, transparent)), url(${heroUrl})` }
              : undefined
          }
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">{t('closingTitle')}</h2>
            <p className="mt-3 max-w-xl text-lg text-white/85">{t('closingText', { event: eventName })}</p>
            <Button asChild size="lg" className={cn(btnDark, 'mt-8')}>
              <Link href={registerHref}>{registerLabel}</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Sponsoren und Partner */}
      {sponsors.length > 0 && (
        <section aria-labelledby="sponsors" className={cn(bleed, 'border-t border-neutral-200 bg-[var(--ev-surface)]')}>
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6 sm:py-20">
            <h2 id="sponsors" className={cn(sectionTitle, 'scroll-mt-20')}>
              {t('sponsorsTitle')}
            </h2>
            {sponsors.map((g) => (
              <div key={g.packageName ? localized(g.packageName, locale) : 'none'} className="space-y-4">
                {g.packageName && sponsors.length > 1 && <h3 className="font-display text-lg font-bold text-neutral-700">{localized(g.packageName, locale)}</h3>}
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {g.companies.map((c) => {
                    const logo = mediaUrl(c.logoPath);
                    const tile = (
                      <span className="flex h-28 items-center justify-center rounded-xl border border-neutral-200 bg-white p-5 text-center text-sm font-semibold text-neutral-800 transition-shadow">
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
                            className="block rounded-xl hover:[&>span]:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ev-primary)]"
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

type Speaker = ReturnType<typeof listPublicSpeakers>[number];

function SpeakerCard({ speaker: s, locale, large = false, moreLabel, linkClass }: { speaker: Speaker; locale: 'de' | 'en'; large?: boolean; moreLabel: string; linkClass: string }) {
  const bio = localized(s.bio, locale);
  const photo = mediaUrl(s.photoPath);
  return (
    <li className="flex flex-col">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className={cn('w-full rounded-2xl bg-[var(--ev-surface)] object-cover', large ? 'aspect-[4/5]' : 'aspect-square')} loading="lazy" />
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex w-full items-center justify-center rounded-2xl bg-[var(--ev-surface)] font-display font-extrabold text-[var(--ev-primary)]',
            large ? 'aspect-[4/5] text-6xl' : 'aspect-square text-4xl'
          )}
        >
          {initials(s.name)}
        </span>
      )}
      <div className={cn('space-y-1', large ? 'pt-4' : 'pt-3')}>
        <span className={cn('block font-display font-bold', large ? 'text-xl' : 'text-base')}>{s.name}</span>
        {(s.role || s.company) && <span className="block text-sm text-neutral-600">{[s.role, s.company].filter(Boolean).join(' · ')}</span>}
        {bio &&
          (large ? (
            <p className="pt-1 text-sm leading-relaxed whitespace-pre-line text-pretty text-neutral-700">{bio}</p>
          ) : (
            <details className="text-sm">
              <summary className={cn('cursor-pointer', linkClass)}>{moreLabel}</summary>
              <p className="mt-1 whitespace-pre-line text-neutral-600">{bio}</p>
            </details>
          ))}
      </div>
    </li>
  );
}

/** Abschnitt über die volle Fensterbreite (das Layout schneidet seitlich ab, siehe overflow-x-clip). */
const bleed = 'relative left-1/2 w-screen -translate-x-1/2';
/** wie bleed, aber klebend (sticky verträgt kein left/translate) */
const bleedSticky = 'sticky top-0 z-30 ml-[calc(50%-50vw)] w-screen';

/**
 * Galerie-Raster ohne Lücken: erstes Bild groß (2×2), die letzte Zeile wird aufgefüllt.
 * Mobil 2 Spalten, ab sm 4 Spalten.
 */
function galleryCell(i: number, n: number): string {
  if (i === 0) return n > 1 ? 'col-span-2 row-span-2' : 'col-span-2 row-span-2 sm:col-span-4';
  const rest = n - 1; // Bilder nach dem großen
  const classes: string[] = [];
  // mobil: Paare; ein einzelnes letztes Bild geht über beide Spalten
  if (rest % 2 === 1 && i === n - 1) classes.push('col-span-2');
  // ab sm: neben dem großen Bild stehen 4 kleine (2 Zeilen × 2), danach Reihen zu 4
  const side = Math.min(rest, 4);
  if (i <= side) {
    if (side === 1) classes.push('sm:col-span-2 sm:row-span-2');
    if (side === 2) classes.push('sm:row-span-2');
    if (side === 3 && i === 3) classes.push('sm:col-span-2');
  } else {
    const after = rest - 4;
    const k = after % 4; // Bilder in der letzten Reihe
    const pos = i - 5; // Position nach dem Block
    const inLast = k > 0 && pos >= after - k;
    if (inLast) {
      if (k === 1) classes.push('sm:col-span-4');
      if (k === 2) classes.push('sm:col-span-2');
      if (k === 3 && pos === after - 1) classes.push('sm:col-span-2');
    }
  }
  if (rest % 2 === 1 && i === n - 1 && !classes.some((c) => c.startsWith('sm:'))) classes.push('sm:col-span-1');
  return classes.join(' ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
