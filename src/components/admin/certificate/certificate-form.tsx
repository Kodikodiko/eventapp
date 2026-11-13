'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  CERTIFICATE_IMAGE_ACCEPT,
  certificateFormSchema,
  certificateImageExtension,
  type CertificateFormValues,
  MAX_CERTIFICATE_IMAGE_BYTES,
} from '@/lib/validation/certificates';
import { saveCertificateAction } from '@/server/actions/certificates';
import { Field, fieldError, LocalizedFields, useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

export function CertificateForm({
  eventId,
  readOnly,
  imageName,
  defaultValues,
}: {
  eventId: number;
  readOnly: boolean;
  imageName: string | null;
  defaultValues: CertificateFormValues;
}) {
  const t = useTranslations('certificate');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | undefined>();
  const [fileError, setFileError] = useState<string | undefined>();
  const [fileKey, setFileKey] = useState(0);
  const form = useForm<CertificateFormValues>({ resolver: zodResolver(certificateFormSchema), defaultValues });
  const errors = form.formState.errors;
  const removeImage = useWatch({ control: form.control, name: 'removeImage' });
  const color = useWatch({ control: form.control, name: 'textColor' });

  function checkFile(f: File | undefined): string | undefined {
    if (!f) return undefined;
    if (!certificateImageExtension(f.name)) return 'imageType';
    if (f.size === 0 || f.size > MAX_CERTIFICATE_IMAGE_BYTES) return 'imageTooLarge';
    return undefined;
  }

  const onSubmit = form.handleSubmit((values) => {
    const problem = checkFile(file);
    setFileError(problem);
    if (problem) return;
    const data = new FormData();
    data.set('values', JSON.stringify(values));
    if (file) data.set('image', file);
    startTransition(async () => {
      const result = await saveCertificateAction(eventId, data);
      if (!result.ok && result.fieldErrors?.image) setFileError(result.fieldErrors.image);
      if (handle(result, { setError: form.setError, success: t('saved') })) {
        setFile(undefined);
        setFileKey((k) => k + 1);
        form.reset(values.removeImage ? { ...values, removeImage: false } : values);
        router.refresh();
      }
    });
  });

  const preview = (locale: 'de' | 'en') => `/api/export/certificates?event=${eventId}&preview=${locale}`;

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>{t('templateTitle')}</CardTitle>
            <CardDescription>{t('intro')}</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={pending || readOnly} className="space-y-6">
              <div className="space-y-1.5">
                <label htmlFor="cert-image" className="text-sm font-medium">
                  {t('image')}
                </label>
                {imageName && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={cn('inline-flex items-center gap-1', removeImage && 'line-through opacity-60')}>
                      <ImageIcon aria-hidden className="size-4" />
                      {t('imageCurrent', { name: imageName })}
                    </span>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" className="size-4" {...form.register('removeImage')} />
                      {t('imageRemove')}
                    </label>
                  </div>
                )}
                <input
                  key={fileKey}
                  id="cert-image"
                  type="file"
                  accept={CERTIFICATE_IMAGE_ACCEPT}
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
                  <p className="text-xs text-muted-foreground">{t('imageHint')}</p>
                )}
              </div>

              <LocalizedFields name="heading" label={t('heading')} />
              <LocalizedFields name="body" label={t('body')} multiline rows={5} />
              <p className="-mt-3 text-xs text-muted-foreground">{t('placeholders')}</p>

              <Field id="cert-color" label={t('textColor')} hint={t('textColorHint')} error={fieldError(errors, 'textColor')} className="max-w-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('textColor')}
                    value={/^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color : '#000000'}
                    onChange={(e) => form.setValue('textColor', e.target.value, { shouldDirty: true, shouldValidate: true })}
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
                  />
                  <Input id="cert-color" className="font-mono" {...form.register('textColor')} />
                </div>
              </Field>
            </fieldset>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4">
              {!readOnly && (
                <Button type="submit" disabled={pending}>
                  {t('save')}
                </Button>
              )}
              <Button asChild variant="outline">
                <a href={preview('de')} target="_blank" rel="noopener">
                  <Eye aria-hidden className="size-4" />
                  {t('previewDe')}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={preview('en')} target="_blank" rel="noopener">
                  <Eye aria-hidden className="size-4" />
                  {t('previewEn')}
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">{form.formState.isDirty || file ? t('previewUnsaved') : t('usage')}</span>
            </div>
          </CardContent>
        </Card>
      </form>
    </FormProvider>
  );
}
