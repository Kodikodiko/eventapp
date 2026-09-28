'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, Download, Eye, Landmark, MoreHorizontal, Send } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateOnly } from '@/lib/dates';
import { centsToInput, formatEuro } from '@/lib/money';
import { cancelInvoiceSchema, recordPaymentSchema, type CancelInvoiceValues, type RecordPaymentValues } from '@/lib/validation/invoices';
import { cancelInvoiceAction, recordPaymentAction, sendInvoiceAction } from '@/server/actions/invoices';
import type { InvoiceListRow, InvoiceState } from '@/server/services/invoices';
import { Field, fieldError } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';
import { useIssueFeedback } from './use-issue-feedback';

const stateVariant: Record<InvoiceState, BadgeProps['variant']> = {
  open: 'billed',
  overdue: 'overdue',
  paid: 'paid',
  cancelled: 'secondary',
  credit_note: 'outline',
};

export type InvoiceStateFilter = 'all' | 'open' | 'overdue';
type Props = { rows: InvoiceListRow[]; organizerIncomplete: boolean; mailToFile: boolean; initialQuery?: string; initialState?: InvoiceStateFilter };
type DialogState = { kind: 'payment' | 'cancel'; row: InvoiceListRow } | null;

/** Heutiges Datum in Wien als YYYY-MM-DD (Vorbelegung für den Zahlungseingang). */
function todayVienna(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

export function InvoicesView({ rows: allRows, organizerIncomplete, mailToFile, initialQuery = '', initialState = 'all' }: Props) {
  const t = useTranslations('invoices');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fmt = (c: number) => formatEuro(c, locale);
  const [query, setQuery] = useState(initialQuery);
  const [stateFilter, setStateFilter] = useState<InvoiceStateFilter>(initialState);
  const needle = query.trim().toLowerCase();
  const rows = allRows.filter(
    (r) =>
      (stateFilter === 'all' || (stateFilter === 'overdue' ? r.state === 'overdue' : r.state === 'open' || r.state === 'overdue')) &&
      (!needle || `${r.number} ${r.recipientName} ${r.recipientCompany ?? ''}`.toLowerCase().includes(needle))
  );

  const open = allRows.filter((r) => r.state === 'open' || r.state === 'overdue');
  const overdue = allRows.filter((r) => r.state === 'overdue');
  const sum = (list: InvoiceListRow[]) => list.reduce((s, r) => s + r.openCents, 0);

  function send(row: InvoiceListRow) {
    startTransition(async () => {
      if (handle(await sendInvoiceAction(row.id), { success: t('sent', { number: row.number }) })) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {organizerIncomplete && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('organizerIncomplete')}{' '}
            <Link href="/admin/settings" className="underline">
              {t('toSettings')}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {mailToFile && <p className="text-sm text-muted-foreground">{t('mailToFileHint')}</p>}

      <p className="text-sm" aria-live="polite">
        {t('summary', { count: allRows.filter((r) => r.type === 'invoice').length, openCount: open.length, open: fmt(sum(open)), overdue: fmt(sum(overdue)) })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="h-9 w-64 bg-card"
        />
        <div role="group" aria-label={t('stateFilter')} className="flex rounded-lg border bg-card p-0.5">
          {(['all', 'open', 'overdue'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={stateFilter === s}
              onClick={() => setStateFilter(s)}
              className={`rounded-md px-3 py-1.5 text-sm ${stateFilter === s ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t(`stateFilterOption.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">{t('colNumber')}</th>
              <th className="p-2 font-medium">{t('colDate')}</th>
              <th className="p-2 font-medium">{t('colRecipient')}</th>
              <th className="p-2 text-right font-medium">{t('colAmount')}</th>
              <th className="p-2 font-medium">{t('colDue')}</th>
              <th className="p-2 font-medium">{t('colState')}</th>
              <th className="p-2 font-medium">{t('colSent')}</th>
              <th className="p-2">
                <span className="sr-only">{t('colActions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const payable = r.state === 'open' || r.state === 'overdue';
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2 font-medium tabular-nums whitespace-nowrap">
                    {r.number}
                    <div className="text-xs font-normal text-muted-foreground">
                      {r.type === 'credit_note' ? t('creditFor', { number: r.relatedNumber ?? '–' }) : t(`kind.${r.kind}`)}
                    </div>
                  </td>
                  <td className="p-2 whitespace-nowrap">{format.dateTime(new Date(r.issuedAt), { dateStyle: 'medium' })}</td>
                  <td className="p-2">
                    {r.recipientCompany ?? r.recipientName}
                    {r.recipientCompany && r.recipientName && <div className="text-xs text-muted-foreground">{r.recipientName}</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">
                    {r.type === 'credit_note' ? `−${fmt(r.grossCents)}` : fmt(r.grossCents)}
                    {payable && r.paidCents > 0 && <div className="text-xs text-muted-foreground">{t('openAmount', { amount: fmt(r.openCents) })}</div>}
                  </td>
                  <td className="p-2 whitespace-nowrap">{r.dueAt ? formatDateOnly(r.dueAt, locale) : '–'}</td>
                  <td className="p-2">
                    <Badge variant={stateVariant[r.state]}>{t(`state.${r.state}`)}</Badge>
                    {r.reminderLevel > 0 && payable && <div className="mt-1 text-xs text-muted-foreground">{t('reminders', { count: r.reminderLevel })}</div>}
                  </td>
                  <td className="p-2 whitespace-nowrap">{r.sentAt ? format.dateTime(new Date(r.sentAt), { dateStyle: 'short', timeStyle: 'short' }) : '–'}</td>
                  <td className="p-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={t('actionsFor', { number: r.number })}>
                          <MoreHorizontal aria-hidden className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/api/export/invoices/${r.id}`} target="_blank" rel="noopener">
                            <Eye aria-hidden className="size-4" />
                            {t('view')}
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/api/export/invoices/${r.id}?download=1`} download>
                            <Download aria-hidden className="size-4" />
                            {t('download')}
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => send(r)}>
                          <Send aria-hidden className="size-4" />
                          {r.sentAt ? t('resend') : t('send')}
                        </DropdownMenuItem>
                        {payable && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'payment', row: r })}>
                              <Landmark aria-hidden className="size-4" />
                              {t('recordPayment')}
                            </DropdownMenuItem>
                            {r.paidCents === 0 && r.creditedCents === 0 && (
                              <DropdownMenuItem onSelect={() => setDialog({ kind: 'cancel', row: r })} className="text-destructive">
                                <Ban aria-hidden className="size-4" />
                                {t('cancelInvoice')}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  {allRows.length === 0 ? t('empty') : t('noMatches')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'payment' && <PaymentDialog key={`p-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cancel' && <CancelInvoiceDialog key={`c-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
    </div>
  );
}

export function PaymentDialog({ row, onClose }: { row: InvoiceListRow; onClose: () => void }) {
  const t = useTranslations('invoices');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<RecordPaymentValues>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { amount: centsToInput(row.openCents), paidOn: todayVienna() },
  });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await recordPaymentAction(row.id, values);
      if (handle(result, { setError: form.setError })) {
        handle(result, {
          success: result.data.fullyPaid ? t('paymentRecordedPaid') : t('paymentRecordedPartial', { open: formatEuro(result.data.openCents, locale) }),
        });
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
              <DialogTitle>{t('paymentTitle', { number: row.number })}</DialogTitle>
              <DialogDescription>{t('paymentHint', { open: formatEuro(row.openCents, locale) })}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pay-amount" label={t('paymentAmount')} error={fieldError(form.formState.errors, 'amount')}>
                <Input id="pay-amount" inputMode="decimal" {...form.register('amount')} />
              </Field>
              <Field id="pay-date" label={t('paymentDate')} error={fieldError(form.formState.errors, 'paidOn')}>
                <Input id="pay-date" type="date" max={todayVienna()} {...form.register('paidOn')} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={pending}>
                {t('paymentSave')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function CancelInvoiceDialog({ row, onClose }: { row: InvoiceListRow; onClose: () => void }) {
  const t = useTranslations('invoices');
  const router = useRouter();
  const handle = useActionFeedback();
  const report = useIssueFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<CancelInvoiceValues>({ resolver: zodResolver(cancelInvoiceSchema), defaultValues: { reason: '' } });
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await cancelInvoiceAction(row.id, values);
      if (!result.ok) {
        handle(result, { setError: form.setError });
        return;
      }
      report(result, 'credit_note');
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
              <DialogTitle>{t('cancelTitle', { number: row.number })}</DialogTitle>
              <DialogDescription>{t('cancelHint')}</DialogDescription>
            </DialogHeader>
            <Field id="inv-cancel-reason" label={t('cancelReason')} hint={t('cancelReasonHint')} error={fieldError(form.formState.errors, 'reason')}>
              <Textarea id="inv-cancel-reason" rows={3} {...form.register('reason')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
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
