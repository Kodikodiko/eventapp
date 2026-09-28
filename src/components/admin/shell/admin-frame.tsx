'use client';

import { Link2, Menu, Plus, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { AdminSidebar, useCurrentEvent } from './admin-sidebar';
import { CommandSearch, type PageTarget } from './command-search';
import type { ShellEvent, ShellUser } from './nav-types';

const COLLAPSE_KEY = 'eventflow.sidebarCollapsed';
const collapseListeners = new Set<() => void>();

/** Einklapp-Zustand als Bequemlichkeit pro Browser (localStorage, beim Server-Rendern ausgeklappt). */
const collapseStore = {
  subscribe(listener: () => void) {
    collapseListeners.add(listener);
    return () => collapseListeners.delete(listener);
  },
  get(): boolean {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  },
  set(value: boolean) {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
    } catch {
      /* Speicher nicht verfügbar */
    }
    collapseListeners.forEach((l) => l());
  },
};

type Props = { events: ShellEvent[]; defaultEventId: number | null; user: ShellUser; children: React.ReactNode };

/** Admin-Rahmen: Seitenleiste (einklappbar, mobil als Menü), Kopfzeile mit Schnellsuche und Event-Aktionen. */
export function AdminFrame({ events, defaultEventId, user, children }: Props) {
  const t = useTranslations('adminNav');
  const locale = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const collapsed = useSyncExternalStore(collapseStore.subscribe, collapseStore.get, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const current = useCurrentEvent(events, defaultEventId);

  const toggleCollapsed = () => collapseStore.set(!collapsed);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pages = useMemo<PageTarget[]>(() => {
    const org = t('sectionOrg');
    const list: PageTarget[] = [
      { href: '/admin/events', label: t('allEvents'), group: org },
      { href: '/admin/events/new', label: t('newEvent'), group: org },
      { href: '/admin/members', label: t('members'), group: org },
      { href: '/admin/audit', label: t('audit'), group: org },
      { href: '/admin/settings', label: t('organizer'), group: org },
      { href: '/admin/security', label: t('security'), group: org },
    ];
    if (current) {
      const base = `/admin/events/${current.id}`;
      const g = current.label;
      list.unshift(
        { href: base, label: t('cockpit'), group: g },
        { href: `${base}/attendees`, label: t('attendees'), group: g },
        { href: `${base}/attendees?new=1`, label: `+ ${t('addRegistration')}`, group: g },
        { href: `${base}/invoices`, label: t('invoices'), group: g },
        { href: `${base}/refunds`, label: t('refunds'), group: g },
        { href: `${base}/speakers`, label: t('speakers'), group: g },
        { href: `${base}/schedule`, label: t('schedule'), group: g },
        { href: `${base}/sponsors`, label: t('sponsors'), group: g },
        { href: `${base}/settings`, label: t('eventSettings'), group: g },
        { href: `${base}/terms`, label: t('terms'), group: g }
      );
    }
    return list;
  }, [current, t]);

  async function copyLink() {
    if (!current) return;
    const url = `${window.location.origin}/${locale}/events/${current.slug}/register`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('linkCopied'), description: url });
    } catch {
      toast({ variant: 'destructive', title: t('linkCopyFailed', { url }) });
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-canvas print:block print:bg-white">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 lg:block print:hidden',
            collapsed ? 'w-[72px]' : 'w-[248px]'
          )}
        >
          <AdminSidebar events={events} defaultEventId={defaultEventId} user={user} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[280px] border-none p-0 [&>button]:text-white">
            <SheetTitle className="sr-only">{t('label')}</SheetTitle>
            <SheetDescription className="sr-only">{t('label')}</SheetDescription>
            <AdminSidebar events={events} defaultEventId={defaultEventId} user={user} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b bg-card px-4 sm:px-6 lg:px-8 print:hidden">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('openMenu')}>
              <Menu aria-hidden />
            </Button>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-input bg-background px-3 text-left text-sm text-muted-foreground hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:max-w-[440px]"
            >
              <Search aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{t('searchPlaceholder')}</span>
              <kbd className="ml-auto hidden rounded border border-input px-1.5 font-sans text-xs sm:inline">{t('searchShortcut')}</kbd>
            </button>
            {current && !current.archived && (
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" onClick={copyLink} className="hidden md:inline-flex" title={t('copyLink')}>
                  <Link2 aria-hidden />
                  <span className="hidden xl:inline">{t('copyLink')}</span>
                </Button>
                <Button onClick={() => router.push(`/admin/events/${current.id}/attendees?new=1&n=${Date.now()}`)}>
                  <Plus aria-hidden />
                  <span className="hidden sm:inline">{t('addRegistration')}</span>
                </Button>
              </div>
            )}
          </header>
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7 print:max-w-none print:p-0">{children}</main>
        </div>
      </div>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} pages={pages} />
    </TooltipProvider>
  );
}
