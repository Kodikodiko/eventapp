'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { createDsrRequestAction } from '@/server/actions/gdpr';
import type { DsrType } from '@/server/services/gdpr';
import { useActionFeedback } from '../use-action-feedback';

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs';

type Props = {
  /** Anfrage einer bestimmten Person (sonst ohne Zuordnung, z. B. wenn niemand gefunden wurde) */
  personId: number | null;
  today: string;
  types: readonly DsrType[];
};

/** Neue Anfrage einer betroffenen Person erfassen (Art, Eingang, Notiz). */
export function DsrForm({ personId, today, types }: Props) {
  const t = useTranslations('gdpr.requests');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<DsrType>('access');
  const [receivedAt, setReceivedAt] = useState(today);
  const [notes, setNotes] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createDsrRequestAction({ personId, type, receivedAt, notes });
      if (handle(result, { success: t('created') })) {
        setNotes('');
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
      <label className="space-y-1 text-sm">
        <span className="font-medium">{t('type')}</span>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={selectClass}>
          {types.map((k) => (
            <option key={k} value={k}>
              {t(`types.${k}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">{t('receivedAt')}</span>
        <Input type="date" required max={today} value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">{t('notes')}</span>
        <Input maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} />
      </label>
      <Button type="submit" disabled={pending}>
        {t('add')}
      </Button>
    </form>
  );
}
