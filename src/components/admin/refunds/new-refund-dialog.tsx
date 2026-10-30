'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/i18n/routing';
import { formatEuro } from '@/lib/money';
import type { RegistrationListRow } from '@/server/services/registrations';
import { CancelDialog, RefundDialog } from '../attendees/registration-row-actions';

export type RefundCandidate = Pick<
  RegistrationListRow,
  'id' | 'firstName' | 'lastName' | 'email' | 'status' | 'paymentStatus' | 'priceCents' | 'refundableCents' | 'invoiceNumber'
>;

type Kind = 'refund' | 'cancel';

/**
 * „Neue Erstattung“ im Bereich Erstattungen: Person wählen, dann dieselben Dialoge wie in der Teilnehmerliste
 * (Erstatten bzw. Abmelden / stornieren).
 */
export function NewRefundDialog({ candidates, open, onOpenChange }: { candidates: RefundCandidate[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('refunds');
  const tA = useTranslations('attendees');
  const locale = useLocale() as Locale;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>('refund');
  const [next, setNext] = useState<{ row: RefundCandidate; kind: Kind } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((c) => !q || `${c.firstName} ${c.lastName} ${c.email ?? ''} ${c.invoiceNumber ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.refundableCents - a.refundableCents || a.lastName.localeCompare(b.lastName, 'de'));
  }, [candidates, query]);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const canCancel = selected != null && selected.status !== 'cancelled';

  function close() {
    setQuery('');
    setSelectedId(null);
    setKind('refund');
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('newTitle')}</DialogTitle>
            <DialogDescription>{t('newHint')}</DialogDescription>
          </DialogHeader>
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('newSearch')} aria-label={t('newSearch')} autoFocus />
          <div role="radiogroup" aria-label={t('newPerson')} className="max-h-64 overflow-y-auto rounded-md border">
            {visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('newEmpty')}</p>}
            {visible.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40">
                <input type="radio" name="new-refund-person" className="size-4" checked={selectedId === c.id} onChange={() => setSelectedId(c.id)} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {c.lastName}, {c.firstName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c.email, c.invoiceNumber, tA(`status.${c.status}`), tA(`payment.${c.paymentStatus}`)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="text-right text-xs whitespace-nowrap tabular-nums">
                  {c.refundableCents > 0 ? t('newRefundable', { amount: formatEuro(c.refundableCents, locale) }) : <span className="text-muted-foreground">{t('newNothingPaid')}</span>}
                </span>
              </label>
            ))}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('newKind')}</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" className="mt-0.5 size-4" checked={kind === 'refund'} onChange={() => setKind('refund')} />
              <span>
                {t('newKindRefund')}
                <span className="block text-xs text-muted-foreground">{t('newKindRefundHint')}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" className="mt-0.5 size-4" checked={kind === 'cancel'} disabled={selected != null && !canCancel} onChange={() => setKind('cancel')} />
              <span>
                {t('newKindCancel')}
                <span className="block text-xs text-muted-foreground">{t('newKindCancelHint')}</span>
              </span>
            </label>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t('back')}
            </Button>
            <Button
              type="button"
              disabled={!selected || (kind === 'cancel' && !canCancel)}
              onClick={() => {
                if (!selected) return;
                setNext({ row: selected, kind });
                close();
              }}
            >
              {t('newContinue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {next?.kind === 'refund' && (
        <RefundDialog
          key={`r-${next.row.id}`}
          registrationId={next.row.id}
          name={`${next.row.firstName} ${next.row.lastName}`}
          refundableCents={next.row.refundableCents}
          open
          onOpenChange={(o) => !o && setNext(null)}
        />
      )}
      {next?.kind === 'cancel' && (
        <CancelDialog key={`c-${next.row.id}`} registrationId={next.row.id} name={`${next.row.firstName} ${next.row.lastName}`} open onOpenChange={(o) => !o && setNext(null)} />
      )}
    </>
  );
}
