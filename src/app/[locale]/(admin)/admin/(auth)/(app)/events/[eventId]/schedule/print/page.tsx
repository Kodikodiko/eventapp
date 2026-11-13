import { getFormatter, getTranslations } from 'next-intl/server';
import { PrintButton } from '@/components/admin/print-button';
import { ProgramGrid } from '@/components/program/program-grid';
import { TIME_ZONE, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { streamEnd } from '@/lib/streams';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listSessions, listStreams } from '@/server/services/program';

/**
 * Druckansicht des Programms – normale React-Seite (Inhalte werden automatisch escaped, kein document.write).
 * Kopfzeile und Navigation des Admin-Bereichs sind beim Drucken ausgeblendet (print:hidden).
 */
export default async function SchedulePrintPage({ params }: EventParams) {
  const locale = await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('schedule');
  const format = await getFormatter();
  const sessions = listSessions(db, event.id);
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short', timeZone: TIME_ZONE });
  const streamCols = listStreams(db, event.id).map((s) => ({ position: s.position, label: localized(s.name, locale) || t('streamN', { n: s.position }) }));
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
        return (
          <section key={day} className="break-inside-avoid-page">
            {days.length > 1 && (
              <h3 className="mb-2 text-lg font-semibold">{format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'full', timeZone: TIME_ZONE })}</h3>
            )}
            <ProgramGrid
              streams={streamCols}
              timeHeader={t('time')}
              timeLabel={time}
              className="text-sm"
              items={daySessions.map((s) => ({
                id: s.id,
                startsAt: s.startsAt,
                stream: s.stream,
                streamTo: streamEnd(s),
                className: 'rounded-sm',
                content: <SessionCell s={s} locale={locale} time={time} />,
              }))}
            />
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
