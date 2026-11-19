'use client';

import { Bookmark, ChevronDown, FileDown, Search, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GROUP_BY_KEYS, type GroupBy } from '@/lib/registration-groups';
import { PAYMENT_METHOD_KEYS, PAYMENT_STATUS_KEYS, TICKET_TYPE_KEYS, toggleSelection, type RegistrationFilter } from '@/lib/registrations-filter';
import { cn } from '@/lib/utils';
import type { RoleOption } from './attendees-table';

export type ViewTab = { key: string; label: string; count: number; active: boolean; onSelect: () => void; onDelete?: () => void };

/** Anzahl je Filterwert (über die übrigen aktiven Filter gezählt) */
export type FilterCounts = Record<FilterKey, Map<string, number>>;
type FilterKey = 'roles' | 'payments' | 'tickets' | 'methods';

type Props = {
  tabs: ViewTab[];
  onSaveView: (name: string) => void;
  filter: RegistrationFilter;
  setFilter: (update: (f: RegistrationFilter) => RegistrationFilter) => void;
  roles: RoleOption[];
  counts: FilterCounts;
  groupBy: GroupBy;
  onGroupBy: (next: GroupBy) => void;
  exportHref: string;
  exportDisabled: boolean;
};

/**
 * Teilnehmerliste: Status als Reiter mit Zählern, alle übrigen Filter als sichtbare Knöpfe
 * mit Anzahl je Wert, Suche mit „/“, Gruppierung und Export in einer Zeile.
 */
export function AttendeesToolbar({ tabs, onSaveView, filter, setFilter, roles, counts, groupBy, onGroupBy, exportHref, exportDisabled }: Props) {
  const t = useTranslations('attendees');
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // „/“ springt in die Suche (nicht, während man tippt)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (key: FilterKey, value: string) =>
    setFilter((f) => ({ ...f, [key]: toggleSelection((f[key] as string[] | undefined) ?? [], value, true) }));

  const groups: { key: FilterKey; label: string; options: { value: string; label: string }[] }[] = [
    { key: 'roles', label: t('colRoles'), options: roles.map((r) => ({ value: r.key, label: r.label })) },
    { key: 'payments', label: t('filterPayment'), options: PAYMENT_STATUS_KEYS.map((v) => ({ value: v, label: t(`payment.${v}`) })) },
    { key: 'tickets', label: t('filterTicket'), options: TICKET_TYPE_KEYS.map((v) => ({ value: v, label: t(`ticket.${v}`) })) },
    { key: 'methods', label: t('filterMethod'), options: PAYMENT_METHOD_KEYS.map((v) => ({ value: v, label: t(`method.${v}`) })) },
  ];
  const anyFilter = groups.some((g) => ((filter[g.key] as string[] | undefined) ?? []).length > 0) || filter.search !== '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-1 gap-y-2 border-b border-input">
        <div role="tablist" aria-label={t('viewsLabel')} className="-mb-px flex flex-wrap gap-0.5">
          {tabs.map((tab) => (
            <span key={tab.key} className="group flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={tab.active}
                onClick={tab.onSelect}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring',
                  tab.active ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.onDelete && <Bookmark aria-hidden className="size-3.5" />}
                {tab.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    tab.active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              </button>
              {tab.onDelete && (
                <button
                  type="button"
                  onClick={tab.onDelete}
                  aria-label={t('deleteView', { name: tab.label })}
                  title={t('deleteView', { name: tab.label })}
                  className="-ml-1 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="ml-1 flex items-center gap-1 px-2 py-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-primary"
          >
            <Bookmark aria-hidden className="size-3.5" />
            {t('saveView')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-ring sm:w-72">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget as HTMLInputElement).blur()}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="hidden rounded border border-input px-1.5 font-sans text-[11px] text-muted-foreground sm:inline">/</kbd>
        </label>

        {groups.map((g) => {
          const active = (filter[g.key] as string[] | undefined) ?? [];
          const first = g.options.find((o) => o.value === active[0])?.label;
          return (
            <DropdownMenu key={g.key}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring',
                    active.length ? 'border-primary bg-brand-soft text-primary' : 'border-input bg-card text-foreground/80 hover:border-primary/40'
                  )}
                >
                  {g.label}
                  {active.length > 0 && (
                    <span className="font-semibold">
                      : {first}
                      {active.length > 1 && ` +${active.length - 1}`}
                    </span>
                  )}
                  <ChevronDown aria-hidden className="size-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {g.options.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={active.includes(o.value)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle(g.key, o.value)}
                  >
                    <span className="flex-1">{o.label}</span>
                    <span className="ml-3 text-xs text-muted-foreground tabular-nums">{counts[g.key].get(o.value) ?? 0}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {anyFilter && (
          <button
            type="button"
            onClick={() => setFilter((f) => ({ ...f, roles: [], payments: [], methods: [], tickets: [], search: '' }))}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <X aria-hidden className="size-3.5" />
            {t('clear')}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('groupBy')}</span>
            <select value={groupBy} onChange={(e) => onGroupBy(e.target.value as GroupBy)} className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
              {GROUP_BY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`groupByOption.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" asChild disabled={exportDisabled} className="h-9 bg-card">
            <a href={exportHref} download aria-disabled={exportDisabled}>
              <FileDown aria-hidden />
              {t('export.button')}
            </a>
          </Button>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!viewName.trim()) return;
              onSaveView(viewName.trim().slice(0, 40));
              setViewName('');
              setSaveOpen(false);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t('saveViewTitle')}</DialogTitle>
              <DialogDescription>{t('saveViewHint')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="view-name">{t('saveViewName')}</Label>
              <Input id="view-name" value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={40} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={!viewName.trim()}>
                {t('saveViewConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
