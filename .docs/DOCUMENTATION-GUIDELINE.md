# GOSSA Final Academic Documentation Blueprint & Writing Guideline

- Document Version: 1.0
- Project Title: Design and Implementation of GOSSA: A Cloud-Based Garage Operations and Service Administration SaaS Platform
- Target Institution: KCA University — School of Technology
- Degree Programme: Bachelor of Business Information Technology (BBIT)
- Standard Compliance: KCA University Final Project Guidelines & APA 7th Edition Referencing

## 1. Overview & Purpose

This document serves as the master guideline and control reference for assembling, drafting, and verifying the final academic project report for GOSSA (Garage Operations and Service Administration).

The objective is to synthesize all prior technical project artifacts—specifically the Project Proposal, Software Requirements Specification (SRS v2.4), Software Design Specification (SDS v2.2), System Implementation Plan (SIP v2.0), System Testing Plan (STP v3.0), and GOSSA User Manual—into a cohesive, examination-grade thesis document.

## 2. Source Document Mapping Register

To ensure consistency and avoid introducing unverified features or contradictions, all content across the six chapters must be traceably mapped to primary project artifacts:

| Final Report Chapter | Primary Source Document | Key Technical Artifacts & Content to Extract |
| --- | --- | --- |
| Chapter 1: Introduction | Project Proposal & Machakos Field Survey | Problem statement, operational challenges in SMEs, main/specific objectives, scope, project significance. |
| Chapter 2: Literature Review | Literature Review Draft & SRS Background | Theoretical framework, review of paper vs. legacy ERP vs. global SaaS, APA 7 comparative table, technology stack justifications. |
| Chapter 3: Methodology | Research & Development Records | Empirical field research methods (interviews, observations), 2-week Agile/Scrum sprint frameworks, ethical considerations. |
| Chapter 4: System Requirements | SRS v2.4 | Canonical user roles (Shop Owner, Service Advisor, Lead Mechanic, Junior Mechanic, Admin, Customer Portal User), 9-State Job Lifecycle, 3-Tier Inventory Model, Functional (FR-1 to FR-12) and Non-Functional requirements. |
| Chapter 5: System Design & Implementation | SDS v2.2 & SIP v2.0 | System architecture, Context/Level 0/Level 1 DFDs, PostgreSQL ERD, Data Dictionary, Supabase Row-Level Security (RLS) multi-tenancy, REST API endpoints, CI/CD, Vercel/Render deployment. |
| Chapter 6: Testing & Results | STP v3.0 & Execution Evidence | Test suites (55 planned test cases), verified execution results, defect triage & re-test logs, objective achievement matrix, limitations, future roadmap. |
| Back Matter: Appendix II | GOSSA User Manual | Role-based operational guidelines, UI navigation workflows, system configuration steps. |

## 3. Mandatory Master Table of Contents

The final submission must strictly adhere to the six-chapter structure mandated by the KCA University guidelines:

### PRELIMINARY PAGES

1. Title Page
2. Declaration
3. Dedication
4. Acknowledgements
5. Abstract / Executive Summary (Max 1 page, structured, includes word count)
6. Table of Contents
7. List of Figures
8. List of Tables
9. List of Abbreviations and Acronyms

### CHAPTER ONE: INTRODUCTION

1.1 Background of the Study

1.2 Background of the Problem

1.3 Problem Statement

1.4 Project Objectives

1.4.1 Main Objective

1.4.2 Specific Objectives

1.5 Scope of the Study

1.6 Significance of the Project

1.7 Assumptions and Limitations

1.8 Organisation of the Report

### CHAPTER TWO: LITERATURE REVIEW

2.1 Introduction

2.2 Concept of Garage Operations & Administration

2.3 Review of Traditional Garage Management Practices

2.4 Review of Existing Digital Garage Management Systems

2.5 Cloud-Based Software-as-a-Service (SaaS) Architecture

2.6 Review of Relevant System Technologies

2.6.1 Frontend Technologies (React, Tailwind CSS)

2.6.2 Backend Frameworks (Node.js, Express)

2.6.3 Database Systems & Security (PostgreSQL, Supabase RLS)

2.7 Comparative Analysis of Existing Solutions

2.8 Identified Research & Operational Gap

2.9 Chapter Summary

### CHAPTER THREE: RESEARCH AND DEVELOPMENT METHODOLOGY

3.1 Introduction

3.2 Research Design

3.3 Target Population

3.4 Sampling Technique and Sample Size

3.5 Data Collection Methods

3.5.1 Semi-Structured Interviews

3.5.2 Direct Contextual Observation

3.5.3 Document & Artifact Review

3.6 Data Analysis & Synthesis

3.7 Software Development Lifecycle (SDLC) Methodology

3.8 Justification of Agile/Scrum Framework

3.9 Sprint Execution & Development Activities (Sprints 1-6)

3.10 Ethical Considerations

3.11 Chapter Summary

### CHAPTER FOUR: SYSTEM REQUIREMENTS ANALYSIS AND SPECIFICATION

4.1 Introduction

4.2 Analysis of the Existing System

4.3 Proposed GOSSA System Architecture

4.4 User Roles and Access Control Matrix

4.4.1 Shop Owner

4.4.2 Service Advisor

4.4.3 Lead Mechanic

4.4.4 Junior Mechanic

4.4.5 System Admin

4.4.6 Customer Portal User

4.5 Canonical Job Card Lifecycle Model

4.6 Inventory Allocation & Management Model

4.7 Functional Requirements (SRS v2.4 Integration)

4.8 Non-Functional Requirements

4.9 System Constraints and Business Rules

4.10 Use Case Analysis & Scenarios

4.11 Chapter Summary

### CHAPTER FIVE: SYSTEM DESIGN, IMPLEMENTATION AND DEPLOYMENT

5.1 Introduction

5.2 Overall System Architecture (SDS v2.2)

5.3 Data Flow Diagrams (Context, Level 0, Level 1)

5.4 Multi-Tenant Security & Row-Level Security (RLS) Design

5.5 Database Design

5.5.1 Conceptual & Logical Database Schema

5.5.2 Entity-Relationship Diagram (ERD)

5.5.3 Physical Database Design & Data Dictionary

5.6 API and Backend Controller Design

5.7 Business Logic Algorithms & Pseudocode

5.8 User Interface (UI/UX) Design & Component Structure

5.9 System Implementation (SIP v2.0 Integration)

5.9.1 Frontend Implementation (React / Tailwind CSS)

5.9.2 Backend Implementation (Node.js / Express)

5.9.3 Database & Migration Setup

5.10 Version Control, CI/CD, and Cloud Deployment (Vercel/Render)

5.11 Chapter Summary

### CHAPTER SIX: TESTING, RESULTS, CONCLUSIONS AND RECOMMENDATIONS

6.1 Introduction

6.2 Software Testing Strategy (STP v3.0 Integration)

6.3 Test Environment & Tooling Setup

6.4 Execution Results by Test Suite

6.4.1 Authentication & RBAC Suite

6.4.2 Job Card State Transition Suite

6.4.3 Inventory Allocation & Deduction Suite

6.4.4 Invoicing & Commission Calculation Suite

6.5 Defect Identification, Triage, and Resolutions

6.6 Evaluation of Project Objectives

6.7 System Limitations

6.8 Conclusion

6.9 Recommendations

6.10 Future Enhancements

### BACK MATTER

- References (APA 7th Edition)
- Appendix I: Sample Source Code
- Appendix II: GOSSA User Manual
- Appendix III: Research Instruments (Interview Guides & Field Survey Forms)
- Appendix IV: Supplementary System Diagrams
- Appendix V: Test Execution Evidence & Logs

## 4. Technical Standardization & Domain Rules

To pass academic scrutiny, all technical descriptions across Chapters 4, 5, and 6 must enforce the following precise domain rules:

### A. Canonical Job Card Lifecycle Model

The generic workflow must be represented by the official 9-state state-machine pipeline:

$$\text{DRAFT} \longrightarrow \text{PENDING\_ESTIMATE} \longrightarrow \text{ESTIMATE\_SHARED} \longrightarrow \text{APPROVED / REJECTED} \longrightarrow \text{IN\_PROGRESS} \longrightarrow \text{QC\_PENDING} \longrightarrow \text{QC\_APPROVED} \longrightarrow \text{INVOICED} \longrightarrow \text{CLOSED}$$

- DRAFT: Vehicle intake initiated; initial symptoms recorded.
- PENDING_ESTIMATE: Diagnostic inspection underway by Lead Mechanic; parts and labor being quantified.
- ESTIMATE_SHARED: Estimate dispatched to Customer Portal for authorization.
- APPROVED / REJECTED: Customer decision point. If rejected, job card transitions to CLOSED.
- IN_PROGRESS: Active repair state; spare parts marked as reserved/consumed.
- QC_PENDING: Repair complete; awaiting Lead Mechanic quality check.
- QC_APPROVED: Quality audit verified; ready for billing.
- INVOICED: Invoice generated; labor cuts computed.
- CLOSED: Final payment received; vehicle released to owner.

### B. 3-Tier Inventory Management Model

Do not describe part allocation as immediate physical stock deduction. Implement the 3-tier stock reconciliation model:

- On-Hand Stock ($S_{hand}$): Total physical inventory present in the garage storage.
- Reserved Stock ($S_{res}$): Inventory allocated to active estimates/approved work orders but not yet physically used.
- Available Stock ($S_{avail}$): Calculated dynamically as:

$$S_{avail} = S_{hand} - S_{res}$$

Physical Deduction: Physical stock ($S_{hand}$) is deducted only upon Lead/Junior mechanic sign-off during active job execution (IN_PROGRESS).

### C. Multi-Tenant Row-Level Security (RLS)

The report must detail how multi-tenancy is secured at both the API and database levels:

- Application Context: JWT payloads contain tenant_id and role attributes.
- Database Enforcement: PostgreSQL tables enforce Row-Level Security policies:

```sql
CREATE POLICY tenant_isolation_policy ON job_cards
FOR ALL
USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

## 5. Academic Quality Assurance Checklist

Before finalizing any section for final submission, check against the following QA criteria:

- [ ] Institutional Alignment: Strictly follows KCA University's 6-chapter format.
- [ ] Citation Style: APA 7th Edition applied consistently for all in-text citations and reference list entries.
- [ ] Empirical Claims: Claims regarding garage inefficiencies or test results are backed by research records or execution logs.
- [ ] Role Terminology: Canonical user roles (Shop Owner, Service Advisor, Lead Mechanic, Junior Mechanic, Admin, Customer Portal User) used without deviation.
- [ ] Evidence Integrity: Distinguishes planned test suites (STP v3.0) from executed test results, documenting defect triages and resolutions accurately.
- [ ] Tone & Style: Written in formal, third-person academic prose suitable for a Bachelor of Business Information Technology thesis.
