'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import type { ActionResult } from '@/lib/action-result';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Wertet das Ergebnis einer Server Action aus: Feldfehler ins Formular, sonst Meldung als Toast.
 * Gibt true zurück, wenn die Aktion erfolgreich war.
 */
export function useActionFeedback() {
  const t = useTranslations('actionErrors');
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
    if (result.fieldErrors && options.setError) {
      for (const [path, message] of Object.entries(result.fieldErrors)) {
        options.setError(path as Path<F>, { type: 'server', message });
      }
    }
    toast({
      variant: 'destructive',
      title: tCommon('saveFailed'),
      description: t.has(result.error) ? t(result.error) : t('UNEXPECTED'),
    });
    return false;
  };
}
