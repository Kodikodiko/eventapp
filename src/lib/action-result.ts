/**
 * Einheitliches Ergebnis von Server Actions. Fehler werden als Codes zurückgegeben;
 * die Oberfläche übersetzt sie (messages: actionErrors.*, validation.*).
 */
import type { z } from 'zod';

export type ActionErrorCode = 'INVALID' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'ARCHIVED' | 'UNEXPECTED';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: ActionErrorCode; fieldErrors?: Record<string, string>; message?: string };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<void>;
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data };
}

export function fail(error: ActionErrorCode, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Zod-Fehler → { 'feld.pfad': 'meldungsschlüssel' } (erster Fehler je Feld). */
export function issuesToFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_form';
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}

/** Fachlicher Fehler aus der Service-Schicht, wird in ein ActionResult übersetzt. */
export class ServiceError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    public readonly fieldErrors?: Record<string, string>
  ) {
    super(code);
    this.name = 'ServiceError';
  }
}
