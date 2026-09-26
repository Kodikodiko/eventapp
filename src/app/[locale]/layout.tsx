import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { routing } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

type Props = LocaleParams & { children: React.ReactNode };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, namespace: 'app' });
  return { title: t('name'), description: t('description') };
}

export default async function LocaleLayout({ children, params }: Props) {
  const locale = await initLocale(params);

  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
