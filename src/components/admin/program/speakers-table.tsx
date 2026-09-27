'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action-result';
import { speakerFormSchema, type SpeakerFormValues } from '@/lib/validation/program';
import { createSpeakerAction, removeSpeakerAction, updateSpeakerAction } from '@/server/actions/program';
import type { SpeakerRow } from '@/server/services/program';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const proposalVariant: Record<SpeakerRow['proposalStatus'], BadgeProps['variant']> = {
  confirmed: 'default',
  pending: 'outline',
  rejected: 'destructive',
};
const slidesVariant: Record<SpeakerRow['slidesStatus'], BadgeProps['variant']> = {
  uploaded: 'paid',
  review: 'secondary',
  missing: 'outline',
};

export function SpeakersTable({ eventId, rows, readOnly }: { eventId: number; rows: SpeakerRow[]; readOnly: boolean }) {
  const t = useTranslations('speakers');
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit' | 'remove'; row: SpeakerRow } | null>(null);

  function remove(row: SpeakerRow) {
    startTransition(async () => {
      if (handle(await removeSpeakerAction(row.id), { success: t('removed') })) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
            <Plus aria-hidden className="size-4" />
            {t('add')}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">{t('colName')}</th>
              <th className="p-2 font-medium">{t('colCompany')}</th>
              <th className="p-2 font-medium">{t('colProposal')}</th>
              <th className="p-2 font-medium">{t('colSlides')}</th>
              <th className="p-2 text-right font-medium">{t('colSessions')}</th>
              <th className="p-2">
                <span className="sr-only">{t('colActions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <div className="font-medium">
                    {r.lastName}, {r.firstName}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="p-2">{r.company}</td>
                <td className="p-2">
                  <Badge variant={proposalVariant[r.proposalStatus]}>{t(`proposal.${r.proposalStatus}`)}</Badge>
                </td>
                <td className="p-2">
                  <Badge variant={slidesVariant[r.slidesStatus]}>{t(`slides.${r.slidesStatus}`)}</Badge>
                </td>
                <td className="p-2 text-right tabular-nums">{r.sessionCount}</td>
                <td className="p-2 text-right">
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: `${r.firstName} ${r.lastName}` })}>
                          <MoreHorizontal aria-hidden className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDialog({ mode: 'edit', row: r })}>
                          <Pencil aria-hidden className="size-4" />
                          {t('edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDialog({ mode: 'remove', row: r })} className="text-destructive">
                          <Trash2 aria-hidden className="size-4" />
                          {t('remove')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog && dialog.mode !== 'remove' && (
        <SpeakerDialog
          key={dialog.mode === 'edit' ? `edit-${dialog.row.id}` : 'create'}
          title={dialog.mode === 'edit' ? t('editTitle') : t('addTitle')}
          defaultValues={
            dialog.mode === 'edit'
              ? {
                  firstName: dialog.row.firstName,
                  lastName: dialog.row.lastName,
                  email: dialog.row.email ?? '',
                  company: dialog.row.company ?? '',
                  locale: dialog.row.locale,
                  proposalStatus: dialog.row.proposalStatus,
                  slidesStatus: dialog.row.slidesStatus,
                }
              : { firstName: '', lastName: '', email: '', company: '', locale: 'de', proposalStatus: 'pending', slidesStatus: 'missing' }
          }
          save={(values) => (dialog.mode === 'edit' ? updateSpeakerAction(dialog.row.id, values) : createSpeakerAction(eventId, values))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.mode === 'remove' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('removeTitle', { name: `${dialog.row.firstName} ${dialog.row.lastName}` })}
          description={t('removeHint')}
          confirmLabel={t('remove')}
          destructive
          onConfirm={() => remove(dialog.row)}
        />
      )}
    </div>
  );
}

type DialogProps = {
  title: string;
  defaultValues: SpeakerFormValues;
  save: (values: SpeakerFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
};

function SpeakerDialog({ title, defaultValues, save, onClose }: DialogProps) {
  const t = useTranslations('speakers');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<SpeakerFormValues>({ resolver: zodResolver(speakerFormSchema), defaultValues });
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
      <DialogContent className="sm:max-w-xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
              <Field id="sp-first" label={t('firstName')} error={fieldError(errors, 'firstName')}>
                <Input id="sp-first" {...register('firstName')} />
              </Field>
              <Field id="sp-last" label={t('lastName')} error={fieldError(errors, 'lastName')}>
                <Input id="sp-last" {...register('lastName')} />
              </Field>
              <Field id="sp-email" label={t('email')} error={fieldError(errors, 'email')}>
                <Input id="sp-email" type="email" {...register('email')} />
              </Field>
              <Field id="sp-company" label={t('company')} error={fieldError(errors, 'company')}>
                <Input id="sp-company" {...register('company')} />
              </Field>
              <Field id="sp-locale" label={t('locale')} error={fieldError(errors, 'locale')}>
                <select id="sp-locale" className={selectClass} {...register('locale')}>
                  <option value="de">{t('localeDe')}</option>
                  <option value="en">{t('localeEn')}</option>
                </select>
              </Field>
              <div />
              <Field id="sp-proposal" label={t('colProposal')} error={fieldError(errors, 'proposalStatus')}>
                <select id="sp-proposal" className={selectClass} {...register('proposalStatus')}>
                  {(['pending', 'confirmed', 'rejected'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`proposal.${s}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="sp-slides" label={t('colSlides')} error={fieldError(errors, 'slidesStatus')}>
                <select id="sp-slides" className={selectClass} {...register('slidesStatus')}>
                  {(['missing', 'uploaded', 'review'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`slides.${s}`)}
                    </option>
                  ))}
                </select>
              </Field>
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
