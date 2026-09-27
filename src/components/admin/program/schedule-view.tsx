'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/action-result';
import { TIME_ZONE, utcToViennaInput, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { SESSION_TAG_KEYS, sessionFormSchema, type SessionFormValues } from '@/lib/validation/program';
import { createSessionAction, deleteSessionAction, updateSessionAction } from '@/server/actions/program';
import type { SessionRow } from '@/server/services/program';
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
  readOnly: boolean;
};

/** Programmpunkte nach Tag und Zeitfenster gruppieren. */
export function groupSessions(sessions: SessionRow[]) {
  const days = new Map<string, Map<string, SessionRow[]>>();
  for (const s of sessions) {
    const day = viennaDate(s.startsAt);
    const slots = days.get(day) ?? new Map<string, SessionRow[]>();
    slots.set(s.startsAt, [...(slots.get(s.startsAt) ?? []), s].sort((a, b) => a.stream - b.stream));
    days.set(day, slots);
  }
  return [...days.entries()].map(([day, slots]) => ({ day, slots: [...slots.entries()].map(([startsAt, items]) => ({ startsAt, items })) }));
}

export function ScheduleView({ eventId, eventStartsAt, sessions, speakers, readOnly }: Props) {
  const t = useTranslations('schedule');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit' | 'delete'; row: SessionRow } | null>(null);
  const days = useMemo(() => groupSessions(sessions), [sessions]);
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

      {days.map(({ day, slots }) => (
        <section key={day} className="space-y-3">
          <h3 className="font-semibold">{format.dateTime(new Date(`${day}T12:00:00Z`), { dateStyle: 'full', timeZone: TIME_ZONE })}</h3>
          <ol className="space-y-2">
            {slots.map(({ startsAt, items }) => (
              <li key={startsAt} className="grid gap-2 sm:grid-cols-[6rem_1fr]">
                <div className="pt-2 text-sm font-medium tabular-nums">{time(startsAt)}</div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {items.map((s) => (
                    <article key={s.id} className={s.tag === 'break' ? 'rounded-md border border-dashed bg-muted/40 p-3' : 'rounded-md border p-3'}>
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
                        {s.location && ` · ${s.location}`} · {t('streamN', { n: s.stream })}
                      </p>
                      {s.speakerName && <p className="mt-1 text-sm">{s.speakerName}</p>}
                      <Badge variant="secondary" className="mt-2">
                        {t(`tag.${s.tag}`)}
                      </Badge>
                    </article>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {dialog && dialog.mode !== 'delete' && (
        <SessionDialog
          key={dialog.mode === 'edit' ? `edit-${dialog.row.id}` : 'create'}
          title={dialog.mode === 'edit' ? t('editTitle') : t('addTitle')}
          speakers={speakers}
          defaultValues={
            dialog.mode === 'edit'
              ? {
                  title: { de: dialog.row.title.de, en: dialog.row.title.en ?? '' },
                  startsAt: utcToViennaInput(dialog.row.startsAt),
                  endsAt: utcToViennaInput(dialog.row.endsAt),
                  location: dialog.row.location,
                  tag: dialog.row.tag,
                  stream: String(dialog.row.stream) as SessionFormValues['stream'],
                  speakerId: dialog.row.speakerId ? String(dialog.row.speakerId) : '',
                }
              : { title: { de: '', en: '' }, startsAt: `${firstDay}T09:00`, endsAt: `${firstDay}T09:45`, location: '', tag: 'talk', stream: '1', speakerId: '' }
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
  defaultValues: SessionFormValues;
  save: (values: SessionFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
};

function SessionDialog({ title, speakers, defaultValues, save, onClose }: DialogProps) {
  const t = useTranslations('schedule');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<SessionFormValues>({ resolver: zodResolver(sessionFormSchema), defaultValues });
  const {
    register,
    formState: { errors },
  } = form;

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
                <Field id="s-stream" label={t('stream')} hint={t('streamHint')} error={fieldError(errors, 'stream')}>
                  <select id="s-stream" className={selectClass} {...register('stream')}>
                    {['1', '2', '3', '4'].map((n) => (
                      <option key={n} value={n}>
                        {t('streamN', { n })}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
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
