'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileDown, MoreHorizontal, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/action-result';
import { formatDateOnly } from '@/lib/dates';
import { centsToInput, formatEuro } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  EXPENSE_STATUS_KEYS,
  expenseFormSchema,
  MAX_RECEIPT_BYTES,
  RECEIPT_ACCEPT,
  receiptExtension,
  type ExpenseFormValues,
  type ExpenseStatus,
} from '@/lib/validation/expenses';
import { VAT_RATE_OPTIONS } from '@/lib/validation/forms';
import { createExpenseAction, deleteExpenseAction, updateExpenseAction } from '@/server/actions/expenses';
import type { EventGroupRow, ExpenseRow, StatusTotals } from '@/server/services/expenses';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError, useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';
import { EventCostGroups } from './event-cost-groups';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const statusVariant: Record<ExpenseStatus, BadgeProps['variant']> = { new: 'outline', planned: 'billed', paid: 'paid' };

type SpeakerOption = { id: number; name: string };

type Props = {
  eventId: number;
  groups: EventGroupRow[];
  totals: StatusTotals;
  expenses: ExpenseRow[];
  speakers: SpeakerOption[];
  /** Veranstalter mit regulärer USt: Steuersatz je Ausgabe erfassen */
  withVat: boolean;
  readOnly: boolean;
};

type DialogState =
  | { kind: 'expense'; row?: ExpenseRow }
  | { kind: 'deleteExpense'; row: ExpenseRow }
  | null;

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });

export function ExpensesView({ eventId, groups, totals, expenses, speakers, withVat, readOnly }: Props) {
  const t = useTranslations('expenses');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const fmt = (cents: number) => formatEuro(cents, locale);

  const shown = useMemo(
    () => expenses.filter((e) => (!groupFilter || String(e.costGroupId) === groupFilter) && (!statusFilter || e.status === statusFilter)),
    [expenses, groupFilter, statusFilter]
  );
  const shownTotal = shown.reduce((s, e) => s + e.amountCents, 0);
  const activeGroups = groups.filter((g) => !g.deactivatedAt);

  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  const tiles: { key: keyof StatusTotals; label: string }[] = [
    { key: 'total', label: t('totalAll') },
    { key: 'paid', label: t('status.paid') },
    { key: 'planned', label: t('status.planned') },
    { key: 'new', label: t('status.new') },
  ];

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-lg border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{tile.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{fmt(totals[tile.key])}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <h3 className="mr-2 text-lg font-semibold">{t('expensesTitle')}</h3>
            <div className="space-y-1">
              <label htmlFor="ex-filter-group" className="text-xs text-muted-foreground">
                {t('filterGroup')}
              </label>
              <select id="ex-filter-group" className={cn(selectClass, 'w-48')} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <option value="">{t('all')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.deactivatedAt ? t('inactiveOption', { name: g.name }) : g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="ex-filter-status" className="text-xs text-muted-foreground">
                {t('filterStatus')}
              </label>
              <select id="ex-filter-status" className={cn(selectClass, 'w-36')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">{t('all')}</option>
                {EXPENSE_STATUS_KEYS.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => setDialog({ kind: 'expense' })} disabled={activeGroups.length === 0} title={activeGroups.length === 0 ? t('noActiveGroups') : undefined}>
              <Plus aria-hidden className="size-4" />
              {t('addExpense')}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">{t('colDate')}</th>
                <th className="p-2 font-medium">{t('colGroup')}</th>
                <th className="p-2 font-medium">{t('colSupplier')}</th>
                <th className="p-2 text-right font-medium">{t('colAmount')}</th>
                <th className="p-2 font-medium">{t('colStatus')}</th>
                <th className="p-2 font-medium">{t('colReceipt')}</th>
                <th className="p-2">
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{formatDateOnly(e.spentOn, locale)}</td>
                  <td className="p-2">
                    {e.groupName}
                    {e.speakerName && <div className="text-xs text-muted-foreground">{e.speakerName}</div>}
                  </td>
                  <td className="p-2">
                    {e.supplier && <div className="font-medium">{e.supplier}</div>}
                    <div className={cn(e.supplier && 'text-muted-foreground')}>{e.description}</div>
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(e.amountCents)}
                    {withVat && e.vatRateBp != null && <div className="text-xs text-muted-foreground">{e.vatRateBp / 100} % USt</div>}
                  </td>
                  <td className="p-2">
                    <Badge variant={statusVariant[e.status]}>{t(`status.${e.status}`)}</Badge>
                  </td>
                  <td className="p-2">
                    {e.receiptPath ? (
                      <a
                        href={`/api/export/receipts/${e.id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                        aria-label={t('openReceipt', { name: e.receiptName ?? '' })}
                        title={e.receiptName ?? undefined}
                      >
                        <Paperclip aria-hidden className="size-4" />
                        <span className="max-w-32 truncate">{e.receiptName}</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {!readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: e.description })}>
                            <MoreHorizontal aria-hidden className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'expense', row: e })}>
                            <Pencil aria-hidden className="size-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                          {e.receiptPath && (
                            <DropdownMenuItem asChild>
                              <a href={`/api/export/receipts/${e.id}?download=1`}>
                                <FileDown aria-hidden className="size-4" />
                                {t('colReceipt')}
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={e.status === 'paid'}
                            title={e.status === 'paid' ? t('paidNoDelete') : undefined}
                            onSelect={() => setDialog({ kind: 'deleteExpense', row: e })}
                            className="text-destructive"
                          >
                            <Trash2 aria-hidden className="size-4" />
                            {t('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {expenses.length === 0 ? t('noExpenses') : t('noMatches')}
                  </td>
                </tr>
              )}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-2" colSpan={3}>
                    {t('sumFiltered', { count: shown.length })}
                  </td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmt(shownTotal)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <EventCostGroups eventId={eventId} groups={groups} totals={totals} readOnly={readOnly} />

      {dialog?.kind === 'expense' && (
        <ExpenseDialog
          key={dialog.row?.id ?? 'new'}
          row={dialog.row}
          groups={groups}
          speakers={speakers}
          withVat={withVat}
          defaultValues={
            dialog.row
              ? {
                  spentOn: dialog.row.spentOn,
                  amount: centsToInput(dialog.row.amountCents),
                  vatRateBp: (dialog.row.vatRateBp == null ? '' : String(dialog.row.vatRateBp)) as ExpenseFormValues['vatRateBp'],
                  costGroupId: String(dialog.row.costGroupId),
                  status: dialog.row.status,
                  supplier: dialog.row.supplier ?? '',
                  description: dialog.row.description,
                  speakerId: dialog.row.speakerId ? String(dialog.row.speakerId) : '',
                  removeReceipt: false,
                }
              : {
                  spentOn: today(),
                  amount: '',
                  vatRateBp: withVat ? '2000' : '',
                  costGroupId: groupFilter && activeGroups.some((g) => String(g.id) === groupFilter) ? groupFilter : String(activeGroups[0]?.id ?? ''),
                  status: 'new',
                  supplier: '',
                  description: '',
                  speakerId: '',
                  removeReceipt: false,
                }
          }
          save={(data) => (dialog.row ? updateExpenseAction(dialog.row.id, data) : createExpenseAction(eventId, data))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deleteExpense' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('deleteTitle', { name: dialog.row.description })}
          description={t('deleteHint')}
          confirmLabel={t('delete')}
          destructive
          onConfirm={() => run(() => deleteExpenseAction(dialog.row.id), t('deleted'))}
        />
      )}
    </div>
  );
}

function ExpenseDialog({
  row,
  groups,
  speakers,
  withVat,
  defaultValues,
  save,
  onClose,
}: {
  row?: ExpenseRow;
  groups: EventGroupRow[];
  speakers: SpeakerOption[];
  withVat: boolean;
  defaultValues: ExpenseFormValues;
  save: (data: FormData) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const t = useTranslations('expenses');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();
  const form = useForm<ExpenseFormValues>({ resolver: zodResolver(expenseFormSchema), defaultValues });
  const errors = form.formState.errors;
  const reg = form.register;
  const groupId = useWatch({ control: form.control, name: 'costGroupId' });
  const removeReceipt = useWatch({ control: form.control, name: 'removeReceipt' });
  const group = groups.find((g) => String(g.id) === groupId);
  // Wählbar: aktive Gruppen und die bisherige Gruppe der Ausgabe (auch wenn inzwischen deaktiviert)
  const selectable = groups.filter((g) => !g.deactivatedAt || g.id === row?.costGroupId);

  function checkFile(f: File | undefined): string | undefined {
    if (!f) return undefined;
    if (!receiptExtension(f.name)) return 'receiptType';
    if (f.size === 0 || f.size > MAX_RECEIPT_BYTES) return 'receiptTooLarge';
    return undefined;
  }

  const onSubmit = form.handleSubmit((values) => {
    const fileProblem = checkFile(file);
    setFileError(fileProblem);
    if (fileProblem) return;
    const data = new FormData();
    data.set('values', JSON.stringify({ ...values, speakerId: group?.speakerLink ? values.speakerId : '' }));
    if (file) data.set('receipt', file);
    startTransition(async () => {
      const result = await save(data);
      if (!result.ok && result.fieldErrors?.receipt) setFileError(result.fieldErrors.receipt);
      if (handle(result, { setError: form.setError, success: t('saved') })) {
        onClose();
        router.refresh();
      }
    });
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{row ? t('editExpense') : t('addExpense')}</DialogTitle>
          </DialogHeader>
          <fieldset disabled={pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="ex-group" label={t('group')} error={fieldError(errors, 'costGroupId')}>
                <select id="ex-group" className={selectClass} {...reg('costGroupId')}>
                  {selectable.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {g.deactivatedAt ? t('inactiveOption', { name: g.name }) : g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ex-status" label={t('colStatus')} error={fieldError(errors, 'status')}>
                <select id="ex-status" className={selectClass} {...reg('status')}>
                  {EXPENSE_STATUS_KEYS.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="ex-date" label={t('date')} error={fieldError(errors, 'spentOn')}>
                <Input id="ex-date" type="date" {...reg('spentOn')} />
              </Field>
              <Field id="ex-amount" label={t('amount')} hint={withVat ? undefined : t('amountHint')} error={fieldError(errors, 'amount')}>
                <Input id="ex-amount" inputMode="decimal" {...reg('amount')} />
              </Field>
              {withVat && (
                <Field id="ex-vat" label={t('vatRate')} error={fieldError(errors, 'vatRateBp')}>
                  <select id="ex-vat" className={selectClass} {...reg('vatRateBp')}>
                    <option value="">{t('vatNone')}</option>
                    {VAT_RATE_OPTIONS.map((bp) => (
                      <option key={bp} value={bp}>
                        {Number(bp) / 100} %
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field id="ex-supplier" label={t('supplier')} error={fieldError(errors, 'supplier')}>
                <Input id="ex-supplier" {...reg('supplier')} />
              </Field>
              {group?.speakerLink && (
                <Field id="ex-speaker" label={t('speaker')} hint={speakers.length === 0 ? t('noSpeakers') : undefined} error={fieldError(errors, 'speakerId')}>
                  <select id="ex-speaker" className={selectClass} {...reg('speakerId')}>
                    <option value="">{t('noSpeaker')}</option>
                    {speakers.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <Field id="ex-description" label={t('description')} error={fieldError(errors, 'description')}>
              <Textarea id="ex-description" rows={2} {...reg('description')} />
            </Field>
            <div className="space-y-1.5">
              <label htmlFor="ex-receipt" className="text-sm font-medium">
                {t('receipt')}
              </label>
              {row?.receiptPath && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <a href={`/api/export/receipts/${row.id}`} target="_blank" rel="noopener" className={cn('inline-flex items-center gap-1 text-primary hover:underline', removeReceipt && 'line-through opacity-60')}>
                    <Paperclip aria-hidden className="size-4" />
                    {t('receiptCurrent', { name: row.receiptName ?? '' })}
                  </a>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="size-4" {...reg('removeReceipt')} />
                    {t('receiptRemove')}
                  </label>
                </div>
              )}
              <input
                id="ex-receipt"
                type="file"
                accept={RECEIPT_ACCEPT}
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setFileError(checkFile(e.target.files?.[0]));
                }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
              {fileError ? (
                <p role="alert" className="text-xs text-destructive">
                  {message(fileError)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('receiptHint')}
                  {row?.receiptPath ? ` ${t('receiptReplaceHint')}` : ''}
                </p>
              )}
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
      </DialogContent>
    </Dialog>
  );
}
