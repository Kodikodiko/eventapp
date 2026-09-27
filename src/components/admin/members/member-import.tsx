'use client';

import { FileUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { applyMemberImportAction, previewMemberImportAction, type MemberPreview } from '@/server/actions/members';
import { useActionFeedback } from '../use-action-feedback';

const MAX_SHOWN_ERRORS = 50;

/** Upload der Mitgliederliste in zwei Schritten: prüfen (Vorschau) → übernehmen. */
export function MemberImport() {
  const t = useTranslations('members');
  const router = useRouter();
  const handle = useActionFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MemberPreview | null>(null);
  const [pending, startTransition] = useTransition();

  function check(file: File) {
    const data = new FormData();
    data.set('file', file);
    startTransition(async () => {
      const result = await previewMemberImportAction(data);
      setPreview(handle(result) ? result.data : null);
    });
  }

  function apply() {
    if (!preview) return;
    startTransition(async () => {
      const result = await applyMemberImportAction({ fileName: preview.fileName, rows: preview.rows });
      if (handle(result, { success: t('imported', { count: preview.rows.length }) })) {
        setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      }
    });
  }

  const errorText = (e: MemberPreview['errors'][number]) => {
    const column = e.column ? t(`columns.${e.column}`) : '';
    const text = t(`errors.${e.code}`, { column, value: e.value ?? '' });
    return e.line > 0 ? t('errorLine', { line: e.line, text }) : text;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="member-file" className="text-sm font-medium">
          {t('fileLabel')}
        </label>
        <input
          ref={inputRef}
          id="member-file"
          type="file"
          accept=".csv,.txt,.xlsx"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(null);
            if (file) check(file);
          }}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        <p className="text-xs text-muted-foreground">{t('fileHint')}</p>
      </div>

      {pending && !preview && <p className="text-sm text-muted-foreground">{t('checking')}</p>}

      {preview && (
        <section aria-live="polite" className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">{t('previewTitle', { file: preview.fileName })}</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-muted-foreground">{t('valid')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.rows.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('added')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.diff.added}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('updated')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.diff.updated}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('removed')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.diff.removed}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('unchanged')}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.diff.unchanged}</dd>
            </div>
          </dl>

          {preview.errors.length > 0 ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm font-medium text-destructive">
                {t('hasErrors', { count: preview.errors.length })}
              </p>
              <ul className="max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
                {preview.errors.slice(0, MAX_SHOWN_ERRORS).map((e, i) => (
                  <li key={i}>{errorText(e)}</li>
                ))}
              </ul>
              {preview.errors.length > MAX_SHOWN_ERRORS && (
                <p className="text-xs text-muted-foreground">{t('moreErrors', { count: preview.errors.length - MAX_SHOWN_ERRORS })}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {preview.diff.removed > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                  {t('removeWarning', { count: preview.diff.removed })}
                </p>
              )}
              <Button onClick={apply} disabled={pending}>
                <FileUp aria-hidden className="size-4" />
                {t('apply', { count: preview.rows.length })}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
