'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, MoreHorizontal, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/action-result';
import { formatDateOnly } from '@/lib/dates';
import { localized, localizedList } from '@/lib/localized';
import { centsToInput, formatEuro } from '@/lib/money';
import { VAT_RATE_OPTIONS } from '@/lib/validation/forms';
import {
  packageFormSchema,
  SPONSOR_PAYMENT_STATUS_KEYS,
  sponsorFormSchema,
  type PackageFormValues,
  type SponsorFormValues,
} from '@/lib/validation/sponsors';
import {
  createPackageAction,
  createSponsorAction,
  deletePackageAction,
  deleteSponsorAction,
  updatePackageAction,
  updateSponsorAction,
} from '@/server/actions/sponsors';
import { issueSponsorInvoiceAction } from '@/server/actions/invoices';
import type { PackageRow, SponsorRow, SponsorTotals } from '@/server/services/sponsors';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError, LocalizedFields, useValidationMessage } from '../form-fields';
import { useIssueFeedback } from '../invoices/use-issue-feedback';
import { useActionFeedback } from '../use-action-feedback';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const paymentVariant: Record<SponsorRow['paymentStatus'], BadgeProps['variant']> = {
  open: 'outline',
  invoiced: 'billed',
  paid: 'paid',
  overdue: 'overdue',
};

type Props = { eventId: number; packages: PackageRow[]; sponsors: SponsorRow[]; totals: SponsorTotals; readOnly: boolean };

type DialogState =
  | { kind: 'package'; row?: PackageRow }
  | { kind: 'deletePackage'; row: PackageRow }
  | { kind: 'sponsor'; row?: SponsorRow }
  | { kind: 'deleteSponsor'; row: SponsorRow }
  | { kind: 'invoice'; row: SponsorRow }
  | null;

export function SponsorsView({ eventId, packages, sponsors, totals, readOnly }: Props) {
  const t = useTranslations('sponsors');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const reportIssue = useIssueFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fmt = (cents: number) => formatEuro(cents, locale);

  function issueInvoice(sponsorId: number) {
    startTransition(async () => {
      if (reportIssue(await issueSponsorInvoiceAction(sponsorId))) router.refresh();
    });
  }

  function run(action: () => Promise<ActionResult<void>>, success: string) {
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('packages')}</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'package' })}>
              <Plus aria-hidden className="size-4" />
              {t('addPackage')}
            </Button>
          )}
        </div>
        {packages.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{t('noPackages')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{localized(p.name, locale)}</CardTitle>
                      <CardDescription>
                        {fmt(p.priceCents)} · {t('bookedCount', { count: p.sponsorCount })}
                      </CardDescription>
                    </div>
                    {!readOnly && (
                      <div className="flex">
                        <Button variant="ghost" size="icon" className="size-7" aria-label={t('editPackageNamed', { name: localized(p.name, locale) })} onClick={() => setDialog({ kind: 'package', row: p })}>
                          <Pencil aria-hidden className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" aria-label={t('deletePackageNamed', { name: localized(p.name, locale) })} onClick={() => setDialog({ kind: 'deletePackage', row: p })}>
                          <Trash2 aria-hidden className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {localizedList(p.benefits, locale).map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">{t('sponsors')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('totals', { count: totals.count, total: fmt(totals.totalCents), paid: fmt(totals.paidCents), open: fmt(totals.openCents) })}
            </p>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => setDialog({ kind: 'sponsor' })}>
              <Plus aria-hidden className="size-4" />
              {t('addSponsor')}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">{t('colCompany')}</th>
                <th className="p-2 font-medium">{t('colPackage')}</th>
                <th className="p-2 text-right font-medium">{t('colAmount')}</th>
                <th className="p-2 font-medium">{t('colDue')}</th>
                <th className="p-2 font-medium">{t('colPayment')}</th>
                <th className="p-2 font-medium">{t('colContacts')}</th>
                <th className="p-2">
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="p-2 font-medium">{s.companyName}</td>
                  <td className="p-2">{s.packageName ? localized(s.packageName, locale) : '–'}</td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(s.amountCents)}
                    {s.discountCents > 0 && <div className="text-xs text-muted-foreground">{t('discountInfo', { discount: fmt(s.discountCents) })}</div>}
                  </td>
                  <td className="p-2 whitespace-nowrap">{s.dueOn ? formatDateOnly(s.dueOn, locale) : '–'}</td>
                  <td className="p-2">
                    <Badge variant={paymentVariant[s.paymentStatus]}>{t(`payment.${s.paymentStatus}`)}</Badge>
                    {s.invoiceNumber && <div className="mt-1 text-xs text-muted-foreground">{t('invoiceNumber', { number: s.invoiceNumber })}</div>}
                  </td>
                  <td className="p-2">
                    {s.contacts.map((c) => (
                      <div key={c.personId}>
                        {c.firstName} {c.lastName}
                        {c.function && <span className="text-muted-foreground"> · {c.function}</span>}
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      </div>
                    ))}
                  </td>
                  <td className="p-2 text-right">
                    {!readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: s.companyName })}>
                            <MoreHorizontal aria-hidden className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'sponsor', row: s })}>
                            <Pencil aria-hidden className="size-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                          {!s.invoiceNumber && s.paymentStatus !== 'paid' && s.amountCents > 0 && (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'invoice', row: s })}>
                              <FileText aria-hidden className="size-4" />
                              {t('issueInvoice')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'deleteSponsor', row: s })} className="text-destructive">
                            <Trash2 aria-hidden className="size-4" />
                            {t('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
              {sponsors.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {t('noSponsors')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialog?.kind === 'package' && (
        <PackageDialog
          key={dialog.row?.id ?? 'new'}
          title={dialog.row ? t('editPackage') : t('addPackage')}
          defaultValues={
            dialog.row
              ? {
                  name: { de: dialog.row.name.de, en: dialog.row.name.en ?? '' },
                  benefits: { de: dialog.row.benefits.de.join('\n'), en: (dialog.row.benefits.en ?? []).join('\n') },
                  price: centsToInput(dialog.row.priceCents),
                  vatRateBp: String(dialog.row.vatRateBp) as PackageFormValues['vatRateBp'],
                  sortOrder: String(dialog.row.sortOrder),
                }
              : { name: { de: '', en: '' }, benefits: { de: '', en: '' }, price: '', vatRateBp: '2000', sortOrder: String(packages.length + 1) }
          }
          save={(v) => (dialog.row ? updatePackageAction(dialog.row.id, v) : createPackageAction(eventId, v))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deletePackage' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('deletePackageTitle', { name: localized(dialog.row.name, locale) })}
          description={t('deletePackageHint')}
          confirmLabel={t('delete')}
          destructive
          onConfirm={() => run(() => deletePackageAction(dialog.row.id), t('packageDeleted'))}
        />
      )}
      {dialog?.kind === 'sponsor' && (
        <SponsorDialog
          key={dialog.row?.id ?? 'new'}
          title={dialog.row ? t('editSponsor') : t('addSponsor')}
          packages={packages.map((p) => ({ id: p.id, label: `${localized(p.name, locale)} (${fmt(p.priceCents)})` }))}
          defaultValues={
            dialog.row
              ? {
                  companyName: dialog.row.companyName,
                  packageId: dialog.row.packageId ? String(dialog.row.packageId) : '',
                  discount: centsToInput(dialog.row.discountCents),
                  dueOn: dialog.row.dueOn ?? '',
                  paymentStatus: dialog.row.paymentStatus,
                  billingAddress: dialog.row.billingAddress,
                  vatId: dialog.row.vatId ?? '',
                  notes: dialog.row.notes ?? '',
                  contacts: dialog.row.contacts.map((c) => ({
                    firstName: c.firstName,
                    lastName: c.lastName,
                    email: c.email ?? '',
                    phone: c.phone ?? '',
                    function: c.function ?? '',
                    locale: c.locale,
                  })),
                }
              : {
                  companyName: '',
                  packageId: packages[0] ? String(packages[0].id) : '',
                  discount: '0',
                  dueOn: '',
                  paymentStatus: 'open',
                  billingAddress: '',
                  vatId: '',
                  notes: '',
                  contacts: [{ firstName: '', lastName: '', email: '', phone: '', function: '', locale: 'de' }],
                }
          }
          save={(v) => (dialog.row ? updateSponsorAction(dialog.row.id, v) : createSponsorAction(eventId, v))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'invoice' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('issueInvoiceTitle', { name: dialog.row.companyName, amount: fmt(dialog.row.amountCents) })}
          description={t('issueInvoiceHint')}
          confirmLabel={t('issueInvoiceConfirm')}
          onConfirm={() => issueInvoice(dialog.row.id)}
        />
      )}
      {dialog?.kind === 'deleteSponsor' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('deleteSponsorTitle', { name: dialog.row.companyName })}
          description={t('deleteSponsorHint')}
          confirmLabel={t('delete')}
          destructive
          onConfirm={() => run(() => deleteSponsorAction(dialog.row.id), t('sponsorDeleted'))}
        />
      )}
    </div>
  );
}

function PackageDialog({
  title,
  defaultValues,
  save,
  onClose,
}: {
  title: string;
  defaultValues: PackageFormValues;
  save: (v: PackageFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const t = useTranslations('sponsors');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<PackageFormValues>({ resolver: zodResolver(packageFormSchema), defaultValues });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await save(values), { setError: form.setError, success: t('packageSaved') })) {
        onClose();
        router.refresh();
      }
    })
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <fieldset disabled={pending} className="space-y-4">
              <LocalizedFields name="name" label={t('packageName')} />
              <LocalizedFields name="benefits" label={t('benefits')} multiline rows={4} deRequired={false} />
              <p className="-mt-2 text-xs text-muted-foreground">{t('benefitsHint')}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="pkg-price" label={t('price')} error={fieldError(errors, 'price')}>
                  <Input id="pkg-price" inputMode="decimal" {...form.register('price')} />
                </Field>
                <Field id="pkg-vat" label={t('vatRate')} error={fieldError(errors, 'vatRateBp')}>
                  <select id="pkg-vat" className={selectClass} {...form.register('vatRateBp')}>
                    {VAT_RATE_OPTIONS.map((bp) => (
                      <option key={bp} value={bp}>
                        {Number(bp) / 100} %
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="pkg-sort" label={t('sortOrder')} error={fieldError(errors, 'sortOrder')}>
                  <Input id="pkg-sort" inputMode="numeric" {...form.register('sortOrder')} />
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

function SponsorDialog({
  title,
  packages,
  defaultValues,
  save,
  onClose,
}: {
  title: string;
  packages: { id: number; label: string }[];
  defaultValues: SponsorFormValues;
  save: (v: SponsorFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const t = useTranslations('sponsors');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<SponsorFormValues>({ resolver: zodResolver(sponsorFormSchema), defaultValues });
  const contacts = useFieldArray({ control: form.control, name: 'contacts' });
  const errors = form.formState.errors;
  const reg = form.register;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await save(values), { setError: form.setError, success: t('sponsorSaved') })) {
        onClose();
        router.refresh();
      }
    })
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <fieldset disabled={pending} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="sp-company" label={t('colCompany')} error={fieldError(errors, 'companyName')}>
                  <Input id="sp-company" {...reg('companyName')} />
                </Field>
                <Field id="sp-package" label={t('colPackage')} error={fieldError(errors, 'packageId')}>
                  <select id="sp-package" className={selectClass} {...reg('packageId')}>
                    <option value="">{t('noPackage')}</option>
                    {packages.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="sp-discount" label={t('discount')} error={fieldError(errors, 'discount')}>
                  <Input id="sp-discount" inputMode="decimal" {...reg('discount')} />
                </Field>
                <Field id="sp-due" label={t('colDue')} error={fieldError(errors, 'dueOn')}>
                  <Input id="sp-due" type="date" {...reg('dueOn')} />
                </Field>
                <Field id="sp-payment" label={t('colPayment')} hint={t('paymentHint')} error={fieldError(errors, 'paymentStatus')}>
                  <select id="sp-payment" className={selectClass} {...reg('paymentStatus')}>
                    {SPONSOR_PAYMENT_STATUS_KEYS.map((s) => (
                      <option key={s} value={s}>
                        {t(`payment.${s}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="sp-billing" label={t('billingAddress')} error={fieldError(errors, 'billingAddress')}>
                  <Textarea id="sp-billing" rows={3} {...reg('billingAddress')} />
                </Field>
                <Field id="sp-vat" label={t('vatId')} hint={t('vatIdHint')} error={fieldError(errors, 'vatId')}>
                  <Input id="sp-vat" {...reg('vatId')} />
                </Field>
              </div>
              <Field id="sp-notes" label={t('notes')} error={fieldError(errors, 'notes')}>
                <Textarea id="sp-notes" rows={2} {...reg('notes')} />
              </Field>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t('contacts')}</legend>
                {contacts.fields.map((f, i) => (
                  <div key={f.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                    <Field id={`c${i}-first`} label={t('firstName')} className="sm:col-span-2" error={fieldError(errors, `contacts.${i}.firstName`)}>
                      <Input id={`c${i}-first`} {...reg(`contacts.${i}.firstName`)} />
                    </Field>
                    <Field id={`c${i}-last`} label={t('lastName')} className="sm:col-span-2" error={fieldError(errors, `contacts.${i}.lastName`)}>
                      <Input id={`c${i}-last`} {...reg(`contacts.${i}.lastName`)} />
                    </Field>
                    <Field id={`c${i}-function`} label={t('function')} className="sm:col-span-2" error={fieldError(errors, `contacts.${i}.function`)}>
                      <Input id={`c${i}-function`} {...reg(`contacts.${i}.function`)} />
                    </Field>
                    <Field id={`c${i}-email`} label={t('email')} className="sm:col-span-3" error={fieldError(errors, `contacts.${i}.email`)}>
                      <Input id={`c${i}-email`} type="email" {...reg(`contacts.${i}.email`)} />
                    </Field>
                    <Field id={`c${i}-phone`} label={t('phone')} className="sm:col-span-2" error={fieldError(errors, `contacts.${i}.phone`)}>
                      <Input id={`c${i}-phone`} type="tel" {...reg(`contacts.${i}.phone`)} />
                    </Field>
                    <div className="flex items-end justify-end">
                      <Button type="button" variant="ghost" size="icon" aria-label={t('removeContact')} onClick={() => contacts.remove(i)} disabled={contacts.fields.length <= 1}>
                        <X aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {fieldError(errors, 'contacts') && (
                  <p role="alert" className="text-xs text-destructive">
                    {message(fieldError(errors, 'contacts'))}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={contacts.fields.length >= 10}
                  onClick={() => contacts.append({ firstName: '', lastName: '', email: '', phone: '', function: '', locale: 'de' })}
                >
                  <UserPlus aria-hidden className="size-4" />
                  {t('addContact')}
                </Button>
              </fieldset>
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
