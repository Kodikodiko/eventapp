/** Hilfen für Streams (parallele Spuren) im Programm – Browser und Server. */
import type { LocalizedText } from '@/lib/localized';

export const MAX_STREAMS = 10;

export type StreamInfo = { position: number; name: LocalizedText };

/** Letzter Stream eines Programmpunkts (Programmpunkte über mehrere Streams haben `streamTo`). */
export function streamEnd(s: { stream: number; streamTo?: number | null }): number {
  return Math.max(s.stream, s.streamTo ?? s.stream);
}

export function defaultStreamName(position: number): LocalizedText {
  return { de: `Stream ${position}`, en: `Stream ${position}` };
}
