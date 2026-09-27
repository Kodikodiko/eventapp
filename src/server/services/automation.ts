/**
 * Abläufe, die Datenbank und E-Mail verbinden: frei gewordene Plätze anbieten und der Zeitplan (`npm run jobs`).
 */
import type { Db } from '@/server/db/core';
import { getMailer, sendAll, type Mailer } from '@/server/mail';
import { waitlistOfferMail } from '@/server/mail/templates';
import { expireStaleReservations } from './checkout';
import { eventsWithWaitlist, expireOffers, offerFreeSeats } from './waitlist';

/** Für die genannten Events freie Plätze an die Warteliste vergeben und die Angebote verschicken. */
export async function fillFreeSeats(db: Db, eventIds: (number | null | undefined)[], mailer: Mailer = getMailer(), now = new Date()) {
  let offered = 0;
  let failed = 0;
  for (const id of new Set(eventIds.filter((x): x is number => typeof x === 'number'))) {
    const notices = offerFreeSeats(db, id, now);
    const r = await sendAll(notices.map(waitlistOfferMail), mailer);
    offered += notices.length;
    failed += r.failed;
  }
  return { offered, failed };
}

export type JobsSummary = { expiredReservations: number; expiredOffers: number; offered: number; mailFailures: number };

/** Ein Durchlauf des Zeitplans (alle 5 Minuten per systemd-Timer, lokal von Hand). */
export async function runJobs(db: Db, mailer: Mailer = getMailer(), now = new Date()): Promise<JobsSummary> {
  const fromReservations = expireStaleReservations(db, now);
  const fromOffers = expireOffers(db, now);
  const r = await fillFreeSeats(db, [...fromReservations, ...fromOffers, ...eventsWithWaitlist(db)], mailer, now);
  return { expiredReservations: fromReservations.length, expiredOffers: fromOffers.length, offered: r.offered, mailFailures: r.failed };
}
