import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Link } from '@/i18n/navigation';
import { LogoutButton } from './logout-button';

type Props = {
  user: { name: string; email: string };
  children: React.ReactNode;
};

/** Grundgerüst des Admin-Bereichs. Navigation und Event-Umschalter werden in Phase 3 ausgebaut. */
export async function AdminShell({ user, children }: Props) {
  const t = await getTranslations('adminNav');
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/admin" className="text-lg font-semibold">
            EventFlow
          </Link>
          <nav aria-label={t('label')} className="flex gap-3 text-sm">
            <Link href="/admin" className="hover:underline">
              {t('dashboard')}
            </Link>
            <Link href="/admin/security" className="hover:underline">
              {t('security')}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground" title={user.email}>
              {t('signedInAs', { name: user.name })}
            </span>
            <LocaleSwitcher />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
