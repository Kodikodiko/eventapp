
import type { Attendee } from '@/lib/data';
import { format } from 'date-fns';

type InvoiceViewProps = {
  attendees: Attendee[];
};

// This component returns an HTML string for printing, not a React component.
export function InvoiceView({ attendees }: InvoiceViewProps): string {
    const getRegistrationDate = (attendee: Attendee) => {
        if (!attendee.registrationDate) return 'N/A';
        const date = typeof attendee.registrationDate === 'string' 
            ? new Date(attendee.registrationDate) 
            : attendee.registrationDate.toDate();
        return format(date, 'dd.MM.yyyy');
    };

  return attendees.map(attendee => `
    <div class="invoice-card bg-white p-8 rounded-lg shadow-md max-w-2xl mx-auto my-8">
      <header class="flex justify-between items-center pb-6 border-b">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">Invoice</h1>
          <p class="text-gray-500">Invoice ID: ${attendee.invoiceId ?? 'N/A'}</p>
        </div>
        <div class="text-right">
          <h2 class="text-xl font-semibold text-gray-700">EventFlow Inc.</h2>
          <p class="text-gray-500">123 Tech Lane, Innovation City</p>
        </div>
      </header>
      <section class="flex justify-between my-6">
        <div>
          <h3 class="font-semibold text-gray-600 mb-1">Billed To</h3>
          <p class="font-bold">${attendee.fullName}</p>
          <p class="text-gray-500">${attendee.email}</p>
          ${attendee.company ? `<p class="text-gray-500">${attendee.company}</p>` : ''}
        </div>
        <div class="text-right">
          <p class="font-semibold"><strong>Registration Date:</strong> ${getRegistrationDate(attendee)}</p>
          <p class="font-semibold"><strong>Status:</strong> Paid</p>
        </div>
      </section>
      <section>
        <table class="w-full">
          <thead class="bg-gray-50">
            <tr>
              <th class="p-3 text-left font-semibold text-gray-600">Description</th>
              <th class="p-3 text-right font-semibold text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b">
              <td class="p-3">Event Ticket - Tech Conference 2024</td>
              <td class="p-3 text-right font-mono">€${(attendee.price ?? 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="flex justify-end mt-6">
        <div class="w-full max-w-xs text-right">
          <div class="flex justify-between py-2">
            <span class="font-semibold text-gray-600">Subtotal</span>
            <span class="font-mono">€${(attendee.price ?? 0).toFixed(2)}</span>
          </div>
          <div class="flex justify-between py-2 border-t">
            <span class="font-bold text-lg">Total</span>
            <span class="font-bold text-lg font-mono">€${(attendee.price ?? 0).toFixed(2)}</span>
          </div>
        </div>
      </section>
      <footer class="mt-8 pt-6 border-t text-center text-gray-500 text-sm">
        <p>Thank you for your registration!</p>
        <p>If you have any questions, please contact billing@eventflow.com.</p>
      </footer>
    </div>
  `).join('');
}
