'use client';

import { CalendarRange, CornerDownLeft, FileText, Search, User, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { localized } from '@/lib/localized';
import { cn } from '@/lib/utils';
import { adminSearchAction } from '@/server/actions/admin';
import type { SearchHit } from '@/server/services/admin-search';

export type PageTarget = { href: string; label: string; group: string };

type Entry = { key: string; href: string; icon: LucideIcon; title: string; detail?: string; group: string };

type Props = { open: boolean; onOpenChange: (open: boolean) => void; pages: PageTarget[] };

/** Schnellsuche (Strg+K): Personen, Belege, Events und Seiten des Admin-Bereichs. */
export function CommandSearch({ open, onOpenChange, pages }: Props) {
  const t = useTranslations('adminNav.searchDialog');
  const tStatus = useTranslations('attendees.status');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ query: string; hits: SearchHit[] }>({ query: '', hits: [] });
  const [activeRaw, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim();
  const searchable = q.length >= 2;
  const hits = useMemo(() => (searchable && result.query === q ? result.hits : []), [searchable, result, q]);
  const loading = searchable && result.query !== q;

  useEffect(() => {
    if (!searchable) return;
    let current = true;
    const timer = setTimeout(async () => {
      const r = await adminSearchAction(q);
      if (current) setResult({ query: q, hits: r.ok ? r.data : [] });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q, searchable]);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();
    const list: Entry[] = hits.map((h): Entry => {
      if (h.kind === 'registration') {
        return {
          key: `r${h.id}`,
          href: `/admin/events/${h.eventId}/attendees?r=${h.id}`,
          icon: User,
          title: h.name,
          detail: [h.email, localized(h.eventName, locale), tStatus(h.status)].filter(Boolean).join(' · '),
          group: t('people'),
        };
      }
      if (h.kind === 'invoice') {
        return {
          key: `i${h.id}`,
          href: `/admin/events/${h.eventId}/invoices?q=${encodeURIComponent(h.number)}`,
          icon: FileText,
          title: `${h.type === 'invoice' ? t('invoice') : t('creditNote')} ${h.number}`,
          detail: h.recipient,
          group: t('documents'),
        };
      }
      return { key: `e${h.id}`, href: `/admin/events/${h.id}`, icon: CalendarRange, title: localized(h.name, locale), detail: h.slug, group: t('events') };
    });
    const pageMatches = pages
      .filter((p) => !needle || p.label.toLowerCase().includes(needle) || p.group.toLowerCase().includes(needle))
      .slice(0, needle ? 6 : 12)
      .map((p): Entry => ({ key: `p${p.href}`, href: p.href, icon: CornerDownLeft, title: p.label, detail: p.group, group: t('pages') }));
    return [...list, ...pageMatches];
  }, [hits, pages, query, locale, t, tStatus]);

  const active = Math.max(0, Math.min(activeRaw, entries.length - 1));
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onOpenChange(false);
    setQuery('');
    // Zeitstempel: dieselbe Anweisung (z. B. dieselbe Person) greift auch auf der schon offenen Seite
    router.push(entry.href.includes('?') ? `${entry.href}&n=${Date.now()}` : entry.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(entries[active]);
    }
  }

  let lastGroup = '';
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(''); }}>
      <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('hint')}</DialogDescription>
        <div className="flex items-center gap-2 border-b px-4">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('hint')}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={entries[active] ? `${listId}-${active}` : undefined}
            aria-label={t('title')}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label={t('title')} className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {entries.map((entry, i) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            const Icon = entry.icon;
            return (
              <li key={entry.key} role="presentation">
                {header && <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{header}</div>}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(entry)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm', i === active && 'bg-accent text-accent-foreground')}
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.title}</span>
                    {entry.detail && <span className="block truncate text-xs text-muted-foreground">{entry.detail}</span>}
                  </span>
                </div>
              </li>
            );
          })}
          {entries.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">{loading ? t('searching') : t('empty')}</li>}
        </ul>
        <div className="flex justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{t('keys')}</span>
          {loading && <span aria-live="polite">{t('searching')}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
