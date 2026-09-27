'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarDays, Download, LogOut, MapPin } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Link, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { ownPersonSchema, portalCancelSchema, type OwnPersonValues, type PortalCancelValues } from '@/lib/validation/portal';
import { cancelOwnRegistrationAction, portalCancelQuoteAction, updateOwnPersonAction } from '@/server/actions/portal';
import type { PortalCancelQuote, PortalPerson, PortalRegistration } from '@/server/services/portal';
import { Field, fieldError } from '../admin/form-fields';
import { useActionFeedback } from '../admin/use-action-feedback';

const statusVariant: Record<PortalRegistration['status'], BadgeProps['variant']> = {
  confirmed: 'default',
  waitlisted: 'outline',
  reserved: 'secondary',
  cancelled: 'destructive',
};

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function PortalView({ person, registrations }: { person: PortalPerson; registrations: PortalRegistration[] }) {
  const t = useTranslations('portal');
  const router = useRouter();
  const [cancelFor, setCancelFor] = useState<PortalRegistration | null>(null);

  async function logout() {
    try {
      await authClient.signOut();
    } finally {
      router.replace('/portal/login');
      router.refresh();
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground">{t('signedInAs', { name: `${person.firstName} ${person.lastName}`, email: person.email })}</p>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut aria-hidden className="size-4" />
          {t('logout')}
        </Button>
      </div>

      <section aria-labelledby="regs-title" className="space-y-4">
        <h2 id="regs-title" className="text-lg font-semibold">
          {t('registrations')}
        </h2>
        {registrations.length === 0 && <p className="text-muted-foreground">{t('noRegistrations')}</p>}
        {registrations.map((r) => (
          <RegistrationCard key={r.id} reg={r} onCancel={() => setCancelFor(r)} />
        ))}
      </section>

      <section aria-labelledby="profile-title" className="space-y-4">
        <h2 id="profile-title" className="text-lg font-semibold">
          {t('profile')}
        </h2>
        <ProfileForm person={person} />
      </section>

      {cancelFor && <CancelDialog key={cancelFor.id} reg={cancelFor} onClose={() => setCancelFor(null)} />}
    </div>
  );
}

function RegistrationCard({ reg, onCancel }: { reg: PortalRegistration; onCancel: () => void }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const range = format.dateTimeRange(new Date(reg.startsAt), new Date(reg.endsAt), { dateStyle: 'full', timeStyle: 'short' });
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">
            <Link href={`/events/${reg.eventSlug}`} className="hover:underline">
              {localized(reg.eventName, locale)}
            </Link>
          </CardTitle>
          <Badge variant={statusVariant[reg.status]}>{t(`status.${reg.status}`)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
            {range}
          </p>
          {reg.location && (
            <p className="flex items-center gap-2">
              <MapPin aria-hidden className="size-4 text-muted-foreground" />
              {reg.location}
            </p>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('ticket')}</dt>
          <dd>
            {t(`ticketType.${reg.ticketType}`)} · {reg.priceCents === 0 ? t('free') : formatEuro(reg.priceCents, locale)}
          </dd>
          {reg.priceCents > 0 && (
            <>
              <dt className="text-muted-foreground">{t('payment')}</dt>
              <dd>
                {t(`paymentStatus.${reg.paymentStatus}`)} · {t(`paymentMethod.${reg.paymentMethod}`)}
              </dd>
            </>
          )}
          {reg.cancelledAt && (
            <>
              <dt className="text-muted-foreground">{t('cancelledAt')}</dt>
              <dd>{format.dateTime(new Date(reg.cancelledAt), { dateStyle: 'medium' })}</dd>
            </>
          )}
        </dl>
        {reg.documents.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium">{t('documents')}</p>
            <ul className="space-y-1">
              {reg.documents.map((d) => (
                <li key={d.id}>
                  <a href={`/api/portal/invoices/${d.id}`} className="inline-flex items-center gap-2 hover:underline" download>
                    <Download aria-hidden className="size-4" />
                    {t(d.type === 'invoice' ? 'invoiceDoc' : 'creditDoc', { number: d.number })} · {formatEuro(d.grossCents, locale)}
                    {d.cancelled && <span className="text-muted-foreground">({t('docCancelled')})</span>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {reg.canCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            {reg.status === 'waitlisted' ? t('leaveWaitlist') : t('cancel')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CancelDialog({ reg, onClose }: { reg: PortalRegistration; onClose: () => void }) {
  const t = useTranslations('portal');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [quote, setQuote] = useState<PortalCancelQuote | null>(null);
  const [loadError, setLoadError] = useState(false);
  const form = useForm<PortalCancelValues>({ resolver: zodResolver(portalCancelSchema), defaultValues: { reason: '' } });
  const fmt = (c: number) => formatEuro(c, locale);

  useEffect(() => {
    let active = true;
    portalCancelQuoteAction(reg.id).then((r) => {
      if (!active) return;
      if (r.ok) setQuote(r.data);
      else setLoadError(true);
    });
    return () => {
      active = false;
    };
  }, [reg.id]);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const r = await cancelOwnRegistrationAction(reg.id, values);
      if (!handle(r, { setError: form.setError })) return;
      toast({ title: reg.status === 'waitlisted' ? t('leftWaitlist') : t('cancelled'), description: t('cancelledMail') });
      onClose();
      router.refresh();
    })
  );

  const a = quote?.amounts;
  const waitlist = reg.status === 'waitlisted';
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{waitlist ? t('leaveWaitlistTitle', { event: localized(reg.eventName, locale) }) : t('cancelTitle', { event: localized(reg.eventName, locale) })}</DialogTitle>
              <DialogDescription>{waitlist ? t('leaveWaitlistHint') : t('cancelHint')}</DialogDescription>
            </DialogHeader>
            {loadError && <p className="text-sm text-destructive">{t('cancelNotPossible')}</p>}
            {!waitlist && quote && a && (
              <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                <p>
                  {quote.rulePercent == null ? t('noRules') : t('rule', { days: quote.daysBefore, percent: quote.rulePercent })}
                </p>
                {a.refundCents > 0 && (
                  <p className="font-medium">
                    {quote.refundMode === 'approval'
                      ? t('refundApproval', { amount: fmt(a.refundCents) })
                      : quote.paymentMethod === 'stripe'
                        ? t('refundOnline', { amount: fmt(a.refundCents) })
                        : t('refundTransfer', { amount: fmt(a.refundCents) })}
                  </p>
                )}
                {a.refundCents === 0 && quote.paidCents > 0 && <p>{t('noRefund')}</p>}
                {a.openCents > 0 && <p className="font-medium">{t('feeOpen', { amount: fmt(a.openCents) })}</p>}
                {a.creditCents > 0 && a.refundCents === 0 && a.openCents === 0 && <p>{t('invoiceCancelled')}</p>}
              </div>
            )}
            <Field id="portal-cancel-reason" label={t('cancelReason')} error={fieldError(form.formState.errors, 'reason')}>
              <Textarea id="portal-cancel-reason" rows={2} {...form.register('reason')} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('back')}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || !quote}>
                {waitlist ? t('leaveWaitlist') : t('cancelConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({ person }: { person: PortalPerson }) {
  const t = useTranslations('portal');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm<OwnPersonValues>({
    resolver: zodResolver(ownPersonSchema),
    defaultValues: { firstName: person.firstName, lastName: person.lastName, company: person.company ?? '', phone: person.phone ?? '', locale: person.locale },
  });
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handle(await updateOwnPersonAction(values), { setError: form.setError, success: t('profileSaved') })) router.refresh();
    })
  );
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} className="max-w-xl space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pf-first" label={t('firstName')} error={fieldError(errors, 'firstName')}>
            <Input id="pf-first" autoComplete="given-name" {...form.register('firstName')} />
          </Field>
          <Field id="pf-last" label={t('lastName')} error={fieldError(errors, 'lastName')}>
            <Input id="pf-last" autoComplete="family-name" {...form.register('lastName')} />
          </Field>
        </div>
        <Field id="pf-email" label={t('email')} hint={t('emailReadonly')}>
          <Input id="pf-email" value={person.email} readOnly disabled />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pf-company" label={t('company')} error={fieldError(errors, 'company')}>
            <Input id="pf-company" autoComplete="organization" {...form.register('company')} />
          </Field>
          <Field id="pf-phone" label={t('phone')} error={fieldError(errors, 'phone')}>
            <Input id="pf-phone" type="tel" autoComplete="tel" {...form.register('phone')} />
          </Field>
        </div>
        <Field id="pf-locale" label={t('locale')} hint={t('localeHint')} error={fieldError(errors, 'locale')}>
          <select id="pf-locale" className={selectClass} {...form.register('locale')}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Button type="submit" disabled={pending}>
          {t('save')}
        </Button>
      </form>
    </FormProvider>
  );
}
