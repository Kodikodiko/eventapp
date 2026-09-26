import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { initLocale, type LocaleParams } from '@/i18n/page';

export default async function AdminHomePage({ params }: LocaleParams) {
  await initLocale(params);
  const t = await getTranslations('admin');

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <LocaleSwitcher />
      </div>
      <p className="mt-2 text-muted-foreground">{t('placeholder')}</p>
    </main>
  );
}
