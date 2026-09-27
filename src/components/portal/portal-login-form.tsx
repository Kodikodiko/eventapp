'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { portalLoginSchema, type PortalLoginValues } from '@/lib/validation/portal';
import { requestPortalLinkAction } from '@/server/actions/portal';
import { Field, fieldError } from '../admin/form-fields';

export function PortalLoginForm() {
  const t = useTranslations('portal');
  const tValidation = useTranslations('validation');
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PortalLoginValues>({ resolver: zodResolver(portalLoginSchema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(null);
      const r = await requestPortalLinkAction(values, locale);
      if (r.ok) setSentTo(values.email.trim());
      else setError(r.fieldErrors?._form === 'tooManyRequests' ? tValidation('tooManyRequests') : t('loginFailed'));
    })
  );

  if (sentTo) {
    return (
      <div role="status" className="flex gap-3 rounded-lg border bg-muted/40 p-4">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{t('linkSentTitle')}</p>
          <p>{t('linkSent', { email: sentTo })}</p>
          <Button variant="link" className="h-auto p-0" onClick={() => setSentTo(null)}>
            {t('tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="portal-email" label={t('email')} hint={t('emailHint')} error={fieldError(form.formState.errors, 'email')}>
          <Input id="portal-email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full">
          {t('sendLink')}
        </Button>
      </form>
    </FormProvider>
  );
}
