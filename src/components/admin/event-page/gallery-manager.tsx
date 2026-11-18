'use client';

import { ArrowLeft, ArrowRight, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from '@/i18n/navigation';
import { checkMediaFile, MEDIA_IMAGE_ACCEPT } from '@/lib/validation/media';
import { addGalleryImageAction, deleteGalleryImageAction, moveGalleryImageAction } from '@/server/actions/event-page';
import { ConfirmDialog } from '../confirm-dialog';
import { useValidationMessage } from '../form-fields';
import { useActionFeedback } from '../use-action-feedback';

type Image = { id: number; url: string; name: string };

/** Galerie der Eventseite: Bilder hochladen (mehrere nacheinander), Reihenfolge ändern, löschen. */
export function GalleryManager({ eventId, readOnly, max, images }: { eventId: number; readOnly: boolean; max: number; images: Image[] }) {
  const t = useTranslations('eventPage');
  const message = useValidationMessage();
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Image | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function upload(files: File[]) {
    const free = max - images.length;
    const problems: string[] = [];
    const ok = files.filter((f) => {
      const p = checkMediaFile(f);
      if (p) problems.push(`${f.name}: ${message(p)}`);
      return !p;
    });
    if (ok.length > free) problems.push(t('galleryFullHint', { max }));
    const todo = ok.slice(0, Math.max(0, free));
    startTransition(async () => {
      for (const [i, f] of todo.entries()) {
        setProgress(t('uploading', { n: i + 1, total: todo.length }));
        const data = new FormData();
        data.set('image', f);
        const result = await addGalleryImageAction(eventId, data);
        if (!result.ok) {
          problems.push(`${f.name}: ${message(result.fieldErrors?.images ?? result.fieldErrors?.image) ?? t('uploadFailed')}`);
        }
      }
      setProgress(null);
      setErrors(problems);
      if (input.current) input.current.value = '';
      router.refresh();
    });
  }

  function run(action: () => Promise<Parameters<typeof handle>[0]>, success?: string) {
    startTransition(async () => {
      if (handle(await action(), { success })) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('galleryTitle')}</CardTitle>
        <CardDescription>{t('galleryIntro', { max })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {images.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((img, i) => (
              <li key={img.id} className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.name} className="aspect-[4/3] w-full object-cover" />
                {!readOnly && (
                  <div className="flex items-center justify-between gap-1 p-1">
                    <span className="flex">
                      <Button variant="ghost" size="icon" className="size-7" disabled={pending || i === 0} aria-label={t('moveLeft')} onClick={() => run(() => moveGalleryImageAction(img.id, -1))}>
                        <ArrowLeft aria-hidden className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={pending || i === images.length - 1}
                        aria-label={t('moveRight')}
                        onClick={() => run(() => moveGalleryImageAction(img.id, 1))}
                      >
                        <ArrowRight aria-hidden className="size-4" />
                      </Button>
                    </span>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive" disabled={pending} aria-label={t('deleteImage', { name: img.name })} onClick={() => setConfirm(img)}>
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('galleryEmpty')}</p>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={input}
              type="file"
              multiple
              accept={MEDIA_IMAGE_ACCEPT}
              className="sr-only"
              id="gallery-upload"
              onChange={(e) => upload([...(e.target.files ?? [])])}
            />
            <Button type="button" variant="outline" disabled={pending || images.length >= max} onClick={() => input.current?.click()}>
              <Upload aria-hidden className="size-4" />
              {t('galleryAdd')}
            </Button>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {progress ?? t('galleryCount', { count: images.length, max })}
            </span>
          </div>
        )}
        {errors.length > 0 && (
          <ul role="alert" className="space-y-0.5 text-xs text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </CardContent>
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={t('deleteImageTitle')}
          description={t('deleteImageHint', { name: confirm.name })}
          confirmLabel={t('deleteImageConfirm')}
          destructive
          onConfirm={() => run(() => deleteGalleryImageAction(confirm.id), t('imageDeleted'))}
        />
      )}
    </Card>
  );
}
