
import { Timestamp } from 'firebase/firestore';

export type AttendeeRole = 'attendee' | 'speaker' | 'orga' | 'sponsor';

export type AttendeeStatus = 'Confirmed' | 'Waitlisted' | 'Cancelled';

export type Attendee = {
  id: string;
  fullName: string;
  email: string;
  status: AttendeeStatus;
  roles: AttendeeRole[];
  registrationDate: Timestamp | string | null;
  invoiceId?: string;
  eventId: string;
  price?: number;
  company?: string;
  pmiNumber?: string;
  billingAddress?: string;
};

// This will be our single event for now.
export const EVENT_ID = 'evt1';

export type SpeakerProposalStatus = 'Pending' | 'Confirmed' | 'Rejected';
export type SpeakerSlidesStatus = 'Missing' | 'Uploaded' | 'Review';

export type Speaker = {
    id: string;
    name: string;
    company: string;
    proposalStatus: SpeakerProposalStatus;
    slidesStatus: SpeakerSlidesStatus;
    slidesUrl?: string;
    eventId: string;
};

export type SponsorPackage = {
    id: string;
    name: string;
    price: number;
    benefits: string[];
    eventId: string;
};

export type SponsorContact = {
    name: string;
    email: string;
    phone: string;
}

export type SponsorPaymentStatus = 'open' | 'billed' | 'paid' | 'overdue';

export type SponsorPaymentDetails = {
    amount: number; // Package Price
    billedAmount: number; // Actual amount received
    dueDate: Timestamp | string | null;
    status: SponsorPaymentStatus;
    discount: number;
}

export type Sponsor = {
    id: string;
    companyName: string;
    packageId: string;
    contacts: SponsorContact[];
    billingAddress: string;
    paymentDetails: SponsorPaymentDetails;
    eventId: string;
};

export type SessionTag = 'break' | 'talk' | 'workshop' | 'general';

export type Session = {
  id: string;
  title: string;
  speaker?: string;
  from: string; // "HH:mm" format
  to: string; // "HH:mm" format
  tag: SessionTag;
  location: string;
  stream: number; // 1-4
  eventId: string;
}

export const salesData = [
  { name: 'Jan', tickets: 400 },
  { name: 'Feb', tickets: 300 },
  { name: 'Mar', tickets: 500 },
  { name: 'Apr', tickets: 450 },
  { name: 'May', tickets: 600 },
  { name: 'Jun', tickets: 800 },
];

export type Pricing = {
  member: number;
  normal: number;
};

export type EventDetails = {
  id: string;
  name: string;
  date: string;
  location: string;
  pricing: Pricing;
  termsOfService: string;
};

export const eventDetails: EventDetails = {
  id: 'evt1',
  name: 'Tech Conference 2024',
  date: '2024-10-26',
  location: 'Convention Center, NYC',
  pricing: {
    member: 99,
    normal: 149,
  },
  termsOfService: `1. Acceptance of Terms: By registering for this event, you agree to be bound by these Terms of Service.
2. Registration: All information provided during registration must be accurate and complete.
3. Payment: Full payment is required to confirm your registration. Prices are as listed and are inclusive of any applicable taxes.
4. Cancellation Policy: Cancellations made 30 days or more before the event will receive a full refund. No refunds will be issued for cancellations made within 30 days of the event.
5. Code of Conduct: All attendees are expected to behave professionally and respectfully. Harassment or disruptive behavior will not be tolerated and may result in removal from the event without a refund.
6. Liability: The event organizers are not liable for any personal injury, loss, or damage to personal property.
7. Photography and Videography: By attending, you consent to being photographed or recorded. These materials may be used for promotional purposes.`,
};

    
