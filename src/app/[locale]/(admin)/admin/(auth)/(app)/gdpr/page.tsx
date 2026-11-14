import { getFormatter, getTranslations } from 'next-intl/server';
import { DsrForm } from '@/components/admin/gdpr/dsr-form';
import { DsrTable } from '@/components/admin/gdpr/dsr-table';
import { RetentionRunButton } from '@/components/admin/gdpr/retention-run-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import type { LocaleParams } from '@/i18n/page';
import { viennaDate } from '@/lib/dates';
import { initAdminPage } from '@/server/admin-pages';
import { requestDb } from '@/server/db';
import { backupDirFromEnv } from '@/server/db/core';
import { DSR_TYPES } from '@/server/db/schema';
import { listDsrRequests, searchPeople } from '@/server/services/gdpr';
import { lastRetentionRun, RETENTION, runRetention } from '@/server/services/retention';

type Props = LocaleParams & { searchParams: Promise<{ q?: string }> };

/** DSGVO: Person suchen (→ Auskunft, Einschränken, Löschen), Anfragen Betroffener, Löschfristen. */
export default async function GdprPage({ params, searchParams }: Props) {
  await initAdminPage(params);
  const q = ((await searchParams).q ?? '').slice(0, 200);
  const t = await getTranslations('gdpr');
  const format = await getFormatter();
  const db = await requestDb();
  const hits = searchPeople(db, q);
  const requests = listDsrRequests(db);
  const today = viennaDate(new Date().toISOString());
  const last = lastRetentionRun(db);
  // Probelauf: zeigt, was der nächste Lauf ändern würde (alles wird zurückgerollt)
  const preview = runRetention(db, { dryRun: true, backupDir: backupDirFromEnv() });
  const previewItems = Object.entries(preview).filter(([, n]) => n > 0) as [keyof typeof preview, number][];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('search.title')}</CardTitle>
          <CardDescription>{t('search.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form role="search" className="flex max-w-md gap-2">
            <Input type="search" name="q" defaultValue={q} placeholder={t('search.placeholder')} aria-label={t('search.title')} />
          </form>
          {q.trim().length >= 2 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2 font-medium">{t('search.name')}</th>
                    <th className="p-2 font-medium">{t('search.email')}</th>
                    <th className="p-2 font-medium">{t('search.company')}</th>
                    <th className="p-2 font-medium">{t('search.involvement')}</th>
                    <th className="p-2 font-medium">{t('search.state')}</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2">
                        <Link href={`/admin/gdpr/people/${p.id}`} className="font-medium underline underline-offset-2">
                          {`${p.firstName} ${p.lastName}`.trim()}
                        </Link>
                      </td>
                      <td className="p-2">{p.email ?? '–'}</td>
                      <td className="p-2">{p.company ?? '–'}</td>
                      <td className="p-2 text-muted-foreground">
                        {t('search.counts', { registrations: p.registrations, speakers: p.speakers, contacts: p.sponsorContacts })}
                      </td>
                      <td className="p-2">
                        {p.anonymizedAt ? (
                          <Badge variant="secondary">{t('state.anonymized')}</Badge>
                        ) : p.restrictedAt ? (
                          <Badge variant="billed">{t('state.restricted')}</Badge>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {hits.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        {t('search.none')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('requests.title')}</CardTitle>
          <CardDescription>{t('requests.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DsrTable rows={requests} showPerson />
          <div className="space-y-2 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">{t('requests.newWithoutPerson')}</h3>
            <p className="text-xs text-muted-foreground">{t('requests.newHint')}</p>
            <DsrForm personId={null} today={today} types={DSR_TYPES} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('retention.title')}</CardTitle>
          <CardDescription>{t('retention.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('retention.ruleUnpaid', { days: RETENTION.unpaidRegistrationDays })}</li>
            <li>{t('retention.rulePeople', { months: RETENTION.personMonths })}</li>
            <li>{t('retention.ruleBusiness', { years: RETENTION.businessContactYears })}</li>
            <li>{t('retention.ruleOrphans', { days: RETENTION.orphanPersonDays })}</li>
            <li>{t('retention.ruleInvoices')}</li>
            <li>{t('retention.ruleAudit', { years: RETENTION.auditYears })}</li>
            <li>{t('retention.ruleBackups', { days: RETENTION.backupDays })}</li>
          </ul>
          <p>
            {last
              ? t('retention.lastRun', { date: format.dateTime(new Date(last.at), { dateStyle: 'medium', timeStyle: 'short' }) })
              : t('retention.neverRun')}
          </p>
          <div className="rounded-lg border p-3">
            <p className="font-medium">{t('retention.previewTitle')}</p>
            {previewItems.length === 0 ? (
              <p className="text-muted-foreground">{t('retention.previewNothing')}</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {previewItems.map(([key, n]) => (
                  <li key={key}>{t(`retention.items.${key}`, { count: n })}</li>
                ))}
              </ul>
            )}
          </div>
          <RetentionRunButton />
        </CardContent>
      </Card>
    </div>
  );
}
