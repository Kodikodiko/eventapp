import { getFormatter, getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { defaultNavEventId, navEvents } from '@/server/services/admin-overview';
import { LogoutButton } from './logout-button';
import { AdminFrame } from './shell/admin-frame';
import type { ShellEvent } from './shell/nav-types';

type Props = {
  locale: Locale;
  user: { name: string; email: string };
  /** false, solange die Zwei-Faktor-Anmeldung nicht eingerichtet ist: nur Sicherheitsseite und Abmelden */
  fullAccess: boolean;
  children: React.ReactNode;
};

export async function AdminShell({ locale, user, fullAccess, children }: Props) {
  if (!fullAccess) {
    const t = await getTranslations('adminNav');
    return (
      <div className="min-h-screen bg-canvas">
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/admin/security" className="flex items-center gap-2.5 font-display text-lg font-bold">
              <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-primary text-base font-extrabold text-primary-foreground">E</span>
              EventFlow
            </Link>
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

  const format = await getFormatter();
  const list = navEvents(await requestDb());
  const events: ShellEvent[] = list.map((e) => ({
    id: e.id,
    label: localized(e.name, locale),
    meta: [format.dateTime(new Date(e.startsAt), { dateStyle: 'medium' }), e.location].filter(Boolean).join(' · '),
    slug: e.slug,
    archived: e.archived,
    counts: e.counts,
  }));

  return (
    <AdminFrame events={events} defaultEventId={defaultNavEventId(list)} user={user}>
      {children}
    </AdminFrame>
  );
}
