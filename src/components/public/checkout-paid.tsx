import { CalendarDays, CalendarPlus, Clock, MapPin } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { CheckoutView } from '@/server/services/checkout';

type Props = { view: CheckoutView; locale: 'de' | 'en'; hasProgram: boolean; contactEmail: string | null };

/**
 * Bestätigungsseite nach erfolgreicher Online-Zahlung (Entwurf B „Bühne“, 19.11.2026).
 * Kopfbereich in den Eventfarben wie auf der Eventseite, darunter die nächsten Schritte.
 * Zeigt bewusst keine Personendaten: Die Seite hängt nur an der Zahlungsreferenz.
 */
export async function CheckoutPaid({ view, locale, hasProgram, contactEmail }: Props) {
  const t = await getTranslations('checkout.paidPage');
  const format = await getFormatter();
  const event = localized(view.eventName, locale);
  const theme = view.eventTheme ?? {};
  const vars = {
    '--ev-primary': theme.primary ?? 'hsl(var(--primary))',
    '--ev-dark': theme.dark ?? 'hsl(249 40% 18%)',
    '--ev-accent': theme.accent ?? 'hsl(var(--primary))',
    '--ev-on-accent': theme.accent ? (theme.dark ?? '#111') : '#fff',
  } as React.CSSProperties;
  const start = new Date(view.eventStartsAt);
  const end = new Date(view.eventEndsAt);
  const sameDay = viennaDate(view.eventStartsAt) === viennaDate(view.eventEndsAt);
  const eventHref = `/events/${view.eventSlug}`;
  const calendarHref = `/api/events/${view.eventSlug}/calendar?locale=${locale}`;

  const steps = [
    { when: t('steps.paid.when'), title: t('steps.paid.title'), text: formatEuro(view.amountCents, locale), done: true },
    { when: t('steps.mail.when'), title: t('steps.mail.title'), text: t('steps.mail.text') },
    { when: t('steps.manage.when'), title: t('steps.manage.title'), text: t('steps.manage.text'), href: '/portal' },
    { when: format.dateTime(start, { day: 'numeric', month: 'long' }), title: t('steps.day.title'), text: t('steps.day.text') },
  ];

  return (
    <div style={vars} className="-mt-8 -mb-8 text-neutral-900">
      <section
        role="status"
        className={cn(bleed, 'overflow-hidden text-white')}
        style={{ backgroundImage: 'radial-gradient(120% 140% at 85% 0%, var(--ev-primary) 0%, var(--ev-dark) 60%)' }}
      >
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:px-6 sm:py-16">
          <div className="ef-pop grid size-20 place-items-center rounded-full bg-white/10 ring-8 ring-white/5 sm:size-28">
            <svg viewBox="0 0 64 64" fill="none" aria-hidden className="ef-check size-14 sm:size-20">
              <circle cx="32" cy="32" r="25" stroke="var(--ev-accent)" strokeWidth="4" />
              <path d="M21 33l7 7 15-16" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0 space-y-4">
            <p className="text-sm font-semibold tracking-wider text-[var(--ev-accent)] uppercase">{t('eyebrow')}</p>
            <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-[-0.02em] text-balance sm:text-5xl">{t('title', { event })}</h1>
            <p className="max-w-[46ch] text-lg text-white/80">{t('lead')}</p>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-base text-white/95">
              <li className="flex items-center gap-2">
                <CalendarDays aria-hidden className="size-4 text-[var(--ev-accent)]" />
                {sameDay ? format.dateTime(start, { dateStyle: 'full' }) : format.dateTimeRange(start, end, { dateStyle: 'long' })}
              </li>
              {sameDay && (
                <li className="flex items-center gap-2">
                  <Clock aria-hidden className="size-4 text-[var(--ev-accent)]" />
                  {format.dateTimeRange(start, end, { timeStyle: 'short' })}
                </li>
              )}
              {view.eventLocation && (
                <li className="flex min-w-0 items-center gap-2">
                  <MapPin aria-hidden className="size-4 shrink-0 text-[var(--ev-accent)]" />
                  <span className="min-w-0">{view.eventLocation}</span>
                </li>
              )}
            </ul>
            <div className="flex flex-wrap gap-3 pt-1">
              <Button asChild size="lg" className="h-12 rounded-full bg-white px-6 text-base font-semibold text-[var(--ev-dark)] hover:bg-white/90">
                <a href={calendarHref} download>
                  <CalendarPlus aria-hidden className="size-5" />
                  {t('addToCalendar')}
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/50 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <Link href={hasProgram ? `${eventHref}#program` : eventHref}>{hasProgram ? t('toProgram') : t('toEvent')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="next-steps" className="mx-auto max-w-5xl space-y-6 py-10 sm:py-14">
        <h2 id="next-steps" className="font-display text-2xl font-extrabold tracking-tight">
          {t('nextTitle')}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li
              key={s.title}
              className={cn('grid min-w-0 content-start gap-1.5 rounded-xl border p-5', s.done ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-white')}
            >
              <span className={cn('text-xs font-semibold tracking-wider uppercase', s.done ? 'text-emerald-700' : 'text-neutral-500')}>{s.when}</span>
              <h3 className="text-base font-semibold">{s.title}</h3>
              <p className="text-sm text-neutral-600 tabular-nums">
                {s.href ? (
                  <Link href={s.href} className="underline underline-offset-4 hover:text-neutral-900">
                    {s.text}
                  </Link>
                ) : (
                  s.text
                )}
              </p>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-5 text-sm text-neutral-500">
          <Link href="/portal" className="hover:underline">
            {t('myRegistrations')}
          </Link>
          <Link href={eventHref} className="hover:underline">
            {t('toEvent')}
          </Link>
          {contactEmail && <span>{t('questions', { email: contactEmail })}</span>}
        </div>
      </section>
    </div>
  );
}

const bleed = 'relative left-1/2 w-screen -translate-x-1/2';
