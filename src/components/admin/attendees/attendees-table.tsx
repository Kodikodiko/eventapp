'use client';

import { ArrowDown, ArrowUp, ArrowUpDown, Award, Check, ChevronRight, Copy, FileDown, FileText, Mail, MoreHorizontal, Tag, Undo2, UserCheck, Wallet, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { centsToInput, formatEuro } from '@/lib/money';
import { companySuggestions, GROUP_BY_KEYS, groupRows, type GroupBy } from '@/lib/registration-groups';
import {
  DEFAULT_SORT,
  EMPTY_FILTER,
  filterAndSort,
  filterToSearchParams,
  type PaymentStatusKey,
  type RegistrationStatusKey,
  toggleSelection,
  type RegistrationFilter,
  type RegistrationSort,
} from '@/lib/registrations-filter';
import { cn } from '@/lib/utils';
import { bulkAddRoleAction } from '@/server/actions/admin';
import { issueRegistrationInvoiceAction } from '@/server/actions/invoices';
import { confirmWaitlistedAction, setPaymentStatusAction } from '@/server/actions/registrations';
import type { RegistrationListRow } from '@/server/services/registrations';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';
import { AttendeesToolbar, type FilterCounts, type ViewTab } from './attendees-toolbar';
import { BulkRefundDialog } from './bulk-refund-dialog';
import { RegistrationDetailPanel } from './registration-detail-panel';
import { RegistrationFormDialog, type PriceOptions } from './registration-form-dialog';
import { RegistrationQuickAdd } from './registration-quick-add';
import {
  CancelDialog,
  canChangePayment,
  canIssueInvoice,
  ConfirmWaitlistedDialog,
  IssueInvoiceDialog,
  PaymentStatusDialog,
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
  prices: PriceOptions;
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
const GROUP_KEY = 'eventflow.attendeeGroupBy';
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

/** Gruppierung pro Browser merken (localStorage, nur Bequemlichkeit). */
const groupListeners = new Set<() => void>();
const groupByStore = {
  subscribe(listener: () => void) {
    groupListeners.add(listener);
    return () => groupListeners.delete(listener);
  },
  get(): GroupBy {
    try {
      const saved = window.localStorage.getItem(GROUP_KEY);
      return saved && (GROUP_BY_KEYS as readonly string[]).includes(saved) ? (saved as GroupBy) : 'none';
    } catch {
      return 'none';
    }
  },
  set(next: GroupBy) {
    try {
      window.localStorage.setItem(GROUP_KEY, next);
    } catch {
      /* ohne Speicher gilt die Wahl nur bis zum Neuladen nicht */
    }
    groupListeners.forEach((l) => l());
  },
};

function SortIcon({ sort, k }: { sort: RegistrationSort; k: RegistrationSort['key'] }) {
  if (sort.key !== k) return <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />;
  return sort.direction === 'asc' ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" />;
}

function useIsWide(query = '(min-width: 1024px)') {
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

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Teilnehmerliste (neue Oberfläche, UI-Redesign 18.11.2026): kompakte Zeilen, sichtbare Filter, Schnellaktionen in der Zeile,
 * Detail als Seitenleiste über der Liste (J/K blättern), schwebende Massenleiste und Schnell-Anmeldung.
 * Alle Änderungen laufen über dieselben Aktionen und Dialoge wie in der alten Oberfläche.
 */
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
  const [bulkRefundOpen, setBulkRefundOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkPaidOpen, setBulkPaidOpen] = useState(false);
  const [paidNote, setPaidNote] = useState('');
  const [paidOn, setPaidOn] = useState(today);
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
  const groupBy = useSyncExternalStore(groupByStore.subscribe, groupByStore.get, () => 'none' as GroupBy);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function setGroupBy(next: GroupBy) {
    groupByStore.set(next);
    setCollapsed(new Set());
  }
  const roleOrder = useMemo(() => roles.map((r) => r.key), [roles]);
  const companies = useMemo(() => companySuggestions(rows.flatMap((r) => [r.company, r.billingCompany])), [rows]);
  const groups = useMemo(() => groupRows(visible, groupBy, roleOrder), [visible, groupBy, roleOrder]);
  const indexOf = useMemo(() => new Map(visible.map((r, i) => [r.id, i])), [visible]);
  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Anzahl je Filterwert: über die übrigen aktiven Filter, nur der eigene Filter bleibt außen vor
  const counts = useMemo<FilterCounts>(() => {
    const countBy = (key: 'roles' | 'payments' | 'tickets' | 'methods', values: (r: RegistrationListRow) => string[]) => {
      const base = filterAndSort(rows, { ...filter, [key]: [] }, sort);
      const m = new Map<string, number>();
      for (const r of base) for (const v of values(r)) m.set(v, (m.get(v) ?? 0) + 1);
      return m;
    };
    return {
      roles: countBy('roles', (r) => r.roles),
      payments: countBy('payments', (r) => [r.paymentStatus]),
      tickets: countBy('tickets', (r) => [r.ticketType]),
      methods: countBy('methods', (r) => [r.paymentMethod]),
    };
  }, [rows, filter, sort]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const detailRow = detailId != null ? (byId.get(detailId) ?? null) : null;
  const roleLabel = useCallback((key: string) => roles.find((r) => r.key === key)?.label ?? key, [roles]);

  // Auswahl auf vorhandene Zeilen beschränken (z. B. nach Aktualisierung)
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const visibleSelected = visible.filter((r) => selected.has(r.id)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;

  const viewOf = (f: RegistrationFilter): ViewFilter => ({ roles: f.roles, statuses: f.statuses, payments: f.payments ?? [], methods: f.methods ?? [], tickets: f.tickets ?? [] });
  const current = viewOf(filter);
  // Reiter = Status; die übrigen Filter (Rolle, Zahlung, Ticket …) bleiben beim Wechsel erhalten und „verlieren“ den Reiter nicht
  const isPaymentOpenView = sameList(current.statuses, BUILT_IN[2].filter.statuses) && sameList(current.payments, ['open']);
  const tabActive = (v: BuiltInView) => sameList(current.statuses, v.filter.statuses) && (v.key === 'paymentOpen' ? isPaymentOpenView : !isPaymentOpenView);
  const selectTab = (v: BuiltInView) =>
    setFilter((f) => ({ ...f, statuses: v.filter.statuses, payments: v.key === 'paymentOpen' ? ['open'] : isPaymentOpenView ? [] : (f.payments ?? []) }));
  const tabs: ViewTab[] = [
    ...BUILT_IN.map((v) => ({ v, count: filterAndSort(rows, { ...EMPTY_FILTER, ...v.filter }, sort).length }))
      .filter(({ v, count }) => !v.hideWhenEmpty || count > 0 || sameFilter(current, v.filter))
      .map(({ v, count }) => ({
        key: v.key,
        label: t(`views.${v.key}`),
        count,
        active: tabActive(v) && !saved.some((s) => sameFilter(current, viewOf(s.filter)) && s.filter.search === filter.search),
        onSelect: () => selectTab(v),
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
    const el = tbodyRef.current?.querySelector<HTMLTableRowElement>(`tr[data-index="${i}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
    return visible[i];
  }
  function step(delta: number) {
    const from = detailId != null ? (indexOf.get(detailId) ?? focusIndex) : focusIndex;
    const row = focusRow(from + delta);
    if (detailId != null && row) setDetailId(row.id);
  }
  function onRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, index: number, row: RegistrationListRow) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setDetailId(row.id);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleRow(row.id);
    }
    void index;
  }

  const dialogOpen = Boolean(active) || createOpen || bulkInvoiceOpen || bulkRefundOpen || bulkConfirmOpen || bulkPaidOpen;
  // Tastatur: J/K blättern, X auswählen, N neue Anmeldung, Esc schließt das Detail (nicht in Eingabefeldern oder Dialogen)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || dialogOpen || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"]')) return;
      const k = e.key.toLowerCase();
      if (k === 'j') {
        e.preventDefault();
        step(1);
      } else if (k === 'k') {
        e.preventDefault();
        step(-1);
      } else if (k === 'x') {
        const row = detailId != null ? byId.get(detailId) : visible[focusIndex];
        if (row) {
          e.preventDefault();
          toggleRow(row.id);
        }
      } else if (k === 'n' && !readOnly) {
        e.preventDefault();
        setCreateOpen(true);
      } else if (e.key === 'Escape' && detailId != null) {
        setDetailId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Sammelaktionen
  const emails = selectedRows.map((r) => r.email).filter((e): e is string => Boolean(e));
  const invoiceable = selectedRows.filter(canIssueInvoice);
  const certificateHref = (...ids: number[]) => `/api/export/certificates?event=${eventId}&ids=${ids.join(',')}`;
  // Teilnahmebestätigung: für alle angehakten Personen (Auswahl entscheidet, nicht der Status)
  const certifiable = selectedRows;
  const refundCandidates = selectedRows.filter((r) => r.status !== 'cancelled' || r.refundableCents > 0);
  const confirmable = selectedRows.filter((r) => r.status === 'waitlisted');
  const payable = selectedRows.filter((r) => r.status !== 'cancelled' && r.paymentStatus === 'open' && canChangePayment(r));
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
  /** Einzelaktion für jede gewählte Zeile ausführen und gesammelt melden */
  function runEach(list: RegistrationListRow[], run: (row: RegistrationListRow) => Promise<{ ok: boolean }>, done: (ok: number) => string, close: () => void) {
    startBulk(async () => {
      let ok = 0;
      let failed = 0;
      for (const row of list) {
        const result = await run(row);
        if (result.ok) ok++;
        else failed++;
      }
      close();
      toast({ variant: failed > 0 ? 'destructive' : undefined, title: done(ok), description: failed > 0 ? t('bulkFailed', { failed }) : undefined });
      router.refresh();
    });
  }
  const issueInvoices = () => runEach(invoiceable, (r) => issueRegistrationInvoiceAction(r.id), (ok) => t('bulkInvoicesDone', { ok }), () => setBulkInvoiceOpen(false));
  const confirmAll = () => runEach(confirmable, (r) => confirmWaitlistedAction(r.id, false), (ok) => t('bulkConfirmDone', { ok }), () => setBulkConfirmOpen(false));
  const markAllPaid = () =>
    runEach(
      payable,
      (r) => setPaymentStatusAction(r.id, { status: 'paid', note: paidNote, paidOn }),
      (ok) => t('bulkPaidDone', { ok }),
      () => {
        setBulkPaidOpen(false);
        setPaidNote('');
      }
    );

  const openDialog = (row: RegistrationListRow, dialog: RowDialog) => setActive({ row, dialog });

  /** Klick auf ein Tag (Rolle, Status, Zahlung, Ticket): Wert zum Filter hinzufügen bzw. wieder entfernen */
  const toggleFilter = (key: 'roles' | 'statuses' | 'payments' | 'tickets', value: string) =>
    setFilter((f) => ({ ...f, [key]: toggleSelection(((f[key] as string[] | undefined) ?? []) as string[], value, true) }));

  const detailIndex = detailRow ? (indexOf.get(detailRow.id) ?? -1) : -1;
  const panel = detailRow && (
    <RegistrationDetailPanel
      key={detailRow.id}
      row={detailRow}
      nav={detailIndex >= 0 ? { position: detailIndex + 1, total: visible.length, onPrev: () => step(-1), onNext: () => step(1) } : undefined}
      certificateHref={certificateHref(detailRow.id)}
      roleLabel={roleLabel}
      readOnly={readOnly}
      onAction={(dialog) => openDialog(detailRow, dialog)}
      onClose={() => setDetailId(null)}
      onFilter={toggleFilter}
      version={rows}
      headingId={panelHeadingId}
    />
  );

  const renderRow = (r: RegistrationListRow, index: number, rowKey: string | number, alsoIn?: string[]) => {
    const name = `${r.firstName} ${r.lastName}`.trim();
    const isOpen = r.id === detailId;
    const isSelected = selected.has(r.id);
    const pTone = paymentTone(r);
    const quickConfirm = !readOnly && r.status === 'waitlisted';
    const quickPaid = !readOnly && r.status !== 'cancelled' && r.paymentStatus === 'open' && canChangePayment(r);
    return (
      <tr
        key={rowKey}
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
          'group cursor-pointer border-t outline-none focus-visible:bg-accent/60 focus-visible:shadow-[inset_3px_0_0_hsl(var(--primary))]',
          isOpen ? 'bg-brand-soft shadow-[inset_3px_0_0_hsl(var(--primary))]' : isSelected ? 'bg-brand-soft/50' : 'hover:bg-muted/40'
        )}
      >
        <td className="w-10 py-1.5 pr-1 pl-3.5">
          <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(r.id)} aria-label={t('selectRow', { name })} tabIndex={-1} />
        </td>
        <td className="max-w-0 px-3 py-1.5">
          <div className="truncate leading-tight font-semibold">
            {r.lastName}, {r.firstName}
          </div>
          <div className="truncate text-xs leading-tight text-muted-foreground">
            {r.email}
            {alsoIn && alsoIn.length > 0 && <span className="italic"> · {t('groupAlsoIn', { roles: alsoIn.map(roleLabel).join(', ') })}</span>}
          </div>
        </td>
        <td className={cn('max-w-0 truncate px-3 py-1.5', !r.company && 'text-muted-foreground')}>{r.company || '–'}</td>
        <td className="hidden px-3 py-1.5 xl:table-cell">
          <div className="flex gap-1 overflow-hidden">
            {r.roles.map((k) => {
              const on = filter.roles.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleFilter('roles', k)}
                  aria-pressed={on}
                  title={on ? t('roleTagRemove', { role: roleLabel(k) }) : t('roleTagFilter', { role: roleLabel(k) })}
                  className={cn(
                    'rounded-md border px-1.5 py-px text-[11px] font-medium whitespace-nowrap',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:border-primary hover:text-primary'
                  )}
                >
                  {roleLabel(k)}
                </button>
              );
            })}
          </div>
        </td>
        <td className="px-3 py-1.5">
          <Pill tone={statusTone[r.status]}>{t(`status.${r.status}`)}</Pill>
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap">
          {pTone ? (
            <span className={cn('inline-flex items-center gap-1.5', r.invoiceOverdue && 'font-semibold text-destructive')} title={r.invoiceNumber ?? undefined}>
              <span aria-hidden className={cn('size-1.5 rounded-full', r.invoiceOverdue ? 'bg-destructive' : r.paymentStatus === 'open' ? 'bg-amber-500' : r.paymentStatus === 'paid' ? 'bg-primary' : 'bg-orange-400')} />
              {r.invoiceOverdue ? t('paymentOverdue') : t(`payment.${r.paymentStatus}`)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t(`method.${r.paymentMethod}`)}</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
          {formatEuro(r.priceCents, locale)}
          {(r.ticketType !== 'normal' || r.priceTier === 'early_bird' || r.discountCode) && (
            <div className="max-w-[9rem] truncate text-[11px] leading-tight text-muted-foreground">
              {[
                r.ticketType === 'special' && r.priceCategoryName ? r.priceCategoryName : r.ticketType !== 'normal' ? t(`ticket.${r.ticketType}`) : null,
                r.priceTier === 'early_bird' ? 'Early Bird' : null,
                r.discountCode ? `Code ${r.discountCode}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </td>
        <td className="hidden px-3 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums lg:table-cell">
          {format.dateTime(new Date(r.createdAt), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="relative py-1 pr-2 pl-1 text-right whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {(quickConfirm || quickPaid) && (
              // Schnellaktionen erscheinen beim Überfahren über Datum/Preis, ohne eigene Spalte
              <span className="pointer-events-none absolute top-1/2 right-11 flex -translate-y-1/2 gap-1 rounded-lg bg-card/95 p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                {quickConfirm && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openDialog(r, 'confirm')}>
                    <UserCheck aria-hidden />
                    {t('quickConfirm')}
                  </Button>
                )}
                {quickPaid && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openDialog(r, 'payment')}>
                    <Wallet aria-hidden />
                    {t('quickPaid')}
                  </Button>
                )}
              </span>
            )}
            {!readOnly && <RegistrationRowMenu row={r} onAction={(dialog) => openDialog(r, dialog)} certificateHref={certificateHref(r.id)} />}
          </span>
        </td>
      </tr>
    );
  };

  const bulkBtn = 'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 whitespace-nowrap hover:bg-white/10 disabled:opacity-50';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <AttendeesToolbar
        tabs={tabs}
        onSaveView={saveView}
        filter={filter}
        setFilter={(update) => setFilter((f) => update(f))}
        roles={roles}
        counts={counts}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        exportHref={exportParams(filter)}
        exportDisabled={visible.length === 0}
      />

      {groupBy !== 'none' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {groups.length > 1 && (
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => setCollapsed(collapsed.size === groups.length ? new Set() : new Set(groups.map((g) => g.key)))}
            >
              {collapsed.size === groups.length ? t('groupExpandAll') : t('groupCollapseAll')}
            </button>
          )}
          {groupBy === 'role' && <span className="text-xs text-muted-foreground">{t('groupRoleHint')}</span>}
        </div>
      )}

      <div className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', selectedRows.length > 0 && 'mb-16')}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-[180px]" />
              <col className="hidden w-[150px] xl:table-column" />
              <col className="w-[108px]" />
              <col className="w-[118px]" />
              <col className="w-[104px]" />
              <col className="hidden w-[104px] lg:table-column" />
              <col className="w-12" />
            </colgroup>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2.5 pr-1 pl-3.5">
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
                <th className="px-3 py-2.5 font-semibold">{t('colCompany')}</th>
                <th className="hidden px-3 py-2.5 font-semibold xl:table-cell">{t('colRoles')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('colStatus')}</th>
                <th className="px-3 py-2.5 font-semibold">{t('colPayment')}</th>
                <th className="px-3 py-2.5 text-right font-semibold">{t('colPrice')}</th>
                <th className="hidden px-3 py-2.5 font-semibold lg:table-cell" aria-sort={sortState('registered')}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('registered')}>
                    {t('colRegistered')} <SortIcon sort={sort} k="registered" />
                  </button>
                </th>
                <th className="px-2 py-2.5">
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {groupBy === 'none'
                ? visible.map((r, index) => renderRow(r, index, r.id))
                : groups.map((g) => {
                    const open = !collapsed.has(g.key);
                    const title =
                      groupBy === 'company'
                        ? (g.label ?? t('groupNoCompany'))
                        : groupBy === 'role'
                          ? g.key
                            ? roleLabel(g.key)
                            : t('groupNoRole')
                          : groupBy === 'status'
                            ? t(`status.${g.key as RegistrationStatusKey}`)
                            : t(`payment.${g.key as PaymentStatusKey}`);
                    return (
                      <Fragment key={`g-${g.key}`}>
                        <tr className="border-t bg-muted/50">
                          <td colSpan={9} className="px-3.5 py-2">
                            <button type="button" aria-expanded={open} onClick={() => toggleGroup(g.key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left">
                              <ChevronRight aria-hidden className={cn('size-4 transition-transform', open && 'rotate-90')} />
                              <span className="font-semibold">{title}</span>
                              <span className="text-muted-foreground">
                                {groupBy === 'payment'
                                  ? t('groupStatsPayment', { count: g.live, cancelled: g.cancelled, sum: formatEuro(g.sumCents, locale) })
                                  : t('groupStats', { count: g.live, cancelled: g.cancelled, paid: g.paid, open: g.open, sum: formatEuro(g.sumCents, locale) })}
                              </span>
                            </button>
                          </td>
                        </tr>
                        {open &&
                          g.rows.map((r) => renderRow(r, indexOf.get(r.id) ?? 0, `${g.key}-${r.id}`, groupBy === 'role' ? r.roles.filter((k) => k !== g.key) : undefined))}
                      </Fragment>
                    );
                  })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {rows.length === 0 ? t('empty') : t('noMatches')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t px-3.5 py-2.5 text-xs text-muted-foreground">
          <span aria-live="polite">{t('count', { visible: visible.length, total: rows.length })}</span>
          <span className="hidden md:inline">{t('keysHintNew')}</span>
        </div>
      </div>

      {/* Massenleiste: schwebt unten, die Tabelle springt nicht */}
      {selectedRows.length > 0 && (
        <div
          role="region"
          aria-label={t('selected', { count: selectedRows.length })}
          className="fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl bg-[#15172B] p-1.5 pl-4 text-sm text-white shadow-[0_12px_32px_-8px_rgba(21,23,43,0.45)] lg:left-[calc(50%+124px)] lg:max-w-[calc(100vw-280px)]"
        >
          <span className="mr-2 font-semibold whitespace-nowrap" aria-live="polite">
            {t('selected', { count: selectedRows.length })}
          </span>
          {!readOnly && confirmable.length > 0 && (
            <button type="button" onClick={() => setBulkConfirmOpen(true)} disabled={bulkPending} className={bulkBtn}>
              <Check aria-hidden className="size-4" />
              {t('bulkConfirm', { count: confirmable.length })}
            </button>
          )}
          {!readOnly && payable.length > 0 && (
            <button type="button" onClick={() => setBulkPaidOpen(true)} disabled={bulkPending} className={bulkBtn}>
              <Wallet aria-hidden className="size-4" />
              {t('bulkPaid', { count: payable.length })}
            </button>
          )}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" disabled={bulkPending} className={bulkBtn}>
                  <Tag aria-hidden className="size-4" />
                  {t('bulkRole')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top">
                {roles.map((r) => (
                  <DropdownMenuItem key={r.key} onSelect={() => assignRole(r.key)}>
                    {r.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <a href={emails.length ? `mailto:?bcc=${emails.map(encodeURIComponent).join(',')}` : undefined} title={t('bulkMailHint')} className={bulkBtn}>
            <Mail aria-hidden className="size-4" />
            {t('bulkMail')}
          </a>
          <a href={exportParams({ ...EMPTY_FILTER, ids: selectedRows.map((r) => r.id) })} download className={bulkBtn}>
            <FileDown aria-hidden className="size-4" />
            {t('bulkExport')}
          </a>
          {/* seltener gebrauchte Sammelaktionen */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={bulkPending} className={bulkBtn}>
                <MoreHorizontal aria-hidden className="size-4" />
                {t('bulkMore')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-64">
              <DropdownMenuItem onSelect={copyEmails}>
                <Copy aria-hidden />
                {t('bulkCopy')}
              </DropdownMenuItem>
              {!readOnly && invoiceable.length > 0 && (
                <DropdownMenuItem onSelect={() => setBulkInvoiceOpen(true)}>
                  <FileText aria-hidden />
                  {t('bulkInvoices', { count: invoiceable.length })}
                </DropdownMenuItem>
              )}
              {certifiable.length > 0 && (
                <DropdownMenuItem asChild>
                  <a href={certificateHref(...certifiable.map((r) => r.id))} download title={t('bulkCertificateHint')}>
                    <Award aria-hidden />
                    {t('bulkCertificate', { count: certifiable.length })}
                  </a>
                </DropdownMenuItem>
              )}
              {!readOnly && refundCandidates.length > 0 && (
                <DropdownMenuItem onSelect={() => setBulkRefundOpen(true)} className="text-destructive focus:text-destructive">
                  <Undo2 aria-hidden />
                  {t('bulkRefund', { count: refundCandidates.length })}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={() => setSelected(new Set())} aria-label={t('bulkClear')} title={t('bulkClear')} className="ml-1 rounded-xl p-2 text-white/70 hover:bg-white/10">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      {/* Detail als Seitenleiste über der Liste (breit) bzw. als Sheet (schmal) */}
      {panel && wide && (
        <aside
          aria-labelledby={panelHeadingId}
          className="fixed top-[60px] right-0 bottom-0 z-30 w-[440px] max-w-full border-l bg-card shadow-[-12px_0_32px_-12px_rgba(21,23,43,0.25)] print:hidden"
        >
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
        <RegistrationQuickAdd eventId={eventId} open={createOpen} onOpenChange={setCreateOpen} roles={roles} prices={prices} seatsFree={seatsFree} companies={companies} />
      )}

      <ConfirmDialog
        open={bulkInvoiceOpen}
        onOpenChange={setBulkInvoiceOpen}
        title={t('bulkInvoicesTitle', { count: invoiceable.length })}
        description={t('bulkInvoicesHint')}
        confirmLabel={t('bulkInvoicesConfirm')}
        onConfirm={issueInvoices}
      />
      <ConfirmDialog
        open={bulkConfirmOpen}
        onOpenChange={setBulkConfirmOpen}
        title={t('bulkConfirmTitle', { count: confirmable.length })}
        description={t('bulkConfirmHint', { free: seatsFree })}
        confirmLabel={t('bulkConfirmAction', { count: confirmable.length })}
        onConfirm={confirmAll}
      />
      <Dialog open={bulkPaidOpen} onOpenChange={setBulkPaidOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (paidNote.trim()) markAllPaid();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>{t('bulkPaidTitle', { count: payable.length })}</DialogTitle>
              <DialogDescription>{t('bulkPaidHint')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-paid-note">{t('bulkPaidNote')}</Label>
                <Input id="bulk-paid-note" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} maxLength={500} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-paid-on">{t('bulkPaidOn')}</Label>
                <Input id="bulk-paid-on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkPaidOpen(false)}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={!paidNote.trim() || bulkPending}>
                {t('bulkPaidAction', { count: payable.length })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {!readOnly && (
        <BulkRefundDialog ids={refundCandidates.map((r) => r.id)} open={bulkRefundOpen} onOpenChange={setBulkRefundOpen} onDone={() => setSelected(new Set())} />
      )}

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
            companies={companies}
            priceLocked={['paid', 'partially_refunded', 'refunded'].includes(active.row.paymentStatus) || active.row.invoiceNumber !== null}
            defaultValues={{
              firstName: active.row.firstName,
              lastName: active.row.lastName,
              email: active.row.email ?? '',
              company: active.row.company ?? '',
              locale: active.row.locale,
              roles: active.row.roles,
              ticketType: active.row.ticketType,
              priceCategoryId: active.row.priceCategoryId ? String(active.row.priceCategoryId) : '',
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
          <PaymentStatusDialog
            key={`payment-${active.row.id}`}
            registrationId={active.row.id}
            name={`${active.row.firstName} ${active.row.lastName}`}
            open={active.dialog === 'payment'}
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
