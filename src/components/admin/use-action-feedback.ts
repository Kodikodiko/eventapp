'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import type { ActionResult } from '@/lib/action-result';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Wertet das Ergebnis einer Server Action aus: Feldfehler ins Formular, sonst Meldung als Toast.
 * Ein Fehler für das ganze Formular (Schlüssel „_form“) erscheint als Beschreibung der Meldung.
 * Gibt true zurück, wenn die Aktion erfolgreich war.
 */
export function useActionFeedback() {
  const t = useTranslations('actionErrors');
  const tValidation = useTranslations('validation');
  const tCommon = useTranslations('forms');
  const { toast } = useToast();

  return function handle<T, F extends FieldValues>(
    result: ActionResult<T>,
    options: { setError?: UseFormSetError<F>; success?: string } = {}
  ): result is { ok: true; data: T } {
    if (result.ok) {
      if (options.success) toast({ title: options.success });
      return true;
    }
    const { _form: formError, ...fieldErrors } = result.fieldErrors ?? {};
    if (options.setError) {
      for (const [path, message] of Object.entries(fieldErrors)) {
        options.setError(path as Path<F>, { type: 'server', message });
      }
    }
    const formKey = formError as Parameters<typeof tValidation>[0] | undefined;
    toast({
      variant: 'destructive',
      title: tCommon('saveFailed'),
      description: formKey && tValidation.has(formKey) ? tValidation(formKey) : t.has(result.error) ? t(result.error) : t('UNEXPECTED'),
    });
    return false;
  };
}
