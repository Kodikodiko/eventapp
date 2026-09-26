'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('localeSwitcher');
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    startTransition(() => {
      router.replace(pathname, { locale });
    });
  }

  return (
    <nav aria-label={t('label')} className={cn('flex gap-1 text-sm', className)}>
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={isPending || locale === current}
          onClick={() => switchTo(locale)}
          aria-current={locale === current ? 'true' : undefined}
          className={cn(
            'rounded px-2 py-1 uppercase',
            locale === current ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {t(locale)}
        </button>
      ))}
    </nav>
  );
}
