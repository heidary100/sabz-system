# Sabz System Platform
# User Lifecycle

Version: 1.0

---

# Overview

This document defines the account status model for the identity domain. It describes every state a User can occupy, the transitions between states, and the events that trigger them.

The status is stored in `User.status` as the `UserStatus` enum:

- `PENDING_OTP`
- `ACTIVE`
- `SUSPENDED`
- `LOCKED`

Deletion is handled separately through soft delete (`deleted_at`) and is not a status value.

Related: [Identity Data Model & Database Decisions](identity-data-model.md), [Prisma Schema Proposal](prisma-schema-proposal.md).

---

# 1. States

## PENDING_OTP

The account has been created but not yet verified.

- Set at registration, before OTP verification.
- Cannot log in.
- Cannot access protected resources.

## ACTIVE

The account is verified and can authenticate.

- Default operational state.
- Can log in and access authorized resources.

## SUSPENDED

The account is disabled by an operator or administrator.

- Cannot log in.
- Cannot access protected resources.
- Reversible by an operator or administrator.

## LOCKED

The account is temporarily locked after repeated failed login attempts.

- Cannot log in.
- Reversible automatically after the lockout period expires or by an administrator (unlock).
- Different from SUSPENDED: LOCKED is a temporary security measure; SUSPENDED is an administrative decision.

---

# 2. State Diagram

```
                register
   Guest ────────────────────► PENDING_OTP
                                  │
                                  │ OTP verified
                                  ▼
                              ACTIVE
                             ▲  │  │
        unlock / timeout     │  │  │  exceeded failed login attempts
                             │  │  ▼
                             │  │  LOCKED
                             │  │
                             │  └────────────► suspend (operator/admin)
                             │                SUSPENDED
                             │                 │
                             └─────────────────┴──► unsuspend (operator/admin)

Any ACTIVE state ──► soft delete (deleted_at set, record hidden)
```

---

# 3. Transitions

| From | To | Trigger | Actor | Audit Event |
|------|----|---------|-------|-------------|
| Guest | PENDING_OTP | Registration (AUTH-US-001) | Guest | Registration |
| PENDING_OTP | ACTIVE | OTP verified | Guest | Registration |
| ACTIVE | LOCKED | Repeated failed login attempts exceed threshold | System | Failed login |
| LOCKED | ACTIVE | Lockout period expires or administrator unlocks | System / Administrator (ADMIN) | Account unlock |
| ACTIVE | SUSPENDED | Account suspension | Operator / Administrator (ADMIN) | Account suspension |
| SUSPENDED | ACTIVE | Account unsuspended | Operator / Administrator (ADMIN) | Account unsuspended |
| Any active state | (soft-deleted) | Delete / anonymization request | Administrator (ADMIN) | Account deletion |

> The unlock/suspend/delete transitions are **future** workflows (not yet
> implemented); the implemented admin role is `ADMIN` (no `SUPER_ADMIN`).

---

# 4. Rules

- Accounts in `PENDING_OTP`, `SUSPENDED`, or `LOCKED` states cannot log in or access protected resources (AUTH-002).
- Lockout threshold, lockout duration, and unlock policy follow the security requirements in the Authentication Specification (§11).
- A password reset invalidates existing sessions; the account remains in its current state.
- Soft-deleted accounts are hidden from queries but retained for audit and referential integrity (see [Identity Data Model](identity-data-model.md) §4).
- Only operators and administrators may suspend accounts; only Super Administrators may assign roles or unlock accounts (AUTH-006, Authentication Specification §9).

  > **Status: known gap / deferred.** Account suspension, lockout/unlock, and
  > role assignment workflows are not yet implemented. There is no `SUPER_ADMIN`
  > role; the implemented admin role is `ADMIN`. AUTH-006 is preserved as a
  > future requirement (see Roles & Permissions Matrix §10).

---

# 5. Related Audit Events

The following lifecycle actions must be recorded in the audit log (Authentication Specification §12):

- Registration
- Failed login
- Login
- Logout
- Password change
- Password reset
- Account suspension
- Account unsuspension
- Account unlock
- Session revocation
- Role assignment
