/** Bilder der Eventseite (Titelbild, Galerie, Speaker-Fotos, Sponsor-Logos): PNG, JPG oder WebP, höchstens 5 MB. */
export const MEDIA_IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
export const MEDIA_IMAGE_ACCEPT = Object.keys(MEDIA_IMAGE_TYPES).map((ext) => `.${ext}`).join(',');
export const MAX_MEDIA_IMAGE_BYTES = 5 * 1024 * 1024;

export type MediaExtension = keyof typeof MEDIA_IMAGE_TYPES;

export function mediaImageExtension(fileName: string): MediaExtension | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ext in MEDIA_IMAGE_TYPES ? (ext as MediaExtension) : null;
}

/** Prüfung im Browser vor dem Hochladen; liefert den Fehlerschlüssel oder undefined. */
export function checkMediaFile(file: { name: string; size: number } | undefined): 'mediaType' | 'imageTooLarge' | undefined {
  if (!file) return undefined;
  if (!mediaImageExtension(file.name)) return 'mediaType';
  if (file.size === 0 || file.size > MAX_MEDIA_IMAGE_BYTES) return 'imageTooLarge';
  return undefined;
}

/** Öffentliche Adresse eines abgelegten Bildes (Pfad relativ zu MEDIA_DIR). */
export function mediaUrl(relative: string | null | undefined): string | null {
  return relative ? `/api/media/${relative}` : null;
}
