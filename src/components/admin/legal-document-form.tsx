'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action-result';
import { legalDocumentFormSchema, type LegalDocumentFormValues } from '@/lib/validation/forms';
import { LocalizedFields } from './form-fields';
import { useActionFeedback } from './use-action-feedback';

type Props = {
  defaultValues: LegalDocumentFormValues;
  /** Server Action, die eine neue Version veröffentlicht */
  publish: (values: LegalDocumentFormValues) => Promise<ActionResult<{ version: number }>>;
  disabled?: boolean;
};

/** Neue Version eines Rechtstexts (AGB oder Datenschutzerklärung) veröffentlichen. */
export function LegalDocumentForm({ defaultValues, publish, disabled }: Props) {
  const t = useTranslations('legalForm');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<LegalDocumentFormValues>({ resolver: zodResolver(legalDocumentFormSchema), defaultValues });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await publish(values);
      if (handle(result, { setError: form.setError, success: result.ok ? t('published', { version: result.data.version }) : undefined })) {
        form.reset(values);
        router.refresh();
      }
    })
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <LocalizedFields name="content" label={t('content')} multiline rows={12} disabled={disabled || pending} />
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
        <Button type="submit" disabled={disabled || pending || !form.formState.isDirty}>
          {pending ? t('publishing') : t('publish')}
        </Button>
      </form>
    </FormProvider>
  );
}
