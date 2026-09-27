'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { eventFormSchema, VAT_RATE_OPTIONS, type EventFormValues } from '@/lib/validation/forms';
import { createEventAction, updateEventAction } from '@/server/actions/events';
import { Field, fieldError, LocalizedFields, useValidationMessage } from './form-fields';
import { useActionFeedback } from './use-action-feedback';

type Props = {
  mode: 'create' | 'edit';
  eventId?: number;
  defaultValues: EventFormValues;
  readOnly?: boolean;
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';

export function EventForm({ mode, eventId, defaultValues, readOnly }: Props) {
  const t = useTranslations('eventForm');
  const router = useRouter();
  const handle = useActionFeedback();
  const message = useValidationMessage();
  const [pending, startTransition] = useTransition();

  const form = useForm<EventFormValues>({ resolver: zodResolver(eventFormSchema), defaultValues, mode: 'onBlur' });
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = form;
  const rules = useFieldArray({ control, name: 'cancellationRules' });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result = mode === 'create' ? await createEventAction(values) : await updateEventAction(eventId!, values);
      if (handle(result, { setError, success: t('saved') })) {
        if (mode === 'create') {
          router.push(`/admin/events/${result.data.id}`);
        } else {
          form.reset(values);
          router.refresh();
        }
      }
    })
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <fieldset disabled={readOnly || pending} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('basics')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <LocalizedFields name="name" label={t('name')} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field id="slug" label={t('slug')} hint={t('slugHint')} error={fieldError(errors, 'slug')}>
                  <Input id="slug" autoComplete="off" {...register('slug')} />
                </Field>
                <Field id="location" label={t('location')} error={fieldError(errors, 'location')}>
                  <Input id="location" {...register('location')} />
                </Field>
              </div>
              <LocalizedFields name="description" label={t('description')} multiline deRequired={false} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('dates')}</CardTitle>
              <CardDescription>{t('datesHint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field id="startsAt" label={t('startsAt')} error={fieldError(errors, 'startsAt')}>
                <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
              </Field>
              <Field id="endsAt" label={t('endsAt')} error={fieldError(errors, 'endsAt')}>
                <Input id="endsAt" type="datetime-local" {...register('endsAt')} />
              </Field>
              <Field id="registrationOpensAt" label={t('registrationOpensAt')} hint={t('optionalNow')} error={fieldError(errors, 'registrationOpensAt')}>
                <Input id="registrationOpensAt" type="datetime-local" {...register('registrationOpensAt')} />
              </Field>
              <Field id="registrationClosesAt" label={t('registrationClosesAt')} hint={t('optionalStart')} error={fieldError(errors, 'registrationClosesAt')}>
                <Input id="registrationClosesAt" type="datetime-local" {...register('registrationClosesAt')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('capacityAndPrices')}</CardTitle>
              <CardDescription>{t('pricesHint')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field id="capacity" label={t('capacity')} hint={t('capacityHint')} error={fieldError(errors, 'capacity')}>
                <Input id="capacity" inputMode="numeric" {...register('capacity')} />
              </Field>
              <Field id="ticketVatRateBp" label={t('vatRate')} hint={t('vatRateHint')} error={fieldError(errors, 'ticketVatRateBp')}>
                <select id="ticketVatRateBp" className={selectClass} {...register('ticketVatRateBp')}>
                  {VAT_RATE_OPTIONS.map((bp) => (
                    <option key={bp} value={bp}>
                      {Number(bp) / 100} %
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="priceNormal" label={t('priceNormal')} error={fieldError(errors, 'priceNormal')}>
                <Input id="priceNormal" inputMode="decimal" {...register('priceNormal')} />
              </Field>
              <Field id="priceMember" label={t('priceMember')} error={fieldError(errors, 'priceMember')}>
                <Input id="priceMember" inputMode="decimal" {...register('priceMember')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('payment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" {...register('allowStripe')} />
                  {t('allowStripe')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" {...register('allowInvoice')} />
                  {t('allowInvoice')}
                </label>
                {fieldError(errors, 'allowStripe') && (
                  <p role="alert" className="text-xs text-destructive">
                    {message(fieldError(errors, 'allowStripe'))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('cancellation')}</CardTitle>
              <CardDescription>{t('cancellationHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="refundMode" label={t('refundMode')} error={fieldError(errors, 'refundMode')}>
                <select id="refundMode" className={selectClass} {...register('refundMode')}>
                  <option value="automatic">{t('refundAutomatic')}</option>
                  <option value="approval">{t('refundApproval')}</option>
                </select>
              </Field>
              <table className="w-full max-w-lg text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2 font-normal">{t('ruleDays')}</th>
                    <th className="pb-2 font-normal">{t('rulePercent')}</th>
                    <th className="sr-only">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.fields.map((field, i) => {
                    const daysErr = fieldError(errors, `cancellationRules.${i}.daysBeforeEvent`);
                    const pctErr = fieldError(errors, `cancellationRules.${i}.refundPercent`);
                    return (
                      <tr key={field.id} className="align-top">
                        <td className="pr-2 pb-2">
                          <Input aria-label={t('ruleDays')} inputMode="numeric" {...register(`cancellationRules.${i}.daysBeforeEvent`)} />
                          {daysErr && <p className="text-xs text-destructive">{message(daysErr)}</p>}
                        </td>
                        <td className="pr-2 pb-2">
                          <Input aria-label={t('rulePercent')} inputMode="numeric" {...register(`cancellationRules.${i}.refundPercent`)} />
                          {pctErr && <p className="text-xs text-destructive">{message(pctErr)}</p>}
                        </td>
                        <td className="pb-2">
                          <Button type="button" variant="ghost" size="icon" onClick={() => rules.remove(i)} aria-label={t('removeRule')}>
                            <Trash2 aria-hidden className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => rules.append({ daysBeforeEvent: '', refundPercent: '' })}
                disabled={rules.fields.length >= 10}
              >
                <Plus aria-hidden className="size-4" />
                {t('addRule')}
              </Button>
            </CardContent>
          </Card>
        </fieldset>

        {!readOnly && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || (mode === 'edit' && !isDirty)}>
              {pending ? t('saving') : mode === 'create' ? t('create') : t('save')}
            </Button>
            {Object.keys(errors).length > 0 && <p className="text-sm text-destructive">{t('fixErrors')}</p>}
          </div>
        )}
      </form>
    </FormProvider>
  );
}
