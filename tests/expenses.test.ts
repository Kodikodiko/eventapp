import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { expenseFormSchema, toExpenseInput, type ExpenseInput } from '@/lib/validation/expenses';
import { openDatabase, type Db } from '@/server/db/core';
import { costGroupTemplates, eventCostGroups } from '@/server/db/schema';
import { receiptDir } from '@/server/receipts/storage';
import { copyEvent, createEvent, setEventArchived } from '@/server/services/events';
import {
  addTemplatesToEvent,
  createEventGroup,
  createExpense,
  createTemplate,
  deleteExpense,
  eventTotals,
  expenseReceipt,
  listEventGroups,
  listExpenses,
  listTemplates,
  publishEventGroup,
  setEventGroupActive,
  setTemplateActive,
  updateEventGroup,
  updateExpense,
  updateTemplate,
} from '@/server/services/expenses';
import { createSpeaker } from '@/server/services/program';

const actor = { userId: 'admin-1' };

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const mk = (slug: string) =>
    createEvent(db, actor, {
      slug,
      name: { de: slug },
      description: null,
      location: '',
      startsAt: '2027-05-12T06:00:00.000Z',
      endsAt: '2027-05-12T16:00:00.000Z',
      registrationOpensAt: null,
      registrationClosesAt: null,
      capacity: 10,
      priceNormalCents: 0,
      priceMemberCents: 0,
      ticketVatRateBp: 2000,
      allowStripe: false,
      allowInvoice: false,
      refundMode: 'automatic',
      cancellationRules: [],
    });
  return { db, event: mk('summit'), other: mk('anderes') };
}

const groupId = (db: Db, eventId: number, name: string) => listEventGroups(db, eventId).find((g) => g.name === name)!.id;

const expense = (costGroupId: number, o: Partial<ExpenseInput> = {}): ExpenseInput => ({
  spentOn: '2027-04-01',
  amountCents: 12000,
  vatRateBp: null,
  costGroupId,
  status: 'new',
  supplier: 'Druckerei Muster',
  description: 'Flyer',
  speakerId: null,
  ...o,
});

const pdf = (name = 'rechnung.pdf') => ({ fileName: name, data: Buffer.from('%PDF-1.4\n% Test\n') });

function codeOf(fn: () => unknown) {
  try {
    fn();
    return { code: 'OK' };
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
}

describe('Kostengruppen', () => {
  it('Standardvorlagen sind angelegt und jedes neue Event erhält eigene Kopien', () => {
    const { db, event } = setup();
    expect(listTemplates(db).map((t) => t.name)).toEqual(['Speaker', 'Raum', 'Marketing', 'Catering', 'Sonstiges']);
    const groups = listEventGroups(db, event.id);
    expect(groups.map((g) => g.name)).toEqual(['Speaker', 'Raum', 'Marketing', 'Catering', 'Sonstiges']);
    expect(groups.find((g) => g.name === 'Speaker')!.speakerLink).toBe(true);
    expect(listTemplates(db).find((t) => t.name === 'Raum')!.eventCount).toBe(2);
  });

  it('Änderungen an Vorlagen wirken nicht auf bestehende Event-Kostengruppen', () => {
    const { db, event } = setup();
    const raum = listTemplates(db).find((t) => t.name === 'Raum')!;
    updateTemplate(db, actor, raum.id, { name: 'Location', speakerLink: true });
    setTemplateActive(db, actor, listTemplates(db).find((t) => t.name === 'Catering')!.id, false);
    const group = listEventGroups(db, event.id).find((g) => g.templateId === raum.id)!;
    expect(group.name).toBe('Raum');
    expect(group.speakerLink).toBe(false);
    expect(listEventGroups(db, event.id).some((g) => g.name === 'Catering' && !g.deactivatedAt)).toBe(true);
  });

  it('Namen sind eindeutig (ohne Groß-/Kleinschreibung) – global und je Event', () => {
    const { db, event, other } = setup();
    expect(codeOf(() => createTemplate(db, actor, { name: 'marketing', speakerLink: false }))).toEqual({ code: 'CONFLICT', fields: { name: 'duplicateName' } });
    expect(codeOf(() => createEventGroup(db, actor, event.id, { name: 'RAUM', speakerLink: false }))).toEqual({ code: 'CONFLICT', fields: { name: 'duplicateName' } });
    const technik = createEventGroup(db, actor, event.id, { name: 'Technik', speakerLink: false });
    // gleicher Name in einem anderen Event ist erlaubt
    expect(codeOf(() => createEventGroup(db, actor, other.id, { name: 'Technik', speakerLink: false })).code).toBe('OK');
    expect(codeOf(() => updateEventGroup(db, actor, technik, { name: 'catering', speakerLink: false })).code).toBe('CONFLICT');
    // Eindeutigkeit auch in der Datenbank abgesichert
    expect(() => db.insert(eventCostGroups).values({ eventId: event.id, name: 'TECHNIK' }).run()).toThrow(/UNIQUE/);
    expect(() => db.insert(costGroupTemplates).values({ name: 'SPEAKER' }).run()).toThrow(/UNIQUE/);
  });

  it('neue Vorlagen lassen sich in bestehende Events übernehmen, deaktivierte nicht', () => {
    const { db, event } = setup();
    createTemplate(db, actor, { name: 'Technik', speakerLink: false });
    const druck = createTemplate(db, actor, { name: 'Druck', speakerLink: false });
    setTemplateActive(db, actor, druck, false);
    expect(addTemplatesToEvent(db, actor, event.id)).toBe(1);
    expect(addTemplatesToEvent(db, actor, event.id)).toBe(0);
    expect(listEventGroups(db, event.id).map((g) => g.name)).toContain('Technik');
    expect(listEventGroups(db, event.id).map((g) => g.name)).not.toContain('Druck');
  });

  it('eventeigene Gruppen können als Vorlage freigegeben werden', () => {
    const { db, event } = setup();
    const own = createEventGroup(db, actor, event.id, { name: 'Technik', speakerLink: false });
    const templateId = publishEventGroup(db, actor, own);
    expect(listEventGroups(db, event.id).find((g) => g.id === own)!.templateId).toBe(templateId);
    expect(codeOf(() => publishEventGroup(db, actor, own))).toEqual({ code: 'CONFLICT', fields: { _form: 'alreadyTemplate' } });
    // Name schon als Vorlage vergeben
    const other = createEventGroup(db, actor, event.id, { name: 'Video', speakerLink: false });
    createTemplate(db, actor, { name: 'video', speakerLink: false });
    expect(codeOf(() => publishEventGroup(db, actor, other))).toEqual({ code: 'CONFLICT', fields: { _form: 'templateNameTaken' } });
  });

  it('beim Kopieren eines Events werden die aktiven Kostengruppen übernommen', () => {
    const { db, event } = setup();
    createEventGroup(db, actor, event.id, { name: 'Technik', speakerLink: false });
    setEventGroupActive(db, actor, groupId(db, event.id, 'Catering'), false);
    const copy = copyEvent(db, actor, event.id, { slug: 'summit-2028', name: { de: 'Summit 2028' } });
    expect(listEventGroups(db, copy.id).map((g) => g.name)).toEqual(['Speaker', 'Raum', 'Marketing', 'Sonstiges', 'Technik']);
  });
});

describe('Ausgaben', () => {
  it('erfasst, summiert und ändert Ausgaben je Kostengruppe und Status', () => {
    const { db, event } = setup();
    const marketing = groupId(db, event.id, 'Marketing');
    const raum = groupId(db, event.id, 'Raum');
    createExpense(db, actor, event.id, expense(marketing, { amountCents: 10000, status: 'paid' }));
    createExpense(db, actor, event.id, expense(marketing, { amountCents: 2550, status: 'planned' }));
    const id = createExpense(db, actor, event.id, expense(raum, { amountCents: 50000 }));
    const totals = eventTotals(listEventGroups(db, event.id));
    expect(totals).toEqual({ new: 50000, planned: 2550, paid: 10000, total: 62550 });
    updateExpense(db, actor, id, expense(raum, { amountCents: 45000, status: 'paid' }));
    expect(eventTotals(listEventGroups(db, event.id)).paid).toBe(55000);
    expect(listExpenses(db, event.id)).toHaveLength(3);
  });

  it('Speaker nur bei Gruppen mit Speaker-Zuordnung und nur aus dem eigenen Event', () => {
    const { db, event, other } = setup();
    const speakerInput = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', company: null, locale: 'de' as const, proposalStatus: 'confirmed' as const, slidesStatus: 'missing' as const };
    const speaker = createSpeaker(db, actor, event.id, speakerInput);
    const foreign = createSpeaker(db, actor, other.id, { ...speakerInput, email: 'grace@example.com', firstName: 'Grace' });
    const speakerGroup = groupId(db, event.id, 'Speaker');
    const id = createExpense(db, actor, event.id, expense(speakerGroup, { speakerId: speaker, description: 'Reisekosten' }));
    expect(listExpenses(db, event.id)[0]).toMatchObject({ id, speakerId: speaker, speakerName: 'Ada Lovelace' });
    expect(codeOf(() => createExpense(db, actor, event.id, expense(speakerGroup, { speakerId: foreign }))).code).toBe('INVALID');
    // in einer Gruppe ohne Speaker-Zuordnung wird ein Speaker ignoriert
    const other2 = createExpense(db, actor, event.id, expense(groupId(db, event.id, 'Raum'), { speakerId: speaker }));
    expect(listExpenses(db, event.id).find((e) => e.id === other2)!.speakerId).toBeNull();
    // Speaker-Zuordnung lässt sich nicht abschalten, solange Ausgaben einen Speaker haben
    expect(codeOf(() => updateEventGroup(db, actor, speakerGroup, { name: 'Speaker', speakerLink: false }))).toEqual({
      code: 'CONFLICT',
      fields: { speakerLink: 'groupHasSpeakerCosts' },
    });
  });

  it('deaktivierte Gruppen: keine neuen Ausgaben, bestehende behalten ihre Gruppe', () => {
    const { db, event } = setup();
    const catering = groupId(db, event.id, 'Catering');
    const id = createExpense(db, actor, event.id, expense(catering));
    setEventGroupActive(db, actor, catering, false);
    expect(codeOf(() => createExpense(db, actor, event.id, expense(catering)))).toEqual({ code: 'INVALID', fields: { costGroupId: 'groupInactive' } });
    expect(codeOf(() => updateExpense(db, actor, id, expense(catering, { amountCents: 999 }))).code).toBe('OK');
  });

  it('Kostengruppen anderer Events sind nicht wählbar', () => {
    const { db, event, other } = setup();
    expect(codeOf(() => createExpense(db, actor, event.id, expense(groupId(db, other.id, 'Raum')))).code).toBe('INVALID');
  });

  it('bezahlte Ausgaben können nicht gelöscht werden, andere schon', () => {
    const { db, event } = setup();
    const raum = groupId(db, event.id, 'Raum');
    const paid = createExpense(db, actor, event.id, expense(raum, { status: 'paid' }));
    const planned = createExpense(db, actor, event.id, expense(raum, { status: 'planned' }));
    expect(codeOf(() => deleteExpense(db, actor, paid))).toEqual({ code: 'CONFLICT', fields: { _form: 'expensePaid' } });
    deleteExpense(db, actor, planned);
    expect(listExpenses(db, event.id).map((e) => e.id)).toEqual([paid]);
  });

  it('archivierte Events sind schreibgeschützt', () => {
    const { db, event } = setup();
    const raum = groupId(db, event.id, 'Raum');
    setEventArchived(db, actor, event.id, true);
    expect(codeOf(() => createExpense(db, actor, event.id, expense(raum))).code).toBe('ARCHIVED');
    expect(codeOf(() => createEventGroup(db, actor, event.id, { name: 'Neu', speakerLink: false })).code).toBe('ARCHIVED');
  });

  it('Belege: ablegen, ersetzen, entfernen; nur erlaubte Dateitypen', () => {
    const { db, event } = setup();
    const raum = groupId(db, event.id, 'Raum');
    const id = createExpense(db, actor, event.id, expense(raum), pdf());
    const first = listExpenses(db, event.id)[0];
    expect(first).toMatchObject({ receiptName: 'rechnung.pdf', receiptType: 'application/pdf' });
    expect(expenseReceipt(db, id)!.content.toString()).toContain('%PDF');

    const png = { fileName: 'foto.PNG', data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]) };
    updateExpense(db, actor, id, expense(raum), { upload: png });
    const second = listExpenses(db, event.id)[0];
    expect(second.receiptType).toBe('image/png');
    expect(fs.existsSync(path.join(receiptDir(), first.receiptPath!))).toBe(false);

    updateExpense(db, actor, id, expense(raum), { remove: true });
    expect(listExpenses(db, event.id)[0].receiptPath).toBeNull();
    expect(fs.existsSync(path.join(receiptDir(), second.receiptPath!))).toBe(false);

    expect(codeOf(() => createExpense(db, actor, event.id, expense(raum), { fileName: 'x.html', data: Buffer.from('<html>') }))).toEqual({
      code: 'INVALID',
      fields: { receipt: 'receiptType' },
    });
    // Endung passt nicht zum Inhalt
    expect(codeOf(() => createExpense(db, actor, event.id, expense(raum), { fileName: 'fake.pdf', data: Buffer.from('<html>') })).code).toBe('INVALID');
    expect(listExpenses(db, event.id)).toHaveLength(1);
  });

  it('Formular: Betrag größer 0, Beschreibung Pflicht, Lieferant optional', () => {
    const base = { spentOn: '2027-04-01', amount: '99,50', vatRateBp: '', costGroupId: '3', status: 'planned', supplier: '', description: 'Saalmiete', speakerId: '', removeReceipt: false };
    const ok = expenseFormSchema.parse(base);
    expect(toExpenseInput(ok)).toMatchObject({ amountCents: 9950, supplier: null, vatRateBp: null, speakerId: null });
    expect(expenseFormSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, description: ' ' }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, status: 'cancelled' }).success).toBe(false);
  });
});
