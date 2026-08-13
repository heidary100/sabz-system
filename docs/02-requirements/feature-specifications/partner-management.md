# Sabz System Platform
# Feature Specification – Partner Management

Version: 1.0

Module ID: PARTNER-001

Status: Approved for Development

Milestone: 1 (Core), Milestone 2 (Tier Management Enhancements)

Priority: Critical (P1)

---

# 1. Purpose

The Partner Management module enables businesses to apply for wholesale access, undergo verification, receive tier-based pricing, and maintain their business profile.

The module supports Sabz System Platform's B2B sales model while ensuring that wholesale pricing is available only to verified business partners.

---

# 2. Goals

- Business partner onboarding
- Business verification workflow
- Tier-based access control
- Partner profile management
- Purchase-volume tracking
- Future automation of tier upgrades
- Secure document management

---

# 3. Actors

- Guest
- Customer
- Partner
- Operator
- Super Administrator

---

# 4. Business Rules

### PARTNER-001

Only authenticated users may apply to become business partners.

---

### PARTNER-002

A user may have only one active partner application.

---

### PARTNER-003

Partner pricing is hidden until the application is approved.

---

### PARTNER-004

Each approved partner belongs to exactly one pricing tier:

- Tier 1 – Distributor
- Tier 2 – Wholesaler
- Tier 3 – Retailer

---

### PARTNER-005

Tier changes are recorded in the audit log.

---

### PARTNER-006

Rejected applications may be corrected and resubmitted.

---

### PARTNER-007

Only Operators and Super Administrators may approve or reject applications.

---

### PARTNER-008

Business documents must be retained for audit purposes unless deleted according to legal or business retention policies.

---

# 5. Application Workflow

Customer

↓

Submit Partner Application

↓

Upload Required Documents

↓

Application Status = Pending Review

↓

Operator Review

↓

Approved

OR

Rejected

↓

Notification Sent

↓

Partner Dashboard Activated

↓

Tier-Based Pricing Enabled

---

# 6. Functional Requirements

## Partner Application

The system shall allow users to:

- Start a partner application
- Save a draft application
- Edit an unapproved application
- Submit the application for review
- Track application status

---

## Business Information

Applicants shall provide:

- Business name
- Business license number
- Business owner name
- National ID (if required)
- Mobile number
- Business phone
- Website (optional)
- Province
- City
- Full business address

> **Address semantics (SS-028):** Province, City, and Full business address are the partner entity's business/legal operating address. They are stored on the Partner entity and are distinct from the user's personal/contact address on UserProfile. The two address concepts are never interchangeable.

---

## Required Documents

The system shall support uploading:

- Business license (required)
- National ID (optional)
- Tax registration (optional)
- Additional supporting documents

Accepted formats:

- PDF
- JPG
- PNG

Maximum file size:

10 MB per file

---

## Operator Review

Operators shall be able to:

- View applications
- Preview documents
- Approve applications
- Reject applications
- Request additional information
- Add internal review notes

---

## Partner Dashboard

Approved partners shall have access to:

- Current pricing tier
- Monthly purchase volume
- Lifetime purchase volume
- Business profile
- Submitted documents
- Order history
- RFQ history

---

# 7. Tier Management

Tier 3

Retail Partner

↓

Monthly purchases reach configured threshold

↓

Tier 2

Wholesaler

↓

Monthly purchases reach configured threshold

↓

Tier 1

Distributor

Tier thresholds shall be configurable through the administration panel rather than hard-coded.

---

# 8. User Stories

### PARTNER-US-001

As a customer,

I want to apply to become a business partner,

so I can access wholesale pricing.

Acceptance Criteria

- Only authenticated users can apply.
- Required fields are validated.
- Application is saved.
- Status is Pending Review.

---

### PARTNER-US-002

As a partner,

I want to upload my business documents,

so the company can verify my eligibility.

Acceptance Criteria

- Supported file types only.
- Maximum size enforced.
- Files stored securely.
- Operator can preview uploaded documents.

---

### PARTNER-US-003

As an Operator,

I want to approve or reject applications,

so verified businesses receive the appropriate pricing.

Acceptance Criteria

- Decision is recorded.
- Audit log updated.
- Notification sent.
- Pricing eligibility changes immediately after approval.

---

### PARTNER-US-004

As a partner,

I want to see my current tier and purchase progress,

so I understand what is required to reach the next level.

Acceptance Criteria

- Current tier displayed.
- Monthly purchase volume displayed.
- Next-tier threshold displayed.
- Remaining amount required displayed.

---

# 9. API Endpoints

Partner

POST /partners/apply

GET /partners/application

PATCH /partners/application

POST /partners/documents

GET /partners/status

GET /partners/dashboard

GET /partners/tier

GET /partners/purchase-summary

Operator

GET /admin/partners

GET /admin/partners/{id}

PATCH /admin/partners/{id}/approve

PATCH /admin/partners/{id}/reject

PATCH /admin/partners/{id}/tier

GET /admin/partners/pending

---

# 10. Validation Rules

Business Name

- Required
- Maximum 200 characters

Business License Number

- Required
- Unique where applicable

Address

- Required

City

- Required

Province

- Required

Document Upload

- Required
- Valid format
- Maximum 10 MB

---

# 11. Authorization

Guest

- No access

Customer

- Create application
- View own application
- Edit pending application

Partner

- View dashboard
- Update profile (where permitted)
- View purchase statistics

Operator

- Review applications
- Approve
- Reject
- Change tier

Super Administrator

- Full access
- Override approvals
- Configure tier thresholds

---

# 12. Notifications

Applicants shall receive notifications when:

- Application submitted
- Additional information requested
- Application approved
- Application rejected
- Tier upgraded
- Tier downgraded

Operators shall receive notifications when:

- New application submitted
- Applicant uploads requested documents

---

# 13. Audit Events

The system shall record:

- Application creation
- Application updates
- Document uploads
- Approval decisions
- Rejection decisions
- Tier changes
- Manual overrides
- Dashboard access (optional)

---

# 14. Error Handling

The module shall return appropriate errors for:

- Duplicate active application
- Missing required fields
- Invalid document type
- Oversized document
- Unauthorized access
- Invalid application status transition
- Application not found

---

# 15. Dependencies

Requires:

- Authentication & Identity
- Notification Service
- Media Service
- Audit Logging

Provides services to:

- Pricing Engine
- Order Management
- Reporting
- Administration

---

# 16. Test Scenarios

Positive Tests

- Submit application
- Upload documents
- Save draft
- Approve application
- Reject application
- Display partner dashboard
- Display tier information
- Display purchase summary

Negative Tests

- Submit duplicate application
- Upload invalid document type
- Upload oversized file
- Access another partner's application
- Approve without permission
- Reject already approved application

---

# 17. Definition of Done

The Partner Management module is complete when:

- Application workflow is fully operational.
- Business documents can be uploaded and reviewed.
- Approval and rejection workflows function correctly.
- Tier assignment is operational.
- Partner dashboard displays correct information.
- Notifications are delivered.
- Audit logs are generated.
- Unit, integration, and user acceptance tests pass.
- The module is approved during the Milestone 1 review.