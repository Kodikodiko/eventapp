'use client';

import { Bookmark, FileDown, ListFilter, Plus, Search, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PAYMENT_METHOD_KEYS,
  PAYMENT_STATUS_KEYS,
  REGISTRATION_STATUS_KEYS,
  TICKET_TYPE_KEYS,
  toggleSelection,
  type RegistrationFilter,
} from '@/lib/registrations-filter';
import { cn } from '@/lib/utils';
import type { RoleOption } from './attendees-table';

export type ViewTab = { key: string; label: string; count: number; active: boolean; onSelect: () => void; onDelete?: () => void };

type Props = {
  tabs: ViewTab[];
  onSaveView: (name: string) => void;
  filter: RegistrationFilter;
  setFilter: (update: (f: RegistrationFilter) => RegistrationFilter) => void;
  roles: RoleOption[];
  exportHref: string;
  exportDisabled: boolean;
};

type ListKey = 'roles' | 'statuses' | 'payments' | 'methods' | 'tickets';

/** Ansichten (Tabs), Suche, Filter-Chips und Export der Teilnehmerliste. */
export function AttendeesToolbar({ tabs, onSaveView, filter, setFilter, roles, exportHref, exportDisabled }: Props) {
  const t = useTranslations('attendees');
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const toggle = (key: ListKey, value: string) =>
    setFilter((f) => ({ ...f, [key]: toggleSelection((f[key] as string[] | undefined) ?? [], value, true) }));

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filter.roles.map((v) => ({ key: `r-${v}`, label: t('chip.role', { value: roleLabel(v) }), remove: () => toggle('roles', v) })),
    ...filter.statuses.map((v) => ({ key: `s-${v}`, label: t('chip.status', { value: t(`status.${v}`) }), remove: () => toggle('statuses', v) })),
    ...(filter.payments ?? []).map((v) => ({ key: `p-${v}`, label: t('chip.payment', { value: t(`payment.${v}`) }), remove: () => toggle('payments', v) })),
    ...(filter.methods ?? []).map((v) => ({ key: `m-${v}`, label: t('chip.method', { value: t(`method.${v}`) }), remove: () => toggle('methods', v) })),
    ...(filter.tickets ?? []).map((v) => ({ key: `t-${v}`, label: t('chip.ticket', { value: t(`ticket.${v}`) }), remove: () => toggle('tickets', v) })),
  ];

  const checkbox = (key: ListKey, value: string, label: string) => (
    <DropdownMenuCheckboxItem
      key={`${key}-${value}`}
      checked={((filter[key] as string[] | undefined) ?? []).includes(value)}
      onSelect={(e) => e.preventDefault()}
      onCheckedChange={() => toggle(key, value)}
    >
      {label}
    </DropdownMenuCheckboxItem>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-input">
        <div role="tablist" aria-label={t('viewsLabel')} className="-mb-px flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <span key={tab.key} className="group flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={tab.active}
                onClick={tab.onSelect}
                className={cn(
                  'border-b-2 px-3 py-2 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-ring',
                  tab.active ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label} <span className="font-normal text-muted-foreground tabular-nums">{tab.count}</span>
              </button>
              {tab.onDelete && (
                <button
                  type="button"
                  onClick={tab.onDelete}
                  aria-label={t('deleteView', { name: tab.label })}
                  title={t('deleteView', { name: tab.label })}
                  className="-ml-1 rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              )}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            className="px-3 py-2 text-sm font-semibold whitespace-nowrap text-primary hover:underline"
          >
            <Bookmark aria-hidden className="mr-1 inline size-3.5" />
            {t('saveView')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-card px-2.5 focus-within:outline-2 focus-within:outline-ring sm:w-72">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={filter.search}
            onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {chips.map((chip) => (
          <span key={chip.key} className="flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-sm font-semibold text-primary">
            {chip.label}
            <button
              type="button"
              onClick={chip.remove}
              aria-label={t('removeFilter', { label: chip.label })}
              className="flex size-6 items-center justify-center rounded-full hover:bg-primary/10"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-full border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              <Plus aria-hidden className="size-3.5" />
              {t('filterAdd')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
            <DropdownMenuLabel>{t('filterStatus')}</DropdownMenuLabel>
            {REGISTRATION_STATUS_KEYS.map((s) => checkbox('statuses', s, t(`status.${s}`)))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('filterPayment')}</DropdownMenuLabel>
            {PAYMENT_STATUS_KEYS.map((s) => checkbox('payments', s, t(`payment.${s}`)))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('filterMethod')}</DropdownMenuLabel>
            {PAYMENT_METHOD_KEYS.map((s) => checkbox('methods', s, t(`method.${s}`)))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('filterTicket')}</DropdownMenuLabel>
            {TICKET_TYPE_KEYS.map((s) => checkbox('tickets', s, t(`ticket.${s}`)))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('filterRoles')}</DropdownMenuLabel>
            {roles.map((r) => checkbox('roles', r.key, r.label))}
          </DropdownMenuContent>
        </DropdownMenu>
        {(chips.length > 0 || filter.search) && (
          <Button variant="ghost" size="sm" onClick={() => setFilter((f) => ({ ...f, roles: [], statuses: [], payments: [], methods: [], tickets: [], search: '' }))}>
            <ListFilter aria-hidden />
            {t('clear')}
          </Button>
        )}
        <Button variant="outline" size="sm" asChild disabled={exportDisabled} className="ml-auto bg-card">
          <a href={exportHref} download aria-disabled={exportDisabled}>
            <FileDown aria-hidden />
            {t('export.button')}
          </a>
        </Button>
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
