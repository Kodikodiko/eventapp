import { buildIcs } from '@/lib/ics';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { appBaseUrl } from '@/server/payments/config';
import { getPublicEventBySlug } from '@/server/services/public-events';

export const dynamic = 'force-dynamic';

/**
 * Kalenderdatei (.ics) eines öffentlichen Events – ohne Personendaten, daher ohne Anmeldung abrufbar.
 * Sprache über ?locale=en (Standard: de).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = getPublicEventBySlug(await requestDb(), slug);
  if (!event) return new Response('Not found', { status: 404 });
  const locale = new URL(request.url).searchParams.get('locale') === 'en' ? 'en' : 'de';
  const base = appBaseUrl();
  const url = `${base}/${locale}/events/${event.slug}`;
  const ics = buildIcs({
    uid: `event-${event.id}@${new URL(base).hostname}`,
    title: localized(event.name, locale),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location || undefined,
    description: url,
    url,
  });
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
