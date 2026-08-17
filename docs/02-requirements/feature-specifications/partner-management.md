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
- Administrator (ADMIN)

---

# 4. Business Rules

### PARTNER-001

Only authenticated users may apply to become business partners.

---

### PARTNER-002

A user may have only one active partner application.

> **SS-038 clarification:** the v1 invariant is one persistent **Partner aggregate per profile**. The `Partner` row itself is the application; there is no separate `PartnerApplication` table. The unique `Partner.profileId` constraint enforces exactly one Partner row per UserProfile.

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

Only Operators and Administrators (ADMIN) may approve or reject applications.

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

Application Status = Pending review (PENDING)

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

> **Lifecycle mapping (SS-038):** these workflow states map to the
> `Partner.approvalStatus` enum on the single persistent Partner aggregate:
> saved draft → `DRAFT`; submitted for review → `PENDING`; operator decision →
> `APPROVED` or `REJECTED`; a corrected resubmission returns to `PENDING`.

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

- Business license (required) — required before submission and before approval
- National ID (optional)
- Tax registration (optional)
- Additional supporting documents

Accepted formats:

- PDF
- JPG
- PNG

Maximum file size:

10 MB per file

> **Storage contract (SS-038 foundation, enforced from SS-039):**
>
> - Allowed MIME types: `application/pdf`, `image/png`, `image/jpeg`.
> - Maximum size: 10 MB.
> - Magic-byte validation is required (MIME type alone is not trusted).
> - `originalName` is display-only metadata; the storage key is server-generated (`partners/<partnerId>/<documentId>.<safe-extension>`) and never derived from the filename.
> - Metadata lives in PostgreSQL (`BusinessDocument`); binary contents live outside the database through the Partner-domain `DocumentStorage` abstraction.
> - Storage paths are never exposed as public URLs.

> **Applicant API (SS-039 implementation):**
>
> - The applicant-facing endpoints are `POST /partners/apply`,
>   `GET /partners/application`, `PATCH /partners/application`,
>   `POST /partners/documents`, `GET /partners/documents`,
>   `GET /partners/documents/{id}`, and `DELETE /partners/documents/{id}`.
> - All endpoints require authentication and resolve ownership exclusively from
>   the authenticated user. Client-supplied ownership identifiers are never
>   accepted. Non-owned resources return `404` (not `403`) so their existence is
>   not disclosed.
> - Applications are created in `DRAFT`. Submission (`PATCH` with `submit: true`,
>   or `submit: true` on creation) transitions `DRAFT`/`REJECTED` → `PENDING`,
>   clearing `rejectedAt` and `rejectionReason` on resubmission. `PENDING` and
>   `APPROVED` applications are locked: business-field edits, document uploads,
>   and document removals all return `409`.
> - Submission requires the mandatory business fields (business name, business
>   license number, address, city, province) and an active `BUSINESS_LICENSE`
>   document; a `submit: true` during creation without a license returns `422`
>   (a freshly created application has no documents yet). The natural flow is to
>   create a draft, upload the license, then submit.
> - Uploading a document whose type already has an active document replaces the
>   old document (new row created, old row soft-deleted, old binary removed).
> - `reviewNotes` are operator-internal and are not exposed to applicants.
> - Audit `before`/`after` payloads never contain `nationalId`,
>   `businessLicenseNo`, file contents, raw storage paths, or secrets. This is
>   separate from the API response policy: the applicant's own application
>   response may include `nationalId` and `businessLicenseNo`.
> - Applicant deletions and replacements soft-delete the `BusinessDocument` row
>   and remove the binary. The relationship between this behavior and
>   PARTNER-008's retention requirement is documented in the Database Design
>   Specification; SS-039 implements the applicant-facing behavior and does not
>   introduce a storage-retention policy.

---

## Operator Review

Operators shall be able to:

- View applications
- Preview documents
- Approve applications
- Reject applications
- Add internal review notes
- Change the tier of an approved partner

> **Admin review API (SS-040 implementation):**
>
> - The operator/admin endpoints are `GET /admin/partners` (paginated list,
>   default `PENDING`), `GET /admin/partners/{id}` (review detail),
>   `PATCH /admin/partners/{id}/approve`, `PATCH /admin/partners/{id}/reject`,
>   `PATCH /admin/partners/{id}/tier`, and
>   `GET /admin/partners/{id}/documents/{documentId}` (document preview).
> - All endpoints require a JWT token **and** either the `OPERATOR` or `ADMIN`
>   role (`PARTNER-007`). There is no `SUPER_ADMIN` role; `ADMIN` is the
>   implemented application role.
> - List pagination uses `page`/`limit` (default 1/20, maximum 100) with
>   deterministic `submittedAt DESC, id DESC` ordering. The default filter is
>   `PENDING`; `status` accepts all `PartnerApprovalStatus` values.
> - Decisions operate only on valid states. Approval and rejection require the
>   partner to be `PENDING`; a tier change requires `APPROVED`. State conflicts
>   and the loser of a concurrent decision return `409` (conditional
>   `updateMany` on `approvalStatus` + `deletedAt`).
> - Approval requires an active `BUSINESS_LICENSE` document (`422` otherwise)
>   and a valid tier (`400` otherwise). The approval transition, the `PARTNER`
>   role activation (assigned to the **applicant's** user, never the reviewer),
>   and the `PARTNER_APPROVED` audit event are committed in one transaction.
> - The review detail includes `reviewNotes` for operators; review notes are
>   never exposed to applicants.
> - Audit `before`/`after` payloads never contain `nationalId`,
>   `businessLicenseNo`, document contents, raw storage paths, or secrets.
> - Document preview serves only active documents of the requested partner;
>   other partners' documents and soft-deleted documents return `404`.

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
- Status is Pending review (PENDING).

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

GET /partners/status — Planned / not yet implemented (application status is returned by `GET /partners/application`)

GET /partners/dashboard — Planned (M2) / not yet implemented

GET /partners/tier — Planned / not yet implemented (tier is returned on the application once approved)

GET /partners/purchase-summary — Planned (M2) / not yet implemented

Operator

GET /admin/partners

GET /admin/partners/{id}

PATCH /admin/partners/{id}/approve

PATCH /admin/partners/{id}/reject

PATCH /admin/partners/{id}/tier

GET /admin/partners/{id}/documents/{documentId}

> The operator endpoints above are implemented by SS-040. `GET
> /admin/partners/pending` (from the registration-flow draft) is replaced by the
> paginated `GET /admin/partners` with a default `status=PENDING` filter;
> `request additional information` is out of scope and not implemented.

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

Administrator (ADMIN)

- Full access
- Override approvals (future)
- Configure tier thresholds (future / M2)

---

# 12. Notifications

> **Not implemented — future scope.** The Notification Service is not yet
> implemented; none of the triggers below are delivered in the current
> milestone. They are preserved as future requirements.

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

Audit events (implemented following the SS-038 audit contract):

- `PARTNER_APPLICATION_CREATED` (SS-039)
- `PARTNER_APPLICATION_UPDATED` (SS-039)
- `PARTNER_APPLICATION_SUBMITTED` (SS-039)
- `PARTNER_DOCUMENT_UPLOADED` (SS-039)
- `PARTNER_DOCUMENT_REMOVED` (SS-039)
- `PARTNER_APPROVED` (SS-040)
- `PARTNER_REJECTED` (SS-040)
- `PARTNER_TIER_CHANGED` (SS-040)

Sensitive information must never appear in audit `before`/`after` payloads:

- `nationalId`
- `businessLicenseNo`
- file contents
- raw storage paths that reveal sensitive information
- tokens and secrets

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
- Notification Service (future scope — not yet implemented)
- Partner-domain DocumentStorage (metadata in PostgreSQL; binary contents
  stored outside the database). The platform Media Service (future product-media
  infrastructure, see Product Catalog) is **not** the Partner document storage.
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
- Display partner dashboard (future / M2)
- Display tier information (future / M2)
- Display purchase summary (future / M2)

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
- Partner dashboard displays correct information (future / M2).
- Notifications are delivered (future scope — Notification Service not yet implemented).
- Audit logs are generated.
- Unit, integration, and user acceptance tests pass.
- The module is approved during the Milestone 1 review.