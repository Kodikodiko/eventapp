import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { formatAmount, formatSignedAmount } from '@/lib/money';
import { planFormSchema, toPlanInput, type PlanInput } from '@/lib/validation/pnl';
import { openDatabase, type Db } from '@/server/db/core';
import { eventCostGroups, expenses, payments, people, refunds, registrations, sponsorPackages, sponsors } from '@/server/db/schema';
import { createEvent, setEventArchived } from '@/server/services/events';
import { dayNumber, dayOfNumber, getPnl, isoWeek, mondayOf, resultTimeline, savePlan, setComparisons } from '@/server/services/pnl';

const actor = { userId: 'admin-1' };
const NOW = new Date('2026-11-13T12:00:00.000Z');

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const mk = (slug: string, startsAt: string) =>
    createEvent(db, actor, {
      slug,
      name: { de: slug },
      description: null,
      location: '',
      startsAt,
      endsAt: startsAt.replace('T08', 'T16'),
      registrationOpensAt: null,
      registrationClosesAt: null,
      capacity: 200,
      priceNormalCents: 25000,
      priceMemberCents: 7500,
      ticketVatRateBp: 0,
      allowStripe: true,
      allowInvoice: true,
      refundMode: 'automatic',
      cancellationRules: [],
    });
  return { db, event: mk('forum-2026', '2026-11-20T08:00:00.000Z'), previous: mk('forum-2025', '2025-11-21T08:00:00.000Z') };
}

let personSeq = 0;
type RegOptions = {
  ticketType?: 'normal' | 'member' | 'special';
  priceCents?: number;
  status?: 'reserved' | 'confirmed' | 'waitlisted' | 'cancelled';
  paymentStatus?: 'open' | 'paid' | 'partially_refunded' | 'refunded' | 'not_required';
  paid?: number;
  createdAt?: string;
  paidAt?: string;
};

/** Legt Person, Anmeldung und (bei paid > 0) einen Zahlungseingang an. Gibt die ID der Zahlung zurück. */
function reg(db: Db, eventId: number, o: RegOptions = {}): { registrationId: number; paymentId: number | null } {
  personSeq += 1;
  const person = db.insert(people).values({ firstName: 'P', lastName: `Nr${personSeq}`, email: `p${personSeq}@example.org` }).returning().get();
  const paid = o.paid ?? 0;
  const row = db
    .insert(registrations)
    .values({
      eventId,
      personId: person.id,
      status: o.status ?? 'confirmed',
      paymentStatus: o.paymentStatus ?? (paid > 0 ? 'paid' : 'open'),
      paymentMethod: 'invoice',
      ticketType: o.ticketType ?? 'normal',
      priceCents: o.priceCents ?? 25000,
      source: 'admin',
      qrToken: `qr-${personSeq}`,
      createdAt: o.createdAt ?? '2026-10-01T10:00:00.000Z',
    })
    .returning()
    .get();
  if (paid === 0) return { registrationId: row.id, paymentId: null };
  const payment = db
    .insert(payments)
    .values({ registrationId: row.id, method: 'bank_transfer', status: 'succeeded', amountCents: paid, paidAt: o.paidAt ?? '2026-10-05T11:00:00.000Z' })
    .returning()
    .get();
  return { registrationId: row.id, paymentId: payment.id };
}

function sponsor(db: Db, eventId: number, name: string, priceCents: number, o: { status?: 'open' | 'invoiced' | 'paid' | 'overdue'; paid?: number; discountCents?: number } = {}) {
  const pkg = db.insert(sponsorPackages).values({ eventId, name: { de: 'Paket' }, benefits: { de: [] }, priceCents }).returning().get();
  const row = db
    .insert(sponsors)
    .values({ eventId, companyName: name, packageId: pkg.id, discountCents: o.discountCents ?? 0, paymentStatus: o.status ?? 'open', createdAt: '2026-09-01T08:00:00.000Z' })
    .returning()
    .get();
  if (o.paid) db.insert(payments).values({ sponsorId: row.id, method: 'bank_transfer', status: 'succeeded', amountCents: o.paid, paidAt: '2026-09-20T10:00:00.000Z' }).run();
  return row.id;
}

const groupId = (db: Db, eventId: number, name: string) =>
  db.select().from(eventCostGroups).all().find((g) => g.eventId === eventId && g.name === name)!.id;

function expense(db: Db, eventId: number, group: string, amountCents: number, status: 'new' | 'planned' | 'paid', spentOn = '2026-10-10') {
  db.insert(expenses).values({ eventId, costGroupId: groupId(db, eventId, group), spentOn, amountCents, description: `${group} ${amountCents}`, status }).run();
}

const plan = (o: Partial<PlanInput> = {}): PlanInput => ({
  tickets: { normal: 30, member: 80, special: 20, free: 80 },
  prices: { normal: null, member: 7000, special: 6000 },
  sponsorIncomeCents: 800000,
  budgets: [],
  ...o,
});

describe('Kalenderhilfen', () => {
  it('Montag und ISO-Kalenderwoche', () => {
    expect(dayOfNumber(mondayOf(dayNumber('2026-11-13')))).toBe('2026-11-09');
    expect(dayOfNumber(mondayOf(dayNumber('2026-11-09')))).toBe('2026-11-09');
    expect(isoWeek('2026-11-13')).toBe(46);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2024-12-30')).toBe(1);
  });
});

describe('Beträge ohne Währungszeichen', () => {
  it('formatAmount und formatSignedAmount', () => {
    expect(formatAmount(520000, 'de')).toBe('5.200,00');
    expect(formatAmount(-27500, 'de')).toBe('−275,00');
    expect(formatSignedAmount(480571, 'de')).toBe('+4.805,71');
    expect(formatSignedAmount(0, 'de')).toBe('0,00');
    expect(formatAmount(520000, 'en')).toBe('5,200.00');
  });
});

describe('Erfolgsrechnung: Ist und Offen', () => {
  it('Tickets nach Tickettyp, Freitickets, Erstattungen', () => {
    const { db, event } = setup();
    reg(db, event.id, { paid: 25000 });
    reg(db, event.id, {}); // offen 250
    reg(db, event.id, { ticketType: 'member', priceCents: 7500, paid: 7500 });
    reg(db, event.id, { ticketType: 'special', priceCents: 0 }); // Freiticket
    reg(db, event.id, { priceCents: 25000, paymentStatus: 'not_required' }); // Zahlung erlassen
    reg(db, event.id, { status: 'waitlisted' }); // zählt nicht
    const cancelled = reg(db, event.id, { status: 'cancelled', paymentStatus: 'refunded', paid: 25000 });
    db.insert(refunds).values({ paymentId: cancelled.paymentId!, amountCents: 20000, status: 'executed', reason: 'Storno', executedAt: '2026-10-20T09:00:00.000Z' }).run();
    const partial = reg(db, event.id, { ticketType: 'member', priceCents: 7500, paid: 7500, paymentStatus: 'paid' });
    db.insert(refunds).values({ paymentId: partial.paymentId!, amountCents: 2500, status: 'approved', reason: 'Kulanz' }).run();
    db.insert(refunds).values({ paymentId: partial.paymentId!, amountCents: 1000, status: 'rejected', reason: 'nein' }).run();

    const { core } = getPnl(db, event, NOW);
    const by = Object.fromEntries(core.tickets.map((t) => [t.key, t]));
    expect(by.normal).toMatchObject({ count: 2, actual: 50000, open: 25000 }); // inkl. Zahlung der stornierten Anmeldung
    expect(by.member).toMatchObject({ count: 2, actual: 15000, open: 0 });
    expect(by.special).toMatchObject({ count: 0, actual: 0, open: 0 });
    expect(by.free).toMatchObject({ count: 2, actual: 0, open: 0 });
    expect(by.refunds).toMatchObject({ count: 1, actual: -20000, open: -2500 });
    expect(core.ticketTotal).toEqual({ count: 6, actual: 45000, open: 22500 });
    expect(core.openTicketCount).toBe(1);
  });

  it('Sponsoren: Zahlungseingänge, Status „bezahlt“ ohne Buchung, Rabatt', () => {
    const { db, event } = setup();
    sponsor(db, event.id, 'Alpha', 200000, { status: 'paid', paid: 200000 });
    sponsor(db, event.id, 'Beta', 120000, { status: 'invoiced' });
    sponsor(db, event.id, 'Gamma', 60000, { status: 'paid' }); // von Hand auf bezahlt gesetzt
    sponsor(db, event.id, 'Delta', 100000, { status: 'invoiced', paid: 40000, discountCents: 10000 }); // Teilzahlung
    const { core } = getPnl(db, event, NOW);
    expect(core.sponsors.map((s) => [s.name, s.actual, s.open])).toEqual([
      ['Alpha', 200000, 0],
      ['Beta', 0, 120000],
      ['Delta', 40000, 50000],
      ['Gamma', 60000, 0],
    ]);
    expect(core.sponsorTotal).toEqual({ actual: 300000, open: 170000 });
  });

  it('Ausgaben je Kostengruppe und Ergebnis', () => {
    const { db, event } = setup();
    reg(db, event.id, { paid: 25000 });
    sponsor(db, event.id, 'Alpha', 200000, { status: 'paid', paid: 200000 });
    expense(db, event.id, 'Catering', 100000, 'paid');
    expense(db, event.id, 'Catering', 300000, 'planned');
    expense(db, event.id, 'Speaker', 50000, 'new');
    const { core } = getPnl(db, event, NOW);
    const catering = core.groups.find((g) => g.name === 'Catering')!;
    expect(catering).toMatchObject({ count: 2, actual: 100000, open: 300000 });
    expect(catering.items.map((i) => i.amountCents)).toEqual([100000, 300000]);
    expect(core.groups.find((g) => g.name === 'Speaker')).toMatchObject({ actual: 0, open: 50000 });
    expect(core.expenses).toEqual({ count: 3, actual: 100000, open: 350000 });
    expect(core.income).toEqual({ actual: 225000, open: 0 });
    expect(core.result).toEqual({ actual: 125000, open: -350000 });
  });

  it('Verlauf: aufgelaufenes Ist-Ergebnis je Woche, endet beim Ist-Ergebnis', () => {
    const { db, event } = setup();
    reg(db, event.id, { paid: 25000, paidAt: '2026-10-05T11:00:00.000Z' });
    expense(db, event.id, 'Catering', 100000, 'paid', '2026-10-14');
    sponsor(db, event.id, 'Alpha', 200000, { status: 'paid', paid: 200000 }); // 20.09.
    const pnl = getPnl(db, event, NOW);
    expect(pnl.timeline[0]).toEqual({ day: '2026-09-14', cents: 0 });
    expect(pnl.timeline.at(-1)).toEqual({ day: '2026-11-13', cents: pnl.core.result.actual });
    const at = (day: string) => pnl.timeline.find((p) => p.day === day)?.cents;
    expect(at('2026-09-20')).toBe(200000);
    expect(at('2026-10-11')).toBe(225000);
    expect(at('2026-10-18')).toBe(125000);
  });

  it('Verlauf ohne Geldflüsse ist leer; vordatierte Buchungen zählen ab heute', () => {
    expect(resultTimeline([], '2026-11-13')).toEqual([]);
    const points = resultTimeline([{ day: '2026-12-01', cents: 100 }], '2026-11-13');
    expect(points[points.length - 1]).toEqual({ day: '2026-11-13', cents: 100 });
  });
});

describe('Plan', () => {
  it('Formularwerte: leer = 0 bzw. keine Angabe', () => {
    const parsed = planFormSchema.parse({
      tickets: { normal: '30', member: '', special: '5', free: '' },
      prices: { normal: '', member: '70', special: '60,50' },
      sponsorIncome: '8.000,00',
      budgets: { '3': '1.500', '4': '' },
    });
    expect(toPlanInput(parsed)).toEqual({
      tickets: { normal: 30, member: 0, special: 5, free: 0 },
      prices: { normal: null, member: 7000, special: 6050 },
      sponsorIncomeCents: 800000,
      budgets: [{ costGroupId: 3, amountCents: 150000 }],
    });
    expect(planFormSchema.safeParse({ tickets: { normal: 'x', member: '', special: '', free: '' }, prices: { normal: '', member: '', special: '' }, sponsorIncome: '', budgets: {} }).success).toBe(false);
  });

  it('speichert je Variante, rechnet mit Eventpreis als Vorgabe und ersetzt Budgets', () => {
    const { db, event } = setup();
    const catering = groupId(db, event.id, 'Catering');
    const speaker = groupId(db, event.id, 'Speaker');
    expect(getPnl(db, event, NOW).plans.plan.figures).toBeNull();

    savePlan(db, actor, event.id, 'plan', plan({ budgets: [{ costGroupId: catering, amountCents: 1500000 }, { costGroupId: speaker, amountCents: 750000 }] }));
    savePlan(db, actor, event.id, 'min', plan({ tickets: { normal: 10, member: 20, special: 0, free: 10 }, sponsorIncomeCents: 380000 }));
    let pnl = getPnl(db, event, NOW);
    expect(pnl.plans.plan.figures).toMatchObject({
      tickets: { normal: 750000, member: 560000, special: 120000, free: null, refunds: null },
      ticketTotal: 1430000,
      sponsorTotal: 800000,
      income: 2230000,
      expenses: 2250000,
      result: -20000,
    });
    expect(pnl.plans.plan.figures!.groups).toEqual({ [catering]: 1500000, [speaker]: 750000 });
    expect(pnl.plans.min.figures).toMatchObject({ ticketTotal: 390000, income: 770000, expenses: 0 });
    expect(pnl.plans.best.values.exists).toBe(false);

    savePlan(db, actor, event.id, 'plan', plan({ budgets: [{ costGroupId: catering, amountCents: 1000000 }] }));
    pnl = getPnl(db, event, NOW);
    expect(pnl.plans.plan.figures!.groups).toEqual({ [catering]: 1000000 });
    expect(pnl.plans.min.figures).toMatchObject({ income: 770000 }); // andere Variante unberührt
  });

  it('lehnt fremde Kostengruppen und archivierte Events ab', () => {
    const { db, event, previous } = setup();
    const foreign = groupId(db, previous.id, 'Catering');
    const code = (fn: () => unknown) => {
      try {
        fn();
        return null;
      } catch (e) {
        return e instanceof ServiceError ? e.code : 'OTHER';
      }
    };
    expect(code(() => savePlan(db, actor, event.id, 'plan', plan({ budgets: [{ costGroupId: foreign, amountCents: 1 }] })))).toBe('INVALID');
    setEventArchived(db, actor, event.id, true);
    expect(code(() => savePlan(db, actor, event.id, 'plan', plan()))).toBe('ARCHIVED');
    expect(code(() => savePlan(db, actor, 9999, 'plan', plan()))).toBe('NOT_FOUND');
  });
});

describe('Vergleich mit anderen Events', () => {
  it('ordnet Sponsoren und Kostengruppen über den Namen zu und weist den Rest gesammelt aus', () => {
    const { db, event, previous } = setup();
    const alpha = sponsor(db, event.id, 'Alpha', 200000, { status: 'paid', paid: 200000 });
    const beta = sponsor(db, event.id, 'Beta', 120000);
    expense(db, event.id, 'Catering', 100000, 'paid');

    reg(db, previous.id, { paid: 20000, createdAt: '2025-10-01T10:00:00.000Z', paidAt: '2025-10-02T10:00:00.000Z' });
    sponsor(db, previous.id, 'alpha ', 180000, { status: 'paid', paid: 180000 });
    sponsor(db, previous.id, 'Omega', 50000, { status: 'paid', paid: 50000 });
    sponsor(db, previous.id, 'Offen', 70000); // nicht bezahlt → kein Ist
    expense(db, previous.id, 'Catering', 90000, 'paid', '2025-10-10');
    expense(db, previous.id, 'Catering', 10000, 'planned', '2025-10-10'); // nicht bezahlt → kein Ist
    db.insert(eventCostGroups).values({ eventId: previous.id, name: 'Altlasten', sortOrder: 99 }).run();
    expense(db, previous.id, 'Altlasten', 30000, 'paid', '2025-10-10');

    expect(getPnl(db, event, NOW).compare).toEqual([]);
    setComparisons(db, actor, event.id, [previous.id]);
    const pnl = getPnl(db, event, NOW);
    expect(pnl.candidates.map((c) => c.id)).toEqual([previous.id]);
    const [col] = pnl.compare;
    expect(col.tickets.normal).toBe(20000);
    expect(col.sponsors).toEqual({ [alpha]: 180000 });
    expect(col.sponsors[beta]).toBeUndefined();
    expect(col.otherSponsors).toBe(50000);
    expect(col.sponsorTotal).toBe(230000);
    expect(col.groups).toMatchObject({ [groupId(db, event.id, 'Catering')]: 90000 });
    expect(col.otherGroups).toEqual([{ name: 'Altlasten', cents: 30000 }]);
    expect(col.expenses).toBe(120000);
    expect(col.result).toBe(20000 + 230000 - 120000);
  });

  it('erlaubt höchstens zwei, nicht das Event selbst, nur bekannte Events', () => {
    const { db, event, previous } = setup();
    const fails = (ids: number[]) => {
      try {
        setComparisons(db, actor, event.id, ids);
        return false;
      } catch (e) {
        return e instanceof ServiceError && e.code === 'INVALID';
      }
    };
    expect(fails([event.id])).toBe(true);
    expect(fails([previous.id, 777])).toBe(true);
    expect(fails([previous.id, 5, 6])).toBe(true);
    setComparisons(db, actor, event.id, [previous.id, previous.id]);
    expect(getPnl(db, event, NOW).compare).toHaveLength(1);
    setComparisons(db, actor, event.id, []);
    expect(getPnl(db, event, NOW).compare).toHaveLength(0);
  });
});

describe('Anmeldungen im Zeitvergleich', () => {
  it('richtet Wochen und Monate nach dem Abstand zum Event aus und kappt das Vorjahr beim gleichen Abstand', () => {
    const { db, event, previous } = setup();
    // Event 2026: Freitag 20.11. (KW 47); heute Freitag 13.11. (KW 46) → 7 Tage vor dem Event
    reg(db, event.id, { createdAt: '2026-11-10T10:00:00.000Z' }); // KW 46
    reg(db, event.id, { createdAt: '2026-11-03T10:00:00.000Z' }); // KW 45
    reg(db, event.id, { createdAt: '2026-11-02T10:00:00.000Z' }); // KW 45
    reg(db, event.id, { createdAt: '2026-10-20T10:00:00.000Z' }); // KW 43
    reg(db, event.id, { createdAt: '2026-11-11T10:00:00.000Z', status: 'cancelled' }); // zählt nicht
    // Event 2025: Freitag 21.11. (KW 47)
    reg(db, previous.id, { createdAt: '2025-11-12T10:00:00.000Z' }); // 9 Tage vorher, eine Woche vor dem Event
    reg(db, previous.id, { createdAt: '2025-11-18T10:00:00.000Z' }); // 3 Tage vorher → noch nicht vergleichbar
    reg(db, previous.id, { createdAt: '2025-10-22T10:00:00.000Z' }); // vier Wochen vor dem Event
    reg(db, previous.id, { createdAt: '2025-09-30T10:00:00.000Z' }); // September

    setComparisons(db, actor, event.id, [previous.id]);
    const trend = getPnl(db, event, NOW).registrations;
    expect(trend.total).toBe(4);
    expect(trend.compare).toMatchObject({ eventId: previous.id, totalAtSameDistance: 3 });
    // älteste Woche zuerst; ältere Anmeldungen des Vorjahrs zählen zum ältesten Abschnitt
    expect(trend.weeks.at(-1)).toEqual({ start: '2026-11-09', current: 1, previous: 1 });
    expect(trend.weeks.at(-2)).toEqual({ start: '2026-11-02', current: 2, previous: 0 });
    expect(trend.weeks.at(-4)).toEqual({ start: '2026-10-19', current: 1, previous: 1 });
    expect(trend.weeks[0]).toMatchObject({ current: 0, previous: 1 });
    expect(trend.weeks.reduce((s, w) => s + w.current, 0)).toBe(4);
    expect(trend.weeks.reduce((s, w) => s + (w.previous ?? 0), 0)).toBe(3);
    expect(trend.months).toEqual([
      { start: '2026-09-01', current: 0, previous: 1 },
      { start: '2026-10-01', current: 1, previous: 1 },
      { start: '2026-11-01', current: 3, previous: 1 },
    ]);
  });

  it('ohne Vergleichs-Event bleibt das Vorjahr leer', () => {
    const { db, event } = setup();
    reg(db, event.id, { createdAt: '2026-11-10T10:00:00.000Z' });
    const trend = getPnl(db, event, NOW).registrations;
    expect(trend.compare).toBeNull();
    expect(trend.weeks).toEqual([{ start: '2026-11-09', current: 1, previous: null }]);
  });
});
