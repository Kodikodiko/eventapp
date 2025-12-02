
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
};

    
