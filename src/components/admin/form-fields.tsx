'use client';

import { useTranslations } from 'next-intl';
import { get, useFormContext, type FieldErrors, type FieldValues } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Übersetzt einen Validierungsschlüssel (z. B. "required") in eine Meldung. */
export function useValidationMessage() {
  const t = useTranslations('validation');
  return (key: string | undefined) => {
    if (!key) return undefined;
    // Schlüssel kommen aus den Zod-Schemas bzw. vom Server – unbekannte fallen auf „invalid“ zurück
    const k = key as Parameters<typeof t>[0];
    return t.has(k) ? t(k) : t('invalid');
  };
}

export function fieldError(errors: FieldErrors<FieldValues>, path: string): string | undefined {
  const e = get(errors, path);
  return typeof e?.message === 'string' ? e.message : undefined;
}

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
};

/** Beschriftung, Eingabe, Hinweis und Fehlermeldung eines Formularfelds. */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  const message = useValidationMessage()(error);
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !message && <p className="text-xs text-muted-foreground">{hint}</p>}
      {message && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

type LocalizedFieldsProps = {
  name: string;
  label: string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  /** Deutsch ist Pflicht (Standard) */
  deRequired?: boolean;
};

/** Zwei Eingaben für Deutsch (Pflicht) und Englisch (optional, Fallback auf Deutsch). */
export function LocalizedFields({ name, label, multiline, rows = 4, disabled, deRequired = true }: LocalizedFieldsProps) {
  const t = useTranslations('forms');
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const Control = multiline ? Textarea : Input;
  return (
    <fieldset className="grid gap-4 md:grid-cols-2" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <Field id={`${name}-de`} label={`${label} (${t('german')}${deRequired ? '' : `, ${t('optional')}`})`} error={fieldError(errors, `${name}.de`)}>
        <Control id={`${name}-de`} lang="de" {...(multiline ? { rows } : {})} {...register(`${name}.de`)} />
      </Field>
      <Field
        id={`${name}-en`}
        label={`${label} (${t('english')}, ${t('optional')})`}
        hint={t('englishFallback')}
        error={fieldError(errors, `${name}.en`)}
      >
        <Control id={`${name}-en`} lang="en" {...(multiline ? { rows } : {})} {...register(`${name}.en`)} />
      </Field>
    </fieldset>
  );
}
