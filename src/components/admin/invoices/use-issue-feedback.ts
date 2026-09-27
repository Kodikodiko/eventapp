'use client';

import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import type { ActionResult } from '@/lib/action-result';
import type { IssueResult } from '@/server/actions/invoices';
import { useActionFeedback } from '../use-action-feedback';

/** Meldung nach dem Ausstellen eines Belegs: erstellt und versendet – oder erstellt, aber E-Mail gescheitert. */
export function useIssueFeedback() {
  const t = useTranslations('invoices');
  const tValidation = useTranslations('validation');
  const handle = useActionFeedback();
  const { toast } = useToast();
  return function report(result: ActionResult<IssueResult>, kind: 'invoice' | 'credit_note' = 'invoice'): boolean {
    if (!handle(result)) return false;
    const { number, mailed, mailError } = result.data;
    if (mailed) {
      toast({ title: t(kind === 'invoice' ? 'issuedAndSent' : 'creditIssuedAndSent', { number }) });
    } else {
      const key = mailError as Parameters<typeof tValidation>[0] | undefined;
      toast({
        variant: 'destructive',
        title: t(kind === 'invoice' ? 'issuedNotSent' : 'creditIssuedNotSent', { number }),
        description: key && tValidation.has(key) ? tValidation(key) : undefined,
      });
    }
    return true;
  };
}
