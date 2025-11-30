export type AttendeeRole = 'attendee' | 'speaker' | 'orga' | 'sponsor';

export type Attendee = {
  id: string;
  name: string;
  email: string;
  status: 'Confirmed' | 'Waitlisted' | 'Cancelled';
  invoiceId: string;
  registrationDate: string;
  roles: AttendeeRole[];
};

export const attendees: Attendee[] = [
  { id: '1', name: 'John Doe', email: 'john.doe@example.com', status: 'Confirmed', invoiceId: 'INV001', registrationDate: '2023-10-01', roles: ['attendee'] },
  { id: '2', name: 'Jane Smith', email: 'jane.smith@example.com', status: 'Confirmed', invoiceId: 'INV002', registrationDate: '2023-10-02', roles: ['attendee', 'speaker'] },
  { id: '3', name: 'Sam Wilson', email: 'sam.wilson@example.com', status: 'Waitlisted', invoiceId: 'INV003', registrationDate: '2023-10-03', roles: ['attendee'] },
  { id: '4', name: 'Alice Brown', email: 'alice.brown@example.com', status: 'Confirmed', invoiceId: 'INV004', registrationDate: '2023-10-04', roles: ['sponsor'] },
  { id: '5', name: 'Bob Johnson', email: 'bob.johnson@example.com', status: 'Cancelled', invoiceId: 'INV005', registrationDate: '2023-10-05', roles: ['orga'] },
];

export type Speaker = {
    id: string;
    name: string;
    company: string;
    proposalStatus: 'Pending' | 'Confirmed' | 'Rejected';
    slidesStatus: 'Missing' | 'Uploaded';
};

export const speakers: Speaker[] = [
    { id: 'spk1', name: 'Dr. Evelyn Reed', company: 'Innovate Inc.', proposalStatus: 'Confirmed', slidesStatus: 'Uploaded' },
    { id: 'spk2', name: 'Marcus Chen', company: 'Tech Solutions', proposalStatus: 'Confirmed', slidesStatus: 'Missing' },
    { id: 'spk3', name: 'Lena Petrova', company: 'Data Insights', proposalStatus: 'Pending', slidesStatus: 'Missing' },
];

export type Sponsor = {
    id: string;
    companyName: string;
    package: 'Platinum' | 'Gold' | 'Silver';
    contactName: string;
    contactEmail: string;
};

export const sponsors: Sponsor[] = [
    { id: 'spo1', companyName: 'Future Systems', package: 'Platinum', contactName: 'David Lee', contactEmail: 'david@future.systems' },
    { id: 'spo2', companyName: 'Connectify', package: 'Gold', contactName: 'Maria Garcia', contactEmail: 'maria@connectify.com' },
];

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
