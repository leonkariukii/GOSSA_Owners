# GOSSA - Business Workflows & State Machine

## 1. Complete Vehicle Service Lifecycle
[ Vehicle Arrival ]
│
▼ (Garage Manager Check-In)
[ Job Card Created (Status: Checked-In) ]
│
▼ (Manager Assigns Bay & Lead Mechanic)
[ Lead Mechanic Diagnosis & Task Assignment ]
│
▼ (Lead Sets Parts, Labor & Junior Cuts)
[ Customer Estimate Approval (SMS/WhatsApp Link) ]
│
▼ (Repair Execution by Lead & Junior Mechanics)
[ Work Completion & Verification ]
│
▼ (Invoice Generation & Payment)
[ Job Closed & Digital Receipt Issued ]


## 2. Detailed Workflow Stages

### Stage 1: Central Reception & Intake (Garage Manager)
1. Customer arrives at the garage.
2. **Garage Manager** creates a Job Card logging:
   * Vehicle Registration Plate (Unique constraint: cannot have two open active jobs simultaneously).
   * Customer Name & Phone Number.
   * Intake Mileage and Fuel Level Percentage (mandatory safety validation).
   * Customer initial complaint and assigned Bay Number.
3. System triggers an automated SMS to the customer confirming intake and providing a secure live-tracking link.

### Stage 2: Diagnosis & Task Delegation (Lead Mechanic)
1. Assigned **Lead Mechanic** receives notification, inspects vehicle, and logs diagnostic notes (tap-to-select fault categories + voice/photo upload).
2. Lead Mechanic adds line items:
   * **Parts:** Description and procurement cost with automatic markup.
   * **Labor Tasks:** Description and customer price.
3. Lead Mechanic assigns 1-3 **Junior Mechanics** to specific sub-tasks and defines their **Junior Cut Amount** (fixed or percentage).

### Stage 3: Junior Mechanic Protection & Work Verification
* **Rule Enforcement:** GOSSA validates that $\text{Junior Cut Amount} \le \text{Customer Labor Price}$ for any given task.
* Junior Mechanics view assigned tasks on their mobile dashboard, execute repairs, and update status (`In Progress` $\rightarrow$ `Completed`) with optional photo proof.
* Upon payment, the cut amount is automatically credited to the Junior Mechanic's personal earnings ledger.

### Stage 4: Customer Engagement & Estimate Approval
* Customer receives an itemized digital estimate web-view showing spare parts, labor breakdown, and optional photo proof of worn parts.
* Customer taps **[ Approve Estimate ]** to authorize work to begin. No work starts without explicit digital approval, eliminating surprise bills.

### Stage 5: Invoicing, Payment & Job Closure
* Once repairs pass final inspection, GOSSA auto-aggregates parts and labor totals.
* Final invoice is sent via SMS/WhatsApp.
* Upon payment logging (M-Pesa / Cash recorded by Manager or Lead), the Job Card status moves to `Paid` then `Closed`, locking all line items as immutable read-only records to prevent post-payment fraud.