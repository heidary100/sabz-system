# Sabz System Platform
# Partner Registration Flow

Version: 1.0

---

# Overview

The partner registration flow handles B2B business account creation, verification, and tier assignment.

> **Status: PLANNED — not yet implemented.** Password-based registration does not exist in the current API. The current authentication flow is OTP-first (see [Authentication API](../05-api/authentication-api.md)) and the current partner application flow is OTP-first as well: an authenticated customer creates the application via `POST /partners/apply` (see [Partner Management](../02-requirements/feature-specifications/partner-management.md) §9 and [API Specification](../05-api/api-specification.md) §5). The steps below describe a **legacy/future password-based design** — legacy concepts such as `companyName`, `businessType`, a `UNVERIFIED` user status, and `POST /partners/me/documents` are **not part of the implemented model** and are retained only to document the future password-registration requirement. OTP responses in the current API return `{ sent, expiresIn }`, never the code.
>
> **SS-038 alignment:** the flow below reflects the approved Partner lifecycle. The `Partner` row is the application aggregate (one persistent row per profile), state is tracked in `Partner.approvalStatus` (DRAFT → PENDING → APPROVED/REJECTED, REJECTED → PENDING), and documents are stored through the Partner-domain `DocumentStorage` abstraction — **not S3**. BusinessDocument metadata lives in PostgreSQL; binary contents live outside the database.

---

# Registration States

```
DRAFT -> PENDING -> APPROVED
                    |
                 REJECTED -> (corrected) -> PENDING
```
> There is no `ACTIVE` partner state; the lifecycle is the
> `PartnerApprovalStatus` enum (DRAFT | PENDING | APPROVED | REJECTED).

# Detailed Flow

## Step 1: Initial Application

```
[Partner] -> POST /auth/partner/register   (future / planned — not implemented)
    Request:
    - phone, password
    - companyName      (legacy concept — the implemented field is businessName)
    - businessType (DISTRIBUTOR | WHOLESALER | RETAIL_SHOP | SYSTEM_INTEGRATOR | CORPORATE)
      (legacy concept — not part of the implemented model)
    - nationalId

    -> [System] validates input
    -> [System] creates User (role: PARTNER, status: UNVERIFIED)
       (legacy concept — the implemented UserStatus enum is
        PENDING_OTP | ACTIVE | SUSPENDED | LOCKED; the PARTNER role is
        granted only after application approval)
    -> [System] creates Partner (approvalStatus: DRAFT)
    -> [System] sends OTP via SMS
    -> Response: { message: "OTP sent" }
```

## Step 2: Phone Verification

```
[Partner] -> POST /auth/verify-otp (phone, code)
    -> [System] validates OTP
    -> [System] keeps Partner.approvalStatus in DRAFT until the application
       is submitted for review (SS-038)
    -> Response: { message: "Phone verified." }
```

## Step 3: Document Upload

```
[Partner] -> POST /partners/documents (multipart/form-data)
    - businessLicense (file, required before submission/approval)
    - nationalCard (file)
    - otherDocuments (files)

    -> [System] validates MIME type (PDF/JPEG/PNG), size (max 10 MB) and
       magic bytes
    -> [System] stores binary contents through the Partner-domain
       DocumentStorage abstraction (local disk in development; S3 is NOT used)
       under a server-generated key: partners/<partnerId>/<documentId>.<ext>
    -> [System] creates BusinessDocument metadata rows (type, originalName,
       mimeType, sizeBytes, storageKey) in PostgreSQL
    -> [System] sends notification to operators (future scope — Notification
       Service is not yet implemented)
```

## Step 4: Operator Review

> **SS-040 alignment:** the operator review API is implemented. The pending
> list is `GET /admin/partners` (default `status=PENDING`, paginated), review
> detail is `GET /admin/partners/:id`, and the decision endpoints below use
> `PATCH`. Operators and Admins authenticate with a JWT; the PARTNER role is
> activated on approval.

```
[Operator] -> GET /admin/partners
    -> [System] returns the paginated list of partner applications in PENDING
    -> [System] returns partner details with documents and profile summary

[Operator] -> GET /admin/partners/:id
    -> [System] returns partner details with documents

[Operator] -> PATCH /admin/partners/:id/approve
    Request:
    - tierId (UUID)
    - reviewNotes (string, optional)

    -> [System] updates Partner.approvalStatus -> APPROVED, sets approvedAt
    -> [System] assigns PartnerTier
    -> [System] grants the PARTNER role to the applicant (single transaction)
    -> [System] writes the PARTNER_APPROVED audit event
```

## Step 5: Rejection (if applicable)

```
[Operator] -> PATCH /admin/partners/:id/reject
    Request:
    - reason (string)
    - reviewNotes (string, optional)

    -> [System] updates Partner.approvalStatus -> REJECTED, sets rejectedAt
       and rejectionReason; reviewNotes may be set by the operator
    -> [System] writes the PARTNER_REJECTED audit event
    -> [Partner] can correct the application and resubmit
       (approvalStatus -> PENDING, PARTNER-006)
```

---

# Partner Tier Assignment

The defined tiers (partner-management.md §4/§7):

| Tier | Partner type |
|------|--------------|
| Tier 1 | Distributor (highest) |
| Tier 2 | Wholesaler |
| Tier 3 | Retailer (lowest) |

Tier assignment is performed **manually** by operators during approval (M1).
The concrete `discountPercent`/`minOrderQuantity` values are not yet defined
(product decision, SS-042). Automatic tier promotion based on order volume is
future M2 scope.

> The earlier "Base/Higher/Maximum discount" tier table was a legacy,
> contradictory proposal and is superseded by the table above (see
> partner-management.md §7).
