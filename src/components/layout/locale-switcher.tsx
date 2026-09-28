'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

export function LocaleSwitcher({ className, variant = 'default' }: { className?: string; variant?: 'default' | 'sidebar' }) {
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
            variant === 'sidebar'
              ? locale === current
                ? 'bg-white/15 font-semibold text-white'
                : 'text-sidebar-foreground hover:bg-white/10 hover:text-white'
              : locale === current
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
          )}
        >
          {t(locale)}
        </button>
      ))}
    </nav>
  );
}
