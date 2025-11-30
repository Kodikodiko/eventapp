# Firebase Hosting Cost Analysis for EventFlow

This document provides a cost estimation for hosting the EventFlow application on Firebase, based on the expected usage patterns.

## User's Estimated Usage

*   **Admin Users:** ~3 event managers.
*   **End-Users:** ~300 attendees.
*   **Monthly Access:** 
    *   ~300 admin sessions per month.
    *   ~500 attendee sessions per month (for the future self-service portal).
*   **Data Storage:** Low. No large images or documents are expected.

## Can we use the Firebase Spark Plan (Free Tier)?

**Conclusion: Yes, absolutely.**

Based on your estimated usage, the Firebase Spark Plan will be more than sufficient for your needs. You are unlikely to incur any costs from Firebase for the foreseeable future.

Here is a breakdown of the relevant Firebase services and how your usage maps to the free tier limits.

---

### 1. Cloud Firestore (Database)

This is where your attendee data, event details, and logs will be stored. It's often the main source of cost in a Firebase project, but your usage is very low.

*   **Stored Data:**
    *   **Spark Plan Limit:** 1 GiB free.
    *   **Your Usage:** With ~300 attendees and some logs, your data will likely be a few megabytes (MB) at most. This is less than 1% of the free limit.
    *   **Verdict:** Covered by the free tier.

*   **Document Reads/Writes:**
    *   **Spark Plan Limits:** 50,000 reads/day and 20,000 writes/day.
    *   **Your Usage:**
        *   **Admin Activity:** Even with 300 admin sessions a month, where each session involves viewing a list of 20 attendees (a read) and updating 5 of them (a write), you'd only be at a few hundred reads/writes per day.
        *   **Attendee Activity:** 300 registrations in a month averages to 10 writes per day. 500 self-service portal views would add a few hundred more reads per month.
        *   **Total:** Your daily usage will be far below the 50,000 reads and 20,000 writes limit.
    *   **Verdict:** Covered by the free tier.

---

### 2. Firebase Authentication

This service will manage logins for your ~3 admins and, in the future, your ~300 attendees.

*   **Spark Plan Limit:** 10,000 Monthly Active Users (MAUs) free.
*   **Your Usage:** You expect ~303 total users (3 admins + 300 attendees).
*   **Verdict:** Your user count is well under the 10,000 MAU limit. Covered by the free tier.

---

### 3. Firebase App Hosting (for your Next.js app)

Firebase App Hosting runs your Next.js application on a serverless platform.

*   **Spark Plan Limits:** You get a generous free quota of CPU time, data transfer, and server instances.
*   **Your Usage:** With ~800 total sessions per month, your traffic is considered low and will not come close to exceeding the free compute and data transfer limits.
*   **Verdict:** Covered by the free tier.

---

### 4. Stripe (Payment Processing)

**This is the only area where you will have direct costs.**

*   **Pricing Model:** Stripe is not part of Firebase and has its own pricing. They typically charge a percentage of the transaction amount plus a small fixed fee for each successful payment.
*   **Example:** If your ticket price is €100 and Stripe's fee is 2.9% + €0.30, you would pay €3.20 to Stripe for that transaction.
*   **Verdict:** This is an operational cost related to your revenue, not a hosting cost from Firebase. These fees are standard for any payment processor.

---

## Summary

The Firebase Spark plan is designed for projects exactly like yours. You can build, deploy, and run your application for your first several events without worrying about incurring any Firebase costs. You will only start paying if your application's usage grows exponentially—by a factor of more than 100x your current estimate.
