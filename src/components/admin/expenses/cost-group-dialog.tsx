'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action-result';
import { costGroupFormSchema, type CostGroupFormValues } from '@/lib/validation/expenses';
import { Field, fieldError, useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

/** Anlegen/Bearbeiten einer Kostengruppe – für Vorlagen und für Kostengruppen eines Events. */
export function CostGroupDialog({
  title,
  defaultValues,
  save,
  success,
  onClose,
}: {
  title: string;
  defaultValues: CostGroupFormValues;
  save: (v: CostGroupFormValues) => Promise<ActionResult<unknown>>;
  success: string;
  onClose: () => void;
}) {
  const t = useTranslations('expenses');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<CostGroupFormValues>({ resolver: zodResolver(costGroupFormSchema), defaultValues });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await save(values), { setError: form.setError, success })) {
        onClose();
        router.refresh();
      }
    })
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <fieldset disabled={pending} className="space-y-4">
            <Field id="cg-name" label={t('name')} error={fieldError(errors, 'name')}>
              <Input id="cg-name" autoFocus {...form.register('name')} />
            </Field>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" {...form.register('speakerLink')} />
                {t('speakerLink')}
              </label>
              <p className="text-xs text-muted-foreground">{t('speakerLinkHint')}</p>
              {fieldError(errors, 'speakerLink') && (
                <p role="alert" className="text-xs text-destructive">
                  {message(fieldError(errors, 'speakerLink'))}
                </p>
              )}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
