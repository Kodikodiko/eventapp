'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/** Unternavigation innerhalb eines Events (weitere Bereiche folgen in Phase 4). */
export function EventNav({ eventId }: { eventId: number }) {
  const t = useTranslations('eventNav');
  const pathname = usePathname();
  const base = `/admin/events/${eventId}`;
  const items = [
    { href: base, label: t('overview'), exact: true },
    { href: `${base}/attendees`, label: t('attendees') },
    { href: `${base}/speakers`, label: t('speakers') },
    { href: `${base}/schedule`, label: t('schedule') },
    { href: `${base}/sponsors`, label: t('sponsors') },
    { href: `${base}/settings`, label: t('settings') },
    { href: `${base}/terms`, label: t('terms') },
  ];

  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-1 border-b print:hidden">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
