import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { auditFilterQuery, parseAuditFilter } from '@/lib/audit-filter';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { AUDIT_PAGE_SIZE, auditFilterOptions, listAuditEntries } from '@/server/services/audit-log';

type Props = LocaleParams & { searchParams: Promise<Record<string, string | string[] | undefined>> };

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs';

export default async function AuditPage({ params, searchParams }: Props) {
  const locale = await initLocale(params);
  const filter = parseAuditFilter(await searchParams);
  const t = await getTranslations('audit');
  const format = await getFormatter();
  const db = await requestDb();
  const options = auditFilterOptions(db);
  const { rows, total, pages } = listAuditEntries(db, filter);
  const page = Math.min(filter.page, pages);

  const actionLabel = (action: string) => {
    const key = `actions.${action.replace('.', '_')}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : action;
  };
  const entityLabel = (entity: string) => {
    const key = `entities.${entity}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : entity;
  };
  const filtered = Object.keys(auditFilterQuery({ ...filter, page: 1 })).length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('filterTitle')}</CardTitle>
          <CardDescription>{t('hint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('search')}</span>
              <Input type="search" name="q" defaultValue={filter.q} placeholder={t('searchPlaceholder')} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('event')}</span>
              <select name="event" defaultValue={filter.eventId ?? ''} className={selectClass}>
                <option value="">{t('all')}</option>
                {options.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {localized(e.name, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('entity')}</span>
              <select name="entity" defaultValue={filter.entity} className={selectClass}>
                <option value="">{t('all')}</option>
                {options.entities.map((e) => (
                  <option key={e} value={e}>
                    {entityLabel(e)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('actor')}</span>
              <select name="actor" defaultValue={filter.actor} className={selectClass}>
                <option value="">{t('all')}</option>
                {options.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="system">{t('system')}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('from')}</span>
              <Input type="date" name="from" defaultValue={filter.from} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('to')}</span>
              <Input type="date" name="to" defaultValue={filter.to} />
            </label>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">{t('apply')}</Button>
              {filtered && (
                <Button variant="outline" asChild>
                  <Link href="/admin/audit">{t('reset')}</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">{t('colAt')}</th>
              <th className="p-2 font-medium">{t('colActor')}</th>
              <th className="p-2 font-medium">{t('colAction')}</th>
              <th className="p-2 font-medium">{t('colSummary')}</th>
              <th className="p-2 font-medium">{t('colEvent')}</th>
              <th className="p-2 font-medium">{t('colRecord')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">{format.dateTime(new Date(r.at), { dateStyle: 'medium', timeStyle: 'medium' })}</td>
                <td className="p-2">{r.actorUserId ? (r.actorName ?? t('deletedAdmin')) : <span className="text-muted-foreground">{t('system')}</span>}</td>
                <td className="p-2">
                  <div>{actionLabel(r.action)}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.action}</div>
                </td>
                <td className="p-2">{r.summary || '–'}</td>
                <td className="p-2">{r.eventName ? localized(r.eventName, locale) : '–'}</td>
                <td className="p-2 whitespace-nowrap text-muted-foreground">
                  {entityLabel(r.entity)}
                  {r.entityId && <span className="font-mono"> #{r.entityId}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label={t('pagination')} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {t('shown', {
            from: total === 0 ? 0 : (page - 1) * AUDIT_PAGE_SIZE + 1,
            to: Math.min(page * AUDIT_PAGE_SIZE, total),
            total,
          })}
        </p>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={{ pathname: '/admin/audit', query: auditFilterQuery(filter, page - 1) }}>{t('previous')}</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                {t('previous')}
              </Button>
            )}
            <span>{t('page', { page, pages })}</span>
            {page < pages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={{ pathname: '/admin/audit', query: auditFilterQuery(filter, page + 1) }}>{t('next')}</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                {t('next')}
              </Button>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
