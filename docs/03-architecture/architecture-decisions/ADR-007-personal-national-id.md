# ADR-007: Personal Iranian National ID (کد ملی)

## Status

Accepted for SS-260 implementation. The leading-zero and repeated-digit
policies below are the implemented rules; any change requires an explicit
amendment and matching tests.

## Context

The platform has no personal Iranian National ID. The only existing
`nationalId` is `Partner.nationalId`, which is the **business legal identifier
(شناسه ملی)** collected during partner onboarding. It is a different concept
with different meaning, DTOs, access rules, and no checksum validation.

The identity data-model convention says profile data belongs on
`UserProfile`. SS-260 nevertheless requires a personal National ID on `User`.
It is an identity-level sensitive attribute rather than a display profile
field, and its access/masking/audit policy differs from names and address.

The required validation is the standard MOD-11 structural checksum. It does
not verify identity, ownership, issuance, legal validity, or authenticity.

## Decisions

### 1. Storage

`User.nationalId` is a nullable `TEXT` column, stored canonically as exactly
10 ASCII digits. It is additive and has no default and no backfill.

This is an explicit exception to the “profile data lives on UserProfile”
rule: the value is identity-level and must stay out of generic profile
serialization. Names, address, and avatar remain on `UserProfile`.

### 2. Separation from the business identifier

`User.nationalId` and `Partner.nationalId` are never merged, shared, or
validated with the same rules. The personal validator is not imported into
partner code. Partner DTOs, onboarding, approval behavior, audit redaction,
and applicant/admin responses are unchanged.

### 3. Leading zeros

SS-260’s explicit product rule requires a non-zero first digit, so values such
as `0013542419` are rejected. The MOD-11 algorithm itself imposes no such
rule: leading zeros can occur in issued numbers. This is therefore a stricter
format/product rule, not part of the checksum, and must not be presented as an
identity or issuance guarantee. If the client later chooses the checksum-only
policy, remove the explicit first-digit check and update the tests and this ADR
together.

### 4. Placeholder policy

Only `0000000000` is treated as an obvious placeholder and rejected. Other
repeated-digit sequences are accepted when the checksum passes: some real
issued numbers are “round” values, and rejecting every repeated sequence would
reject real users. A stricter policy is a separate product decision.

### 5. Normalization

Input is NFC-normalized, outer whitespace is trimmed, and Persian
(`۰-۹`) and Arabic-Indic (`٠-٩`) digits are folded to ASCII. Internal
whitespace and separators are preserved so validation rejects them visibly;
arbitrary non-digit characters are never silently stripped. Full-width
digits, ZWNJ/ZWJ, and bidi control characters are rejected.

### 6. Uniqueness and indexing

No unique constraint and no index. There is no query-by-value requirement;
a unique constraint would leak existence and raise soft-delete/retention
questions. Identity-uniqueness is not part of SS-260.

### 7. Access and masking

- Owner update: existing `PATCH /api/v1/auth/profile`.
- Owner read: only `hasNationalId` and `maskedNationalId` (`****1234`).
- ADMIN read: a dedicated ADMIN-only masked endpoint; no full-value read.
- No admin write.
- No personal National ID in user lists, search, exports, public/share
  DTOs, URLs, logs, telemetry, or browser storage.

### 8. Audit

A change writes `USER_NATIONAL_ID_UPDATED` with
`after: { nationalIdChanged: true }` only. Neither the old nor the new value
ever enters the audit payload.

### 9. Clearing and retention

SS-260 does not implement clear/delete. Empty string and `null` are rejected
as invalid input. Retention/deletion, legal basis, and any field-level
encryption or backup-encryption policy remain client/security decisions and
are not silently invented here.

### 10. Verification boundary

Checksum validation is structural only. No external identity-verification
service, SMS lookup, or government-registry call is used. The UI and API must
not claim that a passing checksum confirms identity.

## Consequences

- Existing users remain valid with `NULL`.
- Old application versions ignore the new column; deployments must migrate
  before starting the new API.
- The profile API composes `User` and `UserProfile` and returns only safe
  National ID fields.
- The storefront can provide immediate advisory feedback, but the server
  remains authoritative.
- SS-261 remains blocked by B-5 and is not partially introduced.

## References

- `docs/01-planning/ux-redesign-audit-2026-10.md` §B.1 C2/C3, §E, §F SS-260.
- Ebrahim Byagowi, public-domain Iranian National Code checker:
  <https://gist.github.com/ebraminio/5292017>
- Global IDs, Iran National Code format:
  <https://globalids.dev/ir/national-code/>
