import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { listEvents } from '@/server/services/events';
import { EventSwitcher } from './event-switcher';
import { LogoutButton } from './logout-button';

type Props = {
  locale: Locale;
  user: { name: string; email: string };
  /** false, solange die Zwei-Faktor-Anmeldung nicht eingerichtet ist: nur Sicherheitsseite und Abmelden */
  fullAccess: boolean;
  children: React.ReactNode;
};

export async function AdminShell({ locale, user, fullAccess, children }: Props) {
  const t = await getTranslations('adminNav');
  const events = fullAccess
    ? listEvents(await requestDb()).map((e) => ({ id: e.id, label: localized(e.name, locale) }))
    : [];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="text-lg font-semibold">
            EventFlow
          </Link>
          {fullAccess && (
            <>
              <nav aria-label={t('label')} className="flex gap-4 text-sm">
                <Link href="/admin" className="hover:underline">
                  {t('dashboard')}
                </Link>
                <Link href="/admin/events" className="hover:underline">
                  {t('events')}
                </Link>
                <Link href="/admin/settings" className="hover:underline">
                  {t('settings')}
                </Link>
                <Link href="/admin/security" className="hover:underline">
                  {t('security')}
                </Link>
              </nav>
              <EventSwitcher events={events} />
            </>
          )}
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
