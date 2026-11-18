'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { UI_COOKIE, type UiVersion } from '@/lib/ui-version';
import { cn } from '@/lib/utils';

/** Schalter „Neue Oberfläche“: speichert die Wahl als Cookie (1 Jahr) und lädt die Seite neu vom Server. */
export function UiToggle({ value, className }: { value: UiVersion; className?: string }) {
  const t = useTranslations('adminNav');
  const router = useRouter();
  const on = value === 'neu';
  function toggle() {
    document.cookie = `${UI_COOKIE}=${on ? 'alt' : 'neu'}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      title={t('uiToggleHint')}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className
      )}
    >
      <span className="hidden whitespace-nowrap xl:inline">{t('uiToggle')}</span>
      <span aria-hidden className={cn('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}
