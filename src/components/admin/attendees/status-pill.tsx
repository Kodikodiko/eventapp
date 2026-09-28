import { cn } from '@/lib/utils';
import type { RegistrationListRow } from '@/server/services/registrations';

export type PillTone = 'green' | 'amber' | 'indigo' | 'grey' | 'red' | 'orange';

const toneClass: Record<PillTone, string> = {
  green: 'bg-[#E7F4EC] text-[#17603C]',
  amber: 'bg-[#FFF4D6] text-[#6B4800]',
  indigo: 'bg-brand-soft text-primary',
  grey: 'bg-muted text-muted-foreground',
  red: 'bg-[#FDECEA] text-[#B42318]',
  orange: 'bg-[#FFF1E8] text-[#9A3412]',
};

/** Kleines Status-Etikett (Farbe ist nie die einzige Information – der Text steht immer dabei). */
export function Pill({ tone, children, className }: { tone: PillTone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', toneClass[tone], className)}>{children}</span>;
}

export const statusTone: Record<RegistrationListRow['status'], PillTone> = {
  confirmed: 'green',
  reserved: 'amber',
  waitlisted: 'indigo',
  cancelled: 'grey',
};

export function paymentTone(row: Pick<RegistrationListRow, 'paymentStatus' | 'invoiceOverdue' | 'status' | 'invoiceNumber'>): PillTone | null {
  if (row.invoiceOverdue) return 'red';
  // storniert ohne gültige Rechnung: es ist nichts (mehr) zu zahlen
  if (row.status === 'cancelled' && row.paymentStatus === 'open' && !row.invoiceNumber) return null;
  switch (row.paymentStatus) {
    case 'open':
      return 'amber';
    case 'paid':
      return 'indigo';
    case 'partially_refunded':
    case 'refunded':
      return 'orange';
    default:
      return null;
  }
}
