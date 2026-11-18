'use client';

import { ImageIcon, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/action-result';
import { checkMediaFile, MEDIA_IMAGE_ACCEPT } from '@/lib/validation/media';
import { useValidationMessage } from './form-fields';
import { useActionFeedback } from './use-action-feedback';

type Props = {
  title: string;
  description: string;
  /** Adresse des aktuellen Bildes, falls vorhanden */
  currentUrl: string | null;
  /** Foto rund (Speaker) oder Logo (Sponsor) */
  shape: 'round' | 'logo';
  /** FormData mit dem Bild im Feld „image“; ohne Bild = entfernen */
  save: (data: FormData) => Promise<ActionResult<unknown>>;
  onClose: () => void;
};

/** Ein Bild hochladen, ersetzen oder entfernen (Speaker-Foto, Sponsor-Logo). */
export function ImageUploadDialog({ title, description, currentUrl, shape, save, onClose }: Props) {
  const t = useTranslations('eventPage');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<string | null>(null);

  function choose(f: File | undefined) {
    setFile(f);
    setError(checkMediaFile(f));
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function submit(remove: boolean) {
    if (!remove && (!file || error)) {
      setError(error ?? 'required');
      return;
    }
    const data = new FormData();
    if (!remove && file) data.set('image', file);
    startTransition(async () => {
      const result = await save(data);
      if (!result.ok && result.fieldErrors?.image) setError(result.fieldErrors.image);
      if (handle(result, { success: remove ? t('imageRemoved') : t('imageSaved') })) {
        onClose();
        router.refresh();
      }
    });
  }

  const shown = preview ?? currentUrl;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-4">
          <div
            className={
              shape === 'round'
                ? 'flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted'
                : 'flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-2'
            }
          >
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt="" className={shape === 'round' ? 'size-full object-cover' : 'max-h-full max-w-full object-contain'} />
            ) : (
              <ImageIcon aria-hidden className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <input
              type="file"
              accept={MEDIA_IMAGE_ACCEPT}
              aria-label={t('chooseImage')}
              disabled={pending}
              onChange={(e) => choose(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {message(error)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('imageHint')}</p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {currentUrl ? (
            <Button type="button" variant="outline" className="text-destructive" disabled={pending} onClick={() => submit(true)}>
              <Trash2 aria-hidden className="size-4" />
              {t('removeImage')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={pending || !file} onClick={() => submit(false)}>
              {t('upload')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
