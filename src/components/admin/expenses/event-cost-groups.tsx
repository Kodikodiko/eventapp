'use client';

import { CopyPlus, MoreHorizontal, Pencil, Plus, Power, PowerOff, Share2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import type { ActionResult } from '@/lib/action-result';
import { formatEuro } from '@/lib/money';
import { cn } from '@/lib/utils';
import { EXPENSE_STATUS_KEYS } from '@/lib/validation/expenses';
import {
  addTemplatesToEventAction,
  createEventGroupAction,
  publishEventGroupAction,
  setEventGroupActiveAction,
  updateEventGroupAction,
} from '@/server/actions/expenses';
import type { EventGroupRow, StatusTotals } from '@/server/services/expenses';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';
import { CostGroupDialog } from './cost-group-dialog';

type DialogState =
  | { kind: 'group'; row?: EventGroupRow }
  | { kind: 'deactivateGroup'; row: EventGroupRow }
  | { kind: 'publishGroup'; row: EventGroupRow }
  | null;

type Props = {
  eventId: number;
  groups: EventGroupRow[];
  totals: StatusTotals;
  readOnly: boolean;
};

/** Kostengruppen eines Events mit Summen je Status. */
export function EventCostGroups({ eventId, groups, totals, readOnly }: Props) {
  const t = useTranslations('expenses');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
  const fmt = (cents: number) => formatEuro(cents, locale);

  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  function addTemplates() {
    startTransition(async () => {
      const result = await addTemplatesToEventAction(eventId);
      if (handle(result, { success: result.ok ? t('templatesAdded', { count: result.data.added }) : undefined })) router.refresh();
    });
  }

  return (
    <>
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">{t('groupsTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('groupsHint')}
            </p>
          </div>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={addTemplates}>
                <CopyPlus aria-hidden className="size-4" />
                {t('addTemplates')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog({ kind: 'group' })}>
                <Plus aria-hidden className="size-4" />
                {t('addGroup')}
              </Button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">{t('colGroup')}</th>
                <th className="p-2 text-right font-medium">{t('colCount')}</th>
                {EXPENSE_STATUS_KEYS.map((s) => (
                  <th key={s} className="p-2 text-right font-medium">
                    {t(`status.${s}`)}
                  </th>
                ))}
                <th className="p-2 text-right font-medium">{t('colTotal')}</th>
                <th className="p-2">
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className={cn('border-t align-top', g.deactivatedAt && 'text-muted-foreground')}>
                  <td className="p-2">
                    <div className="font-medium">{g.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="outline">{g.templateId ? t('fromTemplate') : t('ownGroup')}</Badge>
                      {g.speakerLink && <Badge variant="secondary">{t('speakerBadge')}</Badge>}
                      {g.deactivatedAt && <Badge variant="overdue">{t('inactive')}</Badge>}
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums">{g.expenseCount}</td>
                  {EXPENSE_STATUS_KEYS.map((s) => (
                    <td key={s} className="p-2 text-right tabular-nums whitespace-nowrap">
                      {g.totals[s] ? fmt(g.totals[s]) : '–'}
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold tabular-nums whitespace-nowrap">{fmt(g.totals.total)}</td>
                  <td className="p-2 text-right">
                    {!readOnly && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('groupActionsFor', { name: g.name })}>
                            <MoreHorizontal aria-hidden className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ kind: 'group', row: g })}>
                            <Pencil aria-hidden className="size-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                          {!g.templateId && (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'publishGroup', row: g })}>
                              <Share2 aria-hidden className="size-4" />
                              {t('publish')}
                            </DropdownMenuItem>
                          )}
                          {g.deactivatedAt ? (
                            <DropdownMenuItem onSelect={() => run(() => setEventGroupActiveAction(g.id, true), t('groupActivated'))}>
                              <Power aria-hidden className="size-4" />
                              {t('activate')}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setDialog({ kind: 'deactivateGroup', row: g })}>
                              <PowerOff aria-hidden className="size-4" />
                              {t('deactivate')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="p-2">{t('totalAll')}</td>
                <td className="p-2 text-right tabular-nums">{groups.reduce((n, g) => n + g.expenseCount, 0)}</td>
                {EXPENSE_STATUS_KEYS.map((s) => (
                  <td key={s} className="p-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(totals[s])}
                  </td>
                ))}
                <td className="p-2 text-right tabular-nums whitespace-nowrap">{fmt(totals.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      {dialog?.kind === 'group' && (
        <CostGroupDialog
          key={dialog.row?.id ?? 'new'}
          title={dialog.row ? t('editGroup') : t('addGroup')}
          defaultValues={{ name: dialog.row?.name ?? '', speakerLink: dialog.row?.speakerLink ?? false }}
          save={(v) => (dialog.row ? updateEventGroupAction(dialog.row.id, v) : createEventGroupAction(eventId, v))}
          success={t('groupSaved')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deactivateGroup' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('deactivateTitle', { name: dialog.row.name })}
          description={t('deactivateHint')}
          confirmLabel={t('deactivate')}
          onConfirm={() => run(() => setEventGroupActiveAction(dialog.row.id, false), t('groupDeactivated'))}
        />
      )}
      {dialog?.kind === 'publishGroup' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('publishTitle', { name: dialog.row.name })}
          description={t('publishHint')}
          confirmLabel={t('publish')}
          onConfirm={() => run(() => publishEventGroupAction(dialog.row.id), t('published'))}
        />
      )}
    </>
  );
}
