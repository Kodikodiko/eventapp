import { cookies } from 'next/headers';
import { parseUiVersion, UI_COOKIE, type UiVersion } from '@/lib/ui-version';

/** Gewählte Oberfläche aus dem Cookie; ohne Cookie die neue. */
export async function getUiVersion(): Promise<UiVersion> {
  return parseUiVersion((await cookies()).get(UI_COOKIE)?.value);
}
