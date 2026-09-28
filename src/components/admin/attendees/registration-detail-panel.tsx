'use client';

import { Download, Eye, FileText, Landmark, MoreHorizontal, Pencil, UserCheck, X } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Locale } from '@/i18n/routing';
import { formatDateOnly } from '@/lib/dates';
import { formatEuro } from '@/lib/money';
import { cn } from '@/lib/utils';
import { registrationDetailAction } from '@/server/actions/admin';
import type { InvoiceListRow } from '@/server/services/invoices';
import type { RegistrationDetail } from '@/server/services/registration-detail';
import type { RegistrationListRow } from '@/server/services/registrations';
import { PaymentDialog } from '../invoices/invoices-view';
import { canIssueInvoice, RegistrationRowMenu, type RowDialog } from './registration-row-actions';
import { paymentTone, Pill, statusTone, type PillTone } from './status-pill';

type Props = {
  row: RegistrationListRow;
  roleLabel: (key: string) => string;
  readOnly: boolean;
  onAction: (dialog: RowDialog) => void;
  onClose: () => void;
  /** Kennung des Datenstands: ändert sich nach jeder Aktion, damit das Panel neu lädt */
  version: unknown;
  headingId: string;
};

const invoiceTone: Record<InvoiceListRow['state'], PillTone> = { open: 'amber', overdue: 'red', paid: 'indigo', cancelled: 'grey', credit_note: 'grey' };

function historyTone(action: string): string {
  if (action.includes('cancel') || action.includes('reminder')) return 'bg-destructive';
  if (action.startsWith('refund')) return 'bg-cta';
  if (action.includes('created') || action.includes('confirmed') || action.includes('paid') || action.includes('payment')) return 'bg-[#17603C]';
  return 'bg-primary';
}

/** Detailpanel einer Anmeldung: Stammdaten, Belege, Verlauf und die wichtigsten Aktionen. */
export function RegistrationDetailPanel({ row, roleLabel, readOnly, onAction, onClose, version, headingId }: Props) {
  const t = useTranslations('attendees');
  const tInv = useTranslations('invoices');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const [detail, setDetail] = useState<RegistrationDetail | null>(null);
  const [error, setError] = useState(false);
  const [payment, setPayment] = useState<InvoiceListRow | null>(null);

  useEffect(() => {
    let active = true;
    registrationDetailAction(row.id).then((r) => {
      if (!active) return;
      setError(!r.ok);
      if (r.ok) setDetail(r.data);
    });
    return () => {
      active = false;
    };
  }, [row.id, version]);

  const d = detail && detail.row.id === row.id ? detail : null;
  const name = `${row.firstName} ${row.lastName}`.trim();
  const initials = `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`.toUpperCase();
  const openInvoice = d?.invoices.find((i) => i.type === 'invoice' && (i.state === 'open' || i.state === 'overdue')) ?? null;
  const pTone = paymentTone(row);
  const dt = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  // Hauptaktion je nach Lage; die übrigen stehen unter „Weitere Aktionen“
  let primary: { label: string; icon: React.ReactNode; run: () => void; dialog?: RowDialog } | null = null;
  if (!readOnly) {
    if (openInvoice) primary = { label: t('detail.recordPayment'), icon: <Landmark aria-hidden />, run: () => setPayment(openInvoice) };
    else if (row.status === 'waitlisted') primary = { label: t('detail.confirm'), icon: <UserCheck aria-hidden />, run: () => onAction('confirm'), dialog: 'confirm' };
    else if (canIssueInvoice(row)) primary = { label: t('detail.issueInvoice'), icon: <FileText aria-hidden />, run: () => onAction('invoice'), dialog: 'invoice' };
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 border-b px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft font-bold text-primary">
              {initials}
            </span>
            <div className="flex min-w-0 flex-col">
              <h2 id={headingId} className="truncate text-lg font-bold">
                {name}
              </h2>
              <span className="truncate text-sm text-muted-foreground">{[row.company, row.locale.toUpperCase()].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('detail.close')}>
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={statusTone[row.status]}>{t(`status.${row.status}`)}</Pill>
          {pTone && <Pill tone={pTone}>{row.invoiceOverdue ? t('detail.overdueBadge') : t(`payment.${row.paymentStatus}`)}</Pill>}
          {row.ticketType === 'member' && <Pill tone="grey">{t('detail.member')}</Pill>}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {primary && (
              <Button size="sm" onClick={primary.run}>
                {primary.icon}
                {primary.label}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onAction('edit')}>
              <Pencil aria-hidden />
              {t('detail.edit')}
            </Button>
            <RegistrationRowMenu
              row={row}
              onAction={onAction}
              exclude={['edit', ...(primary?.dialog ? [primary.dialog] : [])]}
              trigger={
                <Button size="sm" variant="outline" aria-label={t('detail.more')}>
                  <MoreHorizontal aria-hidden />
                </Button>
              }
            />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 text-sm">
        <dl className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">{t('detail.email')}</dt>
          <dd className="min-w-0 break-words">{row.email ? <a href={`mailto:${row.email}`} className="text-primary hover:underline">{row.email}</a> : '–'}</dd>
          <dt className="text-muted-foreground">{t('detail.roles')}</dt>
          <dd>{row.roles.map(roleLabel).join(', ') || '–'}</dd>
          <dt className="text-muted-foreground">{t('detail.ticket')}</dt>
          <dd>
            {t(`ticket.${row.ticketType}`)} · {formatEuro(row.priceCents, locale)}
          </dd>
          {row.memberNumberEntered && (
            <>
              <dt className="text-muted-foreground">{t('detail.memberNumber')}</dt>
              <dd className="font-mono text-xs leading-5">{row.memberNumberEntered}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t('detail.paymentMethod')}</dt>
          <dd>{t(`method.${row.paymentMethod}`)}</dd>
          {(row.billingCompany || row.billingAddress) && (
            <>
              <dt className="text-muted-foreground">{t('detail.billing')}</dt>
              <dd className="whitespace-pre-line">{[row.billingCompany, row.billingAddress].filter(Boolean).join('\n')}</dd>
            </>
          )}
          <dt className="text-muted-foreground">{t('detail.registered')}</dt>
          <dd>
            {dt(row.createdAt)} · {row.source === 'public' ? t('detail.sourcePublic') : t('detail.sourceAdmin')}
          </dd>
          {row.cancelledAt && (
            <>
              <dt className="text-muted-foreground">{t('detail.cancelled')}</dt>
              <dd>{dt(row.cancelledAt)}</dd>
              {row.cancelReason && (
                <>
                  <dt className="text-muted-foreground">{t('detail.cancelReason')}</dt>
                  <dd>{row.cancelReason}</dd>
                </>
              )}
            </>
          )}
          <dt className="text-muted-foreground">{t('detail.consents')}</dt>
          <dd>
            {!d ? (
              <Skeleton className="h-4 w-40" />
            ) : d.consents.length === 0 ? (
              t('detail.consentNone')
            ) : (
              d.consents
                .map((c) => {
                  const kind = t(`detail.consentKinds.${c.kind}`);
                  if (c.revokedAt) return t('detail.consentRevoked', { kind });
                  return c.version != null ? t('detail.consentVersion', { kind, version: c.version }) : kind;
                })
                .join(', ')
            )}
          </dd>
        </dl>

        <section aria-labelledby={`${headingId}-docs`} className="rounded-lg border">
          <h3 id={`${headingId}-docs`} className="border-b px-3.5 py-2.5 text-sm font-bold">
            {t('detail.documents')}
          </h3>
          {!d ? (
            <div className="p-3.5">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : d.invoices.length === 0 ? (
            <p className="px-3.5 py-3 text-muted-foreground">{t('detail.noDocuments')}</p>
          ) : (
            <ul className="divide-y">
              {d.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="tabular-nums">
                        {inv.type === 'credit_note' ? t('detail.creditTitle', { number: inv.number }) : t('detail.invoiceTitle', { number: inv.number })}
                      </strong>
                      <Pill tone={invoiceTone[inv.state]}>{tInv(`state.${inv.state}`)}</Pill>
                    </span>
                    <span className="text-muted-foreground">
                      {[
                        inv.type === 'credit_note' ? `−${formatEuro(inv.grossCents, locale)}` : formatEuro(inv.grossCents, locale),
                        inv.type === 'credit_note' && inv.relatedNumber ? tInv('creditFor', { number: inv.relatedNumber }) : null,
                        inv.dueAt && (inv.state === 'open' || inv.state === 'overdue') ? t('detail.dueOn', { date: formatDateOnly(inv.dueAt, locale) }) : null,
                        inv.reminderLevel > 0 && (inv.state === 'open' || inv.state === 'overdue') ? t('detail.reminders', { count: inv.reminderLevel }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <a href={`/api/export/invoices/${inv.id}`} target="_blank" rel="noopener" aria-label={`${t('detail.view')} ${inv.number}`} title={t('detail.view')}>
                        <Eye aria-hidden />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={`/api/export/invoices/${inv.id}?download=1`} download aria-label={`${t('detail.download')} ${inv.number}`} title={t('detail.download')}>
                        <Download aria-hidden />
                      </a>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${headingId}-history`} className="flex flex-col gap-2.5">
          <h3 id={`${headingId}-history`} className="text-sm font-bold">
            {t('detail.history')}
          </h3>
          {error && <p className="text-destructive">{t('detail.error')}</p>}
          {!d && !error ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-4/5" />
            </div>
          ) : d && d.history.length === 0 ? (
            <p className="text-muted-foreground">{t('detail.noHistory')}</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {d?.history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', historyTone(h.action))} />
                  <span className="flex min-w-0 flex-col">
                    <span>{h.summary || h.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {dt(h.at)} · {h.system ? t('detail.system') : (h.actorName ?? '–')}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {payment && <PaymentDialog key={`pay-${payment.id}`} row={payment} onClose={() => setPayment(null)} />}
    </div>
  );
}
