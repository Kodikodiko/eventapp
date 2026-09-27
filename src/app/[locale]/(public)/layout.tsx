import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requestDb } from '@/server/db';
import { getOrganizerSettings } from '@/server/services/organizer';

type Props = LocaleParams & { children: React.ReactNode };

export default async function PublicLayout({ children, params }: Props) {
  await initLocale(params);
  const t = await getTranslations('public');
  const organizer = getOrganizerSettings(await requestDb());
  const brand = organizer.name || 'EventFlow';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-background focus:p-2">
        {t('skipToContent')}
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">
            {brand}
          </Link>
          <nav aria-label={t('navLabel')} className="flex items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">
              {t('events')}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <footer className="border-t text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
          <span>© {brand}</span>
          <Link href="/privacy" className="hover:underline">
            {t('privacy')}
          </Link>
          <Link href="/imprint" className="hover:underline">
            {t('imprint')}
          </Link>
          {organizer.contactEmail && (
            <a href={`mailto:${organizer.contactEmail}`} className="hover:underline">
              {t('contact')}
            </a>
          )}
          <Link href="/admin" className="ml-auto hover:underline">
            {t('toAdmin')}
          </Link>
        </div>
      </footer>
    </div>
  );
}
