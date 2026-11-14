'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { runRetentionAction } from '@/server/actions/gdpr';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';

/** Löschlauf sofort ausführen (läuft sonst einmal am Tag automatisch). */
export function RetentionRunButton() {
  const t = useTranslations('gdpr.retention');
  const router = useRouter();
  const handle = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    setOpen(false);
    startTransition(async () => {
      if (handle(await runRetentionAction(), { success: t('done') })) router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" disabled={pending} onClick={() => setOpen(true)}>
        {t('runNow')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('runTitle')}
        description={t('runText')}
        confirmLabel={t('runNow')}
        destructive
        onConfirm={run}
      />
    </>
  );
}
