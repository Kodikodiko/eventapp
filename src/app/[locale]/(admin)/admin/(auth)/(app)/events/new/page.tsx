import { getTranslations } from 'next-intl/server';
import { EventForm } from '@/components/admin/event-form';
import type { LocaleParams } from '@/i18n/page';
import { initAdminPage } from '@/server/admin-pages';
import { emptyEventFormValues } from '@/lib/validation/event-values';

export default async function NewEventPage({ params }: LocaleParams) {
  await initAdminPage(params);
  const t = await getTranslations('events');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('newTitle')}</h1>
      <EventForm mode="create" defaultValues={emptyEventFormValues()} />
    </div>
  );
}
