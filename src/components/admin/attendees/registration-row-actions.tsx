'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, FileText, MoreHorizontal, Pencil, Undo2, UserCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { Locale } from '@/i18n/routing';
import { centsToInput, formatEuro } from '@/lib/money';
import { cancellationAmounts } from '@/lib/refund-calc';
import { manualRefundSchema, type ManualRefundValues } from '@/lib/validation/refunds';
import { manualRefundAction, quoteCancellationAction } from '@/server/actions/refunds';
import type { CancellationQuote } from '@/server/services/refunds';
import { useRouter } from '@/i18n/navigation';
import { cancelSchema, type CancelValues } from '@/lib/validation/registrations';
import { issueRegistrationInvoiceAction } from '@/server/actions/invoices';
import { cancelRegistrationAction, confirmWaitlistedAction } from '@/server/actions/registrations';
import type { RegistrationListRow } from '@/server/services/registrations';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError } from '../form-fields';
import { useIssueFeedback } from '../invoices/use-issue-feedback';
import { useActionFeedback } from '../use-action-feedback';

export type RowDialog = 'edit' | 'cancel' | 'confirm' | 'invoice' | 'refund';

/** Rechnung kann ausgestellt werden: bestätigt, kostenpflichtig, noch keine gültige Rechnung. */
export function canIssueInvoice(row: Pick<RegistrationListRow, 'status' | 'paymentMethod' | 'priceCents' | 'invoiceNumber'>): boolean {
  return row.status === 'confirmed' && row.paymentMethod !== 'free' && row.priceCents > 0 && !row.invoiceNumber;
}

/** Aktionsmenü einer Zeile – öffnet die gemeinsamen Dialoge der Tabelle. */
export function RegistrationRowMenu({
  row,
  onAction,
  trigger,
  exclude = [],
}: {
  row: RegistrationListRow;
  onAction: (dialog: RowDialog) => void;
  /** eigener Auslöser (z. B. „Weitere Aktionen“ im Detailpanel) */
  trigger?: React.ReactNode;
  /** Aktionen, die anderswo schon als Knopf sichtbar sind */
  exclude?: RowDialog[];
}) {
  const t = useTranslations('attendees');
  const show = (d: RowDialog) => !exclude.includes(d);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: `${row.firstName} ${row.lastName}` })}>
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {show('edit') && (
        <DropdownMenuItem onSelect={() => onAction('edit')}>
          <Pencil aria-hidden className="size-4" />
          {t('edit')}
        </DropdownMenuItem>
        )}
        {show('confirm') && row.status === 'waitlisted' && (
          <DropdownMenuItem onSelect={() => onAction('confirm')}>
            <UserCheck aria-hidden className="size-4" />
            {t('confirmWaitlisted')}
          </DropdownMenuItem>
        )}
        {show('invoice') && canIssueInvoice(row) && (
          <DropdownMenuItem onSelect={() => onAction('invoice')}>
            <FileText aria-hidden className="size-4" />
            {t('issueInvoice')}
          </DropdownMenuItem>
        )}
        {show('refund') && row.refundableCents > 0 && (
          <DropdownMenuItem onSelect={() => onAction('refund')}>
            <Undo2 aria-hidden className="size-4" />
            {t('refund')}
          </DropdownMenuItem>
        )}
        {show('cancel') && row.status !== 'cancelled' && (
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
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const form = useForm<CancelValues>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '', percent: '0', notify: true } });
  const percentText = useWatch({ control: form.control, name: 'percent' });
  const fmt = (c: number) => formatEuro(c, locale);

  useEffect(() => {
    if (!open) return;
    let active = true;
    quoteCancellationAction(registrationId).then((r) => {
      if (!active || !r.ok) return;
      setQuote(r.data);
      form.setValue('percent', String(r.data.rulePercent ?? 0));
    });
    return () => {
      active = false;
    };
  }, [open, registrationId, form]);

  const percent = /^(100|\d{1,2})$/.test(percentText ?? '') ? Number(percentText) : null;
  const amounts = quote && percent != null ? cancellationAmounts({ invoiceCents: quote.invoiceCents, paidCents: quote.paidCents, percent }) : null;
  const hasMoney = quote != null && (quote.invoiceCents > 0 || quote.paidCents > 0);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await cancelRegistrationAction(registrationId, values);
      if (!handle(result, { setError: form.setError })) return;
      const { refundCents, refundStatus, failedRefunds, awaitingTransfer } = result.data;
      toast({
        title: t('cancelled'),
        description:
          refundCents > 0
            ? failedRefunds > 0
              ? t('refundFailedHint')
              : refundStatus === 'proposed'
                ? t('refundProposedHint', { amount: fmt(refundCents) })
                : awaitingTransfer
                  ? t('refundApprovedTransfer')
                  : t('refundStartedHint', { amount: fmt(refundCents) })
            : undefined,
        variant: failedRefunds > 0 ? 'destructive' : undefined,
      });
      onOpenChange(false);
      router.refresh();
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
            {!quote && <p className="text-sm text-muted-foreground">{t('cancelLoading')}</p>}
            {quote && hasMoney && (
              <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
                <p>
                  {quote.rulePercent == null
                    ? t('cancelNoRules')
                    : t('cancelRule', { days: quote.daysBefore, percent: quote.rulePercent })}
                </p>
                <Field id="cancel-percent" label={t('cancelPercent')} hint={t('cancelPercentHint')} error={fieldError(form.formState.errors, 'percent')}>
                  <Input id="cancel-percent" inputMode="numeric" className="w-24" {...form.register('percent')} />
                </Field>
                {amounts && (
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">{quote.invoiceNumber ? t('cancelInvoice', { number: quote.invoiceNumber }) : t('cancelPaid')}</dt>
                    <dd className="text-right tabular-nums">{fmt(quote.invoiceCents)}</dd>
                    <dt className="text-muted-foreground">{t('cancelPaidAmount')}</dt>
                    <dd className="text-right tabular-nums">{fmt(quote.paidCents)}</dd>
                    <dt>{t('cancelCredit')}</dt>
                    <dd className="text-right tabular-nums">{fmt(amounts.creditCents)}</dd>
                    <dt className="font-medium">{t('cancelRefund')}</dt>
                    <dd className="text-right font-medium tabular-nums">{fmt(amounts.refundCents)}</dd>
                    {amounts.openCents > 0 && (
                      <>
                        <dt>{t('cancelFeeOpen')}</dt>
                        <dd className="text-right tabular-nums">{fmt(amounts.openCents)}</dd>
                      </>
                    )}
                  </dl>
                )}
                {amounts && amounts.refundCents > 0 && (
                  <p className="text-muted-foreground">{quote.paymentMethod === 'stripe' ? t('cancelRefundOnline') : t('cancelRefundTransfer')}</p>
                )}
              </div>
            )}
            <Field id="cancel-reason" label={t('cancelReason')} error={fieldError(form.formState.errors, 'reason')}>
              <Textarea id="cancel-reason" rows={3} {...form.register('reason')} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('notify')} />
              {t('cancelNotify')}
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('back')}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || !quote}>
                {t('cancelConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function RefundDialog({ registrationId, name, refundableCents, open, onOpenChange }: DialogProps & { refundableCents: number }) {
  const t = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<ManualRefundValues>({ resolver: zodResolver(manualRefundSchema), defaultValues: { amount: centsToInput(refundableCents), reason: '' } });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await manualRefundAction(registrationId, values);
      if (!handle(result, { setError: form.setError })) return;
      handle(result, {
        success: result.data.status === 'executed' ? t('refundDone') : result.data.status === 'approved' ? t('refundApprovedTransfer') : t('refundFailedHint'),
      });
      onOpenChange(false);
      router.refresh();
    })
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('refundTitle', { name })}</DialogTitle>
              <DialogDescription>{t('refundHint', { amount: formatEuro(refundableCents, locale) })}</DialogDescription>
            </DialogHeader>
            <Field id="refund-amount" label={t('refundAmount')} error={fieldError(form.formState.errors, 'amount')}>
              <Input id="refund-amount" inputMode="decimal" className="w-40" {...form.register('amount')} />
            </Field>
            <Field id="refund-reason" label={t('refundReason')} hint={t('refundReasonHint')} error={fieldError(form.formState.errors, 'reason')}>
              <Textarea id="refund-reason" rows={3} {...form.register('reason')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('refundConfirm')}
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
