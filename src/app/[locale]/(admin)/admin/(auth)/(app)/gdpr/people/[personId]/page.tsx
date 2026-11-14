import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { DsrForm } from '@/components/admin/gdpr/dsr-form';
import { DsrTable } from '@/components/admin/gdpr/dsr-table';
import { PersonActions } from '@/components/admin/gdpr/person-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { viennaDate } from '@/lib/dates';
import { initAdminPage } from '@/server/admin-pages';
import { requestDb } from '@/server/db';
import { DSR_TYPES } from '@/server/db/schema';
import { erasureCheck, listDsrRequests, personDataExport } from '@/server/services/gdpr';
import { listRoles } from '@/server/services/registrations';

type Props = { params: Promise<{ locale: string; personId: string }> };

/** Eine Person aus DSGVO-Sicht: was gespeichert ist, Auskunft, Einschränken, Löschen, Anfragen. */
export default async function GdprPersonPage({ params }: Props) {
  const locale = await initAdminPage(params);
  const id = Number((await params).personId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const db = await requestDb();
  const data = personDataExport(db, id);
  if (!data) notFound();
  const t = await getTranslations('gdpr');
  const tAtt = await getTranslations('attendees');
  const roleLabel = new Map(listRoles(db).map((r) => [r.key, (locale === 'en' && r.label.en) || r.label.de]));
  const statusLabel = (s: string) => (tAtt.has(`status.${s}` as Parameters<typeof tAtt>[0]) ? tAtt(`status.${s}` as Parameters<typeof tAtt>[0]) : s);
  const format = await getFormatter();
  const person = data.person[0] as { firstName: string; lastName: string; email: string | null; company: string | null; restrictedAt: string | null; anonymizedAt: string | null };
  const check = erasureCheck(db, id);
  const requests = listDsrRequests(db, { personId: id });
  const today = viennaDate(new Date().toISOString());
  const dt = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  const counts: [keyof typeof data & ('registrations' | 'consents' | 'speakers' | 'sponsorContacts' | 'invoices' | 'payments' | 'portalAccounts' | 'auditLog'), number][] = [
    ['registrations', data.registrations.length],
    ['consents', data.consents.length],
    ['speakers', data.speakers.length],
    ['sponsorContacts', data.sponsorContacts.length],
    ['invoices', data.invoices.length],
    ['payments', data.payments.length],
    ['portalAccounts', data.portalAccounts.length],
    ['auditLog', data.auditLog.length],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Button variant="link" className="h-auto p-0 text-sm" asChild>
          <Link href="/admin/gdpr">← {t('title')}</Link>
        </Button>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {`${person.firstName} ${person.lastName}`.trim()}
          {person.anonymizedAt ? (
            <Badge variant="secondary">{t('state.anonymizedOn', { date: dt(person.anonymizedAt) })}</Badge>
          ) : person.restrictedAt ? (
            <Badge variant="billed">{t('state.restrictedOn', { date: dt(person.restrictedAt) })}</Badge>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">{[person.email, person.company].filter(Boolean).join(' · ') || '–'}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('person.actionsTitle')}</CardTitle>
          <CardDescription>{t('person.actionsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PersonActions
            personId={id}
            locale={locale}
            restricted={Boolean(person.restrictedAt)}
            anonymized={Boolean(person.anonymizedAt)}
            eraseBlocked={check.activeRegistrations > 0 || check.openRefunds > 0}
            retainedInvoices={check.retainedInvoices}
          />
          {!person.anonymizedAt && check.activeRegistrations > 0 && (
            <p className="text-sm text-destructive">{t('person.blockedActive', { count: check.activeRegistrations })}</p>
          )}
          {!person.anonymizedAt && check.openRefunds > 0 && (
            <p className="text-sm text-destructive">{t('person.blockedRefunds', { count: check.openRefunds })}</p>
          )}
          {check.retainedInvoices > 0 && <p className="text-sm text-muted-foreground">{t('person.retained', { count: check.retainedInvoices })}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('person.storedTitle')}</CardTitle>
          <CardDescription>{t('person.storedHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map(([key, n]) => (
              <div key={key}>
                <dt className="text-muted-foreground">{t(`sections.${key}`)}</dt>
                <dd className="text-lg font-semibold tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          {data.registrations.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {data.registrations.map((r) => (
                <li key={String(r.id)}>
                  {t('person.registrationLine', {
                    event: String(r.event ?? ''),
                    status: statusLabel(String(r.status)),
                    roles: String(r.roles || '')
                      .split(', ')
                      .filter(Boolean)
                      .map((k) => roleLabel.get(k) ?? k)
                      .join(', ') || '–',
                  })}
                </li>
              ))}
            </ul>
          )}
          {data.speakers.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {data.speakers.map((s) => (
                <li key={String(s.id)}>{t('person.speakerLine', { event: String(s.event ?? '') })}</li>
              ))}
            </ul>
          )}
          {data.sponsorContacts.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {data.sponsorContacts.map((c, i) => (
                <li key={i}>{t('person.contactLine', { sponsor: String(c.sponsor), event: String(c.event ?? '') })}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('requests.title')}</CardTitle>
          <CardDescription>{t('requests.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DsrTable rows={requests} showPerson={false} />
          <DsrForm personId={id} today={today} types={DSR_TYPES} />
        </CardContent>
      </Card>
    </div>
  );
}
