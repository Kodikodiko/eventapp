import { getFormatter, getTranslations } from 'next-intl/server';
import { MemberImport } from '@/components/admin/members/member-import';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requestDb } from '@/server/db';
import { countMembers, latestMemberImport, searchMembers } from '@/server/services/members';

type Props = LocaleParams & { searchParams: Promise<{ q?: string }> };

export default async function MembersPage({ params, searchParams }: Props) {
  await initLocale(params);
  const q = ((await searchParams).q ?? '').slice(0, 100);
  const t = await getTranslations('members');
  const format = await getFormatter();
  const db = await requestDb();
  const total = countMembers(db);
  const last = latestMemberImport(db);
  const { rows, total: hits } = searchMembers(db, q);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('importTitle')}</CardTitle>
          <CardDescription>
            {t('current', { count: total })}
            {last && ` · ${t('lastImport', { date: format.dateTime(new Date(last.uploadedAt), { dateStyle: 'medium', timeStyle: 'short' }), file: last.fileName })}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberImport />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('listTitle')}</CardTitle>
          <CardDescription>{t('listHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form role="search" className="flex max-w-sm gap-2">
            <Input type="search" name="q" defaultValue={q} placeholder={t('searchPlaceholder')} aria-label={t('search')} />
          </form>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2 font-medium">{t('columns.memberNumber')}</th>
                  <th className="p-2 font-medium">{t('columns.lastName')}</th>
                  <th className="p-2 font-medium">{t('columns.firstName')}</th>
                  <th className="p-2 font-medium">{t('columns.email')}</th>
                  <th className="p-2 font-medium">{t('columns.validUntil')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 font-mono">{m.memberNumber}</td>
                    <td className="p-2">{m.lastName}</td>
                    <td className="p-2">{m.firstName}</td>
                    <td className="p-2">{m.email}</td>
                    <td className="p-2">{m.validUntil ? format.dateTime(new Date(`${m.validUntil}T12:00:00Z`), { dateStyle: 'medium' }) : '–'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      {total === 0 ? t('empty') : t('noMatches')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">{t('shown', { shown: rows.length, total: hits })}</p>
        </CardContent>
      </Card>
    </div>
  );
}
