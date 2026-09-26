# Event Management Application Specification

This document outlines the features and requirements for the EventFlow application.

## 1. Application Architecture & Context

### 1.1 Core Components
The EventFlow ecosystem consists of two primary components:
1.  **Event Admin App (This Application):** A secure web application for ~5 event managers to administrate multiple events.
2.  **Public Event Site:** A separate, decoupled website that end-users visit to learn about the event.

### 1.2 Registration Flow
- When a user clicks "Register" on the Public Event Site, they will be directed to a public registration page within this application.
- This page will allow new attendees to register for the event.

### 1.3 Multiple Events
- The application manages any number of events. Each event has its own attendees, speakers, sponsors, sponsor packages, schedule, prices, capacity, terms and cancellation policy.
- Every event has a unique, human-readable slug used in public URLs (e.g. `/de/events/pm-summit-2027/register`).
- In the admin area an event switcher selects the current event; all event-specific pages work on the selected event.
- Events can be created, edited, copied (as a template for the next edition) and archived. Archived events are read-only.
- Admin accounts, the member list (see 4.3) and organizer settings (see 4.4) are global, not per event.

### 1.4 Languages
- The application is bilingual: **German (default)** and **English**. See 5.3 for details.

---

## 2. Attendee Management (Admin App)

### 2.1 Attendee Attributes (Roles & Status)
- Each attendee can be assigned one or more roles from the following list:
  - Attendee
  - Speaker
  - Organizer (orga)
  - Sponsor
- Every attendee must have at least one role.
- Each registration has a status:
  - `Reserved` – a seat is held while online payment is pending (expires automatically, see 3.1),
  - `Confirmed` – the registration is valid,
  - `Waitlisted` – the event was full at the time of registration,
  - `Cancelled` – cancelled by the attendee or an admin; the record is kept.
- Independently, each registration has a payment status: `Open`, `Paid`, `Partially refunded`, `Refunded`, or `Not required` (free tickets), and a payment method: `Stripe`, `Invoice`, or `Free`.

### 2.2 Manual Attendee Creation & Editing
- A feature for event managers to manually add new attendees.
- The creation form includes fields for `Full Name` and `Email Address`.
- The form allows assigning one or more roles to the new attendee.
- An optional checkbox to "Create and send invoice" upon adding an attendee.
- Existing attendees can be edited to change their name, email, roles, and status.
- Attendees on the waitlist can be confirmed by an admin.

### 2.3 Attendee List Interaction
- **Sorting:** The attendee list is sortable by clicking on the `Name` and `Registered` column headers.
- **Filtering:**
  - A primary filter control allows filtering by roles and status.
  - Users can select one or more roles/statuses. Attendees must have *all* selected roles and *one of* the selected statuses to be displayed.
  - Clicking a `role` or `status` badge in the table filters the list by that item.
  - Holding `Ctrl` (or `Cmd`) while clicking badges allows for multi-selection.
- **Filter Indicators:**
  - A visual indicator shows when filters are active.
  - A "Clear" button appears to remove all active filters with one click.
- **Data Count:** A summary at the bottom of the list shows the number of visible attendees versus the total (e.g., "Showing 15 of 100 attendees").
- **Cancel:** Registrations can be cancelled via a confirmation dialog. Cancelling sets the status to `Cancelled` and never deletes the record; refunds follow 3.3. Personal data is only deleted through the data protection functions (section 7).

### 2.4 Attendee List Export
- The attendee list can be exported to an Excel file (`.xlsx`).
- The exported file contains the data from the currently visible (filtered) attendee list.

---

## 3. Public Attendee Registration & Management

### 3.1 Public Registration
- A public-facing form for attendees to register themselves.
- The form will include fields for all necessary master data (first name, last name, e-mail; optional company and billing address) and is available in German and English.
- **Ticket price:** There is no free choice of the price. An attendee who enters a member number receives the member price only if the member number matches an entry of the member list (see 4.3) together with the attendee's last name (case-insensitive). Otherwise the normal price applies and the attendee is informed. Price and eligibility are determined exclusively on the server.
- **Payment method:** Depending on the event settings the attendee chooses between
  - **Online payment via Stripe:** the registration is created as `Reserved`, the attendee is redirected to Stripe Checkout; it becomes `Confirmed` only after Stripe confirms the payment (webhook). If the checkout is not completed within its validity period, the reservation expires and the seat is released.
  - **Invoice:** requires company name and billing address. The registration is `Confirmed` immediately with payment status `Open`; an invoice with a due date is issued and sent by e-mail. Admins mark incoming payments as paid; reminders are sent after the due date.
- **Capacity:** Each event has a maximum number of attendees. `Reserved` and `Confirmed` registrations count towards the capacity. When the event is full, new registrations are put on the waitlist (`Waitlisted`) without payment.
- **Waitlist:** When a seat becomes free, the first person on the waitlist is offered the seat by e-mail with a payment link that is valid for 48 hours; if it is not used, the next person is offered the seat. Admins can also move people from the waitlist manually.
- Duplicate registrations (same e-mail, same event, not cancelled) are rejected with a helpful message.
- After submitting, the attendee sees a confirmation page and receives a confirmation e-mail in their language. The attendee never sees data of other attendees.

### 3.2 Attendee Self-Service Portal
- A secure area for registered attendees to manage their own registration.
- After logging in, attendees can:
  - View their registration details.
  - Edit their own master data.
  - Cancel their registration (subject to event policies).
- Login is passwordless via a one-time link sent by e-mail (magic link).

### 3.3 Cancellation & Refunds
- Each event defines a cancellation policy as a list of deadlines with refund percentages (e.g. up to 30 days before the event: 100 %, afterwards: 0 %).
- When a paid registration is cancelled, the system calculates the refund amount according to the policy.
- Each event defines the refund mode:
  - **Automatic:** refunds for Stripe payments are executed immediately via Stripe.
  - **With approval:** the calculated refund is created as a proposal; an admin confirms, changes the amount or rejects it.
- Admins can always trigger a manual refund with any amount up to the amount paid, with a mandatory reason.
- Refunds for invoice payments (bank transfer) are recorded manually by an admin after the transfer.
- Every refund produces a credit note (see 4.4) and an e-mail to the attendee. Refunds made directly in the Stripe dashboard are synchronised via webhook.

---

## 4. Event Management (Admin App)

### 4.1 Event Details
- A dedicated "Event" page to manage core event information.
- Users can view and edit the following event details:
  - Event Name
  - Event Date
  - Location
  - Event slug, start and end date, registration period (from/until)
  - Capacity (maximum number of attendees)
  - Allowed payment methods (Stripe, invoice) and payment term for invoices
  - Cancellation policy and refund mode (see 3.3)
  - Terms of Service for this event (versioned)
  - Descriptive texts in German and English
- The page supports an "edit mode" to make fields editable and save the changes.

### 4.2 Pricing
- The "Event" page includes a section for setting ticket prices.
- Two pricing tiers can be configured:
  - Normal Price
  - Member Price
- The currency used for pricing is Euro (€).
- Prices are entered and stored as the gross amount the attendee pays (in cents). Net and VAT amounts are derived from the VAT settings (see 4.4).
- A price of 0 is allowed (free ticket, no payment step).

### 4.3 Member List
- Admins upload the member list as CSV or XLSX in the admin area. Required columns: member number, last name; optional: first name, e-mail, valid until.
- Before import, a preview shows the number of rows, detected errors (missing values, duplicate member numbers) and the differences to the current list.
- An upload replaces the entire list. Each import is recorded (date, admin, file name, number of rows) in the audit log.
- Member verification during registration uses only this list (see 3.1). If a membership has a `valid until` date, it must be valid on the registration date.
- For development and testing, dummy members are provided by the demo data script.

### 4.4 Invoicing & VAT
- Organizer data used on invoices (name, address, VAT ID if applicable, bank details, contact) is maintained globally in the admin settings.
- **VAT mode:** The organizer is currently a small business (*Kleinunternehmer*). Invoices therefore show no VAT and contain the note „Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung“.
- The system is prepared for regular VAT: a global VAT mode (`small business` / `standard`) and a VAT rate per price item (tickets, sponsor packages). Every invoice always stores net amount, VAT rate, VAT amount and gross amount. Changing the VAT mode only affects invoices issued afterwards.
- Invoices have a consecutive number per calendar year (e.g. `2026-0001`), assigned on the server without gaps, and contain all mandatory information according to § 11 UStG.
- Cancellations and refunds produce a credit note that references the original invoice; invoices are never changed or deleted after issue.
- Invoices are generated as PDF in the attendee's language and can be sent by e-mail and downloaded in the admin area and the self-service portal.
- A yearly revenue overview helps to monitor the small business threshold.

---

## 5. UI/UX Specification

This section details the design system, components, and color palette.

### 5.1 UI Framework
- **Component Library**: **ShadCN UI**. This is not a traditional library but a collection of re-usable components that are copied into the project, allowing for full customization. Core components like `Card`, `Button`, `Table`, `Badge`, and `Dialog` are used extensively.
- **Styling**: **Tailwind CSS v4**. A utility-first CSS framework is used for all styling.
- **Icons**: **Lucide React**. A clean and consistent icon set.

### 5.2 Color Scheme

The application uses a theming system based on CSS variables. The colors are defined in HSL and then mapped to Hex codes for reference. This allows for easy theme changes (e.g., for a dark mode).

#### **Light Theme Palette**

| Name | HSL Value | Hex Code | Description |
| :--- | :--- | :--- | :--- |
| `background` | `210 40% 98%` | `#F8FAFC` | The main background color for pages. |
| `foreground` | `222.2 84% 4.9%`| `#08091C` | The default text color. |
| `card` | `210 40% 100%` | `#FFFFFF` | Background color for card components. |
| `primary` | `262 52% 47%` | `#5839C3` | The primary accent color for buttons and links. |
| `primary-foreground`| `210 40% 98%` | `#F8FAFC` | Text color used on primary backgrounds. |
| `secondary` | `210 17% 95%` | `#EEF1F6` | Background for secondary elements (e.g., badges).|
| `muted` | `210 17% 95%` | `#EEF1F6` | Background for muted elements. |
| `muted-foreground` | `215.4 16.3% 46.9%` | `#667085` | Text color for muted or secondary text. |
| `accent` | `231 99% 62%` | `#4F46E5` | An alternative accent color (e.g., for charts). |
| `destructive` | `0 84.2% 60.2%` | `#F04438` | Color for destructive actions (e.g., delete). |
| `border` | `214.3 31.8% 91.4%`| `#E4E7EB` | Color for borders and dividers. |
| `input` | `214.3 31.8% 91.4%`| `#E4E7EB` | Background for input fields. |
| `ring` | `262 52% 47%` | `#5839C3` | Color for focus rings on interactive elements. |

### 5.3 Internationalization
- All user interfaces (public pages, self-service portal, admin area), e-mails and PDF documents (invoices, credit notes, schedule print) are available in **German (default)** and **English**.
- Public and portal URLs carry the language (e.g. `/de/...`, `/en/...`); the language can be switched on every page. Without a language in the URL, German is used.
- The language chosen at registration is stored with the person and used for all later e-mails and documents.
- Dates, times, numbers and currency amounts are formatted according to the selected language (time zone Europe/Vienna).
- Content entered by admins that is shown publicly (event name and description, session titles, sponsor package names and benefits, terms of service, privacy notice) can be maintained in both languages; German is mandatory, English falls back to German if missing.

---

## 6. Backend & Data Requirements

### 6.1 Data Persistence
- All attendee registrations and related data must be securely stored in a database.

### 6.2 Audit Logging
- A logging functionality needs to be implemented to track user actions.
- The system must record which event manager performed what action and when (e.g., "User 'admin@event.com' updated attendee 'John Doe' on YYYY-MM-DD HH:MM:SS").
- A dedicated view in the admin app should display this log file.
- The log view must be filterable and searchable to allow for easy auditing.

### 6.3 Payments
- The system must integrate with **Stripe** (Checkout, refunds, webhooks) for online payments and support payment by **invoice** (see 3.1, 3.3, 4.4).

---

## 7. Data Protection (GDPR / DSGVO)

The application processes personal data of attendees, speakers and sponsor contacts. It must comply with the EU General Data Protection Regulation (GDPR, German: DSGVO) and the Austrian Data Protection Act (DSG). The event organizer is the controller; all technical requirements below must be met before real personal data is processed.

### 7.1 Transparency & Privacy Notice (Art. 13)
- A privacy notice (Datenschutzerklärung) must be linked on the public registration page, in the self-service portal and in every system e-mail.
- It must state at least: controller and contact, purposes and legal bases (contract fulfilment for registration and invoicing, legal obligation for tax records, consent where applicable), recipients and processors (hosting, payment provider, e-mail provider), retention periods, data subject rights and the right to lodge a complaint with the Austrian Data Protection Authority (Datenschutzbehörde).
- The privacy notice is versioned; the version shown at registration is recorded.

### 7.2 Data Minimisation
- The registration form collects only data required for registration, payment and invoicing. Optional fields are clearly marked as optional.
- The member number is used only to verify eligibility for the member price against the member list (4.3).
- No tracking or analytics tools are used without prior consent. Only technically necessary cookies (e.g. the session cookie) are set, so no cookie banner is required.

### 7.3 Consent & Acceptance Records (Art. 7)
- For each registration the system stores: accepted Terms of Service version, privacy notice version, timestamp and channel (public form / admin entry).
- Consent that is not required for the contract is obtained separately and is never bundled into the Terms of Service, in particular:
  - consent to photography/video recording being used for promotional purposes,
  - consent to receive newsletters or marketing e-mails.
- Each consent is opt-in (unchecked by default), individually revocable, and its grant and revocation are logged with timestamp.

### 7.4 Data Subject Rights (Art. 15–21)
- **Access & portability:** Admins can generate a complete export of all personal data held about a person (attendee records, speaker records, sponsor contacts, consent records, invoices, audit log entries referring to the person) in a machine-readable format (JSON and XLSX). Dates are exported as readable ISO dates.
- **Rectification:** Attendees can correct their own master data in the self-service portal; admins can correct all records.
- **Erasure:** Admins can erase or anonymise a person's data across all entities. Data subject to statutory retention (see 7.5) is not deleted but restricted (excluded from all lists, exports and e-mails) until the retention period ends.
- Person matching is by e-mail address, case-insensitive and whitespace-trimmed.
- Every data subject request (type, date received, date completed, admin) is recorded. Requests must be completed within one month.

### 7.5 Retention & Deletion
- **Invoice and payment records** (name, billing address, invoice number, amounts, payment status) are retained for 7 years from the end of the calendar year, as required by § 132 BAO, and are then deleted.
- **All other attendee data** (e-mail, company, PMI number, roles, consent records) is deleted or anonymised no later than 6 months after the event, unless the person has consented to longer storage.
- **Cancelled and waitlisted registrations** without payment are deleted 30 days after the event.
- **Audit log entries** are kept for 2 years.
- **Member list:** each upload replaces the previous list completely; the previous version is not kept. The list contains only the fields needed for verification.
- **Backups** follow a rotation that ensures deleted data disappears from backups within 90 days.
- Deletion runs automatically (scheduled job); each run is logged with the number of affected records.

### 7.6 Security of Processing (Art. 32)
- The admin area requires authentication. Admin passwords must meet minimum strength requirements; two-factor authentication is supported.
- Access is role-based: public users may only create their own registration; attendees may only read and edit their own record; only admins may access lists, exports and other people's data.
- All authorisation checks are enforced on the server; the client is never trusted for prices, status or permissions.
- All traffic uses HTTPS. Database files and backups are stored encrypted at rest or on encrypted volumes.
- All user-supplied content is escaped when rendered, including print views and generated documents.
- Personal data never appears in URLs, query strings or application logs.
- Exports containing personal data (XLSX, invoices) may only be created by admins and each export is recorded in the audit log.

### 7.7 Accountability & Processors (Art. 28, 30, 33)
- A record of processing activities (Verzeichnis von Verarbeitungstätigkeiten) is maintained for the application.
- Data processing agreements (Auftragsverarbeitungsverträge) are in place with every processor (hosting, e-mail provider, payment provider where applicable).
- Personal data is hosted within the EU/EEA. Any transfer to a third country is documented with its legal basis.
- A documented procedure exists for personal data breaches, including notification of the Datenschutzbehörde within 72 hours where required.

---

## 8. Future & Deferred Requirements

### 8.1 Speaker Document Storage (Deferred)
- **Description:** A feature for speakers to upload presentation files (e.g., PDF, PPTX) and for admins to manage and download these files. This includes version control for uploaded documents.
- **Status:** **Deferred**.
- **Reason:** To avoid incurring cloud storage and data transfer costs during the initial development and rollout phase. The functionality will be re-evaluated for a future version once usage patterns and cost implications can be better estimated.

### 8.2 Role Administration
- A dedicated administration area for managing attendee roles.
- This area would allow for creating, editing, and deleting the available roles (e.g., "Attendee", "Speaker").
