'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';

type Option = { id: number; label: string };

/** Auswahl des aktuellen Events in der Kopfzeile des Admin-Bereichs. */
export function EventSwitcher({ events }: { events: Option[] }) {
  const t = useTranslations('adminNav');
  const router = useRouter();
  const params = useParams<{ eventId?: string }>();
  const current = params.eventId ?? '';

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('eventSwitcher')}</span>
      <select
        className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-sm"
        value={current}
        onChange={(e) => {
          if (e.target.value) router.push(`/admin/events/${e.target.value}`);
        }}
      >
        <option value="">{t('chooseEvent')}</option>
        {events.map((ev) => (
          <option key={ev.id} value={String(ev.id)}>
            {ev.label}
          </option>
        ))}
      </select>
    </label>
  );
}
