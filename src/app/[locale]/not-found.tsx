import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFoundPage() {
  const t = useTranslations('notFound');
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('text')}</p>
      <Link href="/" className="mt-4 inline-block text-primary underline">
        {t('home')}
      </Link>
    </main>
  );
}
