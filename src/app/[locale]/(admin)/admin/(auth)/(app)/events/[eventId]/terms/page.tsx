import { redirect } from '@/i18n/navigation';
import { initAdminPage, type EventParams } from '@/server/admin-pages';

/** Die AGB eines Events werden in den Event-Einstellungen bearbeitet (alte Adresse leitet dorthin weiter). */
export default async function EventTermsPage({ params }: EventParams) {
  const locale = await initAdminPage(params);
  const { eventId } = await params;
  redirect({ href: `/admin/events/${eventId}/settings#terms`, locale });
}
