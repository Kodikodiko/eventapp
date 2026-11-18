/**
 * Umschalter zwischen alter und neuer Oberfläche (UI-Redesign, 18.11.2026).
 * Die alte Oberfläche bleibt im Code, bis sie ausdrücklich entfernt werden soll (TODO UI6).
 */
export const UI_COOKIE = 'eventflow-ui';
export type UiVersion = 'neu' | 'alt';
export const parseUiVersion = (value: string | undefined | null): UiVersion => (value === 'alt' ? 'alt' : 'neu');
