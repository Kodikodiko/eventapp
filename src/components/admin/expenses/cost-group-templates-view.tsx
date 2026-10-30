'use client';

import { MoreHorizontal, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';
import { createTemplateAction, setTemplateActiveAction, updateTemplateAction } from '@/server/actions/expenses';
import type { TemplateRow } from '@/server/services/expenses';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '../confirm-dialog';
import { useActionFeedback } from '../use-action-feedback';
import { CostGroupDialog } from './cost-group-dialog';

type DialogState = { kind: 'edit'; row?: TemplateRow } | { kind: 'deactivate'; row: TemplateRow } | null;

/** Globale Kostengruppen-Vorlagen: anlegen, umbenennen, deaktivieren (nie löschen). */
export function CostGroupTemplatesView({ templates }: { templates: TemplateRow[] }) {
  const t = useTranslations('costGroups');
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);

  function setActive(row: TemplateRow, active: boolean) {
    startTransition(async () => {
      if (handle(await setTemplateActiveAction(row.id, active), { success: active ? t('activated') : t('deactivated') })) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">{t('hint')}</p>
        <Button size="sm" onClick={() => setDialog({ kind: 'edit' })}>
          <Plus aria-hidden className="size-4" />
          {t('add')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">{t('colName')}</th>
              <th className="p-2 font-medium">{t('colSpeakerLink')}</th>
              <th className="p-2 font-medium">{t('colEvents')}</th>
              <th className="p-2 font-medium">{t('colStatus')}</th>
              <th className="p-2">
                <span className="sr-only">{t('colActions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {templates.map((row) => (
              <tr key={row.id} className={cn('border-t', row.deactivatedAt && 'text-muted-foreground')}>
                <td className="p-2 font-medium">{row.name}</td>
                <td className="p-2">{row.speakerLink ? t('yes') : '–'}</td>
                <td className="p-2">{t('eventCount', { count: row.eventCount })}</td>
                <td className="p-2">
                  <Badge variant={row.deactivatedAt ? 'outline' : 'paid'}>{row.deactivatedAt ? t('inactive') : t('active')}</Badge>
                </td>
                <td className="p-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('actionsFor', { name: row.name })}>
                        <MoreHorizontal aria-hidden className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit', row })}>
                        <Pencil aria-hidden className="size-4" />
                        {t('edit')}
                      </DropdownMenuItem>
                      {row.deactivatedAt ? (
                        <DropdownMenuItem onSelect={() => setActive(row, true)}>
                          <Power aria-hidden className="size-4" />
                          {t('activate')}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setDialog({ kind: 'deactivate', row })}>
                          <PowerOff aria-hidden className="size-4" />
                          {t('deactivate')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'edit' && (
        <CostGroupDialog
          key={dialog.row?.id ?? 'new'}
          title={dialog.row ? t('editTitle') : t('add')}
          defaultValues={{ name: dialog.row?.name ?? '', speakerLink: dialog.row?.speakerLink ?? false }}
          save={(v) => (dialog.row ? updateTemplateAction(dialog.row.id, v) : createTemplateAction(v))}
          success={t('saved')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deactivate' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={t('deactivateTitle', { name: dialog.row.name })}
          description={t('deactivateHint')}
          confirmLabel={t('deactivate')}
          onConfirm={() => setActive(dialog.row, false)}
        />
      )}
    </div>
  );
}
