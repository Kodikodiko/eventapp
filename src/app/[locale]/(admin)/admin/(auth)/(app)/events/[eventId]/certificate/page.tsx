import { getTranslations } from 'next-intl/server';
import { CertificateForm } from '@/components/admin/certificate/certificate-form';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { getCertificateSettings } from '@/server/services/certificates';

export default async function CertificatePage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('certificate');
  const settings = getCertificateSettings(db, event.id);
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <CertificateForm
        eventId={event.id}
        readOnly={Boolean(event.archivedAt)}
        imageName={settings.imageName}
        defaultValues={{
          heading: { de: settings.heading.de, en: settings.heading.en ?? '' },
          body: { de: settings.body.de, en: settings.body.en ?? '' },
          textColor: settings.textColor,
          removeImage: false,
        }}
      />
    </div>
  );
}
