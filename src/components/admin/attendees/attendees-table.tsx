'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Copy, FileDown, FileText, Mail, Tag, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { centsToInput, formatEuro } from '@/lib/money';
import {
  DEFAULT_SORT,
  EMPTY_FILTER,
  filterAndSort,
  filterToSearchParams,
  type RegistrationFilter,
  type RegistrationSort,
} from '@/lib/registrations-filter';
import { cn } from '@/lib/utils';
import { bulkAddRoleAction } from '@/server/actions/admin';
import { issueRegistrationInvoiceAction } from '@/server/actions/invoices';
import type { RegistrationListRow } from '@/server/services/registrations';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';
import { AttendeesToolbar, type ViewTab } from './attendees-toolbar';
import { RegistrationDetailPanel } from './registration-detail-panel';
import { RegistrationFormDialog } from './registration-form-dialog';
import {
  CancelDialog,
  canIssueInvoice,
  ConfirmWaitlistedDialog,
  IssueInvoiceDialog,
  RefundDialog,
  RegistrationRowMenu,
  type RowDialog,
} from './registration-row-actions';
import { paymentTone, Pill, statusTone } from './status-pill';

export type RoleOption = { key: string; label: string };

type Props = {
  eventId: number;
  rows: RegistrationListRow[];
  roles: RoleOption[];
  seatsFree: number;
  readOnly: boolean;
  prices: { normal: string; member: string };
  /** aus der URL: Ansicht, geöffnete Anmeldung, Dialog „Neue Anmeldung“ */
  initialView?: string;
  openId?: number | null;
  openCreate?: boolean;
  /** ändert sich bei jedem Aufruf aus Suche/Kopfzeile, damit dieselbe Anweisung erneut greift */
  intentKey?: string;
};

type ViewFilter = Omit<RegistrationFilter, 'search' | 'ids'>;
type BuiltInView = { key: 'all' | 'confirmed' | 'paymentOpen' | 'waitlisted' | 'reserved' | 'cancelled'; filter: ViewFilter; hideWhenEmpty?: boolean };
type SavedView = { id: string; name: string; filter: RegistrationFilter; sort: RegistrationSort };

const NO_FILTER: ViewFilter = { roles: [], statuses: [], payments: [], methods: [], tickets: [] };
const BUILT_IN: BuiltInView[] = [
  { key: 'all', filter: NO_FILTER },
  { key: 'confirmed', filter: { ...NO_FILTER, statuses: ['confirmed'] } },
  { key: 'paymentOpen', filter: { ...NO_FILTER, statuses: ['confirmed', 'reserved'], payments: ['open'] } },
  { key: 'waitlisted', filter: { ...NO_FILTER, statuses: ['waitlisted'] } },
  { key: 'reserved', filter: { ...NO_FILTER, statuses: ['reserved'] }, hideWhenEmpty: true },
  { key: 'cancelled', filter: { ...NO_FILTER, statuses: ['cancelled'] } },
];

const SAVED_KEY = 'eventflow.attendeeViews';
const sameList = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
const sameFilter = (a: ViewFilter, b: ViewFilter) =>
  sameList(a.roles, b.roles) && sameList(a.statuses, b.statuses) && sameList(a.payments, b.payments) && sameList(a.methods, b.methods) && sameList(a.tickets, b.tickets);

/** Gespeicherte Ansichten: pro Browser (localStorage), nur eine Bequemlichkeit. */
const NO_VIEWS: SavedView[] = [];
const viewListeners = new Set<() => void>();
let viewCache: { raw: string | null; views: SavedView[] } = { raw: null, views: NO_VIEWS };
const savedViewsStore = {
  subscribe(listener: () => void) {
    viewListeners.add(listener);
    return () => viewListeners.delete(listener);
  },
  get(): SavedView[] {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(SAVED_KEY);
    } catch {
      return NO_VIEWS;
    }
    if (raw === viewCache.raw) return viewCache.views;
    let views = NO_VIEWS;
    try {
      const parsed = JSON.parse(raw ?? '[]');
      if (Array.isArray(parsed)) views = parsed.filter((v) => v && typeof v.name === 'string' && v.filter && v.sort);
    } catch {
      /* unlesbar → leer */
    }
    viewCache = { raw, views };
    return views;
  },
  set(views: SavedView[]) {
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(views));
    } catch {
      /* nur Bequemlichkeit */
    }
    viewListeners.forEach((l) => l());
  },
};

function SortIcon({ sort, k }: { sort: RegistrationSort; k: RegistrationSort['key'] }) {
  if (sort.key !== k) return <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />;
  return sort.direction === 'asc' ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" />;
}

function useIsWide(query = '(min-width: 1280px)') {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return wide;
}

export function AttendeesTable({ eventId, rows, roles, seatsFree, readOnly, prices, initialView, openId, openCreate, intentKey = '' }: Props) {
  const t = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const router = useRouter();
  const { toast } = useToast();
  const handle = useActionFeedback();
  const panelHeadingId = useId();
  const wide = useIsWide();
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  const startView = BUILT_IN.find((v) => v.key === initialView);
  const [filter, setFilter] = useState<RegistrationFilter>(startView ? { ...EMPTY_FILTER, ...startView.filter } : { ...EMPTY_FILTER, ...NO_FILTER });
  const [sort, setSort] = useState<RegistrationSort>(DEFAULT_SORT);
  const saved = useSyncExternalStore(savedViewsStore.subscribe, savedViewsStore.get, () => NO_VIEWS);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(openId ?? null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(Boolean(openCreate) && !readOnly);
  const [active, setActive] = useState<{ row: RegistrationListRow; dialog: RowDialog } | null>(null);
  const [bulkInvoiceOpen, setBulkInvoiceOpen] = useState(false);
  const [bulkPending, startBulk] = useTransition();

  // Neue Anweisung aus der URL bei schon geöffneter Seite (z. B. zweite Suche): Zustand anpassen
  const [seenIntent, setSeenIntent] = useState(intentKey);
  if (intentKey !== seenIntent) {
    setSeenIntent(intentKey);
    if (openId) setDetailId(openId);
    if (openCreate && !readOnly) setCreateOpen(true);
    if (startView) setFilter({ ...EMPTY_FILTER, ...startView.filter });
  }

  // Parameter aus der URL (Suche, Cockpit, Kopfzeile) nur einmal auswerten, dann aus der Adresse entfernen
  useEffect(() => {
    if (!initialView && !openId && !openCreate) return;
    const url = new URL(window.location.href);
    ['view', 'r', 'new', 'n'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', url.toString());
  }, [initialView, openId, openCreate, intentKey]);

  const visible = useMemo(() => filterAndSort(rows, filter, sort), [rows, filter, sort]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const detailRow = detailId != null ? (byId.get(detailId) ?? null) : null;
  const roleLabel = useCallback((key: string) => roles.find((r) => r.key === key)?.label ?? key, [roles]);

  // Auswahl auf vorhandene Zeilen beschränken (z. B. nach Aktualisierung)
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const visibleSelected = visible.filter((r) => selected.has(r.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  const viewOf = (f: RegistrationFilter): ViewFilter => ({ roles: f.roles, statuses: f.statuses, payments: f.payments ?? [], methods: f.methods ?? [], tickets: f.tickets ?? [] });
  const current = viewOf(filter);
  const tabs: ViewTab[] = [
    ...BUILT_IN.map((v) => ({ v, count: filterAndSort(rows, { ...EMPTY_FILTER, ...v.filter }, sort).length }))
      .filter(({ v, count }) => !v.hideWhenEmpty || count > 0 || sameFilter(current, v.filter))
      .map(({ v, count }) => ({
        key: v.key,
        label: t(`views.${v.key}`),
        count,
        active: sameFilter(current, v.filter) && !saved.some((s) => sameFilter(current, viewOf(s.filter)) && s.filter.search === filter.search && filter.search !== ''),
        onSelect: () => setFilter({ ...EMPTY_FILTER, ...v.filter, search: filter.search }),
      })),
    ...saved.map((s) => ({
      key: s.id,
      label: s.name,
      count: filterAndSort(rows, s.filter, s.sort).length,
      active: sameFilter(current, viewOf(s.filter)) && s.filter.search === filter.search && !BUILT_IN.some((b) => sameFilter(current, b.filter) && !filter.search),
      onSelect: () => {
        setFilter({ ...EMPTY_FILTER, ...s.filter });
        setSort(s.sort);
      },
      onDelete: () => {
        savedViewsStore.set(saved.filter((x) => x.id !== s.id));
      },
    })),
  ];

  function saveView(name: string) {
    savedViewsStore.set([...saved, { id: `v${Date.now()}`, name, filter: { ...filter, ids: [] }, sort }]);
    toast({ title: t('viewSaved', { name }) });
  }

  const exportParams = (f: RegistrationFilter) => `/api/export/registrations?event=${eventId}&locale=${locale}&${filterToSearchParams(f, sort).toString()}`;

  function toggleSort(key: RegistrationSort['key']) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'name' ? 'asc' : 'desc' }));
  }
  const sortState = (key: RegistrationSort['key']) => (sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');

  function toggleRow(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function focusRow(index: number) {
    const i = Math.max(0, Math.min(visible.length - 1, index));
    setFocusIndex(i);
    tbodyRef.current?.querySelector<HTMLTableRowElement>(`tr[data-index="${i}"]`)?.focus();
  }
  function onRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, index: number, row: RegistrationListRow) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(index + 1);
      if (detailId != null) setDetailId(visible[Math.min(visible.length - 1, index + 1)]?.id ?? detailId);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(index - 1);
      if (detailId != null) setDetailId(visible[Math.max(0, index - 1)]?.id ?? detailId);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setDetailId(row.id);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleRow(row.id);
    }
  }

  // Esc schließt das Detailpanel (nicht, solange ein Dialog offen ist)
  useEffect(() => {
    if (detailId == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented || active || createOpen || bulkInvoiceOpen) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"]')) return;
      setDetailId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, active, createOpen, bulkInvoiceOpen]);

  // Sammelaktionen
  const emails = selectedRows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const invoiceable = selectedRows.filter(canIssueInvoice);
  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      toast({ title: t('bulkCopied', { count: emails.length }) });
    } catch {
      toast({ variant: 'destructive', title: t('bulkCopyFailed') });
    }
  }
  function assignRole(role: string) {
    startBulk(async () => {
      const result = await bulkAddRoleAction({ ids: selectedRows.map((r) => r.id), role });
      if (handle(result, { success: result.ok ? t('bulkRoleDone', { count: result.data.changed }) : undefined })) router.refresh();
    });
  }
  function issueInvoices() {
    startBulk(async () => {
      let ok = 0;
      let failed = 0;
      for (const row of invoiceable) {
        const result = await issueRegistrationInvoiceAction(row.id);
        if (result.ok) ok++;
        else failed++;
      }
      setBulkInvoiceOpen(false);
      toast({
        variant: failed > 0 ? 'destructive' : undefined,
        title: t('bulkInvoicesDone', { ok }),
        description: failed > 0 ? t('bulkInvoicesFailed', { failed }) : undefined,
      });
      router.refresh();
    });
  }

  const openDialog = (row: RegistrationListRow, dialog: RowDialog) => setActive({ row, dialog });

  const panel = detailRow && (
    <RegistrationDetailPanel
      key={detailRow.id}
      row={detailRow}
      roleLabel={roleLabel}
      readOnly={readOnly}
      onAction={(dialog) => openDialog(detailRow, dialog)}
      onClose={() => setDetailId(null)}
      version={rows}
      headingId={panelHeadingId}
    />
  );

  return (
    <div className={cn('grid items-start gap-5', panel && wide && 'grid-cols-[minmax(0,1fr)_420px]')}>
      <div className="flex min-w-0 flex-col gap-3.5">
        <AttendeesToolbar
          tabs={tabs}
          onSaveView={saveView}
          filter={filter}
          setFilter={(update) => setFilter((f) => update(f))}
          roles={roles}
          exportHref={exportParams(filter)}
          exportDisabled={visible.length === 0}
        />

        {selectedRows.length > 0 && (
          <div role="region" aria-label={t('selected', { count: selectedRows.length })} className="sticky top-[68px] z-20 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[#1C1A3F] px-3.5 py-2 text-sm text-white shadow-md">
            <span className="font-semibold" aria-live="polite">
              {t('selected', { count: selectedRows.length })}
            </span>
            <a href={emails.length ? `mailto:?bcc=${emails.map(encodeURIComponent).join(',')}` : undefined} title={t('bulkMailHint')} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
              <Mail aria-hidden className="size-4" />
              {t('bulkMail')}
            </a>
            <button type="button" onClick={copyEmails} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
              <Copy aria-hidden className="size-4" />
              {t('bulkCopy')}
            </button>
            {!readOnly && invoiceable.length > 0 && (
              <button type="button" onClick={() => setBulkInvoiceOpen(true)} disabled={bulkPending} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                <FileText aria-hidden className="size-4" />
                {t('bulkInvoices', { count: invoiceable.length })}
              </button>
            )}
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" disabled={bulkPending} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                    <Tag aria-hidden className="size-4" />
                    {t('bulkRole')}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {roles.map((r) => (
                    <DropdownMenuItem key={r.key} onSelect={() => assignRole(r.key)}>
                      {r.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <a href={exportParams({ ...EMPTY_FILTER, ids: selectedRows.map((r) => r.id) })} download className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
              <FileDown aria-hidden className="size-4" />
              {t('bulkExport')}
            </a>
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-white/10">
              <X aria-hidden className="size-4" />
              {t('bulkClear')}
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="w-10 py-2.5 pr-1 pl-3.5">
                    <Checkbox
                      checked={allVisibleSelected ? true : visibleSelected > 0 ? 'indeterminate' : false}
                      onCheckedChange={toggleAllVisible}
                      aria-label={t('selectAll')}
                      disabled={visible.length === 0}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-semibold" aria-sort={sortState('name')}>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('name')}>
                      {t('colName')} <SortIcon sort={sort} k="name" />
                    </button>
                  </th>
                  <th className={cn('px-3 py-2.5 font-semibold', panel && wide && 'hidden 2xl:table-cell')}>{t('colCompany')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('colStatus')}</th>
                  <th className="px-3 py-2.5 font-semibold">{t('colPayment')}</th>
                  <th className="px-3 py-2.5 text-right font-semibold">{t('colPrice')}</th>
                  <th className={cn('px-3 py-2.5 font-semibold', panel && wide && 'hidden')} aria-sort={sortState('registered')}>
                    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('registered')}>
                      {t('colRegistered')} <SortIcon sort={sort} k="registered" />
                    </button>
                  </th>
                  <th className="w-12 px-2 py-2.5">
                    <span className="sr-only">{t('colActions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={tbodyRef}>
                {visible.map((r, index) => {
                  const name = `${r.firstName} ${r.lastName}`.trim();
                  const isOpen = r.id === detailId;
                  const isSelected = selected.has(r.id);
                  const pTone = paymentTone(r);
                  return (
                    <tr
                      key={r.id}
                      data-index={index}
                      tabIndex={index === focusIndex ? 0 : -1}
                      onFocus={() => setFocusIndex(index)}
                      onKeyDown={(e) => onRowKeyDown(e, index, r)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('button, a, input, [role="checkbox"], [role="menuitem"]')) return;
                        setDetailId(r.id);
                      }}
                      aria-selected={isOpen}
                      aria-label={t('openDetails', { name })}
                      className={cn(
                        'cursor-pointer border-t align-top outline-none focus-visible:bg-accent/60 focus-visible:shadow-[inset_3px_0_0_hsl(var(--primary))]',
                        isOpen ? 'bg-brand-soft/70' : isSelected ? 'bg-brand-soft/40' : 'hover:bg-muted/40'
                      )}
                    >
                      <td className="py-2.5 pr-1 pl-3.5">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(r.id)} aria-label={t('selectRow', { name })} tabIndex={-1} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold">
                          {r.lastName}, {r.firstName}
                        </div>
                        <div className="text-[13px] text-muted-foreground">{r.email}</div>
                        {r.roles.length > 0 && !(r.roles.length === 1 && r.roles[0] === 'attendee') && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {r.roles
                              .filter((k) => k !== 'attendee')
                              .map((k) => (
                                <span key={k} className="rounded bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                                  {roleLabel(k)}
                                </span>
                              ))}
                          </div>
                        )}
                      </td>
                      <td className={cn('px-3 py-2.5', !r.company && 'text-muted-foreground', panel && wide && 'hidden 2xl:table-cell')}>{r.company || '–'}</td>
                      <td className="px-3 py-2.5">
                        <Pill tone={statusTone[r.status]}>{t(`status.${r.status}`)}</Pill>
                      </td>
                      <td className="px-3 py-2.5">
                        {pTone ? <Pill tone={pTone}>{r.invoiceOverdue ? t('paymentOverdue') : t(`payment.${r.paymentStatus}`)}</Pill> : <span className="text-muted-foreground">{t(`method.${r.paymentMethod}`)}</span>}
                        {pTone && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {r.invoiceNumber ? r.invoiceNumber : r.paymentMethod === 'invoice' ? t('noInvoice') : t(`method.${r.paymentMethod}`)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                        {formatEuro(r.priceCents, locale)}
                        {r.ticketType === 'member' && <div className="text-xs text-muted-foreground">{t('ticket.member')}</div>}
                      </td>
                      <td className={cn('px-3 py-2.5 whitespace-nowrap text-muted-foreground', panel && wide && 'hidden')}>
                        {format.dateTime(new Date(r.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {!readOnly && <RegistrationRowMenu row={r} onAction={(dialog) => openDialog(r, dialog)} />}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {rows.length === 0 ? t('empty') : t('noMatches')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t px-3.5 py-2.5 text-sm text-muted-foreground">
            <span aria-live="polite">{t('count', { visible: visible.length, total: rows.length })}</span>
            <span className="hidden md:inline">{t('keysHint')}</span>
          </div>
        </div>
      </div>

      {panel && wide && (
        <aside aria-labelledby={panelHeadingId} className="sticky top-[76px] h-[calc(100vh-100px)] overflow-hidden rounded-xl border bg-card shadow-[0_8px_30px_rgba(21,23,43,0.08)]">
          {panel}
        </aside>
      )}
      {!wide && (
        <Sheet open={Boolean(detailRow)} onOpenChange={(o) => !o && setDetailId(null)}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md [&>button:first-of-type]:hidden">
            <SheetTitle className="sr-only">{detailRow ? t('detail.label', { name: `${detailRow.firstName} ${detailRow.lastName}` }) : ''}</SheetTitle>
            <SheetDescription className="sr-only">{t('title')}</SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      )}

      {!readOnly && (
        <RegistrationFormDialog
          mode="create"
          eventId={eventId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          roles={roles}
          prices={prices}
          seatsFree={seatsFree}
        />
      )}

      <ConfirmDialog
        open={bulkInvoiceOpen}
        onOpenChange={setBulkInvoiceOpen}
        title={t('bulkInvoicesTitle', { count: invoiceable.length })}
        description={t('bulkInvoicesHint')}
        confirmLabel={t('bulkInvoicesConfirm')}
        onConfirm={issueInvoices}
      />

      {active && (
        <>
          <RegistrationFormDialog
            key={`edit-${active.row.id}`}
            mode="edit"
            registrationId={active.row.id}
            open={active.dialog === 'edit'}
            onOpenChange={(o) => !o && setActive(null)}
            roles={roles}
            prices={prices}
            seatsFree={seatsFree}
            priceLocked={['paid', 'partially_refunded', 'refunded'].includes(active.row.paymentStatus) || active.row.invoiceNumber !== null}
            defaultValues={{
              firstName: active.row.firstName,
              lastName: active.row.lastName,
              email: active.row.email ?? '',
              company: active.row.company ?? '',
              locale: active.row.locale,
              roles: active.row.roles,
              ticketType: active.row.ticketType,
              price: centsToInput(active.row.priceCents),
              billingCompany: active.row.billingCompany ?? '',
              billingAddress: active.row.billingAddress ?? '',
            }}
          />
          <CancelDialog
            key={`cancel-${active.row.id}`}
            registrationId={active.row.id}
            name={`${active.row.firstName} ${active.row.lastName}`}
            open={active.dialog === 'cancel'}
            onOpenChange={(o) => !o && setActive(null)}
          />
          <RefundDialog
            key={`refund-${active.row.id}`}
            registrationId={active.row.id}
            name={`${active.row.firstName} ${active.row.lastName}`}
            refundableCents={active.row.refundableCents}
            open={active.dialog === 'refund'}
            onOpenChange={(o) => !o && setActive(null)}
          />
          <IssueInvoiceDialog
            key={`invoice-${active.row.id}`}
            registrationId={active.row.id}
            name={`${active.row.firstName} ${active.row.lastName}`}
            amount={formatEuro(active.row.priceCents, locale)}
            open={active.dialog === 'invoice'}
            onOpenChange={(o) => !o && setActive(null)}
          />
          <ConfirmWaitlistedDialog
            key={`confirm-${active.row.id}`}
            registrationId={active.row.id}
            name={`${active.row.firstName} ${active.row.lastName}`}
            seatsFree={seatsFree}
            open={active.dialog === 'confirm'}
            onOpenChange={(o) => !o && setActive(null)}
          />
        </>
      )}
    </div>
  );
}
