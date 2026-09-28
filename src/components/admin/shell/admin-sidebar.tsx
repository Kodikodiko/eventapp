'use client';

import {
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronsUpDown,
  FileText,
  Handshake,
  History,
  IdCard,
  LayoutDashboard,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { LogoutButton } from '../logout-button';
import type { ShellEvent, ShellUser } from './nav-types';

type Props = {
  events: ShellEvent[];
  defaultEventId: number | null;
  user: ShellUser;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  /** im mobilen Menü: nach einem Klick schließen */
  onNavigate?: () => void;
};

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: { value: number; tone: 'muted' | 'danger' | 'warn'; label: string } };

/** Aktuelles Event: aus der URL, sonst das vom Server vorgeschlagene. */
export function useCurrentEvent(events: ShellEvent[], defaultEventId: number | null): ShellEvent | null {
  const params = useParams<{ eventId?: string }>();
  const fromUrl = params.eventId ? events.find((e) => String(e.id) === params.eventId) : undefined;
  return fromUrl ?? events.find((e) => e.id === defaultEventId) ?? null;
}

export function AdminSidebar({ events, defaultEventId, user, collapsed, onToggleCollapsed, onNavigate }: Props) {
  const t = useTranslations('adminNav');
  const pathname = usePathname();
  const router = useRouter();
  const current = useCurrentEvent(events, defaultEventId);
  const base = current ? `/admin/events/${current.id}` : null;

  const eventItems: Item[] = base
    ? [
        { href: base, label: t('cockpit'), icon: LayoutDashboard, exact: true },
        {
          href: `${base}/attendees`,
          label: t('attendees'),
          icon: Users,
          badge: { value: current!.counts.attendees, tone: 'muted', label: t('attendeesBadge', { count: current!.counts.attendees }) },
        },
        { href: `${base}/speakers`, label: t('speakers'), icon: Mic },
        { href: `${base}/schedule`, label: t('schedule'), icon: CalendarDays },
        { href: `${base}/sponsors`, label: t('sponsors'), icon: Handshake },
        {
          href: `${base}/invoices`,
          label: t('invoices'),
          icon: FileText,
          badge: { value: current!.counts.overdueInvoices, tone: 'danger', label: t('overdueBadge', { count: current!.counts.overdueInvoices }) },
        },
        {
          href: `${base}/refunds`,
          label: t('refunds'),
          icon: Undo2,
          badge: { value: current!.counts.openRefunds, tone: 'warn', label: t('refundsBadge', { count: current!.counts.openRefunds }) },
        },
        { href: `${base}/settings`, label: t('eventSettings'), icon: Settings },
        { href: `${base}/terms`, label: t('terms'), icon: ScrollText },
      ]
    : [];
  const orgItems: Item[] = [
    { href: '/admin/events', label: t('allEvents'), icon: CalendarRange, exact: true },
    { href: '/admin/members', label: t('members'), icon: IdCard },
    { href: '/admin/audit', label: t('audit'), icon: History },
    { href: '/admin/settings', label: t('organizer'), icon: Building2 },
    { href: '/admin/security', label: t('security'), icon: ShieldCheck },
  ];

  const isActive = (item: Item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const activeEvents = events.filter((e) => !e.archived);
  const archivedEvents = events.filter((e) => e.archived);

  function renderItem(item: Item) {
    const active = isActive(item);
    const Icon = item.icon;
    const showBadge = item.badge && (item.badge.tone === 'muted' ? item.badge.value >= 0 : item.badge.value > 0);
    const link = (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        className={cn(
          'relative flex items-center gap-2.5 rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring',
          collapsed ? 'size-11 justify-center' : 'min-h-9 px-2.5 py-2',
          active ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-white/5 hover:text-white'
        )}
      >
        <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.8} />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {showBadge && item.badge && (
          <span
            title={item.badge.label}
            className={cn(
              'tabular-nums',
              collapsed ? 'absolute top-1 right-1 size-2 rounded-full' : 'rounded-full px-1.5 text-xs font-semibold',
              item.badge.tone === 'muted' && (collapsed ? 'hidden' : 'text-sidebar-foreground/80'),
              item.badge.tone === 'danger' && 'bg-[#E5484D] text-white',
              item.badge.tone === 'warn' && 'bg-[#F4A261] text-[#15172B]'
            )}
          >
            {collapsed ? <span className="sr-only">{item.badge.label}</span> : <><span aria-hidden>{item.badge.value}</span><span className="sr-only">{item.badge.label}</span></>}
          </span>
        )}
      </Link>
    );
    if (!collapsed) return <li key={item.href}>{link}</li>;
    return (
      <li key={item.href}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </li>
    );
  }

  const sectionLabel = (text: string) =>
    collapsed ? <div className="mx-3 my-2 border-t border-sidebar-border" aria-hidden /> : (
      <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-[0.08em] text-sidebar-foreground/65 uppercase">{text}</div>
    );

  return (
    <div className={cn('flex h-full flex-col gap-4 bg-sidebar text-sidebar-foreground', collapsed ? 'items-center px-2 py-4' : 'px-3.5 py-4')}>
      <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between gap-2 px-1')}>
        <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-sidebar-ring">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary font-display text-base font-extrabold text-white">E</span>
          <span className={cn('font-display text-base font-bold text-white', collapsed && 'sr-only')}>EventFlow</span>
        </Link>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t('expand') : t('collapse')}
            title={collapsed ? t('expand') : t('collapse')}
            className="flex size-9 items-center justify-center rounded-md text-sidebar-foreground hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-ring"
          >
            {collapsed ? <PanelLeftOpen aria-hidden className="size-[18px]" /> : <PanelLeftClose aria-hidden className="size-[18px]" />}
          </button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex items-center rounded-lg border border-sidebar-border bg-white/5 text-left text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sidebar-ring',
            collapsed ? 'size-11 justify-center' : 'w-full justify-between gap-2 px-3 py-2.5'
          )}
          aria-label={t('eventSwitcher')}
        >
          {collapsed ? (
            <CalendarRange aria-hidden className="size-[18px]" />
          ) : (
            <>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{current?.label ?? t('noEvent')}</span>
                <span className="truncate text-xs text-sidebar-foreground/75">{current?.meta ?? t('noEventHint')}</span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-sidebar-foreground/75" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} className="w-72">
          <DropdownMenuLabel>{t('eventSwitcher')}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {activeEvents.map((e) => (
              <DropdownMenuItem key={e.id} onSelect={() => { router.push(`/admin/events/${e.id}`); onNavigate?.(); }}>
                <Check aria-hidden className={cn('size-4', e.id === current?.id ? 'opacity-100' : 'opacity-0')} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{e.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{e.meta}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {archivedEvents.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">{t('archivedGroup')}</DropdownMenuLabel>
              {archivedEvents.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => { router.push(`/admin/events/${e.id}`); onNavigate?.(); }}>
                  <Check aria-hidden className={cn('size-4', e.id === current?.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate text-muted-foreground">{e.label}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { router.push('/admin/events/new'); onNavigate?.(); }}>
            <Plus aria-hidden className="size-4" />
            {t('newEvent')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <nav aria-label={t('label')} className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto', collapsed && 'items-center')}>
        {eventItems.length > 0 && (
          <>
            {sectionLabel(t('sectionEvent'))}
            <ul className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>{eventItems.map(renderItem)}</ul>
          </>
        )}
        {sectionLabel(t('sectionOrg'))}
        <ul className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>{orgItems.map(renderItem)}</ul>
      </nav>

      <div className={cn('flex border-t border-sidebar-border pt-3', collapsed ? 'flex-col items-center gap-2' : 'flex-col gap-2 px-1')}>
        {!collapsed && (
          <div className="flex min-w-0 flex-col" title={user.email}>
            <span className="truncate text-sm font-semibold text-white">{user.name}</span>
            <span className="text-xs text-sidebar-foreground/75">{t('role')}</span>
          </div>
        )}
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-2' : 'justify-between gap-2')}>
          <LocaleSwitcher variant="sidebar" className={collapsed ? 'flex-col' : undefined} />
          <LogoutButton variant="sidebar" iconOnly={collapsed} />
        </div>
      </div>
    </div>
  );
}
