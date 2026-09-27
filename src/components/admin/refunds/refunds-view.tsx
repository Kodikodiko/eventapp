'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Landmark, MoreHorizontal, RotateCcw, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { centsToInput, formatEuro } from '@/lib/money';
import {
  approveRefundSchema,
  refundTransferSchema,
  rejectRefundSchema,
  type ApproveRefundValues,
  type RefundTransferValues,
  type RejectRefundValues,
} from '@/lib/validation/refunds';
import { approveRefundAction, recordRefundTransferAction, rejectRefundAction, retryRefundAction } from '@/server/actions/refunds';
import type { RefundListRow } from '@/server/services/refunds';
import { Field, fieldError } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

const statusVariant: Record<RefundListRow['status'], BadgeProps['variant']> = {
  proposed: 'billed',
  approved: 'outline',
  executed: 'paid',
  rejected: 'secondary',
  failed: 'overdue',
};

type DialogState = { kind: 'approve' | 'reject' | 'transfer'; row: RefundListRow } | null;

function todayVienna(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

export function RefundsView({ rows, refundMode }: { rows: RefundListRow[]; refundMode: 'automatic' | 'approval' }) {
  const t = useTranslations('refunds');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fmt = (c: number) => formatEuro(c, locale);
  const open = rows.filter((r) => r.status === 'proposed' || r.status === 'approved' || r.status === 'failed');

  function retry(row: RefundListRow) {
    startTransition(async () => {
      const r = await retryRefundAction(row.id);
      if (handle(r)) handle(r, { success: r.data.status === 'executed' ? t('executed') : t('failedAgain') });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{refundMode === 'automatic' ? t('modeAutomatic') : t('modeApproval')}</p>
      <p className="text-sm" aria-live="polite">
        {t('summary', { open: open.length, total: rows.length })}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">{t('colPerson')}</th>
              <th className="p-2 text-right font-medium">{t('colAmount')}</th>
              <th className="p-2 font-medium">{t('colMethod')}</th>
              <th className="p-2 font-medium">{t('colStatus')}</th>
              <th className="p-2 font-medium">{t('colReason')}</th>
              <th className="p-2 font-medium">{t('colDate')}</th>
              <th className="p-2">
                <span className="sr-only">{t('colActions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const actionable = r.status === 'proposed' || r.status === 'failed' || (r.status === 'approved' && r.method === 'bank_transfer');
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2">
                    {r.firstName} {r.lastName}
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(r.amountCents)}
                    {r.rulePercent != null && <div className="text-xs text-muted-foreground">{t('percentOf', { percent: r.rulePercent })}</div>}
                  </td>
                  <td className="p-2">{t(`method.${r.method}`)}</td>
                  <td className="p-2">
                    <Badge variant={statusVariant[r.status]}>{t(`status.${r.status}`)}</Badge>
                    {r.status === 'approved' && r.method === 'bank_transfer' && <div className="mt-1 text-xs text-muted-foreground">{t('awaitingTransfer')}</div>}
                    {r.creditNoteNumber && <div className="mt-1 text-xs text-muted-foreground">{t('creditNote', { number: r.creditNoteNumber })}</div>}
                    {r.failureMessage && (r.status === 'failed' || r.status === 'rejected') && <div className="mt-1 max-w-56 text-xs text-muted-foreground">{r.failureMessage}</div>}
                  </td>
                  <td className="p-2 max-w-64">{r.reason}</td>
                  <td className="p-2 whitespace-nowrap">{format.dateTime(new Date(r.executedAt ?? r.decidedAt ?? r.proposedAt), { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-2 text-right">
                    {actionable && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: `${r.firstName} ${r.lastName}` })}>
                            <MoreHorizontal aria-hidden className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {r.status === 'proposed' && (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'approve', row: r })}>
                              <Check aria-hidden className="size-4" />
                              {t('approve')}
                            </DropdownMenuItem>
                          )}
                          {r.status === 'failed' && (
                            <DropdownMenuItem onSelect={() => retry(r)}>
                              <RotateCcw aria-hidden className="size-4" />
                              {t('retry')}
                            </DropdownMenuItem>
                          )}
                          {r.status === 'approved' && r.method === 'bank_transfer' && (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'transfer', row: r })}>
                              <Landmark aria-hidden className="size-4" />
                              {t('recordTransfer')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'reject', row: r })} className="text-destructive">
                            <X aria-hidden className="size-4" />
                            {t('reject')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog?.kind === 'approve' && <ApproveDialog key={`a-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reject' && <RejectDialog key={`r-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferDialog key={`t-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}

function useRefundForm() {
  return { t: useTranslations('refunds'), locale: useLocale() as Locale, router: useRouter(), handle: useActionFeedback(), transition: useTransition() } as const;
}

function ApproveDialog({ row, onClose }: { row: RefundListRow; onClose: () => void }) {
  const { t, locale, router, handle, transition } = useRefundForm();
  const [pending, startTransition] = transition;
  const form = useForm<ApproveRefundValues>({ resolver: zodResolver(approveRefundSchema), defaultValues: { amount: centsToInput(row.amountCents) } });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const r = await approveRefundAction(row.id, values);
      if (!handle(r, { setError: form.setError })) return;
      handle(r, { success: r.data.status === 'executed' ? t('executed') : r.data.status === 'approved' ? t('approvedTransfer') : t('failedAgain') });
      onClose();
      router.refresh();
    })
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('approveTitle', { name: `${row.firstName} ${row.lastName}` })}</DialogTitle>
              <DialogDescription>
                {t('approveHint', { amount: formatEuro(row.amountCents, locale), paid: formatEuro(row.paymentCents, locale) })}{' '}
                {row.method === 'stripe' ? t('approveOnline') : t('approveTransfer')}
              </DialogDescription>
            </DialogHeader>
            <Field id="approve-amount" label={t('amount')} error={fieldError(form.formState.errors, 'amount')}>
              <Input id="approve-amount" inputMode="decimal" className="w-40" {...form.register('amount')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('approve')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ row, onClose }: { row: RefundListRow; onClose: () => void }) {
  const { t, locale, router, handle, transition } = useRefundForm();
  const [pending, startTransition] = transition;
  const form = useForm<RejectRefundValues>({ resolver: zodResolver(rejectRefundSchema), defaultValues: { note: '' } });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await rejectRefundAction(row.id, values), { setError: form.setError, success: t('rejected') })) {
        onClose();
        router.refresh();
      }
    })
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('rejectTitle', { amount: formatEuro(row.amountCents, locale), name: `${row.firstName} ${row.lastName}` })}</DialogTitle>
              <DialogDescription>{t('rejectHint')}</DialogDescription>
            </DialogHeader>
            <Field id="reject-note" label={t('rejectNote')} error={fieldError(form.formState.errors, 'note')}>
              <Textarea id="reject-note" rows={3} {...form.register('note')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('back')}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {t('reject')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ row, onClose }: { row: RefundListRow; onClose: () => void }) {
  const { t, locale, router, handle, transition } = useRefundForm();
  const [pending, startTransition] = transition;
  const form = useForm<RefundTransferValues>({ resolver: zodResolver(refundTransferSchema), defaultValues: { transferredOn: todayVienna() } });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await recordRefundTransferAction(row.id, values), { setError: form.setError, success: t('executed') })) {
        onClose();
        router.refresh();
      }
    })
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('transferTitle', { amount: formatEuro(row.amountCents, locale), name: `${row.firstName} ${row.lastName}` })}</DialogTitle>
              <DialogDescription>{t('transferHint')}</DialogDescription>
            </DialogHeader>
            <Field id="transfer-date" label={t('transferDate')} error={fieldError(form.formState.errors, 'transferredOn')}>
              <Input id="transfer-date" type="date" max={todayVienna()} className="w-44" {...form.register('transferredOn')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('recordTransfer')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
