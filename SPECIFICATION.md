# Event Management Application Specification

This document outlines the features and requirements for the EventFlow application.

## 1. Application Architecture & Context

### 1.1 Core Components
The EventFlow ecosystem consists of two primary components:
1.  **Event Admin App (This Application):** A secure web application for ~5 event managers to administrate the event.
2.  **Public Event Site:** A separate, decoupled website that end-users visit to learn about the event.

### 1.2 Registration Flow
- When a user clicks "Register" on the Public Event Site, they will be directed to a public registration page within this application.
- This page will allow new attendees to register for the event.

---

## 2. Attendee Management (Admin App)

### 2.1 Attendee Attributes (Roles & Status)
- Each attendee can be assigned one or more roles from the following list:
  - Attendee
  - Speaker
  - Organizer (orga)
  - Sponsor
- Every attendee must have at least one role.
- Each attendee has a status: `Confirmed`, `Waitlisted`, or `Cancelled`.

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
- **Unregister:** Attendees can be unregistered from the event via a confirmation dialog.

### 2.4 Attendee List Export
- The attendee list can be exported to an Excel file (`.xlsx`).
- The exported file contains the data from the currently visible (filtered) attendee list.

---

## 3. Public Attendee Registration & Management

### 3.1 Public Registration
- A public-facing form for attendees to register themselves.
- The form will include fields for all necessary master data (e.g., Full Name, Email).
- Attendees can select their ticket price (e.g., Normal, Member).
- The registration process integrates with **Stripe** to handle the payment process.

### 3.2 Attendee Self-Service Portal
- A secure area for registered attendees to manage their own registration.
- After logging in, attendees can:
  - View their registration details.
  - Edit their own master data.
  - Cancel their registration (subject to event policies).

---

## 4. Event Management (Admin App)

### 4.1 Event Details
- A dedicated "Event" page to manage core event information.
- Users can view and edit the following event details:
  - Event Name
  - Event Date
  - Location
- The page supports an "edit mode" to make fields editable and save the changes.

### 4.2 Pricing
- The "Event" page includes a section for setting ticket prices.
- Two pricing tiers can be configured:
  - Normal Price
  - Member Price
- The currency used for pricing is Euro (€).

---

## 5. UI/UX Specification

This section details the design system, components, and color palette.

### 5.1 UI Framework
- **Component Library**: **ShadCN UI**. This is not a traditional library but a collection of re-usable components that are copied into the project, allowing for full customization. Core components like `Card`, `Button`, `Table`, `Badge`, and `Dialog` are used extensively.
- **Styling**: **Tailwind CSS**. A utility-first CSS framework is used for all styling.
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
- The system must integrate with **Stripe** for processing payments during public registration.

---

## 7. Future & Deferred Requirements

### 7.1 Speaker Document Storage (Deferred)
- **Description:** A feature for speakers to upload presentation files (e.g., PDF, PPTX) and for admins to manage and download these files. This includes version control for uploaded documents.
- **Status:** **Deferred**.
- **Reason:** To avoid incurring cloud storage and data transfer costs during the initial development and rollout phase. The functionality will be re-evaluated for a future version once usage patterns and cost implications can be better estimated.

### 7.2 Role Administration
- A dedicated administration area for managing attendee roles.
- This area would allow for creating, editing, and deleting the available roles (e.g., "Attendee", "Speaker").
