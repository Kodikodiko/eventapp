import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/admin/login-form';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { redirect } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requestDb } from '@/server/db';
import { getSession, isAdmin } from '@/server/auth/session';

type Props = LocaleParams & { searchParams: Promise<{ error?: string }> };

export default async function AdminLoginPage({ params, searchParams }: Props) {
  const locale = await initLocale(params);
  await requestDb();
  const session = await getSession();
  if (isAdmin(session) && session.user.twoFactorEnabled) redirect({ href: '/admin', locale });

  const { error } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 p-4">
      <LocaleSwitcher />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{t('loginTitle')}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error === 'forbidden' && (
            <p role="alert" className="text-sm text-destructive">
              {t('forbidden')}
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
