import { readMediaImage } from '@/server/media/storage';

export const dynamic = 'force-dynamic';

/**
 * Bilder der öffentlichen Eventseite (Titelbild, Galerie, Speaker-Fotos, Sponsor-Logos) aus MEDIA_DIR.
 * Dateinamen sind zufällig und ändern sich bei jedem Upload, daher lange zwischenspeicherbar.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const image = readMediaImage(path.join('/'));
  if (!image) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
