import { getTranslations } from 'next-intl/server';
import { CostGroupTemplatesView } from '@/components/admin/expenses/cost-group-templates-view';
import type { LocaleParams } from '@/i18n/page';
import { initAdminPage } from '@/server/admin-pages';
import { requestDb } from '@/server/db';
import { listTemplates } from '@/server/services/expenses';

export default async function CostGroupsPage({ params }: LocaleParams) {
  await initAdminPage(params);
  const t = await getTranslations('costGroups');
  const db = await requestDb();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <CostGroupTemplatesView templates={listTemplates(db)} />
    </div>
  );
}
