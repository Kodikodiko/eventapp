import { getTranslations } from 'next-intl/server';
import { PortalLoginForm } from '@/components/portal/portal-login-form';
import { redirect } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { getSession, isAttendee } from '@/server/auth/session';

type Props = LocaleParams & { searchParams: Promise<{ error?: string }> };

export default async function PortalLoginPage({ params, searchParams }: Props) {
  const locale = await initLocale(params);
  const session = await getSession();
  if (isAttendee(session)) redirect({ href: '/portal', locale });
  const t = await getTranslations('portal');
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
        <p className="text-muted-foreground">{t('loginIntro')}</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {t('linkInvalid')}
        </p>
      )}
      {session && !isAttendee(session) && <p className="rounded-md border p-3 text-sm">{t('adminSessionHint')}</p>}
      <PortalLoginForm />
    </div>
  );
}
