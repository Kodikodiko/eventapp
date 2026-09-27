'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action-result';
import { registrationCreateSchema, type RegistrationCreateValues } from '@/lib/validation/registrations';
import { createRegistrationAction, updateRegistrationAction } from '@/server/actions/registrations';
import { Field, fieldError, useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';
import type { RoleOption } from './attendees-table';

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  prices: { normal: string; member: string };
  seatsFree: number;
} & (
  | { mode: 'create'; eventId: number }
  | { mode: 'edit'; registrationId: number; defaultValues: Omit<RegistrationCreateValues, 'status' | 'overbook'>; priceLocked: boolean }
);

export function RegistrationFormDialog(props: Props) {
  const { open, onOpenChange, roles, prices, seatsFree, mode } = props;
  const t = useTranslations('registrationForm');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();

  const defaults: RegistrationCreateValues =
    mode === 'edit'
      ? { ...props.defaultValues, status: 'confirmed', overbook: false }
      : {
          firstName: '',
          lastName: '',
          email: '',
          company: '',
          locale: 'de',
          roles: ['attendee'],
          ticketType: 'normal',
          price: prices.normal,
          billingCompany: '',
          billingAddress: '',
          status: seatsFree > 0 ? 'confirmed' : 'waitlisted',
          overbook: false,
        };

  const form = useForm<RegistrationCreateValues>({
    // Beim Bearbeiten gibt es Status/Überbuchung nicht; das Update-Schema ignoriert diese Felder
    // Beim Bearbeiten sind Status/Überbuchung fest vorbelegt; die Update-Action ignoriert diese Felder
    resolver: zodResolver(registrationCreateSchema),
    defaultValues: defaults,
  });
  const {
    register,
    control,
    setValue,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = form;
  const status = useWatch({ control, name: 'status' });
  const priceLocked = mode === 'edit' && props.priceLocked;

  function close(next: boolean) {
    if (!next) reset(defaults);
    onOpenChange(next);
  }

  const onSubmit = handleSubmit((values) =>
    startTransition(async () => {
      const result: ActionResult<unknown> =
        mode === 'create'
          ? await createRegistrationAction(props.eventId, values)
          : await updateRegistrationAction(props.registrationId, values);
      if (handle(result, { setError, success: mode === 'create' ? t('created') : t('saved') })) {
        close(false);
        router.refresh();
      }
    })
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{mode === 'create' ? t('createTitle') : t('editTitle')}</DialogTitle>
              {mode === 'create' && <DialogDescription>{t('createHint')}</DialogDescription>}
            </DialogHeader>
            <fieldset disabled={pending} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="reg-first" label={t('firstName')} error={fieldError(errors, 'firstName')}>
                  <Input id="reg-first" autoComplete="off" {...register('firstName')} />
                </Field>
                <Field id="reg-last" label={t('lastName')} error={fieldError(errors, 'lastName')}>
                  <Input id="reg-last" autoComplete="off" {...register('lastName')} />
                </Field>
                <Field id="reg-email" label={t('email')} error={fieldError(errors, 'email')}>
                  <Input id="reg-email" type="email" autoComplete="off" {...register('email')} />
                </Field>
                <Field id="reg-company" label={t('company')} error={fieldError(errors, 'company')}>
                  <Input id="reg-company" {...register('company')} />
                </Field>
                <Field id="reg-locale" label={t('locale')} hint={t('localeHint')} error={fieldError(errors, 'locale')}>
                  <select id="reg-locale" className={selectClass} {...register('locale')}>
                    <option value="de">{t('localeDe')}</option>
                    <option value="en">{t('localeEn')}</option>
                  </select>
                </Field>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('roles')}</legend>
                <div className="flex flex-wrap gap-4">
                  {roles.map((r) => (
                    <label key={r.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" value={r.key} className="size-4" {...register('roles')} />
                      {r.label}
                    </label>
                  ))}
                </div>
                {fieldError(errors, 'roles') && (
                  <p role="alert" className="text-xs text-destructive">
                    {message(fieldError(errors, 'roles'))}
                  </p>
                )}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="reg-ticket" label={t('ticketType')} error={fieldError(errors, 'ticketType')}>
                  <select
                    id="reg-ticket"
                    className={selectClass}
                    disabled={priceLocked}
                    {...register('ticketType', {
                      onChange: (e) => setValue('price', e.target.value === 'member' ? prices.member : prices.normal),
                    })}
                  >
                    <option value="normal">{t('ticketNormal')}</option>
                    <option value="member">{t('ticketMember')}</option>
                  </select>
                </Field>
                <Field
                  id="reg-price"
                  label={t('price')}
                  hint={priceLocked ? t('priceLocked') : t('priceHint')}
                  error={fieldError(errors, 'price')}
                >
                  <Input id="reg-price" inputMode="decimal" readOnly={priceLocked} {...register('price')} />
                </Field>
                <Field id="reg-billing-company" label={t('billingCompany')} error={fieldError(errors, 'billingCompany')}>
                  <Input id="reg-billing-company" {...register('billingCompany')} />
                </Field>
                <Field id="reg-billing-address" label={t('billingAddress')} error={fieldError(errors, 'billingAddress')}>
                  <Textarea id="reg-billing-address" rows={3} {...register('billingAddress')} />
                </Field>
              </div>

              {mode === 'create' && (
                <div className="space-y-2">
                  <Field id="reg-status" label={t('status')} error={fieldError(errors, 'status')}>
                    <select id="reg-status" className={selectClass} {...register('status')}>
                      <option value="confirmed">{t('statusConfirmed')}</option>
                      <option value="waitlisted">{t('statusWaitlisted')}</option>
                    </select>
                  </Field>
                  {status === 'confirmed' && seatsFree <= 0 && (
                    <label className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                      <input type="checkbox" className="size-4" {...register('overbook')} />
                      {t('overbook')}
                    </label>
                  )}
                </div>
              )}
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={pending}>
                {mode === 'create' ? t('create') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
