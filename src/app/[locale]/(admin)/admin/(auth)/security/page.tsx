import { CheckCircle2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { TwoFactorSetup } from '@/components/admin/two-factor-setup';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requireAdmin } from '@/server/auth/session';

export default async function AdminSecurityPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const session = await requireAdmin(locale);
  const t = await getTranslations('security');
  const enabled = Boolean(session.user.twoFactorEnabled);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      {enabled ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2">
            <CheckCircle2 aria-hidden className="size-5 text-green-600" />
            {t('enabled')}
          </p>
          <Link href="/admin" className="text-primary underline">
            {t('toDashboard')}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{t('required')}</p>
          <TwoFactorSetup />
        </div>
      )}
    </div>
  );
}
