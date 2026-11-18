'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { eventPageFormSchema, type EventPageFormValues, MAX_HIGHLIGHTS, THEME_KEYS } from '@/lib/validation/event-page';
import { checkMediaFile, MEDIA_IMAGE_ACCEPT, mediaUrl } from '@/lib/validation/media';
import { saveEventPageAction } from '@/server/actions/event-page';
import { Field, fieldError, LocalizedFields, useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

type Props = {
  eventId: number;
  slug: string;
  readOnly: boolean;
  heroUrl: string | null;
  heroName: string | null;
  logoUrl: string | null;
  logoName: string | null;
  defaultValues: EventPageFormValues;
};

/** Standardfarben als Vorschau, wenn keine eigene Farbe gesetzt ist. */
const DEFAULT_COLORS: Record<(typeof THEME_KEYS)[number], string> = {
  primary: '#3A2A8C',
  dark: '#1F1A3D',
  accent: '#3A2A8C',
  surface: '#F0EEE8',
};

type Picked = { file: File | undefined; preview: string | null; error: string | undefined };
const NONE: Picked = { file: undefined, preview: null, error: undefined };

/** Motto, Farben, Logo, Titelbild und Nutzen-Blöcke der öffentlichen Eventseite. */
export function EventPageForm({ eventId, slug, readOnly, heroUrl, heroName, logoUrl, logoName, defaultValues }: Props) {
  const t = useTranslations('eventPage');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [fileKey, setFileKey] = useState(0);
  const form = useForm<EventPageFormValues>({ resolver: zodResolver(eventPageFormSchema), defaultValues });
  const removeHero = useWatch({ control: form.control, name: 'removeHero' });
  const removeLogo = useWatch({ control: form.control, name: 'removeLogo' });
  const highlights = useWatch({ control: form.control, name: 'highlights' });
  const theme = useWatch({ control: form.control, name: 'theme' });

  const pick = (key: string, f: File | undefined) =>
    setPicked((p) => ({ ...p, [key]: { file: f, preview: f ? URL.createObjectURL(f) : null, error: checkMediaFile(f) } }));
  const get = (key: string) => picked[key] ?? NONE;

  const onSubmit = form.handleSubmit((values) => {
    const checked = Object.fromEntries(Object.entries(picked).map(([k, p]) => [k, { ...p, error: checkMediaFile(p.file) }]));
    setPicked(checked);
    if (Object.values(checked).some((p) => p.error)) return;
    const data = new FormData();
    data.set('values', JSON.stringify(values));
    for (const [key, p] of Object.entries(checked)) if (p.file) data.set(key, p.file);
    startTransition(async () => {
      const result = await saveEventPageAction(eventId, data);
      if (!result.ok && result.fieldErrors) {
        const errors = result.fieldErrors;
        setPicked((p) => {
          const next = { ...p };
          if (errors.heroImage) next.heroImage = { ...get('heroImage'), error: errors.heroImage };
          if (errors.logo) next.logo = { ...get('logo'), error: errors.logo };
          for (let i = 0; i < MAX_HIGHLIGHTS; i++) {
            const e = errors[`highlights.${i}.icon`];
            if (e) next[`highlightIcon${i}`] = { ...get(`highlightIcon${i}`), error: e };
          }
          return next;
        });
      }
      if (handle(result, { setError: form.setError, success: t('saved') })) {
        setPicked({});
        setFileKey((k) => k + 1);
        router.refresh();
      }
    });
  });

  const fileInput = (key: string, id: string) => (
    <input
      key={`${key}-${fileKey}`}
      id={id}
      type="file"
      accept={MEDIA_IMAGE_ACCEPT}
      onChange={(e) => pick(key, e.target.files?.[0])}
      className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
    />
  );
  const fileHint = (key: string, hint: string) =>
    get(key).error ? (
      <p role="alert" className="text-xs text-destructive">
        {message(get(key).error)}
      </p>
    ) : (
      <p className="text-xs text-muted-foreground">{hint}</p>
    );

  const shownHero = get('heroImage').preview ?? (removeHero ? null : heroUrl);
  const shownLogo = get('logo').preview ?? (removeLogo ? null : logoUrl);
  const color = (key: (typeof THEME_KEYS)[number]) => theme?.[key] || DEFAULT_COLORS[key];

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>{t('headerTitle')}</CardTitle>
              <CardDescription>{t('headerIntro')}</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/events/${slug}`} target="_blank">
                <ExternalLink aria-hidden className="size-4" />
                {t('viewPage')}
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <fieldset disabled={pending || readOnly} className="space-y-6">
              <LocalizedFields name="tagline" label={t('tagline')} deRequired={false} />
              <div className="space-y-2">
                <label htmlFor="hero-image" className="text-sm font-medium">
                  {t('heroImage')}
                </label>
                <div
                  className="relative flex aspect-[16/5] w-full max-w-2xl items-center justify-center overflow-hidden rounded-lg border bg-cover bg-center text-sm"
                  style={{ backgroundColor: color('dark'), backgroundImage: shownHero ? `url(${shownHero})` : undefined }}
                >
                  {shownHero && <span aria-hidden className="absolute inset-0 opacity-50" style={{ backgroundColor: color('primary') }} />}
                  {shownLogo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shownLogo} alt="" className="absolute top-3 left-3 h-10 w-auto" />
                  )}
                  {!shownHero && <span className="relative text-white/80">{t('heroNone')}</span>}
                </div>
                {heroName && !get('heroImage').preview && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" {...form.register('removeHero')} />
                    {t('heroRemove', { name: heroName })}
                  </label>
                )}
                {fileInput('heroImage', 'hero-image')}
                {fileHint('heroImage', t('heroHint'))}
              </div>
              <div className="space-y-2">
                <label htmlFor="event-logo" className="text-sm font-medium">
                  {t('logo')}
                </label>
                {logoName && !get('logo').preview && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" {...form.register('removeLogo')} />
                    {t('logoRemove', { name: logoName })}
                  </label>
                )}
                {fileInput('logo', 'event-logo')}
                {fileHint('logo', t('logoHint'))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('colorsTitle')}</CardTitle>
            <CardDescription>{t('colorsIntro')}</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={pending || readOnly} className="grid gap-4 sm:grid-cols-2">
              {THEME_KEYS.map((key) => (
                <Field
                  key={key}
                  id={`theme-${key}`}
                  label={t(`color_${key}`)}
                  hint={t(`color_${key}_hint`)}
                  error={fieldError(form.formState.errors, `theme.${key}`)}
                >
                  <Controller
                    control={form.control}
                    name={`theme.${key}`}
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={t(`color_${key}`)}
                          value={field.value || DEFAULT_COLORS[key]}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                        />
                        <Input
                          id={`theme-${key}`}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder={t('colorDefault')}
                          className="font-mono uppercase"
                          maxLength={7}
                        />
                        {field.value && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange('')}>
                            {t('colorReset')}
                          </Button>
                        )}
                      </div>
                    )}
                  />
                </Field>
              ))}
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('highlightsTitle')}</CardTitle>
            <CardDescription>{t('highlightsIntro')}</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={pending || readOnly} className="space-y-6">
              {Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => {
                const key = `highlightIcon${i}`;
                const current = highlights?.[i]?.iconPath ?? null;
                const icon = get(key).preview ?? mediaUrl(current);
                return (
                  <div key={i} className="space-y-3 rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">{t('highlightN', { n: i + 1 })}</h3>
                    <LocalizedFields name={`highlights.${i}.title`} label={t('highlightTitle')} deRequired={false} />
                    <LocalizedFields name={`highlights.${i}.text`} label={t('highlightText')} multiline rows={2} deRequired={false} />
                    <div className="space-y-2">
                      <label htmlFor={`highlight-icon-${i}`} className="text-sm font-medium">
                        {t('highlightIcon')}
                      </label>
                      <div className="flex items-center gap-3">
                        <span className={cn('flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted')}>
                          {icon && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={icon} alt="" className="size-full object-cover" />
                          )}
                        </span>
                        {current && !get(key).preview && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => form.setValue(`highlights.${i}.iconPath`, null, { shouldDirty: true })}
                          >
                            {t('highlightIconRemove')}
                          </Button>
                        )}
                      </div>
                      {fileInput(key, `highlight-icon-${i}`)}
                      {fileHint(key, t('highlightIconHint'))}
                    </div>
                  </div>
                );
              })}
            </fieldset>
            {!readOnly && (
              <div className="mt-6 border-t pt-4">
                <Button type="submit" disabled={pending}>
                  {t('save')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    </FormProvider>
  );
}
