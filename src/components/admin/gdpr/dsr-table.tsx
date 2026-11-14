'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { completeDsrRequestAction } from '@/server/actions/gdpr';
import type { DsrRow } from '@/server/services/gdpr';
import { useActionFeedback } from '../use-action-feedback';

/** Liste der Anfragen Betroffener mit Frist (1 Monat) und „Erledigt“. */
export function DsrTable({ rows, showPerson }: { rows: DsrRow[]; showPerson: boolean }) {
  const t = useTranslations('gdpr.requests');
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const day = (d: string) => format.dateTime(new Date(`${d.slice(0, 10)}T12:00:00Z`), { dateStyle: 'medium' });

  function complete(id: number) {
    startTransition(async () => {
      if (handle(await completeDsrRequestAction(id), { success: t('completedToast') })) router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2 font-medium">{t('type')}</th>
            {showPerson && <th className="p-2 font-medium">{t('person')}</th>}
            <th className="p-2 font-medium">{t('receivedAt')}</th>
            <th className="p-2 font-medium">{t('dueOn')}</th>
            <th className="p-2 font-medium">{t('status')}</th>
            <th className="p-2 font-medium">{t('notes')}</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="p-2 whitespace-nowrap">{t(`types.${r.type}`)}</td>
              {showPerson && (
                <td className="p-2">
                  {r.personId ? (
                    <Link href={`/admin/gdpr/people/${r.personId}`} className="underline underline-offset-2">
                      {r.personName || t('unnamed')}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t('noPerson')}</span>
                  )}
                </td>
              )}
              <td className="p-2 whitespace-nowrap">{day(r.receivedAt)}</td>
              <td className="p-2 whitespace-nowrap">{day(r.dueOn)}</td>
              <td className="p-2 whitespace-nowrap">
                {r.completedAt ? (
                  <Badge variant="paid">{t('completedOn', { date: day(r.completedAt), name: r.handledByName ?? '–' })}</Badge>
                ) : r.overdue ? (
                  <Badge variant="overdue">{t('overdue')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('open')}</Badge>
                )}
              </td>
              <td className="p-2 whitespace-pre-line">{r.notes ?? ''}</td>
              <td className="p-2 text-right">
                {!r.completedAt && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => complete(r.id)}>
                    {t('complete')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showPerson ? 7 : 6} className="p-6 text-center text-muted-foreground">
                {t('empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
