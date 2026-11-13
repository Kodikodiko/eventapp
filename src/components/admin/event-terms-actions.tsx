'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/action-result';
import type { LegalDocumentFormValues } from '@/lib/validation/forms';
import { LegalDocumentForm } from './legal-document-form';

/**
 * AGB eines Events bearbeiten. „Globale AGB als Vorlage laden“ setzt den Text der aktuellen globalen AGB ins Formular;
 * erst „Als neue Version veröffentlichen“ ändert die AGB des Events.
 */
export function EventTermsEditor({
  current,
  global,
  publish,
  disabled,
}: {
  current: LegalDocumentFormValues;
  global: LegalDocumentFormValues | null;
  publish: (values: LegalDocumentFormValues) => Promise<ActionResult<{ version: number }>>;
  disabled?: boolean;
}) {
  const t = useTranslations('terms');
  const [loaded, setLoaded] = useState<{ key: number; data: LegalDocumentFormValues | null }>({ key: 0, data: null });
  return (
    <div className="space-y-3">
      {global && !disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => setLoaded((v) => ({ key: v.key + 1, data: global }))}>
          {t('loadGlobal')}
        </Button>
      )}
      <LegalDocumentForm key={loaded.key} defaultValues={current} startValues={loaded.data} publish={publish} disabled={disabled} />
    </div>
  );
}
