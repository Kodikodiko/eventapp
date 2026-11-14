'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/action-result';
import { utcToViennaInput } from '@/lib/dates';
import { centsToInput, formatEuro } from '@/lib/money';
import { percentLabel } from '@/lib/pricing';
import {
  discountCodeFormSchema,
  priceCategoryFormSchema,
  type DiscountCodeFormValues,
  type PriceCategoryFormValues,
} from '@/lib/validation/pricing';
import {
  createDiscountCodeAction,
  createPriceCategoryAction,
  deleteDiscountCodeAction,
  deletePriceCategoryAction,
  updateDiscountCodeAction,
  updatePriceCategoryAction,
} from '@/server/actions/pricing';
import type { DiscountCodeRow, PriceCategoryRow } from '@/server/services/pricing';
import { ConfirmDialog } from '../confirm-dialog';
import { Field, fieldError } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

type EarlyBird = {
  startsAt: string | null;
  endsAt: string | null;
  normalCents: number | null;
  memberCents: number | null;
  priceNormalCents: number;
  priceMemberCents: number;
  /** läuft gerade */
  active: boolean;
};

type Props = {
  eventId: number;
  earlyBird: EarlyBird;
  categories: PriceCategoryRow[];
  codes: DiscountCodeRow[];
  readOnly: boolean;
};

type DialogState =
  | { kind: 'category'; row?: PriceCategoryRow }
  | { kind: 'deleteCategory'; row: PriceCategoryRow }
  | { kind: 'code'; row?: DiscountCodeRow }
  | { kind: 'deleteCode'; row: DiscountCodeRow }
  | null;

function useDateTime(locale: Locale) {
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Vienna' });
  return (iso: string) => fmt.format(new Date(iso));
}

export function PricingView({ eventId, earlyBird, categories, codes, readOnly }: Props) {
  const t = useTranslations('pricing');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fmt = (cents: number) => formatEuro(cents, locale);
  const dateTime = useDateTime(locale);
  const hasEarlyBird = earlyBird.endsAt !== null && (earlyBird.normalCents !== null || earlyBird.memberCents !== null);

  function run(action: () => Promise<ActionResult<void>>, success: string) {
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  const discountLabel = (c: DiscountCodeRow) => (c.kind === 'percent' ? `−${percentLabel(c.value)} %` : `−${fmt(c.value)}`);
  const validity = (c: DiscountCodeRow) => {
    if (c.validFrom && c.validUntil) return t('validFromTo', { from: dateTime(c.validFrom), to: dateTime(c.validUntil) });
    if (c.validUntil) return t('validUntil', { to: dateTime(c.validUntil) });
    if (c.validFrom) return t('validFrom', { from: dateTime(c.validFrom) });
    return t('validAlways');
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              Early Bird
              {hasEarlyBird && <Badge variant={earlyBird.active ? 'paid' : 'outline'}>{earlyBird.active ? t('earlyBirdRunning') : t('earlyBirdNotRunning')}</Badge>}
            </CardTitle>
            {!readOnly && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/events/${eventId}/settings`}>{t('editEarlyBird')}</Link>
              </Button>
            )}
          </div>
          <CardDescription>{t('earlyBirdHint')}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {hasEarlyBird ? (
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[12rem_1fr]">
              <dt className="text-muted-foreground">{t('period')}</dt>
              <dd>
                {earlyBird.startsAt ? dateTime(earlyBird.startsAt) : t('fromStart')} – {dateTime(earlyBird.endsAt!)}
              </dd>
              <dt className="text-muted-foreground">{t('normal')}</dt>
              <dd>{earlyBird.normalCents !== null ? `${fmt(earlyBird.normalCents)} (${t('instead', { price: fmt(earlyBird.priceNormalCents) })})` : t('noEarlyBird')}</dd>
              <dt className="text-muted-foreground">{t('member')}</dt>
              <dd>{earlyBird.memberCents !== null ? `${fmt(earlyBird.memberCents)} (${t('instead', { price: fmt(earlyBird.priceMemberCents) })})` : t('noEarlyBird')}</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground">{t('earlyBirdNone')}</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">{t('codes')}</h3>
            <p className="text-sm text-muted-foreground">{t('codesHint')}</p>
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'code' })}>
              <Plus aria-hidden className="size-4" />
              {t('addCode')}
            </Button>
          )}
        </div>
        {codes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{t('noCodes')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('code')}</th>
                  <th className="px-3 py-2 font-medium">{t('discount')}</th>
                  <th className="px-3 py-2 font-medium">{t('validity')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('uses')}</th>
                  <th className="px-3 py-2 font-medium">{t('status')}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t('actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold">{c.code}</span>
                      {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{discountLabel(c)}</td>
                    <td className="px-3 py-2">{validity(c)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {c.maxUses !== null ? t('usesOf', { used: c.usedCount, max: c.maxUses }) : c.usedCount}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={c.active ? 'paid' : 'outline'}>{c.active ? t('active') : t('inactive')}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {!readOnly && (
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" className="size-7" aria-label={t('editNamed', { name: c.code })} onClick={() => setDialog({ kind: 'code', row: c })}>
                            <Pencil aria-hidden className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7" aria-label={t('deleteNamed', { name: c.code })} onClick={() => setDialog({ kind: 'deleteCode', row: c })}>
                            <Trash2 aria-hidden className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">{t('categories')}</h3>
            <p className="text-sm text-muted-foreground">{t('categoriesHint')}</p>
          </div>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'category' })}>
              <Plus aria-hidden className="size-4" />
              {t('addCategory')}
            </Button>
          )}
        </div>
        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{t('noCategories')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('categoryName')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('price')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('registrations')}</th>
                  <th className="px-3 py-2 font-medium">{t('status')}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t('actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(c.priceCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.usedCount}</td>
                    <td className="px-3 py-2">
                      <Badge variant={c.active ? 'paid' : 'outline'}>{c.active ? t('active') : t('inactive')}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {!readOnly && (
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon" className="size-7" aria-label={t('editNamed', { name: c.name })} onClick={() => setDialog({ kind: 'category', row: c })}>
                            <Pencil aria-hidden className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7" aria-label={t('deleteNamed', { name: c.name })} onClick={() => setDialog({ kind: 'deleteCategory', row: c })}>
                            <Trash2 aria-hidden className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog?.kind === 'category' && (
        <CategoryDialog
          title={dialog.row ? t('editCategory') : t('addCategory')}
          defaultValues={
            dialog.row
              ? { name: dialog.row.name, price: centsToInput(dialog.row.priceCents), active: dialog.row.active }
              : { name: '', price: '', active: true }
          }
          save={(v) => (dialog.row ? updatePriceCategoryAction(dialog.row.id, v) : createPriceCategoryAction(eventId, v))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'code' && (
        <CodeDialog
          title={dialog.row ? t('editCode') : t('addCode')}
          defaultValues={
            dialog.row
              ? {
                  code: dialog.row.code,
                  kind: dialog.row.kind,
                  value: dialog.row.kind === 'percent' ? percentLabel(dialog.row.value) : centsToInput(dialog.row.value),
                  validFrom: utcToViennaInput(dialog.row.validFrom),
                  validUntil: utcToViennaInput(dialog.row.validUntil),
                  maxUses: dialog.row.maxUses === null ? '' : String(dialog.row.maxUses),
                  active: dialog.row.active,
                  note: dialog.row.note ?? '',
                }
              : { code: '', kind: 'percent', value: '', validFrom: '', validUntil: '', maxUses: '', active: true, note: '' }
          }
          save={(v) => (dialog.row ? updateDiscountCodeAction(dialog.row.id, v) : createDiscountCodeAction(eventId, v))}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'deleteCategory' || dialog?.kind === 'deleteCode'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('deleteTitle')}
        description={
          dialog?.kind === 'deleteCategory' ? t('deleteCategoryText', { name: dialog.row.name }) : dialog?.kind === 'deleteCode' ? t('deleteCodeText', { name: dialog.row.code }) : ''
        }
        confirmLabel={t('delete')}
        destructive
        onConfirm={() => {
          if (dialog?.kind === 'deleteCategory') {
            const id = dialog.row.id;
            run(() => deletePriceCategoryAction(id), t('deleted'));
          } else if (dialog?.kind === 'deleteCode') {
            const id = dialog.row.id;
            run(() => deleteDiscountCodeAction(id), t('deleted'));
          }
          setDialog(null);
        }}
      />
    </div>
  );
}

function CategoryDialog({
  title,
  defaultValues,
  save,
  onClose,
}: {
  title: string;
  defaultValues: PriceCategoryFormValues;
  save: (v: PriceCategoryFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const t = useTranslations('pricing');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<PriceCategoryFormValues>({ resolver: zodResolver(priceCategoryFormSchema), defaultValues });
  const errors = form.formState.errors;
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <fieldset disabled={pending} className="space-y-4">
            <Field id="cat-name" label={t('categoryName')} hint={t('categoryNameHint')} error={fieldError(errors, 'name')}>
              <Input id="cat-name" {...form.register('name')} />
            </Field>
            <Field id="cat-price" label={t('priceGross')} error={fieldError(errors, 'price')}>
              <Input id="cat-price" inputMode="decimal" {...form.register('price')} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" {...form.register('active')} />
              {t('activeLabel')}
            </label>
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

function CodeDialog({
  title,
  defaultValues,
  save,
  onClose,
}: {
  title: string;
  defaultValues: DiscountCodeFormValues;
  save: (v: DiscountCodeFormValues) => Promise<ActionResult<unknown>>;
  onClose: () => void;
}) {
  const t = useTranslations('pricing');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<DiscountCodeFormValues>({ resolver: zodResolver(discountCodeFormSchema), defaultValues });
  const errors = form.formState.errors;
  const kind = useWatch({ control: form.control, name: 'kind' });
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
            <Field id="code-code" label={t('code')} hint={t('codeHint')} error={fieldError(errors, 'code')} className="sm:col-span-2">
              <Input id="code-code" className="font-mono uppercase" autoComplete="off" {...form.register('code')} />
            </Field>
            <Field id="code-kind" label={t('kind')} error={fieldError(errors, 'kind')}>
              <select id="code-kind" className={selectClass} {...form.register('kind')}>
                <option value="percent">{t('kindPercent')}</option>
                <option value="fixed">{t('kindFixed')}</option>
              </select>
            </Field>
            <Field id="code-value" label={kind === 'percent' ? t('valuePercent') : t('valueFixed')} error={fieldError(errors, 'value')}>
              <Input id="code-value" inputMode="decimal" {...form.register('value')} />
            </Field>
            <Field id="code-from" label={t('validFromLabel')} hint={t('optional')} error={fieldError(errors, 'validFrom')}>
              <Input id="code-from" type="datetime-local" {...form.register('validFrom')} />
            </Field>
            <Field id="code-until" label={t('validUntilLabel')} hint={t('optional')} error={fieldError(errors, 'validUntil')}>
              <Input id="code-until" type="datetime-local" {...form.register('validUntil')} />
            </Field>
            <Field id="code-max" label={t('maxUses')} hint={t('maxUsesHint')} error={fieldError(errors, 'maxUses')}>
              <Input id="code-max" inputMode="numeric" {...form.register('maxUses')} />
            </Field>
            <Field id="code-note" label={t('note')} hint={t('noteHint')} error={fieldError(errors, 'note')}>
              <Input id="code-note" {...form.register('note')} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" className="size-4" {...form.register('active')} />
              {t('activeLabel')}
            </label>
          </fieldset>
          <p className="text-xs text-muted-foreground">{t('codeRule')}</p>
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
