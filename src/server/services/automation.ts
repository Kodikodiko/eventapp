/**
 * Abläufe, die Datenbank und E-Mail verbinden: frei gewordene Plätze anbieten und der Zeitplan (`npm run jobs`).
 */
import type { Db } from '@/server/db/core';
import { getMailer, sendAll, type Mailer } from '@/server/mail';
import { waitlistOfferMail } from '@/server/mail/templates';
import { expireStaleReservations } from './checkout';
import { markOverdueSponsors } from './invoices';
import { issueMissingInvoices, mailOrganizer, sendDueReminders } from './notifications';
import { retentionDue, runRetention, type RetentionOptions, type RetentionSummary } from './retention';
import { eventsWithWaitlist, expireOffers, offerFreeSeats } from './waitlist';

/** Für die genannten Events freie Plätze an die Warteliste vergeben und die Angebote verschicken. */
export async function fillFreeSeats(db: Db, eventIds: (number | null | undefined)[], mailer: Mailer = getMailer(), now = new Date()) {
  let offered = 0;
  let failed = 0;
  const organizer = mailOrganizer(db);
  for (const id of new Set(eventIds.filter((x): x is number => typeof x === 'number'))) {
    const notices = offerFreeSeats(db, id, now);
    const r = await sendAll(notices.map((n) => waitlistOfferMail({ ...n, organizer })), mailer);
    offered += notices.length;
    failed += r.failed;
  }
  return { offered, failed };
}

export type JobsSummary = {
  expiredReservations: number;
  expiredOffers: number;
  offered: number;
  invoicesIssued: number;
  remindersSent: number;
  overdueSponsors: number;
  mailFailures: number;
  /** Löschlauf, falls er in diesem Durchlauf fällig war (einmal am Tag) */
  retention: RetentionSummary | null;
};

/**
 * Ein Durchlauf des Zeitplans (alle 5 Minuten per Timer, lokal von Hand).
 * Mit `retention` läuft außerdem einmal am Tag der Löschlauf (Spezifikation 7.5).
 */
export async function runJobs(
  db: Db,
  mailer: Mailer = getMailer(),
  now = new Date(),
  options: { retention?: Omit<RetentionOptions, 'now' | 'dryRun'> } = {}
): Promise<JobsSummary> {
  const fromReservations = expireStaleReservations(db, now);
  const fromOffers = expireOffers(db, now);
  const r = await fillFreeSeats(db, [...fromReservations, ...fromOffers, ...eventsWithWaitlist(db)], mailer, now);
  const invoicesIssued = await issueMissingInvoices(db, mailer, now);
  const reminders = await sendDueReminders(db, mailer, now);
  const overdueSponsors = markOverdueSponsors(db, now);
  const retention = options.retention && retentionDue(db, now) ? runRetention(db, { ...options.retention, now }) : null;
  return {
    expiredReservations: fromReservations.length,
    expiredOffers: fromOffers.length,
    offered: r.offered,
    invoicesIssued,
    remindersSent: reminders.sent,
    overdueSponsors,
    mailFailures: r.failed + reminders.failed,
    retention,
  };
}
