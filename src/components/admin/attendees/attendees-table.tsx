'use client';

import { ArrowUpDown, FileDown, ListFilter, Plus, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { formatEuro } from '@/lib/money';
import {
  DEFAULT_SORT,
  EMPTY_FILTER,
  filterAndSort,
  filterToSearchParams,
  REGISTRATION_STATUS_KEYS,
  toggleSelection,
  type RegistrationFilter,
  type RegistrationSort,
  type RegistrationStatusKey,
} from '@/lib/registrations-filter';
import type { RegistrationListRow } from '@/server/services/registrations';
import { RegistrationFormDialog } from './registration-form-dialog';
import { centsToInput } from '@/lib/money';
import { CancelDialog, ConfirmWaitlistedDialog, IssueInvoiceDialog, RegistrationRowMenu, type RowDialog } from './registration-row-actions';

export type RoleOption = { key: string; label: string };

type Props = {
  eventId: number;
  rows: RegistrationListRow[];
  roles: RoleOption[];
  seatsFree: number;
  readOnly: boolean;
  prices: { normal: string; member: string };
};

const statusVariant: Record<RegistrationStatusKey, BadgeProps['variant']> = {
  confirmed: 'default',
  reserved: 'secondary',
  waitlisted: 'outline',
  cancelled: 'destructive',
};

const paymentVariant: Record<RegistrationListRow['paymentStatus'], BadgeProps['variant']> = {
  paid: 'paid',
  open: 'outline',
  partially_refunded: 'secondary',
  refunded: 'secondary',
  not_required: 'secondary',
};

export function AttendeesTable({ eventId, rows, roles, seatsFree, readOnly, prices }: Props) {
  const t = useTranslations('attendees');
  const locale = useLocale();
  const format = useFormatter();
  const [filter, setFilter] = useState<RegistrationFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<RegistrationSort>(DEFAULT_SORT);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<{ row: RegistrationListRow; dialog: RowDialog } | null>(null);

  const visible = useMemo(() => filterAndSort(rows, filter, sort), [rows, filter, sort]);
  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const filtersActive = filter.roles.length > 0 || filter.statuses.length > 0 || filter.search.trim() !== '';
  const exportHref = `/api/export/registrations?event=${eventId}&locale=${locale}&${filterToSearchParams(filter, sort).toString()}`;

  function toggleSort(key: RegistrationSort['key']) {
    setSort((s) => (s.key === key ? { key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'name' ? 'asc' : 'desc' }));
  }
  const sortState = (key: RegistrationSort['key']) =>
    sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="h-8 w-56"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={filter.roles.length || filter.statuses.length ? 'secondary' : 'outline'} size="sm">
              <ListFilter aria-hidden className="size-4" />
              {t('filter')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t('filterRoles')}</DropdownMenuLabel>
            {roles.map((r) => (
              <DropdownMenuCheckboxItem
                key={r.key}
                checked={filter.roles.includes(r.key)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => setFilter((f) => ({ ...f, roles: toggleSelection(f.roles, r.key, true) }))}
              >
                {r.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('filterStatus')}</DropdownMenuLabel>
            {REGISTRATION_STATUS_KEYS.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={filter.statuses.includes(s)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => setFilter((f) => ({ ...f, statuses: toggleSelection(f.statuses, s, true) }))}
              >
                {t(`status.${s}`)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={() => setFilter(EMPTY_FILTER)}>
            <X aria-hidden className="size-4" />
            {t('clear')}
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild disabled={visible.length === 0}>
            <a href={exportHref} download>
              <FileDown aria-hidden className="size-4" />
              {t('export.button')}
            </a>
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden className="size-4" />
              {t('add')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('badgeHint')}</p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium" aria-sort={sortState('name')}>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('name')}>
                  {t('colName')} <ArrowUpDown aria-hidden className="size-3.5" />
                </button>
              </th>
              <th className="p-2 font-medium">{t('colCompany')}</th>
              <th className="p-2 font-medium">{t('colRoles')}</th>
              <th className="p-2 font-medium">{t('colStatus')}</th>
              <th className="p-2 font-medium">{t('colPayment')}</th>
              <th className="p-2 text-right font-medium">{t('colPrice')}</th>
              <th className="p-2 font-medium" aria-sort={sortState('registered')}>
                <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('registered')}>
                  {t('colRegistered')} <ArrowUpDown aria-hidden className="size-3.5" />
                </button>
              </th>
              <th className="p-2">
                <span className="sr-only">{t('colActions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2">
                  <div className="font-medium">
                    {r.lastName}, {r.firstName}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </td>
                <td className="p-2">{r.company}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {r.roles.map((key) => (
                      <button
                        key={key}
                        type="button"
                        title={t('badgeHint')}
                        onClick={(e) => setFilter((f) => ({ ...f, roles: toggleSelection(f.roles, key, e.ctrlKey || e.metaKey) }))}
                      >
                        <Badge variant={filter.roles.includes(key) ? 'default' : 'secondary'}>{roleLabel(key)}</Badge>
                      </button>
                    ))}
                  </div>
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    title={t('badgeHint')}
                    onClick={(e) => setFilter((f) => ({ ...f, statuses: toggleSelection(f.statuses, r.status, e.ctrlKey || e.metaKey) }))}
                  >
                    <Badge variant={statusVariant[r.status]}>{t(`status.${r.status}`)}</Badge>
                  </button>
                </td>
                <td className="p-2">
                  <Badge variant={paymentVariant[r.paymentStatus]}>{t(`payment.${r.paymentStatus}`)}</Badge>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t(`method.${r.paymentMethod}`)}
                    {r.invoiceNumber && <> · {r.invoiceNumber}</>}
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums whitespace-nowrap">
                  {formatEuro(r.priceCents, locale as 'de' | 'en')}
                  {r.ticketType === 'member' && <div className="text-xs text-muted-foreground">{t('ticket.member')}</div>}
                </td>
                <td className="p-2 whitespace-nowrap">{format.dateTime(new Date(r.createdAt), { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="p-2 text-right">
                  {!readOnly && <RegistrationRowMenu row={r} onAction={(dialog) => setActive({ row: r, dialog })} />}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  {rows.length === 0 ? t('empty') : t('noMatches')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('count', { visible: visible.length, total: rows.length })}
      </p>

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
          <IssueInvoiceDialog
            key={`invoice-${active.row.id}`}
            registrationId={active.row.id}
            name={`${active.row.firstName} ${active.row.lastName}`}
            amount={formatEuro(active.row.priceCents, locale as 'de' | 'en')}
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
