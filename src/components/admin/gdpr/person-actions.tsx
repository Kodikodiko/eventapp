'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { erasePersonAction, liftRestrictionAction, restrictPersonAction } from '@/server/actions/gdpr';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';

type Props = {
  personId: number;
  restricted: boolean;
  anonymized: boolean;
  /** Löschen ist blockiert (laufende Anmeldung, offene Erstattung) */
  eraseBlocked: boolean;
  retainedInvoices: number;
  locale: string;
};

/** Auskunft herunterladen, Verarbeitung einschränken und Person löschen (anonymisieren). */
export function PersonActions({ personId, restricted, anonymized, eraseBlocked, retainedInvoices, locale }: Props) {
  const t = useTranslations('gdpr.person');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'restrict' | 'erase' | null>(null);

  const exportHref = (format: 'json' | 'xlsx') => `/api/export/person?person=${personId}&format=${format}&locale=${locale}`;

  function run(action: () => Promise<Parameters<typeof handle>[0]>, success: string) {
    setDialog(null);
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <a href={exportHref('json')} download>
          {t('exportJson')}
        </a>
      </Button>
      <Button variant="outline" asChild>
        <a href={exportHref('xlsx')} download>
          {t('exportXlsx')}
        </a>
      </Button>
      {!anonymized &&
        (restricted ? (
          <Button variant="outline" disabled={pending} onClick={() => run(() => liftRestrictionAction(personId), t('liftDone'))}>
            {t('lift')}
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => setDialog('restrict')}>
            {t('restrict')}
          </Button>
        ))}
      {!anonymized && (
        <Button variant="destructive" disabled={pending || eraseBlocked} onClick={() => setDialog('erase')}>
          {t('erase')}
        </Button>
      )}

      <ConfirmDialog
        open={dialog === 'restrict'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('restrictTitle')}
        description={t('restrictText')}
        confirmLabel={t('restrict')}
        onConfirm={() => run(() => restrictPersonAction(personId), t('restrictDone'))}
      />
      <ConfirmDialog
        open={dialog === 'erase'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('eraseTitle')}
        description={`${t('eraseText')} ${retainedInvoices > 0 ? t('eraseRetained', { count: retainedInvoices }) : ''}`.trim()}
        confirmLabel={t('erase')}
        destructive
        onConfirm={() => run(() => erasePersonAction(personId), t('eraseDone'))}
      />
    </div>
  );
}
