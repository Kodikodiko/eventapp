'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Clock, Hourglass } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { Field, fieldError, useValidationMessage } from '@/components/admin/form-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatEuro } from '@/lib/money';
import {
  publicRegistrationSchema,
  type PublicPaymentMethod,
  type PublicRegistrationValues,
} from '@/lib/validation/public-registration';
import { quotePriceAction, registerPublicAction, type PublicRegistrationOutcome } from '@/server/actions/public-registration';

type Quote = { priceCents: number; ticketType: 'normal' | 'member'; memberCheck: 'none' | 'valid' | 'invalid'; /** Nummer|Nachname, für die der Preis gilt */ key: string };

const TOP_ID = 'registration-top';
const scrollToTop = () => document.getElementById(TOP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

type Props = {
  event: { id: number; slug: string; name: string; priceNormalCents: number; priceMemberCents: number };
  waitlistOnly: boolean;
  paymentMethods: PublicPaymentMethod[];
  termsDocumentId: number;
  privacyDocumentId: number;
  paymentTermDays: number;
};

const checkboxClass = 'mt-0.5 size-4 shrink-0 accent-primary';

export function RegistrationForm({ event, waitlistOnly, paymentMethods, termsDocumentId, privacyDocumentId, paymentTermDays }: Props) {
  const t = useTranslations('publicForm');
  const tAction = useTranslations('actionErrors');
  const validation = useValidationMessage();
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const normal: Quote = { priceCents: event.priceNormalCents, ticketType: 'normal', memberCheck: 'none', key: '|' };
  const [quote, setQuote] = useState<Quote>(normal);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicRegistrationOutcome | null>(null);

  const form = useForm<PublicRegistrationValues>({
    resolver: zodResolver(publicRegistrationSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      company: '',
      memberNumber: '',
      paymentMethod: paymentMethods.length === 1 ? paymentMethods[0] : '',
      billingCompany: '',
      billingAddress: '',
      acceptTerms: false,
      acceptPrivacy: false,
      photoConsent: false,
      newsletter: false,
      website: '',
    },
  });
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = form;
  const paymentMethod = useWatch({ control, name: 'paymentMethod' });
  const memberNumber = useWatch({ control, name: 'memberNumber' });
  const needsPayment = quote.priceCents > 0;
  const memberPriceDiffers = event.priceMemberCents !== event.priceNormalCents;

  /** Preis beim Server erfragen; gibt den neuen Preis zurück (null bei Fehler). */
  async function refreshQuote(force = false): Promise<Quote | null> {
    const number = getValues('memberNumber').trim();
    const lastName = getValues('lastName').trim();
    const key = `${number}|${lastName.toLowerCase()}`;
    if (!force && key === quote.key) return quote;
    if (!number) {
      const q = { ...normal, key };
      setQuote(q);
      return q;
    }
    const res = await quotePriceAction({ eventId: event.id, memberNumber: number, lastName });
    if (!res.ok) {
      setFormError(res.fieldErrors?._form ? validation(res.fieldErrors._form)! : tAction(res.error));
      return null;
    }
    const q = { ...res.data, key };
    setQuote(q);
    return q;
  }

  function showError(message: string) {
    setFormError(message);
    scrollToTop();
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const shown = quote.priceCents;
      const current = await refreshQuote();
      if (!current) return;
      if (current.priceCents !== shown) {
        showError(validation('priceChanged')!);
        return;
      }
      if (current.priceCents === 0 && values.paymentMethod) values = { ...values, paymentMethod: '' };
      const res = await registerPublicAction(
        { eventId: event.id, termsDocumentId, privacyDocumentId, expectedPriceCents: current.priceCents, locale },
        values
      );
      if (res.ok) {
        if (res.data.checkoutUrl) {
          window.location.assign(res.data.checkoutUrl);
          return;
        }
        setResult(res.data);
        scrollToTop();
        return;
      }
      const { _form: general, ...fields } = res.fieldErrors ?? {};
      for (const [path, message] of Object.entries(fields)) setError(path as keyof PublicRegistrationValues, { type: 'server', message });
      if (general === 'priceChanged') await refreshQuote(true);
      showError(general ? validation(general)! : tAction(Object.keys(fields).length > 0 ? 'INVALID' : res.error));
    });
  });

  if (result) return <RegistrationDone result={result} event={event} paymentTermDays={paymentTermDays} />;

  return (
    <FormProvider {...form}>
      <div id={TOP_ID} className="scroll-mt-6" />
      <form onSubmit={onSubmit} noValidate className="space-y-8">
        {formError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        {waitlistOnly && (
          <Alert>
            <Hourglass className="size-4" />
            <AlertTitle>{t('waitlistTitle')}</AlertTitle>
            <AlertDescription>{t('waitlistHint')}</AlertDescription>
          </Alert>
        )}

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-lg font-semibold">{t('personTitle')}</legend>
          <Field id="firstName" label={t('firstName')} error={fieldError(errors, 'firstName')}>
            <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field id="lastName" label={t('lastName')} error={fieldError(errors, 'lastName')}>
            <Input id="lastName" autoComplete="family-name" {...register('lastName', { onBlur: () => memberNumber && startTransition(async () => void (await refreshQuote())) })} />
          </Field>
          <Field id="email" label={t('email')} hint={t('emailHint')} error={fieldError(errors, 'email')} className="sm:col-span-2">
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field id="company" label={t('companyOptional')} error={fieldError(errors, 'company')} className="sm:col-span-2">
            <Input id="company" autoComplete="organization" {...register('company')} />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-semibold">{t('ticketTitle')}</legend>
          {memberPriceDiffers && (
            <Field id="memberNumber" label={t('memberNumber')} hint={t('memberNumberHint')} error={fieldError(errors, 'memberNumber')}>
              <Input id="memberNumber" autoComplete="off" {...register('memberNumber', { onBlur: () => startTransition(async () => void (await refreshQuote())) })} />
            </Field>
          )}
          <div className="rounded-lg border bg-muted/40 p-4" aria-live="polite">
            <p className="flex items-baseline justify-between gap-4">
              <span>{quote.ticketType === 'member' ? t('priceMember') : t('priceNormal')}</span>
              <span className="text-xl font-semibold">{quote.priceCents === 0 ? t('free') : formatEuro(quote.priceCents, locale)}</span>
            </p>
            {quote.memberCheck === 'valid' && <p className="mt-1 text-sm text-green-700 dark:text-green-400">{t('memberValid')}</p>}
            {quote.memberCheck === 'invalid' && <p className="mt-1 text-sm text-destructive">{t('memberInvalid')}</p>}
          </div>
        </fieldset>

        {needsPayment && (
          <fieldset className="space-y-4">
            <legend className="mb-3 text-lg font-semibold">{t('paymentTitle')}</legend>
            <div role="radiogroup" aria-describedby={errors.paymentMethod ? 'paymentMethod-error' : undefined} className="space-y-2">
              {paymentMethods.map((m) => (
                <label key={m} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary">
                  <input type="radio" value={m} className={checkboxClass} {...register('paymentMethod')} />
                  <span>
                    <span className="font-medium">{t(`method.${m}`)}</span>
                    <span className="block text-sm text-muted-foreground">
                      {m === 'invoice' ? t('method.invoiceHint', { days: paymentTermDays }) : t('method.stripeHint')}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {errors.paymentMethod && (
              <p id="paymentMethod-error" role="alert" className="text-xs text-destructive">
                {validation(errors.paymentMethod.message)}
              </p>
            )}
            {paymentMethod === 'invoice' && (
              <div className="grid gap-4">
                <Field id="billingCompany" label={t('billingCompany')} error={fieldError(errors, 'billingCompany')}>
                  <Input
                    id="billingCompany"
                    autoComplete="organization"
                    {...register('billingCompany')}
                    onFocus={() => !getValues('billingCompany') && setValue('billingCompany', getValues('company'))}
                  />
                </Field>
                <Field id="billingAddress" label={t('billingAddress')} hint={t('billingAddressHint')} error={fieldError(errors, 'billingAddress')}>
                  <Textarea id="billingAddress" rows={3} autoComplete="street-address" {...register('billingAddress')} />
                </Field>
              </div>
            )}
          </fieldset>
        )}

        <fieldset className="space-y-3">
          <legend className="mb-3 text-lg font-semibold">{t('consentTitle')}</legend>
          <Consent name="acceptTerms" error={fieldError(errors, 'acceptTerms')}>
            {t.rich('acceptTerms', {
              link: (chunks) => (
                <Link href={`/events/${event.slug}/terms`} target="_blank" className="underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </Consent>
          <Consent name="acceptPrivacy" error={fieldError(errors, 'acceptPrivacy')}>
            {t.rich('acceptPrivacy', {
              link: (chunks) => (
                <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </Consent>
          <p className="pt-2 text-sm text-muted-foreground">{t('optionalConsents')}</p>
          <Consent name="photoConsent">{t('photoConsent')}</Consent>
          <Consent name="newsletter">{t('newsletter')}</Consent>
        </fieldset>

        {/* Honeypot: für Menschen unsichtbar */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </div>

        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          {pending ? t('submitting') : waitlistOnly ? t('submitWaitlist') : t('submit')}
        </Button>
      </form>
    </FormProvider>
  );
}

function Consent({ name, error, children }: { name: 'acceptTerms' | 'acceptPrivacy' | 'photoConsent' | 'newsletter'; error?: string; children: React.ReactNode }) {
  const validation = useValidationMessage();
  const { register } = useFormContext<PublicRegistrationValues>();
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" className={checkboxClass} aria-invalid={Boolean(error)} {...register(name)} />
        <span>{children}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 pl-7 text-xs text-destructive">
          {validation(error)}
        </p>
      )}
    </div>
  );
}

function RegistrationDone({
  result,
  event,
  paymentTermDays,
}: {
  result: PublicRegistrationOutcome;
  event: Props['event'];
  paymentTermDays: number;
}) {
  const t = useTranslations('publicForm');
  const locale = useLocale() as Locale;
  const Icon = result.status === 'confirmed' ? CheckCircle2 : result.status === 'reserved' ? Clock : Hourglass;
  const price = result.priceCents === 0 ? t('free') : formatEuro(result.priceCents, locale);
  return (
    <div id={TOP_ID} className="scroll-mt-6 space-y-4 rounded-lg border p-6" role="status">
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <Icon className="size-6 text-primary" aria-hidden />
        {t(`done.${result.status}.title`)}
      </h2>
      <p>{t(`done.${result.status}.text`, { event: event.name })}</p>
      <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">{t('done.ticket')}</dt>
        <dd>
          {result.ticketType === 'member' ? t('priceMember') : t('priceNormal')} · {price}
        </dd>
        {result.paymentMethod !== 'free' && (
          <>
            <dt className="text-muted-foreground">{t('done.payment')}</dt>
            <dd>{t(`method.${result.paymentMethod}`)}</dd>
          </>
        )}
      </dl>
      {result.memberCheck === 'invalid' && <p className="text-sm">{t('done.memberInvalid')}</p>}
      {result.status === 'confirmed' && result.paymentMethod === 'invoice' && <p>{t('done.invoiceNext', { days: paymentTermDays })}</p>}
      {result.status === 'waitlisted' && <p>{t('done.waitlistNext')}</p>}
      <p className="text-sm text-muted-foreground">{t('done.emailNote')}</p>
      <Link href={`/events/${event.slug}`} className="inline-block text-sm underline underline-offset-4">
        {t('done.back')}
      </Link>
    </div>
  );
}
