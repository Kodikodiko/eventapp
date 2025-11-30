# Event Management Application Specification

This document outlines the features and requirements for the EventFlow application.

## 1. Attendee Management

### 1.1 Attendee Attributes (Roles & Status)
- Each attendee can be assigned one or more roles from the following list:
  - Attendee
  - Speaker
  - Organizer (orga)
  - Sponsor
- Every attendee must have at least one role.
- Each attendee has a status: `Confirmed`, `Waitlisted`, or `Cancelled`.

### 1.2 Manual Attendee Creation & Editing
- A feature to manually add new attendees to the event.
- The creation form includes fields for `Full Name` and `Email Address`.
- The form allows assigning one or more roles to the new attendee.
- There is an optional checkbox to "Create and send invoice" upon adding an attendee.
- Existing attendees can be edited to change their name, email, roles, and status.
- Attendees on the waitlist can be confirmed.

### 1.3 Attendee List Interaction
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

### 1.4 Attendee List Export
- The attendee list can be exported to an Excel file (`.xlsx`).
- The exported file contains the data from the currently visible (filtered) attendee list.

## 2. Event Management

### 2.1 Event Details
- A dedicated "Event" page to manage core event information.
- Users can view and edit the following event details:
  - Event Name
  - Event Date
  - Location
- The page supports an "edit mode" to make fields editable and save the changes.

### 2.2 Pricing
- The "Event" page includes a section for setting ticket prices.
- Two pricing tiers can be configured:
  - Normal Price
  - Member Price
- The currency used for pricing is Euro (€).

## 3. Future Requirements (To Be Implemented)

### 3.1 Role Administration
- A dedicated administration area for managing attendee roles.
- This area would allow for creating, editing, and deleting the available roles (e.g., "Attendee", "Speaker").
