'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { copyEventSchema, type CopyEventValues } from '@/lib/validation/forms';
import { copyEventAction, setEventArchivedAction } from '@/server/actions/events';
import { Field, fieldError, LocalizedFields } from './form-fields';
import { useActionFeedback } from './use-action-feedback';

/** Event als Vorlage kopieren (Einstellungen, Stornobedingungen, AGB, Sponsorpakete). */
export function CopyEventDialog({ eventId, suggestion }: { eventId: number; suggestion: CopyEventValues }) {
  const t = useTranslations('eventActions');
  const router = useRouter();
  const handle = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<CopyEventValues>({ resolver: zodResolver(copyEventSchema), defaultValues: suggestion });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await copyEventAction(eventId, values);
      if (handle(result, { setError: form.setError, success: t('copied') })) {
        setOpen(false);
        router.push(`/admin/events/${result.data.id}/settings`);
      }
    })
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Copy aria-hidden className="size-4" />
          {t('copy')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t('copyTitle')}</DialogTitle>
              <DialogDescription>{t('copyHint')}</DialogDescription>
            </DialogHeader>
            <LocalizedFields name="name" label={t('newName')} />
            <Field id="copy-slug" label={t('newSlug')} error={fieldError(form.formState.errors, 'slug')}>
              <Input id="copy-slug" autoComplete="off" {...form.register('slug')} />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {t('copyConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Archivieren (schreibgeschützt) bzw. Archivierung aufheben – mit Rückfrage. */
export function ArchiveToggle({ eventId, archived }: { eventId: number; archived: boolean }) {
  const t = useTranslations('eventActions');
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await setEventArchivedAction(eventId, !archived);
      if (handle(result, { success: archived ? t('unarchived') : t('archived') })) router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          {archived ? <ArchiveRestore aria-hidden className="size-4" /> : <Archive aria-hidden className="size-4" />}
          {archived ? t('unarchive') : t('archive')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{archived ? t('unarchiveTitle') : t('archiveTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{archived ? t('unarchiveHint') : t('archiveHint')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={run}>{archived ? t('unarchive') : t('archive')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
