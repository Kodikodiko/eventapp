'use client';

import { AlertTriangle, ChevronDown, Plus, Printer, Settings2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { TIME_ZONE, utcToViennaInput, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { streamEnd, type StreamInfo } from '@/lib/streams';
import type { SessionFormValues } from '@/lib/validation/program';
import { cn } from '@/lib/utils';
import { createSessionAction, deleteSessionAction, updateSessionAction } from '@/server/actions/program';
import type { SessionRow, SpeakerRow } from '@/server/services/program';
import { mediaUrl } from '@/lib/validation/media';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';
import { SessionDialog, StreamsPanel } from './schedule-view';

type Props = {
  eventId: number;
  eventStartsAt: string;
  sessions: SessionRow[];
  speakers: SpeakerRow[];
  streams: StreamInfo[];
  readOnly: boolean;
};

/** Pixel je Minute auf der Zeitachse */
const PX = 1.6;
const SNAP = 5;
const MIN = 60_000;

type Drag = { id: number; startX: number; startY: number; dy: number; dStream: number; moved: boolean; colWidth: number };

function formValues(s: SessionRow, startsAt = s.startsAt, endsAt = s.endsAt, stream = s.stream, streamTo = streamEnd(s)): SessionFormValues {
  return {
    title: { de: s.title.de, en: s.title.en ?? '' },
    startsAt: utcToViennaInput(startsAt),
    endsAt: utcToViennaInput(endsAt),
    location: s.location,
    tag: s.tag,
    stream: String(stream),
    streamTo: String(streamTo),
    speakerId: s.speakerId ? String(s.speakerId) : '',
    coSpeakerIds: s.coSpeakerIds.map(String),
  };
}

const overlaps = (a: SessionRow, b: SessionRow) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/**
 * Programm & Speaker (UI-Redesign 18.11.2026): Speaker-Leiste links, Programm auf echter Zeitachse rechts.
 * Ziehen verschiebt einen Programmpunkt (Zeit in 5-Minuten-Schritten, Stream seitlich), Klicken öffnet den bekannten Dialog.
 * Überschneidungen (gleicher Speaker oder gleicher Stream) stehen oben.
 */
export function ProgramPlanner({ eventId, eventStartsAt, sessions, speakers, streams, readOnly }: Props) {
  const t = useTranslations('schedule');
  const tp = useTranslations('schedule.planner');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ mode: 'create'; startsAt?: string; stream?: number } | { mode: 'edit'; row: SessionRow } | null>(null);
  const [showStreams, setShowStreams] = useState(false);
  const [hoverSpeaker, setHoverSpeaker] = useState<number | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // aktueller Ziehzustand auch für Ereignisse vor dem nächsten Rendern (pointerup direkt nach pointermove)
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const [removeRow, setRemoveRow] = useState<SessionRow | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => [...new Set(sessions.map((s) => viennaDate(s.startsAt)))].sort(), [sessions]);
  const [day, setDay] = useState(days[0] ?? viennaDate(eventStartsAt));
  const daySessions = sessions.filter((s) => viennaDate(s.startsAt) === day);
  const streamCount = Math.max(1, streams.length);
  const streamLabel = (n: number) => localized(streams[n - 1]?.name, locale) || t('streamN', { n });
  const time = (ms: number | string) => format.dateTime(new Date(ms), { timeStyle: 'short', timeZone: TIME_ZONE });

  // Zeitfenster des Tages: volle Stunden um alle Programmpunkte
  const hour = 60 * MIN;
  const t0 = daySessions.length ? Math.floor(Math.min(...daySessions.map((s) => Date.parse(s.startsAt))) / hour) * hour : Date.parse(`${day}T08:00:00Z`);
  const t1 = daySessions.length ? Math.ceil(Math.max(...daySessions.map((s) => Date.parse(s.endsAt))) / hour) * hour : t0 + 8 * hour;
  const height = ((t1 - t0) / MIN) * PX;
  const ticks: number[] = [];
  for (let m = t0; m <= t1; m += 30 * MIN) ticks.push(m);

  // Hinweise: Überschneidungen je Speaker und je Stream, fehlende Folien
  const conflicts = useMemo(() => {
    const list: string[] = [];
    const people = (s: SessionRow) => [s.speakerId, ...s.coSpeakerIds].filter((x): x is number => x != null);
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];
        if (!overlaps(a, b)) continue;
        const shared = people(a).filter((p) => people(b).includes(p));
        for (const p of shared) {
          const sp = speakers.find((x) => x.id === p);
          list.push(tp('conflictSpeaker', { name: sp ? `${sp.firstName} ${sp.lastName}` : '?', a: localized(a.title, locale), b: localized(b.title, locale) }));
        }
        const sameStream = a.stream <= streamEnd(b) && b.stream <= streamEnd(a);
        if (sameStream && a.tag !== 'break' && b.tag !== 'break') {
          list.push(tp('conflictStream', { stream: streamLabel(Math.max(a.stream, b.stream)), a: localized(a.title, locale), b: localized(b.title, locale) }));
        }
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, speakers, locale]);
  const confirmed = speakers.filter((s) => s.proposalStatus === 'confirmed');
  const slidesMissing = confirmed.filter((s) => s.slidesStatus === 'missing').length;

  function save(row: SessionRow, values: SessionFormValues) {
    startTransition(async () => {
      if (handle(await updateSessionAction(row.id, values), { success: tp('moved', { title: localized(row.title, locale), time: values.startsAt.slice(11) }) })) router.refresh();
    });
  }

  function onPointerDown(e: React.PointerEvent, s: SessionRow) {
    if (readOnly || e.button !== 0) return;
    const col = (gridRef.current?.clientWidth ?? 600) / streamCount;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: s.id, startX: e.clientX, startY: e.clientY, dy: 0, dStream: 0, moved: false, colWidth: col });
  }
  function onPointerMove(e: React.PointerEvent, s: SessionRow) {
    const drag = dragRef.current;
    if (!drag || drag.id !== s.id) return;
    const dyMin = Math.round((e.clientY - drag.startY) / PX / SNAP) * SNAP;
    const span = streamEnd(s) - s.stream;
    const dStream = Math.max(1 - s.stream, Math.min(streamCount - 1 - span - (s.stream - 1), Math.round((e.clientX - drag.startX) / drag.colWidth)));
    const moved = drag.moved || Math.abs(e.clientY - drag.startY) > 4 || Math.abs(e.clientX - drag.startX) > 4;
    if (dyMin !== drag.dy || dStream !== drag.dStream || moved !== drag.moved) setDrag({ ...drag, dy: dyMin, dStream, moved });
  }
  function onPointerUp(s: SessionRow) {
    const d = dragRef.current;
    if (!d || d.id !== s.id) return;
    setDrag(null);
    if (!d.moved) {
      setDialog({ mode: 'edit', row: s });
      return;
    }
    if (d.dy === 0 && d.dStream === 0) return;
    const start = new Date(Date.parse(s.startsAt) + d.dy * MIN).toISOString();
    const end = new Date(Date.parse(s.endsAt) + d.dy * MIN).toISOString();
    save(s, formValues(s, start, end, s.stream + d.dStream, streamEnd(s) + d.dStream));
  }

  const blockClass = (s: SessionRow) => {
    const plenary = streams.length > 1 && s.stream === 1 && streamEnd(s) >= streams.length && (s.tag === 'talk' || s.tag === 'workshop');
    if (s.tag === 'break') return 'border-border bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,transparent_6px_12px)] text-muted-foreground';
    if (s.tag === 'general') return 'border-primary/30 bg-brand-soft text-foreground';
    if (plenary) return 'border-primary bg-primary text-primary-foreground';
    return 'border-border bg-card text-foreground';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {days.length > 1 && (
          <div role="tablist" className="flex gap-1">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={d === day}
                onClick={() => setDay(d)}
                className={cn('rounded-lg px-3 py-1.5 text-sm', d === day ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:bg-muted')}
              >
                {format.dateTime(new Date(`${d}T12:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIME_ZONE })}
              </button>
            ))}
          </div>
        )}
        <span className="text-sm text-muted-foreground">{readOnly ? '' : tp('dragHint')}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowStreams((v) => !v)} aria-expanded={showStreams}>
            <Settings2 aria-hidden className="size-4" />
            {tp('streams', { count: streams.length })}
            <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', showStreams && 'rotate-180')} />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/events/${eventId}/schedule/print`}>
              <Printer aria-hidden className="size-4" />
              {t('print')}
            </Link>
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
              <Plus aria-hidden className="size-4" />
              {t('add')}
            </Button>
          )}
        </div>
      </div>

      {showStreams && <StreamsPanel eventId={eventId} streams={streams} readOnly={readOnly} />}

      {(conflicts.length > 0 || slidesMissing > 0) && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {conflicts.map((c, i) => (
            <p key={i} className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {c}
            </p>
          ))}
          {slidesMissing > 0 && (
            <p className="flex items-start gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {tp('slidesMissing', { count: slidesMissing, total: confirmed.length })}
              <Link href={`/admin/events/${eventId}/speakers`} className="font-semibold underline underline-offset-4">
                {tp('toSpeakers')}
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside aria-label={tp('speakersTitle')} className="rounded-xl border bg-card lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-display font-bold">{tp('speakersTitle')}</h3>
            <Link href={`/admin/events/${eventId}/speakers`} className="text-xs font-semibold text-primary hover:underline">
              {tp('manage')}
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-1 p-2 text-center text-xs">
            {(
              [
                [tp('pending'), speakers.filter((s) => s.proposalStatus === 'pending').length, 'text-amber-700'],
                [tp('confirmed'), confirmed.length, 'text-[#17603C]'],
                [tp('noSlides'), slidesMissing, slidesMissing ? 'text-destructive' : 'text-muted-foreground'],
              ] as const
            ).map(([label, n, tone]) => (
              <span key={label} className="rounded-lg bg-muted/60 py-1.5">
                <span className={cn('block font-display text-base font-bold tabular-nums', tone)}>{n}</span>
                {label}
              </span>
            ))}
          </div>
          <ul className="space-y-0.5 p-2 pt-0">
            {speakers.length === 0 && <li className="p-3 text-sm text-muted-foreground">{tp('noSpeakers')}</li>}
            {speakers.map((s) => {
              const photo = mediaUrl(s.photoPath);
              const name = `${s.firstName} ${s.lastName}`;
              return (
                <li
                  key={s.id}
                  onMouseEnter={() => setHoverSpeaker(s.id)}
                  onMouseLeave={() => setHoverSpeaker(null)}
                  className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5', hoverSpeaker === s.id && 'bg-brand-soft', s.proposalStatus === 'rejected' && 'opacity-50')}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-bold text-primary">
                      {`${s.firstName.charAt(0)}${s.lastName.charAt(0)}`.toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.company ?? (s.proposalStatus === 'pending' ? tp('pending') : '')}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold">
                    {s.sessionCount > 0 ? (
                      <span className="rounded bg-muted px-1.5 tabular-nums" title={tp('sessionsHint', { count: s.sessionCount })}>
                        {s.sessionCount}×
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 text-amber-900">{tp('free')}</span>
                    )}
                    {s.proposalStatus === 'confirmed' && s.slidesStatus === 'missing' && (
                      <span className="rounded bg-destructive/10 px-1.5 text-destructive" title={tp('slidesMissingOne')}>
                        {tp('slidesShort')}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        <section aria-label={t('title')} className="min-w-0 rounded-xl border bg-card p-3">
          {daySessions.length === 0 && <p className="p-8 text-center text-muted-foreground">{t('empty')}</p>}
          {daySessions.length > 0 && (
            <div className="overflow-x-auto">
              <div style={{ minWidth: streamCount > 2 ? `${4 + streamCount * 11}rem` : undefined }}>
                <div className="grid grid-cols-[56px_1fr] pb-2 text-xs font-semibold text-muted-foreground">
                  <span />
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${streamCount}, minmax(0, 1fr))` }}>
                    {Array.from({ length: streamCount }, (_, i) => (
                      <span key={i} className="truncate px-2">
                        {streamLabel(i + 1)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[56px_1fr]">
                  <div className="relative" style={{ height }}>
                    {ticks.map((m) => (
                      <span key={m} className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums" style={{ top: ((m - t0) / MIN) * PX }}>
                        {time(m)}
                      </span>
                    ))}
                  </div>
                  <div ref={gridRef} className="relative rounded-lg border bg-muted/20" style={{ height }}>
                    {ticks.map((m) => (
                      <div
                        key={m}
                        aria-hidden
                        className={cn('absolute inset-x-0 border-t', (m - t0) % hour ? 'border-dashed border-border/50' : 'border-border')}
                        style={{ top: ((m - t0) / MIN) * PX }}
                      />
                    ))}
                    {Array.from({ length: streamCount - 1 }, (_, i) => (
                      <div key={i} aria-hidden className="absolute inset-y-0 border-l" style={{ left: `${((i + 1) / streamCount) * 100}%` }} />
                    ))}
                    {daySessions.map((s) => {
                      const d = drag?.id === s.id ? drag : null;
                      const start = Date.parse(s.startsAt) + (d?.dy ?? 0) * MIN;
                      const end = Date.parse(s.endsAt) + (d?.dy ?? 0) * MIN;
                      const from = s.stream + (d?.dStream ?? 0);
                      const to = streamEnd(s) + (d?.dStream ?? 0);
                      const top = ((start - t0) / MIN) * PX;
                      const h = Math.max(22, ((end - start) / MIN) * PX - 3);
                      const people = [s.speakerName, ...s.coSpeakerNames].filter(Boolean).join(', ');
                      const highlighted = hoverSpeaker != null && (s.speakerId === hoverSpeaker || s.coSpeakerIds.includes(hoverSpeaker));
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onPointerDown={(e) => onPointerDown(e, s)}
                          onPointerMove={(e) => onPointerMove(e, s)}
                          onPointerUp={() => onPointerUp(s)}
                          onPointerCancel={() => setDrag(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setDialog({ mode: 'edit', row: s })}
                          aria-label={t('editNamed', { title: localized(s.title, locale) })}
                          className={cn(
                            'absolute flex touch-none flex-col items-start justify-start overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs shadow-sm transition-shadow select-none focus-visible:outline-2 focus-visible:outline-ring',
                            blockClass(s),
                            !readOnly && 'cursor-grab',
                            d?.moved && 'z-20 cursor-grabbing shadow-lg ring-2 ring-primary',
                            highlighted && 'z-10 ring-2 ring-amber-400'
                          )}
                          style={{ top, height: h, left: `calc(${((from - 1) / streamCount) * 100}% + 4px)`, width: `calc(${((to - from + 1) / streamCount) * 100}% - 8px)` }}
                        >
                          <span className="block">
                            <span className="font-semibold tabular-nums opacity-80">
                              {time(start)}–{time(end)}
                            </span>{' '}
                            <span className="font-semibold">{localized(s.title, locale)}</span>
                          </span>
                          {h > 44 && (people || s.location) && <span className="mt-0.5 block truncate opacity-75">{[people, s.location].filter(Boolean).join(' · ')}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {dialog && (
        <SessionDialog
          key={dialog.mode === 'edit' ? `edit-${dialog.row.id}` : 'create'}
          title={dialog.mode === 'edit' ? t('editTitle') : t('addTitle')}
          speakers={speakers.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))}
          streams={streams.map((st) => ({ position: st.position, label: streamLabel(st.position) }))}
          defaultValues={
            dialog.mode === 'edit'
              ? formValues(dialog.row)
              : {
                  title: { de: '', en: '' },
                  startsAt: `${day}T09:00`,
                  endsAt: `${day}T09:45`,
                  location: '',
                  tag: 'talk',
                  stream: '1',
                  streamTo: '1',
                  speakerId: '',
                  coSpeakerIds: [],
                }
          }
          save={(values) => (dialog.mode === 'edit' ? updateSessionAction(dialog.row.id, values) : createSessionAction(eventId, values))}
          onClose={() => setDialog(null)}
          onDelete={
            dialog.mode === 'edit' && !readOnly
              ? () => {
                  setRemoveRow(dialog.row);
                  setDialog(null);
                }
              : undefined
          }
        />
      )}
      {removeRow && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoveRow(null)}
          title={t('deleteTitle', { title: localized(removeRow.title, locale) })}
          description={t('deleteHint')}
          confirmLabel={t('delete')}
          destructive
          onConfirm={() =>
            startTransition(async () => {
              if (handle(await deleteSessionAction(removeRow.id), { success: t('deleted') })) router.refresh();
              setRemoveRow(null);
            })
          }
        />
      )}
    </div>
  );
}
