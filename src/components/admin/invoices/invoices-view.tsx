'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Ban, CornerDownRight, Download, Eye, Landmark, MoreHorizontal, Search, Send, Undo2, Wallet, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateOnly } from '@/lib/dates';
import { centsToInput, formatEuro } from '@/lib/money';
import { cancelInvoiceSchema, recordPaymentSchema, type CancelInvoiceValues, type RecordPaymentValues } from '@/lib/validation/invoices';
import { cn } from '@/lib/utils';
import { cancelInvoiceAction, recordPaymentAction, sendInvoiceAction, sendRemindersNowAction } from '@/server/actions/invoices';
import type { InvoiceListRow, InvoiceState } from '@/server/services/invoices';
import { Field, fieldError } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';
import { PaymentStatusDialog, RefundDialog } from '../attendees/registration-row-actions';
import { useIssueFeedback } from './use-issue-feedback';

const stateVariant: Record<InvoiceState, BadgeProps['variant']> = {
  open: 'billed',
  overdue: 'overdue',
  paid: 'paid',
  cancelled: 'secondary',
  credit_note: 'outline',
};

/** Filter der alten Liste (Adresse ?state=…); die neue Liste bildet sie auf ihre Kacheln ab. */
export type InvoiceStateFilter = 'all' | 'open' | 'overdue' | 'paid';
/** Kacheln der neuen Liste: Handlungsbedarf, offen (noch nicht fällig), bezahlt, Gutschriften, alle */
type Tile = 'overdue' | 'due' | 'paid' | 'credit' | 'all';
type Props = { rows: InvoiceListRow[]; organizerIncomplete: boolean; mailToFile: boolean; initialQuery?: string; initialState?: InvoiceStateFilter };
type DialogState = { kind: 'payment' | 'cancel' | 'status' | 'refund'; row: InvoiceListRow } | null;

const MAX_REMINDERS = 2;

function inTile(r: InvoiceListRow, tile: Tile): boolean {
  switch (tile) {
    case 'overdue':
      return r.state === 'overdue';
    case 'due':
      return r.state === 'open';
    case 'paid':
      return r.state === 'paid';
    case 'credit':
      return r.type === 'credit_note';
    default:
      return true;
  }
}

/** Heutiges Datum in Wien als YYYY-MM-DD (Vorbelegung für den Zahlungseingang). */
function todayVienna(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
}

/** Tage seit Fälligkeit (Wiener Datum), mindestens 0 */
function daysOverdue(dueAt: string | null): number {
  if (!dueAt) return 0;
  const ms = new Date(`${todayVienna()}T00:00:00Z`).getTime() - new Date(`${dueAt.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Rechnungen (UI-Redesign 18.11.2026): Kacheln mit Summen sind die Filter, Start bei „Handlungsbedarf“,
 * Gutschriften hängen an ihrer Rechnung, Sammelaktionen für überfällige und offene Rechnungen.
 */
export function InvoicesView({ rows: allRows, organizerIncomplete, mailToFile, initialQuery = '', initialState }: Props) {
  const t = useTranslations('invoices');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const { toast } = useToast();
  const handle = useActionFeedback();
  const [bulkPending, startBulk] = useTransition();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fmt = (c: number) => formatEuro(c, locale);
  const [query, setQuery] = useState(initialQuery);
  const overdueRows = allRows.filter((r) => r.state === 'overdue');
  // Start: aus der Adresse, sonst „Handlungsbedarf“, wenn es etwas zu tun gibt
  const startTile: Tile =
    initialState === 'overdue' ? 'overdue' : initialState === 'open' ? 'due' : initialState === 'paid' ? 'paid' : initialState === 'all' && initialQuery ? 'all' : overdueRows.length ? 'overdue' : 'all';
  const [tile, setTile] = useState<Tile>(startTile);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paidOpen, setPaidOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(todayVienna);

  const needle = query.trim().toLowerCase();
  const matches = (r: InvoiceListRow) => !needle || `${r.number} ${r.recipientName} ${r.recipientCompany ?? ''}`.toLowerCase().includes(needle);
  // Gutschriften zu ihrer Rechnung (außer in der Kachel „Gutschriften“)
  const creditsOf = useMemo(() => {
    const m = new Map<string, InvoiceListRow[]>();
    for (const r of allRows) if (r.type === 'credit_note' && r.relatedNumber) m.set(r.relatedNumber, [...(m.get(r.relatedNumber) ?? []), r]);
    return m;
  }, [allRows]);
  const hasParent = (r: InvoiceListRow) => r.type === 'credit_note' && r.relatedNumber != null && allRows.some((x) => x.number === r.relatedNumber);
  const rows = allRows.filter((r) => inTile(r, tile) && matches(r) && (tile === 'credit' || !hasParent(r)));

  const sum = (list: InvoiceListRow[], key: 'openCents' | 'grossCents' = 'openCents') => list.reduce((s, r) => s + r[key], 0);
  const dueRows = allRows.filter((r) => r.state === 'open');
  const paidRows = allRows.filter((r) => r.state === 'paid');
  const creditRows = allRows.filter((r) => r.type === 'credit_note');
  const tiles: { key: Tile; label: string; value: string; sub: string; tone: string }[] = [
    { key: 'overdue', label: t('tiles.overdue'), value: fmt(sum(overdueRows)), sub: t('tiles.count', { count: overdueRows.length }), tone: 'text-destructive' },
    { key: 'due', label: t('tiles.due'), value: fmt(sum(dueRows)), sub: t('tiles.count', { count: dueRows.length }), tone: 'text-amber-700' },
    { key: 'paid', label: t('tiles.paid'), value: fmt(sum(paidRows, 'grossCents')), sub: t('tiles.count', { count: paidRows.length }), tone: 'text-[#17603C]' },
    { key: 'credit', label: t('tiles.credit'), value: `−${fmt(sum(creditRows, 'grossCents'))}`, sub: t('tiles.countCredit', { count: creditRows.length }), tone: 'text-foreground' },
  ];

  // Auswahl: nur offene/überfällige Rechnungen
  const selectable = (r: InvoiceListRow) => r.type === 'invoice' && (r.state === 'open' || r.state === 'overdue');
  const selectedRows = allRows.filter((r) => selected.has(r.id) && selectable(r));
  const visibleSelectable = rows.filter(selectable);
  const allSelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => selected.has(r.id));
  const remindable = selectedRows.filter((r) => r.state === 'overdue' && r.reminderLevel < MAX_REMINDERS);
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  function chooseTile(next: Tile) {
    setTile(next);
    setSelected(new Set());
  }

  function send(row: InvoiceListRow) {
    startTransition(async () => {
      if (handle(await sendInvoiceAction(row.id), { success: t('sent', { number: row.number }) })) router.refresh();
    });
  }
  function remindNow() {
    startBulk(async () => {
      const result = await sendRemindersNowAction(remindable.map((r) => r.id));
      if (handle(result)) {
        const { sent, failed, skipped } = result.data;
        toast({ variant: failed > 0 ? 'destructive' : undefined, title: t('bulk.remindDone', { sent }), description: failed + skipped > 0 ? t('bulk.remindProblems', { count: failed + skipped }) : undefined });
        setSelected(new Set());
        router.refresh();
      }
    });
  }
  function resendAll() {
    startBulk(async () => {
      let ok = 0;
      for (const r of selectedRows) if ((await sendInvoiceAction(r.id)).ok) ok++;
      toast({ variant: ok < selectedRows.length ? 'destructive' : undefined, title: t('bulk.resendDone', { ok, total: selectedRows.length }) });
      router.refresh();
    });
  }
  function recordAllPaid() {
    startBulk(async () => {
      let ok = 0;
      for (const r of selectedRows) if ((await recordPaymentAction(r.id, { amount: centsToInput(r.openCents), paidOn })).ok) ok++;
      setPaidOpen(false);
      setSelected(new Set());
      toast({ variant: ok < selectedRows.length ? 'destructive' : undefined, title: t('bulk.paidDone', { ok, total: selectedRows.length }) });
      router.refresh();
    });
  }

  const menu = (r: InvoiceListRow) => {
    const payable = r.state === 'open' || r.state === 'overdue';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={t('actionsFor', { number: r.number })}>
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
          {r.type === 'invoice' && r.registrationId != null && r.state !== 'cancelled' && (
            <>
              <DropdownMenuSeparator />
              {/* gleiche Dialoge wie unter „Teilnehmende“ – Rechnungs- und Zahlungsstatus bleiben gleich */}
              <DropdownMenuItem onSelect={() => setDialog({ kind: 'status', row: r })}>
                <Wallet aria-hidden className="size-4" />
                {t('changeStatus')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog({ kind: 'refund', row: r })}>
                <Undo2 aria-hidden className="size-4" />
                {t('refund')}
              </DropdownMenuItem>
            </>
          )}
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
    );
  };

  const renderRow = (r: InvoiceListRow, nested = false) => {
    const payable = r.state === 'open' || r.state === 'overdue';
    const days = r.state === 'overdue' ? daysOverdue(r.dueAt) : 0;
    return (
      <tr key={r.id} className={cn('border-t', r.state === 'overdue' && 'bg-destructive/[0.03]', nested && 'bg-muted/30 text-muted-foreground', selected.has(r.id) && 'bg-brand-soft/60')}>
        <td className="w-10 py-2 pl-3.5">
          {selectable(r) && <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={t('bulk.select', { number: r.number })} />}
        </td>
        <td className="px-3 py-2 font-semibold whitespace-nowrap tabular-nums">
          {nested ? (
            <span className="flex items-center gap-1.5 font-normal">
              <CornerDownRight aria-hidden className="size-3.5" />
              {r.number}
            </span>
          ) : (
            r.number
          )}
        </td>
        <td className="max-w-0 px-3 py-2">
          <span className="block truncate">
            {nested ? t('creditFor', { number: r.relatedNumber ?? '–' }) : (r.recipientCompany ?? r.recipientName)}
            {!nested && r.recipientCompany && r.recipientName && <span className="ml-2 text-xs text-muted-foreground">{r.recipientName}</span>}
          </span>
          {!nested && <span className="block text-xs text-muted-foreground">{r.type === 'credit_note' ? t('creditFor', { number: r.relatedNumber ?? '–' }) : t(`kind.${r.kind}`)}</span>}
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {r.type === 'credit_note' ? `−${fmt(r.grossCents)}` : fmt(r.grossCents)}
          {payable && r.paidCents > 0 && <div className="text-xs text-muted-foreground">{t('openAmount', { amount: fmt(r.openCents) })}</div>}
        </td>
        <td className="px-3 py-2">
          <Badge variant={stateVariant[r.state]}>{t(`state.${r.state}`)}</Badge>
        </td>
        <td className={cn('px-3 py-2 whitespace-nowrap', r.state === 'overdue' ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
          {r.state === 'overdue' ? t('overdueSince', { days }) : r.dueAt && payable ? formatDateOnly(r.dueAt, locale) : '–'}
        </td>
        <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">
          {payable
            ? r.reminderLevel > 0
              ? t('reminders', { count: r.reminderLevel })
              : t('noReminder')
            : r.sentAt
              ? t('sentOn', { date: format.dateTime(new Date(r.sentAt), { dateStyle: 'short' }) })
              : '–'}
        </td>
        <td className="py-1 pr-2 text-right">{menu(r)}</td>
      </tr>
    );
  };

  const bulkBtn = 'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 whitespace-nowrap hover:bg-white/10 disabled:opacity-50';

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

      <div role="group" aria-label={t('stateFilter')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((x) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={tile === x.key}
            onClick={() => chooseTile(x.key)}
            className={cn(
              'rounded-xl border bg-card p-4 text-left shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              tile === x.key ? (x.key === 'overdue' ? 'border-destructive ring-1 ring-destructive' : 'border-primary ring-1 ring-primary') : 'hover:border-primary/40'
            )}
          >
            <span className="block text-sm text-muted-foreground">{x.label}</span>
            <span className={cn('mt-1 block font-display text-2xl font-bold tabular-nums', x.tone)}>{x.value}</span>
            <span className="block text-xs text-muted-foreground">{x.sub}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-ring sm:w-72">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <button
          type="button"
          aria-pressed={tile === 'all'}
          onClick={() => chooseTile('all')}
          className={cn('rounded-lg px-3 py-1.5 text-sm', tile === 'all' ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:text-foreground')}
        >
          {t('tiles.all', { count: allRows.filter((r) => r.type === 'invoice').length })}
        </button>
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {t('shown', { count: rows.length })}
        </span>
      </div>

      <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', selectedRows.length > 0 && 'mb-16')}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[130px]" />
              <col />
              <col className="w-[120px]" />
              <col className="w-[120px]" />
              <col className="w-[140px]" />
              <col className="w-[150px]" />
              <col className="w-12" />
            </colgroup>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2.5 pl-3.5">
                  {visibleSelectable.length > 0 && (
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(visibleSelectable.map((r) => r.id)))}
                      aria-label={t('bulk.selectAll')}
                    />
                  )}
                </th>
                <th className="px-3 py-2.5 font-semibold">{t('colNumber')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('colRecipient')}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t('colAmount')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('colState')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('colDue')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('colLast')}</th>
                <th className="py-2.5">
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  {renderRow(r)}
                  {tile !== 'credit' && r.type === 'invoice' && (creditsOf.get(r.number) ?? []).map((c) => renderRow(c, true))}
                </Fragment>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    {allRows.length === 0 ? t('empty') : tile === 'overdue' && !needle ? t('nothingOverdue') : t('noMatches')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div
          role="region"
          aria-label={t('bulk.selected', { count: selectedRows.length })}
          className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl bg-[#15172B] p-1.5 pl-4 text-sm text-white shadow-[0_12px_32px_-8px_rgba(21,23,43,0.45)] lg:left-[calc(50%+124px)] lg:max-w-[calc(100vw-280px)]"
        >
          <span className="mr-2 font-semibold whitespace-nowrap" aria-live="polite">
            {t('bulk.selected', { count: selectedRows.length })}
          </span>
          {remindable.length > 0 && (
            <button type="button" onClick={remindNow} disabled={bulkPending} className={bulkBtn} title={t('bulk.remindHint')}>
              <Send aria-hidden className="size-4" />
              {t('bulk.remind', { count: remindable.length })}
            </button>
          )}
          <button type="button" onClick={() => setPaidOpen(true)} disabled={bulkPending} className={bulkBtn}>
            <Landmark aria-hidden className="size-4" />
            {t('bulk.paid', { count: selectedRows.length })}
          </button>
          <button type="button" onClick={resendAll} disabled={bulkPending} className={bulkBtn}>
            <Send aria-hidden className="size-4" />
            {t('bulk.resend')}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label={t('bulk.clear')} title={t('bulk.clear')} className="ml-1 rounded-xl p-2 text-white/70 hover:bg-white/10">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              recordAllPaid();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t('bulk.paidTitle', { count: selectedRows.length })}</DialogTitle>
              <DialogDescription>{t('bulk.paidHint', { sum: fmt(sum(selectedRows)) })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="inv-bulk-paid-on">{t('paymentDate')}</Label>
              <Input id="inv-bulk-paid-on" type="date" max={todayVienna()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="w-48" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaidOpen(false)}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={bulkPending}>
                {t('bulk.paidAction', { count: selectedRows.length })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {dialog?.kind === 'payment' && <PaymentDialog key={`p-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cancel' && <CancelInvoiceDialog key={`c-${dialog.row.id}`} row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'status' && dialog.row.registrationId != null && (
        <PaymentStatusDialog
          key={`s-${dialog.row.id}`}
          registrationId={dialog.row.registrationId}
          name={dialog.row.recipientName ?? dialog.row.number}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}
      {dialog?.kind === 'refund' && dialog.row.registrationId != null && (
        <RefundDialog
          key={`r-${dialog.row.id}`}
          registrationId={dialog.row.registrationId}
          name={dialog.row.recipientName ?? dialog.row.number}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}
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
