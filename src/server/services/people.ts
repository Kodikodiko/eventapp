/**
 * Personen: eine Person pro E-Mail-Adresse, gemeinsam für Teilnehmende, Speaker und Sponsor-Kontakte.
 */
import { eq } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { Db } from '@/server/db/core';
import { people } from '@/server/db/schema';
import type { Tx } from './audit';

export type PersonInput = {
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  locale: 'de' | 'en';
  phone?: string | null;
};

/**
 * Person zur E-Mail finden oder anlegen. Bei einer vorhandenen Person werden Name und Sprache aktualisiert;
 * Firma und Telefon nur, wenn ein Wert übergeben wird (leere Angaben löschen nichts).
 */
export function upsertPerson(tx: Tx | Db, input: PersonInput): number {
  const email = input.email.trim().toLowerCase();
  const existing = tx.select().from(people).where(eq(people.email, email)).get();
  if (existing) {
    // Wiederverwendung: Name und Sprache aktualisieren, vorhandene Firma/Telefon nicht mit leeren Werten überschreiben
    tx.update(people)
      .set({
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company ?? existing.company,
        phone: input.phone ?? existing.phone,
        locale: input.locale,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(people.id, existing.id))
      .run();
    return existing.id;
  }
  const [row] = tx
    .insert(people)
    .values({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      company: input.company,
      phone: input.phone ?? null,
      locale: input.locale,
    })
    .returning()
    .all();
  return row.id;
}

/** Stammdaten einer bestimmten Person ändern; die E-Mail darf keiner anderen Person gehören. */
export function updatePerson(tx: Tx | Db, personId: number, input: PersonInput): void {
  const email = input.email.trim().toLowerCase();
  const other = tx.select({ id: people.id }).from(people).where(eq(people.email, email)).get();
  if (other && other.id !== personId) throw new ServiceError('CONFLICT', { email: 'emailInUse' });
  tx.update(people)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      company: input.company,
      locale: input.locale,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(people.id, personId))
    .run();
}
