# EventFlow Application: Architecture Overview

This document provides a detailed overview of the EventFlow application's architecture, technology stack, and operational cost analysis. It is intended for both technical and non-technical stakeholders.

---

### **Executive Summary (High-Level)**

EventFlow is a modern, serverless web application designed for efficient event management. It is built on a foundation of best-in-class, production-ready technologies to ensure it is fast, secure, and scalable. The frontend is a rich client-side application that provides a seamless, desktop-like experience for event managers. The backend leverages Google's Firebase platform, allowing us to manage data and users without the complexity of traditional server infrastructure. This serverless approach is not only highly reliable but also extremely cost-effective.

---

### **Git Workflow: Pushing to GitHub**

Because this project lives on your local machine, all Git commands must be run from your computer's **Terminal** (not from within the Firebase Studio website).

#### **1. How to find your Terminal:**
*   **Windows:** Press the **Windows Key**, type `cmd` or `PowerShell`, and hit Enter.
*   **macOS:** Press **Cmd + Space**, type `Terminal`, and hit Enter.
*   **Linux:** Press **Ctrl + Alt + T**.

#### **2. How to push changes:**
Once your terminal is open, navigate to your project folder (e.g., `cd Documents/eventapp`) and run:

```bash
# Stage the changes I made for you
git add .

# Save the changes with a message
git commit -m "Update from Firebase Studio"

# Send the changes to GitHub
git push origin main
```

---

### **Cost Analysis (High-Level)**

Based on the projected usage of approximately 3 admin users and 300 attendees, the application is expected to run entirely within the **Firebase Spark Plan (Free Tier)**. 

This means **there will be no recurring hosting or backend infrastructure costs.** 

The only direct costs will be standard transaction fees from Stripe for payment processing, which is an operational cost tied to revenue, not a hosting cost. A detailed breakdown is available in the `COST_ANALYSIS.md` document.

---

### **Source Code Management**

The source code for this application is managed using Git and is hosted on GitHub.

*   **Repository URL:** [https://github.com/Kodikodiko/eventapp](https://github.com/Kodikodiko/eventapp)

---

### **Data Storage & Persistence**

The application uses three primary methods for storing information:

#### **1. Cloud Firestore (Primary Database)**
The core of the application's data resides in **Google Cloud Firestore**, a highly scalable NoSQL document database.
*   **Persistent Entities**: Attendees, Sponsors, Sponsorship Packages, Speakers, and the Event Schedule.
*   **Security**: Data access is governed by **Firestore Security Rules**, ensuring that only authorized users can read or write specific information.
*   **Real-time**: The UI updates instantly when data changes in Firestore, providing a live collaborative experience for event managers.

#### **2. Firebase Authentication**
User identity and login credentials are managed by **Firebase Authentication**.
*   **Security**: Passwords are encrypted and managed by Google's secure infrastructure.
*   **Access Control**: Used to verify administrators before allowing access to the event management tools.

#### **3. Browser LocalStorage (Local Configuration)**
Certain configuration settings are currently stored in the user's browser.
*   **Entities**: Core Event Details (Name, Date, Location, Terms of Service).
*   *Note: In future versions, these settings may be migrated to Firestore for shared access across multiple admin accounts.*

---

### **Detailed Technical Architecture**

This section breaks down the application into its core components for a technical audience.

#### **1. Hosting & Deployment**

*   **Platform**: The application is configured for **Firebase App Hosting**. This is a managed, serverless platform specifically designed for hosting modern web applications.
*   **Deployment**: Firebase App Hosting automatically builds the Next.js application and deploys it to a global Content Delivery Network (CDN).
*   **Scalability**: The platform automatically scales resources in response to traffic.

#### **2. Frontend Architecture**

The frontend is built as a Single-Page Application (SPA) for a fluid and responsive user experience.

*   **Framework**: **Next.js 15 (App Router)** with **React 18**.
*   **Language**: **TypeScript**.
*   **UI Components**: **ShadCN UI** and **Tailwind CSS**.
*   **Icons**: **Lucide React**.

#### **3. Backend & Data Layer**

*   **Data Interaction**: All database operations occur directly on the client-side using the Firebase client-side SDK.
*   **Logic**: Complex logic like GDPR data anonymization or Excel exports is handled within the React application, leveraging client-side libraries like `xlsx`.

---

### **Frontend Deep Dive & Customization**

For details on how to customize the UI or change colors, please refer to the **UI/UX Specification** section in `SPECIFICATION.md`.
