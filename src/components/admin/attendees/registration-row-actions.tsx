'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, FileText, MoreHorizontal, Pencil, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { cancelSchema, type CancelValues } from '@/lib/validation/registrations';
import { issueRegistrationInvoiceAction } from '@/server/actions/invoices';
import { cancelRegistrationAction, confirmWaitlistedAction } from '@/server/actions/registrations';
import type { RegistrationListRow } from '@/server/services/registrations';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError } from '../form-fields';
import { useIssueFeedback } from '../invoices/use-issue-feedback';
import { useActionFeedback } from '../use-action-feedback';

export type RowDialog = 'edit' | 'cancel' | 'confirm' | 'invoice';

/** Aktionsmenü einer Zeile – öffnet die gemeinsamen Dialoge der Tabelle. */
export function RegistrationRowMenu({ row, onAction }: { row: RegistrationListRow; onAction: (dialog: RowDialog) => void }) {
  const t = useTranslations('attendees');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: `${row.firstName} ${row.lastName}` })}>
          <MoreHorizontal aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAction('edit')}>
          <Pencil aria-hidden className="size-4" />
          {t('edit')}
        </DropdownMenuItem>
        {row.status === 'waitlisted' && (
          <DropdownMenuItem onSelect={() => onAction('confirm')}>
            <UserCheck aria-hidden className="size-4" />
            {t('confirmWaitlisted')}
          </DropdownMenuItem>
        )}
        {row.status === 'confirmed' && row.paymentMethod !== 'free' && row.priceCents > 0 && !row.invoiceNumber && (
          <DropdownMenuItem onSelect={() => onAction('invoice')}>
            <FileText aria-hidden className="size-4" />
            {t('issueInvoice')}
          </DropdownMenuItem>
        )}
        {row.status !== 'cancelled' && (
          <DropdownMenuItem onSelect={() => onAction('cancel')} className="text-destructive">
            <Ban aria-hidden className="size-4" />
            {t('cancelRegistration')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type DialogProps = { registrationId: number; name: string; open: boolean; onOpenChange: (o: boolean) => void };

export function CancelDialog({ registrationId, name, open, onOpenChange }: DialogProps) {
  const t = useTranslations('attendees');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<CancelValues>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '' } });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await cancelRegistrationAction(registrationId, values), { setError: form.setError, success: t('cancelled') })) {
        onOpenChange(false);
        router.refresh();
      }
    })
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('cancelTitle', { name })}</DialogTitle>
              <DialogDescription>{t('cancelHint')}</DialogDescription>
            </DialogHeader>
            <Field id="cancel-reason" label={t('cancelReason')} error={fieldError(form.formState.errors, 'reason')}>
              <Textarea id="cancel-reason" rows={3} {...form.register('reason')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('back')}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {t('cancelConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function IssueInvoiceDialog({ registrationId, name, amount, open, onOpenChange }: DialogProps & { amount: string }) {
  const t = useTranslations('attendees');
  const router = useRouter();
  const report = useIssueFeedback();
  const [, startTransition] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('issueInvoiceTitle', { name, amount })}
      description={t('issueInvoiceHint')}
      confirmLabel={t('issueInvoiceConfirm')}
      onConfirm={() =>
        startTransition(async () => {
          if (report(await issueRegistrationInvoiceAction(registrationId))) router.refresh();
        })
      }
    />
  );
}

export function ConfirmWaitlistedDialog({ registrationId, name, seatsFree, open, onOpenChange }: DialogProps & { seatsFree: number }) {
  const t = useTranslations('attendees');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [overbook, setOverbook] = useState(false);
  const full = seatsFree <= 0;

  function confirm() {
    startTransition(async () => {
      if (handle(await confirmWaitlistedAction(registrationId, full && overbook), { success: t('confirmed') })) {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmTitle', { name })}</DialogTitle>
          <DialogDescription>
            {full ? t('confirmFull') : t('confirmHint', { count: seatsFree })} {t('confirmMailHint')}
          </DialogDescription>
        </DialogHeader>
        {full && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={overbook} onChange={(e) => setOverbook(e.target.checked)} />
            {t('overbook')}
          </label>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('back')}
          </Button>
          <Button type="button" onClick={confirm} disabled={pending || (full && !overbook)}>
            {t('confirmAction')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
