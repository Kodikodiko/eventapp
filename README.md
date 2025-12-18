# EventFlow Application: Architecture Overview

This document provides a detailed overview of the EventFlow application's architecture, technology stack, and operational cost analysis. It is intended for both technical and non-technical stakeholders.

---

### **Executive Summary (High-Level)**

EventFlow is a modern, serverless web application designed for efficient event management. It is built on a foundation of best-in-class, production-ready technologies to ensure it is fast, secure, and scalable. The frontend is a rich client-side application that provides a seamless, desktop-like experience for event managers. The backend leverages Google's Firebase platform, allowing us to manage data and users without the complexity of traditional server infrastructure. This serverless approach is not only highly reliable but also extremely cost-effective.

---

### **Cost Analysis (High-Level)**

Based on the projected usage of approximately 3 admin users and 300 attendees, the application is expected to run entirely within the **Firebase Spark Plan (Free Tier)**. 

This means **there will be no recurring hosting or backend infrastructure costs.** 

The only direct costs will be standard transaction fees from Stripe for payment processing, which is an operational cost tied to revenue, not a hosting cost. A detailed breakdown is available in the `COST_ANALYSIS.md` document.

---

### **Detailed Technical Architecture**

This section breaks down the application into its core components for a technical audience.

#### **1. Hosting & Deployment**

*   **Platform**: The application is configured for **Firebase App Hosting**. This is a managed, serverless platform specifically designed for hosting modern web applications.
*   **Deployment**: Firebase App Hosting automatically builds the Next.js application and deploys it to a global Content Delivery Network (CDN). This ensures fast load times for users anywhere in the world. The `apphosting.yaml` file configures this environment.
*   **Scalability**: The platform automatically scales resources in response to traffic. We've configured it with a starting point of one instance, which can be increased if the event's popularity grows significantly.

#### **2. Frontend Architecture**

The frontend is the interactive user interface for event managers. It's built as a Single-Page Application (SPA) for a fluid and responsive user experience.

*   **Framework**: **Next.js 15 (App Router)** with **React 18**. This is the industry-standard framework for building high-performance React applications. We use the App Router, which leverages React Server Components for optimized rendering, reducing the amount of JavaScript sent to the client and improving initial page load times.
*   **Language**: **TypeScript**. We use TypeScript throughout the project. This adds static typing to JavaScript, which helps catch errors during development, improves code quality, and makes the codebase easier to understand and maintain.
*   **UI Components**: **ShadCN UI** and **Tailwind CSS**. We use ShadCN UI, a collection of beautifully designed and accessible components (like tables, buttons, and forms) that are built on top of Tailwind CSS. This allows for rapid development of a polished, professional UI while maintaining full control over styling.

    *   **Example (A ShadCN Card component from `src/app/(app)/dashboard/page.tsx`):**
        ```tsx
        import {
          Card,
          CardContent,
          CardHeader,
          CardTitle,
        } from '@/components/ui/card';
        import { DollarSign } from 'lucide-react';

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$45,231.89</div>
          </CardContent>
        </Card>
        ```

#### **3. Backend & Data Layer**

The application uses a "Backend-as-a-Service" (BaaS) model provided by **Google Firebase**. This means we do not manage any servers directly.

*   **Database**: **Cloud Firestore**. This is a highly scalable, real-time NoSQL document database. All application data (attendees, sponsors, speakers, etc.) is stored in Firestore.
    *   **Data Interaction**: A key architectural decision is that **all database operations occur directly on the client-side**. The Next.js application communicates securely with Firestore using the Firebase client-side SDK. This simplifies development and leverages Firestore's powerful real-time capabilities.
    *   **Real-time Updates**: We use real-time listeners to fetch data. When data changes in the database (e.g., a new attendee registers), the UI updates automatically without needing a page refresh. This is achieved with custom hooks like `useCollection`.

        *   **Example (Fetching attendees in `src/app/(app)/attendees/page.tsx`):**
            ```tsx
            import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
            import { collection } from 'firebase/firestore';

            // ...inside the component...
            const firestore = useFirestore();
            const attendeesCol = useMemoFirebase(() =>
              firestore ? collection(firestore, `events/${EVENT_ID}/attendees`) : null,
              [firestore]
            );
            const { data: attendees, isLoading } = useCollection<Attendee>(attendeesCol);
            // The 'attendees' variable will always contain the latest data from Firestore.
            ```

*   **Authentication**: **Firebase Authentication**. This service handles user identity. It securely manages user sign-in and sign-out. It supports anonymous access and can be easily extended to support email/password, Google, and other login providers.
*   **Security**: Security is enforced by **Firestore Security Rules**. These are rules deployed to Firebase that define who can read, write, or update data. For instance, we can specify that only an authenticated admin user can edit event details.

    *   **Example (Simplified rule from `firestore.rules`):**
        ```rules
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            // Only allow signed-in users to read or write to event data
            match /events/{eventId}/{document=**} {
              allow read, write: if request.auth != null;
            }
          }
        }
        ```

#### **4. Data Modeling**

We define clear data structures using TypeScript to ensure consistency across the application.

*   **Example (The `Attendee` data model from `src/lib/data.ts`):**
    ```ts
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
      eventId: string;
      price?: number;
      company?: string;
      pmiNumber?: string;
    };
    ```
