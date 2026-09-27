import { getTranslations } from 'next-intl/server';
import { PortalView } from '@/components/portal/portal-view';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requireAttendee } from '@/server/auth/session';
import { requestDb } from '@/server/db';
import { portalOverview } from '@/server/services/portal';

export default async function PortalPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const session = await requireAttendee(locale);
  const t = await getTranslations('portal');
  const overview = portalOverview(await requestDb(), session.user.personId);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PortalView person={overview.person} registrations={overview.registrations} />
    </div>
  );
}
