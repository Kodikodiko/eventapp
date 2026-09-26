import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';

export default async function HomePage({ params }: LocaleParams) {
  await initLocale(params);
  const t = await getTranslations('home');

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <LocaleSwitcher />
      </div>
      <p className="mt-2 text-muted-foreground">{t('intro')}</p>
      <Link href="/admin" className="mt-6 inline-block text-primary underline">
        {t('toAdmin')}
      </Link>
    </main>
  );
}
