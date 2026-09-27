import { getFormatter, getTranslations } from 'next-intl/server';
import { PrintButton } from '@/components/admin/print-button';
import { initLocale } from '@/i18n/page';
import { TIME_ZONE, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { listSessions } from '@/server/services/program';

/**
 * Druckansicht des Programms – normale React-Seite (Inhalte werden automatisch escaped, kein document.write).
 * Kopfzeile und Navigation des Admin-Bereichs sind beim Drucken ausgeblendet (print:hidden).
 */
export default async function SchedulePrintPage({ params }: EventParams) {
  const locale = await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('schedule');
  const format = await getFormatter();
  const sessions = listSessions(db, event.id);
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short', timeZone: TIME_ZONE });
  const streams = Math.max(1, ...sessions.map((s) => s.stream));
  const days = [...new Set(sessions.map((s) => viennaDate(s.startsAt)))];

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">{t('printHint')}</p>
        <PrintButton label={t('printNow')} />
      </div>
      <header>
        <h2 className="text-2xl font-bold">{localized(event.name, locale)}</h2>
        <p className="text-muted-foreground">
          {format.dateTime(new Date(event.startsAt), { dateStyle: 'full', timeZone: TIME_ZONE })}
          {event.location && ` · ${event.location}`}
        </p>
      </header>
      {days.length === 0 && <p>{t('empty')}</p>}
      {days.map((day) => {
        const daySessions = sessions.filter((s) => viennaDate(s.startsAt) === day);
        const slots = [...new Set(daySessions.map((s) => s.startsAt))];
        return (
          <section key={day} className="break-inside-avoid-page">
            {days.length > 1 && (
              <h3 className="mb-2 text-lg font-semibold">{format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'full', timeZone: TIME_ZONE })}</h3>
            )}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 text-left">
                  <th className="w-24 p-2">{t('time')}</th>
                  {Array.from({ length: streams }, (_, i) => (
                    <th key={i} className="p-2">
                      {t('streamN', { n: i + 1 })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => {
                  const items = daySessions.filter((s) => s.startsAt === slot);
                  const fullWidth = items.length === 1 && items[0].tag !== 'talk' && items[0].tag !== 'workshop';
                  return (
                    <tr key={slot} className="break-inside-avoid border-b align-top">
                      <td className="p-2 font-medium tabular-nums whitespace-nowrap">{time(slot)}</td>
                      {fullWidth ? (
                        <td colSpan={streams} className="p-2">
                          <SessionCell s={items[0]} locale={locale} time={time} />
                        </td>
                      ) : (
                        Array.from({ length: streams }, (_, i) => {
                          const s = items.find((x) => x.stream === i + 1);
                          return (
                            <td key={i} className="p-2">
                              {s && <SessionCell s={s} locale={locale} time={time} />}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function SessionCell({
  s,
  locale,
  time,
}: {
  s: Awaited<ReturnType<typeof listSessions>>[number];
  locale: 'de' | 'en';
  time: (iso: string) => string;
}) {
  return (
    <div>
      <div className="font-medium">{localized(s.title, locale)}</div>
      <div className="text-xs text-muted-foreground">
        {time(s.startsAt)}–{time(s.endsAt)}
        {s.location && ` · ${s.location}`}
      </div>
      {s.speakerName && <div className="text-xs">{s.speakerName}</div>}
    </div>
  );
}
