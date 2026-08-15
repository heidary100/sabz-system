# Sabz System Platform
# Partner Registration Flow

Version: 1.0

---

# Overview

The partner registration flow handles B2B business account creation, verification, and tier assignment.

> **Status: PLANNED — not yet implemented.** Password-based registration does not exist in the current API. The current authentication flow is OTP-first (see [Authentication API](../05-api/authentication-api.md)); the steps below describe the intended future design. OTP responses in the current API return `{ sent, expiresIn }`, never the code.
>
> **SS-038 alignment:** the flow below reflects the approved Partner lifecycle. The `Partner` row is the application aggregate (one persistent row per profile), state is tracked in `Partner.approvalStatus` (DRAFT → PENDING → APPROVED/REJECTED, REJECTED → PENDING), and documents are stored through the Partner-domain `DocumentStorage` abstraction — **not S3**. BusinessDocument metadata lives in PostgreSQL; binary contents live outside the database.

---

# Registration States

```
DRAFT -> PENDING -> APPROVED -> ACTIVE
                    |
                 REJECTED -> (corrected) -> PENDING
```

# Detailed Flow

## Step 1: Initial Application

```
[Partner] -> POST /auth/partner/register
    Request:
    - phone, password
    - companyName
    - businessType (DISTRIBUTOR | WHOLESALER | RETAIL_SHOP | SYSTEM_INTEGRATOR | CORPORATE)
    - nationalId

    -> [System] validates input
    -> [System] creates User (role: PARTNER, status: UNVERIFIED)
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
[Partner] -> POST /partners/me/documents (multipart/form-data)
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
    -> [System] sends notification to operators
```

## Step 4: Operator Review

```
[Operator] -> GET /admin/partners/pending
    -> [System] returns list of partner applications in PENDING

[Operator] -> GET /admin/partners/:id
    -> [System] returns partner details with documents

[Operator] -> POST /admin/partners/:id/approve
    Request:
    - tierId (UUID)
    - notes (string, optional)

    -> [System] updates Partner.approvalStatus -> APPROVED, sets approvedAt
    -> [System] assigns PartnerTier
    -> [System] sends SMS notification to partner
```

## Step 5: Rejection (if applicable)

```
[Operator] -> POST /admin/partners/:id/reject
    Request:
    - reason (string)

    -> [System] updates Partner.approvalStatus -> REJECTED, sets rejectedAt
       and rejectionReason; reviewNotes may be set by the operator
    -> [System] sends SMS notification with reason
    -> [Partner] can correct the application and resubmit
       (approvalStatus -> PENDING, PARTNER-006)
```

---

# Partner Tier Assignment

| Tier | Criteria | Discount |
|------|----------|----------|
| Tier 1 | Standard new partner | Base discount |
| Tier 2 | Verified history + volume | Higher discount |
| Tier 3 | Long-term + high volume | Maximum discount |

Tier assignment is performed manually by operators during approval, based on business rules and partner profile.
