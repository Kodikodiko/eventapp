'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatEuro } from '@/lib/money';
import { bulkRefundSchema, type BulkRefundValues } from '@/lib/validation/refunds';
import { bulkRefundAction, previewBulkRefundAction } from '@/server/actions/refunds';
import type { BulkRefundPreview } from '@/server/services/bulk-refunds';
import { Field, fieldError } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

type Props = { ids: number[]; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void };

/**
 * Sammel-Erstattung: Einstellungen → Vorschau mit Beträgen je Person → „Sind Sie sicher?“ → Ausführung.
 * Mit Storno (Abmeldung/Eventabsage) oder als Teilerstattung ohne Storno.
 */
export function BulkRefundDialog({ ids, open, onOpenChange, onDone }: Props) {
  const t = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ values: BulkRefundValues; data: BulkRefundPreview } | null>(null);
  const form = useForm<BulkRefundValues>({
    resolver: zodResolver(bulkRefundSchema),
    defaultValues: { cancel: true, mode: 'rules', percent: '100', reason: '', notify: true, transferDone: false },
  });
  const cancel = useWatch({ control: form.control, name: 'cancel' });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const fmt = (c: number) => formatEuro(c, locale);

  function close(next: boolean) {
    if (!next) {
      setPreview(null);
      form.reset();
    }
    onOpenChange(next);
  }

  const onPreview = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await previewBulkRefundAction(ids, values);
      if (handle(result, { setError: form.setError })) setPreview({ values, data: result.data });
    })
  );

  function run() {
    if (!preview) return;
    startTransition(async () => {
      const result = await bulkRefundAction(ids, preview.values);
      if (!handle(result)) return;
      const r = result.data;
      toast({
        variant: r.failed > 0 ? 'destructive' : undefined,
        title: t('bulkRefundDone', { count: r.done, amount: fmt(r.refundedCents) }),
        description: [
          r.awaitingTransfer > 0 ? t('bulkRefundAwaiting', { count: r.awaitingTransfer }) : null,
          r.failed > 0 ? t('bulkRefundFailed', { count: r.failed }) : null,
          r.skipped > 0 ? t('bulkRefundSkipped', { count: r.skipped }) : null,
        ]
          .filter(Boolean)
          .join(' '),
      });
      close(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {preview ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('sureTitle')}</DialogTitle>
              <DialogDescription>
                {preview.values.cancel
                  ? t('bulkRefundSureCancel', { count: preview.data.count, amount: fmt(preview.data.totalRefundCents) })
                  : t('bulkRefundSureRefund', { count: preview.data.count, amount: fmt(preview.data.totalRefundCents) })}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t('colName')}</th>
                    <th className="px-3 py-2 text-right font-medium">%</th>
                    <th className="px-3 py-2 text-right font-medium">{t('cancelRefund')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.rows.map((r) => (
                    <tr key={r.registrationId} className={r.skip ? 'border-t text-muted-foreground' : 'border-t'}>
                      <td className="px-3 py-1.5">
                        {r.name}
                        {r.skip && <span className="block text-xs">{t(`bulkRefundSkip.${r.skip}`)}</span>}
                        {!r.skip && r.openCents > 0 && <span className="block text-xs text-muted-foreground">{t('bulkRefundFeeOpen', { amount: fmt(r.openCents) })}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.skip ? '–' : r.percent}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.skip ? '–' : fmt(r.refundCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {preview.values.transferDone ? <li>{t('sureTransferBooked')}</li> : <li>{t('bulkRefundTransferHint')}</li>}
              {preview.values.cancel && <li>{preview.values.notify ? t('bulkRefundMail') : t('sureNoMail')}</li>}
              <li>{t('sureHint')}</li>
            </ul>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={pending}>
                {t('back')}
              </Button>
              <Button type="button" variant={preview.values.cancel ? 'destructive' : 'default'} onClick={run} disabled={pending || preview.data.count === 0} autoFocus>
                {preview.values.cancel ? t('bulkRefundRunCancel', { count: preview.data.count }) : t('bulkRefundRun', { count: preview.data.count })}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <FormProvider {...form}>
            <form onSubmit={onPreview} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>{t('bulkRefundTitle', { count: ids.length })}</DialogTitle>
                <DialogDescription>{t('bulkRefundHint')}</DialogDescription>
              </DialogHeader>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('bulkRefundKind')}</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" className="mt-0.5 size-4" checked={cancel} onChange={() => form.setValue('cancel', true)} />
                  <span>
                    {t('bulkRefundKindCancel')}
                    <span className="block text-xs text-muted-foreground">{t('bulkRefundKindCancelHint')}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" className="mt-0.5 size-4" checked={!cancel} onChange={() => form.setValue('cancel', false)} />
                  <span>
                    {t('bulkRefundKindPartial')}
                    <span className="block text-xs text-muted-foreground">{t('bulkRefundKindPartialHint')}</span>
                  </span>
                </label>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('cancelPercent')}</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" value="rules" className="size-4" {...form.register('mode')} />
                  {t('bulkRefundModeRules')}
                </label>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="radio" value="percent" className="size-4" {...form.register('mode')} />
                  {t('bulkRefundModePercent')}
                  <Input
                    aria-label={t('cancelPercent')}
                    inputMode="numeric"
                    className={mode === 'percent' ? 'h-8 w-20' : 'h-8 w-20 opacity-50'}
                    // nicht „disabled“: react-hook-form würde den Wert sonst weglassen
                    readOnly={mode !== 'percent'}
                    onFocus={() => form.setValue('mode', 'percent')}
                    {...form.register('percent')}
                  />
                  %
                </label>
                {fieldError(form.formState.errors, 'percent') && mode === 'percent' && (
                  <p role="alert" className="text-xs text-destructive">
                    {t('bulkRefundPercentError')}
                  </p>
                )}
              </fieldset>
              <Field id="bulk-refund-reason" label={t('cancelReason')} hint={t('refundReasonHint')} error={fieldError(form.formState.errors, 'reason')}>
                <Textarea id="bulk-refund-reason" rows={2} {...form.register('reason')} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4" {...form.register('transferDone')} />
                <span>{t('transferDoneBulk')}</span>
              </label>
              {cancel && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" {...form.register('notify')} />
                  {t('cancelNotify')}
                </label>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  {t('back')}
                </Button>
                <Button type="submit" disabled={pending}>
                  {t('bulkRefundPreview')}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
