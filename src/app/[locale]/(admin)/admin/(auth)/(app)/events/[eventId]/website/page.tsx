import { getTranslations } from 'next-intl/server';
import { EventPageForm } from '@/components/admin/event-page/event-page-form';
import { GalleryManager } from '@/components/admin/event-page/gallery-manager';
import { toEventPageFormValues } from '@/lib/validation/event-page';
import { mediaUrl } from '@/lib/validation/media';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { getEventPageSettings, MAX_GALLERY_IMAGES } from '@/server/services/event-page';

export default async function EventWebsitePage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('eventPage');
  const settings = getEventPageSettings(db, event.id);
  const readOnly = Boolean(event.archivedAt);
  return (
    <div className="space-y-6">
      <h2 className="sr-only">{t('title')}</h2>
      <EventPageForm
        eventId={event.id}
        slug={event.slug}
        readOnly={readOnly}
        heroUrl={mediaUrl(settings.heroImagePath)}
        heroName={settings.heroImageName}
        logoUrl={mediaUrl(settings.logoPath)}
        logoName={settings.logoName}
        defaultValues={toEventPageFormValues(settings)}
      />
      <GalleryManager
        eventId={event.id}
        readOnly={readOnly}
        max={MAX_GALLERY_IMAGES}
        images={settings.gallery.map((g) => ({ id: g.id, url: mediaUrl(g.imagePath)!, name: g.imageName }))}
      />
    </div>
  );
}
