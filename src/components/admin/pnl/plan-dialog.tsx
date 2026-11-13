'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { localized } from '@/lib/localized';
import { centsToInput, formatEuro, parseEuroToCents } from '@/lib/money';
import { cn } from '@/lib/utils';
import { PLAN_PRICE_KEYS, PLAN_TICKET_KEYS, PLAN_VARIANT_KEYS, planFormSchema, type PlanFormValues, type PlanVariant } from '@/lib/validation/pnl';
import { savePlanAction } from '@/server/actions/pnl';
import type { CompareColumn, PlanValues, Pnl } from '@/server/services/pnl';
import { fieldError, useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

type Group = { id: number; name: string };

function toForm(plan: PlanValues, groups: Group[]): PlanFormValues {
  const n = (v: number) => (plan.exists ? String(v) : '');
  const price = (v: number | null) => (v === null ? '' : centsToInput(v));
  const budget = new Map(plan.budgets.map((b) => [b.costGroupId, b.amountCents]));
  return {
    tickets: { normal: n(plan.tickets.normal), member: n(plan.tickets.member), special: n(plan.tickets.special), free: n(plan.tickets.free) },
    prices: { normal: price(plan.prices.normal), member: price(plan.prices.member), special: price(plan.prices.special) },
    sponsorIncome: plan.exists ? centsToInput(plan.sponsorIncomeCents) : '',
    budgets: Object.fromEntries(groups.map((g) => [String(g.id), budget.has(g.id) ? centsToInput(budget.get(g.id)!) : ''])),
  };
}

/** Ist-Werte eines Vergleichs-Events als Ausgangspunkt für einen Plan. */
function fromCompare(c: CompareColumn, groups: Group[]): PlanFormValues {
  const count = (k: (typeof PLAN_TICKET_KEYS)[number]) => String(c.ticketCounts[k] ?? 0);
  const avg = (k: (typeof PLAN_PRICE_KEYS)[number]) => {
    const paying = c.ticketCounts[k] ?? 0;
    return paying > 0 && c.tickets[k] > 0 ? centsToInput(Math.round(c.tickets[k] / paying)) : '';
  };
  return {
    tickets: { normal: count('normal'), member: count('member'), special: count('special'), free: count('free') },
    prices: { normal: avg('normal'), member: avg('member'), special: avg('special') },
    sponsorIncome: centsToInput(Math.max(0, c.sponsorTotal)),
    budgets: Object.fromEntries(groups.map((g) => [String(g.id), c.groups[g.id] !== undefined ? centsToInput(Math.max(0, c.groups[g.id])) : ''])),
  };
}

type Props = { eventId: number; pnl: Pnl; initialVariant: PlanVariant; readOnly: boolean; onClose: () => void };

/** Plan der Erfolgsrechnung erfassen: je Variante Tickets, Sponsoren und Budget je Kostengruppe. */
export function PlanDialog({ eventId, pnl, initialVariant, readOnly, onClose }: Props) {
  const t = useTranslations('pnl');
  const [variant, setVariant] = useState<PlanVariant>(initialVariant);
  const groups = pnl.core.groups.map((g) => ({ id: g.id, name: g.name }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('planDialog.title')}</DialogTitle>
          <DialogDescription>{t('planDialog.intro')}</DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label={t('variantLabel')} className="inline-flex w-fit gap-1 rounded-lg bg-muted p-1">
          {PLAN_VARIANT_KEYS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={variant === v}
              onClick={() => setVariant(v)}
              className={cn(
                'h-8 w-28 rounded-md text-[13px] focus-visible:outline-2 focus-visible:outline-ring',
                variant === v ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t(`variant.${v}`)}
            </button>
          ))}
        </div>
        {/* alle drei Formulare bleiben eingehängt, damit Eingaben beim Wechsel der Variante nicht verloren gehen */}
        {PLAN_VARIANT_KEYS.map((v) => (
          <div key={v} role="tabpanel" hidden={variant !== v}>
            <PlanForm eventId={eventId} variant={v} pnl={pnl} groups={groups} readOnly={readOnly} onClose={onClose} />
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({ eventId, variant, pnl, groups, readOnly, onClose }: { eventId: number; variant: PlanVariant; pnl: Pnl; groups: Group[]; readOnly: boolean; onClose: () => void }) {
  const t = useTranslations('pnl');
  const locale = useLocale() as Locale;
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<PlanFormValues>({ resolver: zodResolver(planFormSchema), defaultValues: toForm(pnl.plans[variant].values, groups) });
  const errors = form.formState.errors;
  const values = useWatch({ control: form.control });
  const euro = (cents: number) => formatEuro(cents, locale);
  const reference = pnl.compare[0];

  // Summen aus den aktuellen Eingaben
  const cents = (v: string | undefined) => (v && v.trim() !== '' ? (parseEuroToCents(v) ?? 0) : null);
  const ticketSum = PLAN_PRICE_KEYS.reduce((s, k) => s + (Number(values.tickets?.[k]) || 0) * (cents(values.prices?.[k]) ?? pnl.eventPrices[k]), 0);
  const income = ticketSum + (cents(values.sponsorIncome) ?? 0);
  const expenses = Object.values(values.budgets ?? {}).reduce<number>((s, v) => s + (cents(v) ?? 0), 0);

  const onSubmit = form.handleSubmit((v) =>
    startTransition(async () => {
      if (handle(await savePlanAction(eventId, variant, v), { setError: form.setError, success: t('planDialog.saved', { variant: t(`variant.${variant}`) }) })) {
        form.reset(v);
        router.refresh();
      }
    })
  );

  const id = (name: string) => `plan-${variant}-${name}`;
  const err = (path: string) => {
    const m = message(fieldError(errors, path));
    return m ? (
      <p role="alert" className="mt-1 text-xs text-destructive">
        {m}
      </p>
    ) : null;
  };
  const th = 'pb-1.5 text-xs font-medium text-muted-foreground';
  const h3 = 'text-sm font-semibold';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset disabled={pending || readOnly} className="space-y-6">
        {!readOnly && pnl.compare.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pnl.compare.map((c) => (
              <Button key={c.eventId} type="button" variant="outline" size="sm" onClick={() => form.reset(fromCompare(c, groups), { keepDefaultValues: true })}>
                {t('planDialog.copyFrom', { name: localized(c.name, locale) })}
              </Button>
            ))}
          </div>
        )}

        <section className="space-y-2">
          <h3 className={h3}>{t('tickets')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={cn(th, 'text-left')}>
                  {t('planDialog.ticketType')}
                </th>
                <th scope="col" className={cn(th, 'w-28 text-left')}>
                  {t('planDialog.count')}
                </th>
                <th scope="col" className={cn(th, 'w-36 text-left')}>
                  {t('planDialog.price')}
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_TICKET_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    <label htmlFor={id(`count-${k}`)}>{t(`ticket.${k}`)}</label>
                  </th>
                  <td className="py-1 pr-3 align-top">
                    <Input id={id(`count-${k}`)} inputMode="numeric" placeholder="0" className="h-9" {...form.register(`tickets.${k}`)} />
                    {err(`tickets.${k}`)}
                  </td>
                  <td className="py-1 align-top">
                    {k !== 'free' && (
                      <>
                        <Input
                          aria-label={`${t('planDialog.price')} ${t(`ticket.${k}`)}`}
                          inputMode="decimal"
                          placeholder={centsToInput(pnl.eventPrices[k])}
                          className="h-9"
                          {...form.register(`prices.${k}`)}
                        />
                        {err(`prices.${k}`)}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">{t('planDialog.priceHint')}</p>
        </section>

        <section className="space-y-2">
          <h3 className={h3}>
            <label htmlFor={id('sponsors')}>{t('sponsors')}</label>
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <Input id={id('sponsors')} inputMode="decimal" placeholder="0,00" className="h-9 w-36" {...form.register('sponsorIncome')} />
            {reference && (
              <span className="text-xs text-muted-foreground">
                {t('planDialog.reference', { name: localized(reference.name, locale), amount: euro(reference.sponsorTotal) })}
              </span>
            )}
          </div>
          {err('sponsorIncome')}
        </section>

        <section className="space-y-2">
          <h3 className={h3}>{t('planDialog.budgets')}</h3>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('planDialog.noGroups')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" className={cn(th, 'text-left')}>
                    {t('planDialog.group')}
                  </th>
                  <th scope="col" className={cn(th, 'w-36 text-left')}>
                    {t('planDialog.budget')}
                  </th>
                  {reference && (
                    <th scope="col" className={cn(th, 'w-36 text-right')}>
                      {localized(reference.name, locale)}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      <label htmlFor={id(`budget-${g.id}`)}>{g.name}</label>
                    </th>
                    <td className="py-1 align-top">
                      <Input id={id(`budget-${g.id}`)} inputMode="decimal" placeholder="–" className="h-9" {...form.register(`budgets.${g.id}`)} />
                      {err(`budgets.${g.id}`)}
                    </td>
                    {reference && (
                      <td className="py-1 pl-3 text-right text-muted-foreground tabular-nums">{reference.groups[g.id] !== undefined ? euro(reference.groups[g.id]) : '–'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </fieldset>

      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
        {(
          [
            [t('income'), income],
            [t('expenses'), expenses],
            [t('row.result'), income - expenses],
          ] as const
        ).map(([name, value]) => (
          <div key={name}>
            <dt className="text-xs text-muted-foreground">{name}</dt>
            <dd className="font-semibold tabular-nums">{euro(value)}</dd>
          </div>
        ))}
      </dl>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('planDialog.close')}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            {t('planDialog.save', { variant: t(`variant.${variant}`) })}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
