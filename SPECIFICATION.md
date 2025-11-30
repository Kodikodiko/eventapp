# Event Management Application Specification

This document outlines the features and requirements for the EventFlow application.

## 1. Attendee Management

### 1.1 Attendee Attributes (Roles)
- Each attendee can be assigned one or more roles from the following list:
  - Attendee
  - Speaker
  - Organizer
  - Sponsor
- Every attendee must have at least one role.

### 1.2 Manual Attendee Creation
- A feature to manually add new attendees to the event.
- The creation form includes fields for master data like `Full Name` and `Email Address`.
- The form allows assigning one or more roles to the new attendee.
- There is an optional checkbox to "Create and send invoice" upon adding the attendee.

### 1.3 Attendee List Filtering
- The main attendee list can be filtered based on roles.
- Users can select one or more roles to display only the attendees who have *all* of the selected roles.

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
