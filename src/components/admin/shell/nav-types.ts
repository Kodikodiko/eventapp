/** Daten für den Admin-Rahmen (vom Server aufbereitet, im Browser nur angezeigt). */
export type ShellEvent = {
  id: number;
  label: string;
  /** Datum und Ort, bereits formatiert */
  meta: string;
  slug: string;
  archived: boolean;
  counts: { attendees: number; overdueInvoices: number; openRefunds: number };
};

export type ShellUser = { name: string; email: string };
