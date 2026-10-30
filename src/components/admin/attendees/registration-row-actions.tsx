'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, FileText, MoreHorizontal, Pencil, Undo2, UserCheck, Wallet } from 'lucide-react';
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
import { formatDateOnly } from '@/lib/dates';
import { centsToInput, formatEuro, parseEuroToCents, percentOf } from '@/lib/money';
import { cancellationAmounts } from '@/lib/refund-calc';
import { manualRefundSchema, type ManualRefundValues } from '@/lib/validation/refunds';
import { manualRefundAction, quoteCancellationAction } from '@/server/actions/refunds';
import type { CancellationQuote } from '@/server/services/refunds';
import { useRouter } from '@/i18n/navigation';
import { cancelSchema, paymentStatusSchema, type CancelValues, type PaymentStatusValues } from '@/lib/validation/registrations';
import { issueRegistrationInvoiceAction } from '@/server/actions/invoices';
import { cancelRegistrationAction, confirmWaitlistedAction, paymentStatusOptionsAction, setPaymentStatusAction } from '@/server/actions/registrations';
import type { PaymentStatusOptions } from '@/server/services/payment-status';
import type { RegistrationListRow } from '@/server/services/registrations';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError } from '../form-fields';
import { useIssueFeedback } from '../invoices/use-issue-feedback';
import { useActionFeedback } from '../use-action-feedback';

export type RowDialog = 'edit' | 'cancel' | 'confirm' | 'invoice' | 'refund' | 'payment';

/** Rechnung kann ausgestellt werden: bestätigt, kostenpflichtig, noch keine gültige Rechnung. */
export function canIssueInvoice(row: Pick<RegistrationListRow, 'status' | 'paymentMethod' | 'priceCents' | 'invoiceNumber'>): boolean {
  return row.status === 'confirmed' && row.paymentMethod !== 'free' && row.priceCents > 0 && !row.invoiceNumber;
}

/** Zahlungsstatus lässt sich von Hand ändern (offen, bezahlt, nicht nötig – nicht bei Erstattungen). */
export function canChangePayment(row: Pick<RegistrationListRow, 'paymentStatus' | 'priceCents' | 'invoiceNumber'>): boolean {
  if (!['open', 'paid', 'not_required'].includes(row.paymentStatus)) return false;
  return row.priceCents > 0 || row.invoiceNumber !== null;
}

/** „Erstatten“ anbieten: bei Erstattbarem, oder kostenpflichtig und noch offen (der Dialog führt dann zuerst zum Zahlungsstatus). */
export function canRefund(row: Pick<RegistrationListRow, 'refundableCents' | 'paymentStatus' | 'priceCents' | 'invoiceNumber'>): boolean {
  return row.refundableCents > 0 || (row.paymentStatus === 'open' && (row.priceCents > 0 || row.invoiceNumber !== null));
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
        {show('payment') && canChangePayment(row) && (
          <DropdownMenuItem onSelect={() => onAction('payment')}>
            <Wallet aria-hidden className="size-4" />
            {t('changePaymentStatus')}
          </DropdownMenuItem>
        )}
        {show('refund') && canRefund(row) && (
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

function todayVienna(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

/** Schnellwahl für Erstattungssätze (z. B. „laut Stornobedingungen“, „100 %“). */
function PercentChips({ options, current, onPick }: { options: { label: string; percent: number }[]; current: number | null; onPick: (percent: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button key={o.label} type="button" size="sm" variant={current === o.percent ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => onPick(o.percent)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** Rückfrage „Sind Sie sicher?“ als zweiter Schritt im selben Dialog. */
function SureStep({ title, lines, confirmLabel, pending, destructive, onBack, onConfirm }: {
  title: string;
  lines: string[];
  confirmLabel: string;
  pending: boolean;
  destructive?: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('attendees');
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t('sureTitle')}</DialogTitle>
        <DialogDescription>{title}</DialogDescription>
      </DialogHeader>
      <ul className="list-disc space-y-1 rounded-md border bg-muted/40 py-3 pr-3 pl-7 text-sm">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{t('sureHint')}</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          {t('back')}
        </Button>
        <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={pending} autoFocus>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function CancelDialog({ registrationId, name, open, onOpenChange }: DialogProps) {
  const t = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [sure, setSure] = useState<CancelValues | null>(null);
  const form = useForm<CancelValues>({ resolver: zodResolver(cancelSchema), defaultValues: { reason: '', percent: '0', notify: true, transferDone: false } });
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
  const byTransfer = quote?.paymentMethod !== 'stripe';
  const chips = [
    ...(quote?.rulePercent != null ? [{ label: t('percentRules', { percent: quote.rulePercent }), percent: quote.rulePercent }] : []),
    { label: t('percentFull'), percent: 100 },
    { label: t('percentNone'), percent: 0 },
  ];

  function submit(values: CancelValues) {
    startTransition(async () => {
      const result = await cancelRegistrationAction(registrationId, values);
      if (!handle(result, { setError: form.setError })) {
        setSure(null);
        return;
      }
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
    });
  }

  const sureLines = sure
    ? [
        t('sureCancel', { name }),
        amounts && amounts.refundCents > 0
          ? t('sureRefund', { amount: fmt(amounts.refundCents), percent: percent ?? 0 })
          : t('sureNoRefund'),
        ...(amounts && amounts.refundCents > 0 && byTransfer ? [sure.transferDone ? t('sureTransferBooked') : t('sureTransferOpen')] : []),
        ...(amounts && amounts.openCents > 0 ? [t('sureFeeOpen', { amount: fmt(amounts.openCents) })] : []),
        sure.notify ? t('sureMail') : t('sureNoMail'),
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : (setSure(null), onOpenChange(false)))}>
      <DialogContent>
        {sure ? (
          <SureStep
            title={t('cancelTitle', { name })}
            lines={sureLines}
            confirmLabel={amounts && amounts.refundCents > 0 ? t('sureCancelRefundConfirm') : t('sureCancelConfirm')}
            pending={pending}
            destructive
            onBack={() => setSure(null)}
            onConfirm={() => submit(sure)}
          />
        ) : (
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit((values) => setSure(values))} className="space-y-4" noValidate>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Input id="cancel-percent" inputMode="numeric" className="w-20" {...form.register('percent')} />
                      <PercentChips options={chips} current={percent} onPick={(p) => form.setValue('percent', String(p), { shouldValidate: true })} />
                    </div>
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
                    <p className="text-muted-foreground">{byTransfer ? t('cancelRefundTransfer') : t('cancelRefundOnline')}</p>
                  )}
                  {amounts && amounts.refundCents > 0 && byTransfer && (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5 size-4" {...form.register('transferDone')} />
                      <span>{t('transferDone')}</span>
                    </label>
                  )}
                </div>
              )}
              <Field id="cancel-reason" label={t('cancelReason')} error={fieldError(form.formState.errors, 'reason')}>
                <div className="space-y-1.5">
                  <Textarea id="cancel-reason" rows={2} {...form.register('reason')} />
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => form.setValue('reason', t('reasonDeregistered'), { shouldValidate: true })}>
                    {t('reasonDeregisteredPick')}
                  </Button>
                </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Erstattung ohne Storno (Teil-/Kulanzerstattung). Wird aus Teilnehmerliste, Detailpanel, Rechnungen und
 * „Erstattungen → Neue Erstattung“ gleich verwendet. Ohne Zahlungseingang führt der Dialog zuerst zum Zahlungsstatus.
 */
export function RefundDialog({ registrationId, name, refundableCents: initialRefundable = 0, open, onOpenChange }: DialogProps & { refundableCents?: number }) {
  const t = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [sure, setSure] = useState<ManualRefundValues | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const form = useForm<ManualRefundValues>({
    resolver: zodResolver(manualRefundSchema),
    defaultValues: { amount: centsToInput(initialRefundable), reason: '', transferDone: false },
  });
  // maßgeblich ist der aktuelle Stand vom Server (z. B. nach „Als bezahlt markieren“)
  const refundableCents = quote?.paidCents ?? initialRefundable;
  const amountText = useWatch({ control: form.control, name: 'amount' });
  const fmt = (c: number) => formatEuro(c, locale);

  useEffect(() => {
    if (!open) return;
    let active = true;
    quoteCancellationAction(registrationId).then((r) => {
      if (!active || !r.ok) return;
      setQuote(r.data);
      if (!form.getFieldState('amount').isDirty) form.setValue('amount', centsToInput(r.data.paidCents));
    });
    return () => {
      active = false;
    };
  }, [open, registrationId, reload, form]);

  const amountCents = parseEuroToCents(amountText ?? '');
  const percentOfRefundable = (p: number) => percentOf(refundableCents, p);
  const currentPercent = [25, 50, 100, quote?.rulePercent ?? -1].find((p) => p >= 0 && amountCents === percentOfRefundable(p)) ?? null;
  const chips = [
    ...(quote?.rulePercent != null ? [{ label: t('percentRules', { percent: quote.rulePercent }), percent: quote.rulePercent }] : []),
    { label: '25 %', percent: 25 },
    { label: '50 %', percent: 50 },
    { label: t('percentFull'), percent: 100 },
  ];
  const byTransfer = quote?.paymentMethod !== 'stripe';

  function submit(values: ManualRefundValues) {
    startTransition(async () => {
      const result = await manualRefundAction(registrationId, values);
      if (!handle(result, { setError: form.setError })) {
        setSure(null);
        return;
      }
      handle(result, {
        success: result.data.status === 'executed' ? t('refundDone') : result.data.status === 'approved' ? t('refundApprovedTransfer') : t('refundFailedHint'),
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
    <Dialog open={open && !payOpen} onOpenChange={(o) => (o ? onOpenChange(o) : (setSure(null), onOpenChange(false)))}>
      <DialogContent>
        {quote && refundableCents === 0 ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('refundTitle', { name })}</DialogTitle>
              <DialogDescription>{t('refundNothingPaid')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('back')}
              </Button>
              <Button type="button" onClick={() => setPayOpen(true)}>
                {t('changePaymentStatus')}
              </Button>
            </DialogFooter>
          </div>
        ) : sure ? (
          <SureStep
            title={t('refundTitle', { name })}
            lines={[
              t('sureRefundOnly', { amount: fmt(parseEuroToCents(sure.amount) ?? 0) }),
              ...(byTransfer ? [sure.transferDone ? t('sureTransferBooked') : t('sureTransferOpen')] : [t('sureOnline')]),
              t('sureCreditNote'),
            ]}
            confirmLabel={t('sureRefundConfirm')}
            pending={pending}
            onBack={() => setSure(null)}
            onConfirm={() => submit(sure)}
          />
        ) : (
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit((values) => setSure(values))} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>{t('refundTitle', { name })}</DialogTitle>
                <DialogDescription>{t('refundHint', { amount: fmt(refundableCents) })}</DialogDescription>
              </DialogHeader>
              <Field id="refund-amount" label={t('refundAmount')} hint={quote?.rulePercent != null ? t('cancelRule', { days: quote.daysBefore, percent: quote.rulePercent }) : undefined} error={fieldError(form.formState.errors, 'amount')}>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id="refund-amount" inputMode="decimal" className="w-32" {...form.register('amount')} />
                  <PercentChips options={chips} current={currentPercent} onPick={(p) => form.setValue('amount', centsToInput(percentOfRefundable(p)), { shouldValidate: true })} />
                </div>
              </Field>
              <Field id="refund-reason" label={t('refundReason')} hint={t('refundReasonHint')} error={fieldError(form.formState.errors, 'reason')}>
                <Textarea id="refund-reason" rows={3} {...form.register('reason')} />
              </Field>
              {quote && byTransfer && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4" {...form.register('transferDone')} />
                  <span>{t('transferDone')}</span>
                </label>
              )}
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
        )}
      </DialogContent>
    </Dialog>
    {payOpen && (
      <PaymentStatusDialog
        registrationId={registrationId}
        name={name}
        open
        onOpenChange={(o) => !o && setPayOpen(false)}
        onSaved={() => {
          setPayOpen(false);
          setReload((n) => n + 1);
        }}
      />
    )}
    </>
  );
}

export function PaymentStatusDialog({ registrationId, name, open, onOpenChange, onSaved }: DialogProps & { onSaved?: () => void }) {
  const t = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState<PaymentStatusOptions | null>(null);
  const [sure, setSure] = useState<PaymentStatusValues | null>(null);
  const form = useForm<PaymentStatusValues>({ resolver: zodResolver(paymentStatusSchema), defaultValues: { status: 'paid', note: '', paidOn: todayVienna() } });
  const status = useWatch({ control: form.control, name: 'status' });

  useEffect(() => {
    if (!open) return;
    let active = true;
    paymentStatusOptionsAction(registrationId).then((r) => {
      if (!active || !r.ok) return;
      setOptions(r.data);
      if (r.data.targets[0]) form.setValue('status', r.data.targets[0]);
    });
    return () => {
      active = false;
    };
  }, [open, registrationId, form]);

  function submit(values: PaymentStatusValues) {
    startTransition(async () => {
      const result = await setPaymentStatusAction(registrationId, values);
      if (!handle(result, { setError: form.setError, success: t('paymentStatusSaved') })) {
        setSure(null);
        return;
      }
      router.refresh();
      if (onSaved) onSaved();
      else onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : (setSure(null), onOpenChange(false)))}>
      <DialogContent>
        {sure && options ? (
          <SureStep
            title={t('paymentStatusTitle', { name })}
            lines={[
              t('surePaymentStatus', { from: t(`payment.${options.current}`), to: t(`payment.${sure.status}`) }),
              ...(sure.status === 'paid' && options.openCents > 0 ? [t('surePaymentBooked', { amount: formatEuro(options.openCents, locale), date: formatDateOnly(sure.paidOn, locale) })] : []),
              ...(sure.status === 'open' && options.current === 'paid' ? [t('surePaymentReverted')] : []),
              t('sureLogged', { note: sure.note }),
            ]}
            confirmLabel={t('surePaymentConfirm')}
            pending={pending}
            onBack={() => setSure(null)}
            onConfirm={() => submit(sure)}
          />
        ) : (
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit((values) => setSure(values))} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>{t('paymentStatusTitle', { name })}</DialogTitle>
                <DialogDescription>{t('paymentStatusHint')}</DialogDescription>
              </DialogHeader>
              {!options ? (
                <p className="text-sm text-muted-foreground">{t('cancelLoading')}</p>
              ) : options.targets.length === 0 ? (
                <p className="rounded-md border bg-muted/40 p-3 text-sm">{t('paymentStatusNone', { status: t(`payment.${options.current}`) })}</p>
              ) : (
                <>
                  <p className="text-sm">
                    {t('paymentStatusCurrent')} <strong>{t(`payment.${options.current}`)}</strong>
                    {options.openCents > 0 && options.current !== 'paid' && <> · {t('paymentStatusOpenAmount', { amount: formatEuro(options.openCents, locale) })}</>}
                  </p>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t('paymentStatusNew')}</legend>
                    {options.targets.map((s) => (
                      <label key={s} className="flex items-start gap-2 text-sm">
                        <input type="radio" value={s} className="mt-0.5 size-4" {...form.register('status')} />
                        <span>
                          {t(`payment.${s}`)}
                          <span className="block text-xs text-muted-foreground">{t(`paymentStatusExplain.${s}`)}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  {status === 'paid' && (
                    <Field id="pay-status-date" label={t('paymentStatusDate')} error={fieldError(form.formState.errors, 'paidOn')}>
                      <Input id="pay-status-date" type="date" className="w-44" max={todayVienna()} {...form.register('paidOn')} />
                    </Field>
                  )}
                  <Field id="pay-status-note" label={t('paymentStatusNote')} hint={t('paymentStatusNoteHint')} error={fieldError(form.formState.errors, 'note')}>
                    <Textarea id="pay-status-note" rows={2} {...form.register('note')} />
                  </Field>
                </>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  {t('back')}
                </Button>
                <Button type="submit" disabled={pending || !options || options.targets.length === 0}>
                  {t('paymentStatusSave')}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        )}
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
