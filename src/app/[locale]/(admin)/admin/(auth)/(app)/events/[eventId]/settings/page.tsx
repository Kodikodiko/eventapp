import { EventForm } from '@/components/admin/event-form';
import { initLocale } from '@/i18n/page';
import { eventToFormValues } from '@/lib/validation/event-values';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { getCancellationRules } from '@/server/services/events';

export default async function EventSettingsPage({ params }: EventParams) {
  await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const rules = getCancellationRules(db, event.id);
  return (
    <EventForm
      key={`${event.id}-${event.slug}`}
      mode="edit"
      eventId={event.id}
      defaultValues={eventToFormValues(event, rules)}
      readOnly={Boolean(event.archivedAt)}
    />
  );
}
