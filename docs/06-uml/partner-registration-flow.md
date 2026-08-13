# Sabz System Platform
# Partner Registration Flow

Version: 1.0

---

# Overview

The partner registration flow handles B2B business account creation, verification, and tier assignment.

> **Status: PLANNED — not yet implemented.** Password-based registration does not exist in the current API. The current authentication flow is OTP-first (see [Authentication API](../05-api/authentication-api.md)); the steps below describe the intended future design. OTP responses in the current API return `{ sent, expiresIn }`, never the code.

---

# Registration States

```
PENDING_PHONE -> PHONE_VERIFIED -> PENDING_REVIEW -> APPROVED -> ACTIVE
                                                        |
                                                    REJECTED
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
    -> [System] creates Partner (verificationStatus: PENDING_PHONE)
    -> [System] sends OTP via SMS
    -> Response: { message: "OTP sent" }
```

## Step 2: Phone Verification

```
[Partner] -> POST /auth/verify-otp (phone, code)
    -> [System] validates OTP
    -> [System] updates Partner.verificationStatus -> PENDING_REVIEW
    -> [System] sends welcome notification
    -> Response: { message: "Phone verified. Your application is under review." }
```

## Step 3: Document Upload

```
[Partner] -> POST /partners/me/documents (multipart/form-data)
    - businessLicense (file)
    - nationalCard (file)
    - otherDocuments (files)

    -> [System] uploads files to S3 storage
    -> [System] creates BusinessDocument records
    -> [System] sends notification to operators
```

## Step 4: Operator Review

```
[Operator] -> GET /admin/partners/pending
    -> [System] returns list of pending partner applications

[Operator] -> GET /admin/partners/:id
    -> [System] returns partner details with documents

[Operator] -> POST /admin/partners/:id/approve
    Request:
    - tierId (UUID)
    - notes (string, optional)

    -> [System] updates Partner.verificationStatus -> APPROVED
    -> [System] assigns PartnerTier
    -> [System] sends SMS notification to partner
```

## Step 5: Rejection (if applicable)

```
[Operator] -> POST /admin/partners/:id/reject
    Request:
    - reason (string)

    -> [System] updates Partner.verificationStatus -> REJECTED
    -> [System] sends SMS notification with reason
    -> [Partner] can reapply after addressing the reason
```

---

# Partner Tier Assignment

| Tier | Criteria | Discount |
|------|----------|----------|
| Tier 1 | Standard new partner | Base discount |
| Tier 2 | Verified history + volume | Higher discount |
| Tier 3 | Long-term + high volume | Maximum discount |

Tier assignment is performed manually by operators during approval, based on business rules and partner profile.
