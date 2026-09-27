'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { organizerFormSchema, type OrganizerFormValues } from '@/lib/validation/forms';
import { saveOrganizerAction } from '@/server/actions/settings';
import { Field, fieldError, LocalizedFields } from './form-fields';
import { useActionFeedback } from './use-action-feedback';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** Veranstalterdaten für Rechnungen und USt-Modus. */
export function OrganizerForm({ defaultValues }: { defaultValues: OrganizerFormValues }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<OrganizerFormValues>({ resolver: zodResolver(organizerFormSchema), defaultValues, mode: 'onBlur' });
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = form;
  const vatMode = useWatch({ control, name: 'vatMode' });

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await saveOrganizerAction(values), { setError, success: t('saved') })) {
        form.reset(values);
        router.refresh();
      }
    })
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <fieldset disabled={pending} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="org-name" label={t('name')} error={fieldError(errors, 'name')}>
              <Input id="org-name" {...register('name')} />
            </Field>
            <Field id="org-email" label={t('contactEmail')} error={fieldError(errors, 'contactEmail')}>
              <Input id="org-email" type="email" {...register('contactEmail')} />
            </Field>
          </div>
          <Field id="org-address" label={t('address')} error={fieldError(errors, 'address')}>
            <Textarea id="org-address" rows={3} {...register('address')} />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="org-iban" label={t('iban')} error={fieldError(errors, 'iban')}>
              <Input id="org-iban" {...register('iban')} />
            </Field>
            <Field id="org-bic" label={t('bic')} error={fieldError(errors, 'bic')}>
              <Input id="org-bic" {...register('bic')} />
            </Field>
            <Field id="org-terms" label={t('paymentTermDays')} error={fieldError(errors, 'invoicePaymentTermDays')}>
              <Input id="org-terms" inputMode="numeric" {...register('invoicePaymentTermDays')} />
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="org-vatmode" label={t('vatMode')} hint={t('vatModeHint')} error={fieldError(errors, 'vatMode')}>
              <select id="org-vatmode" className={selectClass} {...register('vatMode')}>
                <option value="small_business">{t('vatSmallBusiness')}</option>
                <option value="standard">{t('vatStandard')}</option>
              </select>
            </Field>
            <Field id="org-vatid" label={t('vatId')} hint={vatMode === 'standard' ? t('vatIdRequiredHint') : undefined} error={fieldError(errors, 'vatId')}>
              <Input id="org-vatid" {...register('vatId')} />
            </Field>
          </div>
          {vatMode === 'small_business' && <LocalizedFields name="smallBusinessNote" label={t('smallBusinessNote')} />}
        </fieldset>
        <Button type="submit" disabled={pending || !isDirty}>
          {t('save')}
        </Button>
      </form>
    </FormProvider>
  );
}
