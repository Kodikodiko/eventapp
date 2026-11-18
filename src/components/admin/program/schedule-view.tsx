'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/action-result';
import { TIME_ZONE, utcToViennaInput, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { MAX_STREAMS, streamEnd, type StreamInfo } from '@/lib/streams';
import { SESSION_TAG_KEYS, sessionFormSchema, streamFormSchema, type SessionFormValues, type StreamFormValues } from '@/lib/validation/program';
import {
  addStreamAction,
  createSessionAction,
  deleteSessionAction,
  deleteStreamAction,
  moveStreamAction,
  renameStreamAction,
  updateSessionAction,
} from '@/server/actions/program';
import type { SessionRow } from '@/server/services/program';
import { ProgramGrid } from '@/components/program/program-grid';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError, LocalizedFields } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

type SpeakerOption = { id: number; name: string };

type Props = {
  eventId: number;
  eventStartsAt: string;
  sessions: SessionRow[];
  speakers: SpeakerOption[];
  streams: StreamInfo[];
  readOnly: boolean;
};

/** Programmpunkte nach Tag gruppieren (Reihenfolge nach Beginn). */
function groupByDay(sessions: SessionRow[]) {
  const days = new Map<string, SessionRow[]>();
  for (const s of sessions) days.set(viennaDate(s.startsAt), [...(days.get(viennaDate(s.startsAt)) ?? []), s]);
  return [...days.entries()].map(([day, items]) => ({ day, items }));
}

export function ScheduleView({ eventId, eventStartsAt, sessions, speakers, streams, readOnly }: Props) {
  const t = useTranslations('schedule');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit' | 'delete'; row: SessionRow } | null>(null);
  const days = useMemo(() => groupByDay(sessions), [sessions]);
  const streamLabel = (n: number) => localized(streams[n - 1]?.name, locale) || t('streamN', { n });
  const streamRange = (s: SessionRow) => {
    const to = streamEnd(s);
    if (streams.length > 1 && s.stream === 1 && to >= streams.length) return t('allStreams');
    return to > s.stream ? `${streamLabel(s.stream)} – ${streamLabel(to)}` : streamLabel(s.stream);
  };
  const time = (iso: string) => format.dateTime(new Date(iso), { timeStyle: 'short', timeZone: TIME_ZONE });
  const firstDay = viennaDate(eventStartsAt);

  function remove(row: SessionRow) {
    startTransition(async () => {
      if (handle(await deleteSessionAction(row.id), { success: t('deleted') })) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
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

      {days.length === 0 && <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{t('empty')}</p>}

      <StreamsPanel eventId={eventId} streams={streams} readOnly={readOnly} />

      {days.map(({ day, items }) => (
        <section key={day} className="space-y-3">
          <h3 className="font-semibold">{format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'full', timeZone: TIME_ZONE })}</h3>
          <ProgramGrid
            streams={streams.map((st) => ({ position: st.position, label: streamLabel(st.position) }))}
            timeLabel={time}
            timeHeader={t('time')}
            items={items.map((s) => ({
              id: s.id,
              startsAt: s.startsAt,
              stream: s.stream,
              streamTo: streamEnd(s),
              className: s.tag === 'break' ? 'border-dashed bg-muted/40' : 'bg-card',
              content: (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium">{localized(s.title, locale)}</h4>
                    {!readOnly && (
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" className="size-7" aria-label={t('editNamed', { title: localized(s.title, locale) })} onClick={() => setDialog({ mode: 'edit', row: s })}>
                          <Pencil aria-hidden className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" aria-label={t('deleteNamed', { title: localized(s.title, locale) })} onClick={() => setDialog({ mode: 'delete', row: s })}>
                          <Trash2 aria-hidden className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {time(s.startsAt)}–{time(s.endsAt)}
                    {s.location && ` · ${s.location}`}
                    {streams.length > 1 && ` · ${streamRange(s)}`}
                  </p>
                  {(s.speakerName || s.coSpeakerNames.length > 0) && (
                    <p className="mt-1 text-sm">{[s.speakerName, ...s.coSpeakerNames].filter(Boolean).join(', ')}</p>
                  )}
                  <Badge variant="secondary" className="mt-2">
                    {t(`tag.${s.tag}`)}
                  </Badge>
                </>
              ),
            }))}
          />
        </section>
      ))}

      {dialog && dialog.mode !== 'delete' && (
        <SessionDialog
          key={dialog.mode === 'edit' ? `edit-${dialog.row.id}` : 'create'}
          title={dialog.mode === 'edit' ? t('editTitle') : t('addTitle')}
          speakers={speakers}
          streams={streams.map((st) => ({ position: st.position, label: streamLabel(st.position) }))}
          defaultValues={
            dialog.mode === 'edit'
              ? {
                  title: { de: dialog.row.title.de, en: dialog.row.title.en ?? '' },
                  startsAt: utcToViennaInput(dialog.row.startsAt),
                  endsAt: utcToViennaInput(dialog.row.endsAt),
                  location: dialog.row.location,
                  tag: dialog.row.tag,
                  stream: String(dialog.row.stream),
                  streamTo: String(streamEnd(dialog.row)),
                  speakerId: dialog.row.speakerId ? String(dialog.row.speakerId) : '',
                  coSpeakerIds: dialog.row.coSpeakerIds.map(String),
                }
              : {
                  title: { de: '', en: '' },
                  startsAt: `${firstDay}T09:00`,
                  endsAt: `${firstDay}T09:45`,
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
        />
      )}
      {dialog?.mode === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('deleteTitle', { title: localized(dialog.row.title, locale) })}
          description={t('deleteHint')}
          confirmLabel={t('delete')}
          destructive
          onConfirm={() => remove(dialog.row)}
        />
      )}
    </div>
  );
}

type DialogProps = {
  title: string;
  speakers: SpeakerOption[];
  streams: { position: number; label: string }[];
  defaultValues: SessionFormValues;
  save: (values: SessionFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
  /** optional: „Löschen“ im Dialog anbieten (Programmplaner der neuen Oberfläche) */
  onDelete?: () => void;
};

export function SessionDialog({ title, speakers, streams, defaultValues, save, onClose, onDelete }: DialogProps) {
  const t = useTranslations('schedule');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<SessionFormValues>({ resolver: zodResolver(sessionFormSchema), defaultValues });
  const {
    register,
    formState: { errors },
  } = form;
  const from = Number(useWatch({ control: form.control, name: 'stream' }));
  const mainSpeaker = useWatch({ control: form.control, name: 'speakerId' });
  const coSpeakers = speakers.filter((s) => String(s.id) !== mainSpeaker);
  const allStreams = () => {
    form.setValue('stream', '1', { shouldDirty: true });
    form.setValue('streamTo', String(streams.length), { shouldDirty: true });
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await save(values), { setError: form.setError, success: t('saved') })) {
        onClose();
        router.refresh();
      }
    })
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <fieldset disabled={pending} className="space-y-4">
              <LocalizedFields name="title" label={t('titleLabel')} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="s-start" label={t('startsAt')} error={fieldError(errors, 'startsAt')}>
                  <Input id="s-start" type="datetime-local" {...register('startsAt')} />
                </Field>
                <Field id="s-end" label={t('endsAt')} error={fieldError(errors, 'endsAt')}>
                  <Input id="s-end" type="datetime-local" {...register('endsAt')} />
                </Field>
                <Field id="s-location" label={t('location')} error={fieldError(errors, 'location')}>
                  <Input id="s-location" {...register('location')} />
                </Field>
                <Field id="s-speaker" label={t('speaker')} error={fieldError(errors, 'speakerId')}>
                  <select id="s-speaker" className={selectClass} {...register('speakerId')}>
                    <option value="">{t('noSpeaker')}</option>
                    {speakers.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="s-tag" label={t('tagLabel')} error={fieldError(errors, 'tag')}>
                  <select id="s-tag" className={selectClass} {...register('tag')}>
                    {SESSION_TAG_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`tag.${k}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                {coSpeakers.length > 0 && (
                  <fieldset className="space-y-1.5 sm:col-span-2">
                    <legend className="text-sm font-medium">{t('coSpeakers')}</legend>
                    <div className="grid max-h-36 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                      {coSpeakers.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="size-4" value={String(s.id)} {...register('coSpeakerIds')} />
                          {s.name}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('coSpeakersHint')}</p>
                  </fieldset>
                )}
                {streams.length > 1 && (
                  <>
                    <Field id="s-stream" label={t('stream')} hint={t('streamHint')} error={fieldError(errors, 'stream')}>
                      <select
                        id="s-stream"
                        className={selectClass}
                        {...register('stream', {
                          onChange: (e) => {
                            if (Number(form.getValues('streamTo')) < Number(e.target.value)) form.setValue('streamTo', e.target.value);
                          },
                        })}
                      >
                        {streams.map((st) => (
                          <option key={st.position} value={String(st.position)}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="s-stream-to" label={t('streamTo')} hint={t('streamToHint')} error={fieldError(errors, 'streamTo')}>
                      <div className="flex gap-2">
                        <select id="s-stream-to" className={selectClass} {...register('streamTo')}>
                          {streams
                            .filter((st) => st.position >= from)
                            .map((st) => (
                              <option key={st.position} value={String(st.position)}>
                                {st.label}
                              </option>
                            ))}
                        </select>
                        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={allStreams}>
                          {t('allStreams')}
                        </Button>
                      </div>
                    </Field>
                  </>
                )}
              </div>
            </fieldset>
            <DialogFooter>
              {onDelete && (
                <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={onDelete}>
                  <Trash2 aria-hidden className="size-4" />
                  {t('delete')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Streams des Events: anlegen, umbenennen, Reihenfolge ändern, löschen. */
export function StreamsPanel({ eventId, streams, readOnly }: { eventId: number; streams: StreamInfo[]; readOnly: boolean }) {
  const t = useTranslations('schedule');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<{ position: number | null; name: StreamFormValues['name'] } | null>(null);
  const [remove, setRemove] = useState<StreamInfo | null>(null);

  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  return (
    <section aria-labelledby="streams-title" className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="streams-title" className="font-semibold">
            {t('streamsTitle')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('streamsHint', { max: MAX_STREAMS })}</p>
        </div>
        {!readOnly && streams.length < MAX_STREAMS && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setEdit({ position: null, name: { de: `Stream ${streams.length + 1}`, en: '' } })}>
            <Plus aria-hidden className="size-4" />
            {t('addStream')}
          </Button>
        )}
      </div>
      <ol className="mt-3 flex flex-wrap gap-2">
        {streams.map((s, i) => (
          <li key={s.position} className="flex items-center gap-1 rounded-md border bg-background py-1 pr-1 pl-3 text-sm">
            <span className="mr-1 text-xs text-muted-foreground tabular-nums">{s.position}</span>
            <span className="font-medium">{localized(s.name, locale)}</span>
            {!readOnly && (
              <>
                <Button variant="ghost" size="icon" className="size-7" disabled={pending || i === 0} aria-label={t('moveLeft')} onClick={() => run(() => moveStreamAction(eventId, s.position, -1), t('streamMoved'))}>
                  <ChevronLeft aria-hidden className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" disabled={pending || i === streams.length - 1} aria-label={t('moveRight')} onClick={() => run(() => moveStreamAction(eventId, s.position, 1), t('streamMoved'))}>
                  <ChevronRight aria-hidden className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" disabled={pending} aria-label={t('renameStream')} onClick={() => setEdit({ position: s.position, name: { de: s.name.de, en: s.name.en ?? '' } })}>
                  <Pencil aria-hidden className="size-3.5" />
                </Button>
                {streams.length > 1 && (
                  <Button variant="ghost" size="icon" className="size-7" disabled={pending} aria-label={t('deleteStream')} onClick={() => setRemove(s)}>
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      {edit && (
        <StreamDialog
          title={edit.position == null ? t('addStream') : t('renameStream')}
          defaultValues={{ name: edit.name }}
          save={(v) => (edit.position == null ? addStreamAction(eventId, v) : renameStreamAction(eventId, edit.position, v))}
          onClose={() => setEdit(null)}
        />
      )}
      {remove && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemove(null)}
          title={t('deleteStreamTitle', { name: localized(remove.name, locale) })}
          description={t('deleteStreamHint')}
          confirmLabel={t('delete')}
          destructive
          onConfirm={() => run(() => deleteStreamAction(eventId, remove.position), t('streamDeleted'))}
        />
      )}
    </section>
  );
}

function StreamDialog({
  title,
  defaultValues,
  save,
  onClose,
}: {
  title: string;
  defaultValues: StreamFormValues;
  save: (v: StreamFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const t = useTranslations('schedule');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<StreamFormValues>({ resolver: zodResolver(streamFormSchema), defaultValues });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await save(values), { setError: form.setError, success: t('streamSaved') })) {
        onClose();
        router.refresh();
      }
    })
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <fieldset disabled={pending}>
              <LocalizedFields name="name" label={t('streamName')} />
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
