# GOSSA (Garage Operations and Service Administration) - PRD Overview

## 1. Project Vision & Context
GOSSA is a specialized Software as a Service (SaaS) platform designed to digitize and bring operational transparency to local auto repair garages operating under the "bay/chair rental" and independent mechanic model (specifically validated in Machakos County, Kenya). 

Traditional local garages operate with severe operational friction: mechanics are independent contractors who pay a monthly rent/stipend to a facility manager, vehicles enter unrecorded, junior mechanics are frequently underpaid or ghosted by lead mechanics, and customers are left completely in the dark until final pickup. GOSSA bridges these gaps by enforcing digital intake, transparent job delegation, protected junior earnings, and real-time customer communication.

## 2. Tech Stack Blueprint for Coding Agents
* **Frontend:** React / Next.js with Tailwind CSS (Mobile-first Progressive Web App layout for responsiveness across Android/iOS devices used by mechanics).
* **Backend:** Node.js with Express.js REST API architecture.
* **Database & Auth:** Supabase (PostgreSQL) utilizing Row Level Security (RLS) and real-time Supabase subscriptions.
* **Notifications Gateway:** SMS/WhatsApp integration (e.g., Africa's Talking / Twilio) for customer tracking links and digital receipts.

## 3. Stakeholder Personas & Permissions

### A. Garage Owner (Property / Landlord)
* **Role & Responsibility:** Owns the physical premises, collects monthly rent from the Garage Manager, and ensures facility compliance.
* **System Permissions:** High-level read-only analytics, occupancy trends, and manager rent payment logs.

### B. Garage Manager (Facility Admin)
* **Role & Responsibility:** Runs facility operations, manages bay allocations, handles vehicle check-ins at reception, and collects monthly stipends/rent from mechanics.
* **System Permissions:** Create/onboard users, register vehicles and create initial Job Cards, assign Lead Mechanics to bays, track mechanic rent ledgers.

### C. Lead Mechanic (Technical Lead & Job Owner)
* **Role & Responsibility:** Takes control of assigned vehicles, performs physical diagnostics, sources spare parts, assigns tasks to Junior Mechanics, and calculates final customer estimates.
* **System Permissions:** Update job diagnostics, create task items, assign junior mechanics and cut amounts, generate invoices.

### D. Junior Mechanic (Apprentice / Assistant)
* **Role & Responsibility:** Assists Lead Mechanics with hands-on repairs, pays lower monthly rent to the manager, and earns a negotiated cut per task.
* **System Permissions:** View assigned tasks, update task status (In Progress / Completed), view personal earnings wallet and rent status.

### E. Customer (Vehicle Owner)
* **Role & Responsibility:** Drops off vehicle, approves estimates, and makes final payments.
* **System Permissions:** Access secure web-link via SMS/WhatsApp to view real-time status, approve estimates, and receive digital receipts.