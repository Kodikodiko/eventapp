/** Textvorlagen für System-E-Mails (vorläufig; Gestaltung und weitere Vorlagen folgen in Phase 7). */
import { formatEuro } from '@/lib/money';
import { localized, type LocalizedText } from '@/lib/localized';
import { TIME_ZONE } from '@/lib/dates';
import { appBaseUrl } from '@/server/payments/config';
import type { MailMessage } from './index';

export type OfferMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: 'de' | 'en';
  eventName: LocalizedText;
  token: string;
  expiresAt: string;
  priceCents: number;
};

const when = (iso: string, locale: 'de' | 'en') =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'full', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(iso));

export function waitlistOfferMail(d: OfferMailData): MailMessage {
  const event = localized(d.eventName, d.locale);
  const link = `${appBaseUrl()}/${d.locale}/offer/${d.token}`;
  const privacy = `${appBaseUrl()}/${d.locale}/privacy`;
  const price = d.priceCents === 0 ? (d.locale === 'en' ? 'free' : 'kostenlos') : formatEuro(d.priceCents, d.locale);
  if (d.locale === 'en') {
    return {
      to: d.email,
      subject: `A seat is available: ${event}`,
      text: [
        `Dear ${d.firstName} ${d.lastName},`,
        '',
        `a seat has become available for ${event}. You were next on the waitlist.`,
        `Price: ${price}`,
        '',
        `Accept the seat here (valid until ${when(d.expiresAt, 'en')}):`,
        link,
        '',
        'If you do not accept it in time, the seat will be offered to the next person.',
        '',
        `Privacy notice: ${privacy}`,
      ].join('\n'),
    };
  }
  return {
    to: d.email,
    subject: `Ein Platz ist frei: ${event}`,
    text: [
      `Guten Tag ${d.firstName} ${d.lastName},`,
      '',
      `für ${event} ist ein Platz frei geworden. Sie sind als Nächste:r auf der Warteliste.`,
      `Preis: ${price}`,
      '',
      `Hier können Sie den Platz annehmen (gültig bis ${when(d.expiresAt, 'de')}):`,
      link,
      '',
      'Nehmen Sie das Angebot nicht rechtzeitig an, geht der Platz an die nächste Person.',
      '',
      `Datenschutzerklärung: ${privacy}`,
    ].join('\n'),
  };
}
