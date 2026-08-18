# Sabz System Platform
# Feature Specification – Authentication & Identity

Version: 1.0

Module ID: AUTH-001

Status: Approved for Development

Milestone: 1

Priority: Critical (P1)

---

# 1. Purpose

The Authentication & Identity module provides secure user authentication, identity verification, account management, and authorization for all users of the Sabz System Platform.

It is the foundation for every other module.

---

# 2. Goals

- Secure user authentication
- Mobile-first registration
- OTP verification
- JWT-based authorization
- Role-Based Access Control (RBAC)
- Session management
- Password recovery
- Profile management

---

# 3. Actors

- Guest
- Customer (B2C)
- Partner (B2B)
- Operator
- Administrator (ADMIN)

---

# 4. Business Rules

### AUTH-001

Every user must register using a unique mobile number.

---

### AUTH-002

A user cannot access protected resources until authenticated.

---

### AUTH-003

A partner account is initially treated as a standard customer until the partner application is approved.

---

### AUTH-004

Only approved partners may access partner pricing.

---

### AUTH-005

Users may hold multiple roles simultaneously (e.g., Customer + Partner).

---

### AUTH-006

Administrative roles are assigned only by Super Administrators.

> **Status: partially implemented (M1).** There is no `SUPER_ADMIN` role in the
> implemented role model (`CUSTOMER`, `PARTNER`, `OPERATOR`, `ADMIN`). The M1
> role-administration API (SS-063) implements the administrative
> assignment/removal of roles with `ADMIN` as the privileged role: `ADMIN`
> may assign any role (including `ADMIN`) to another user and may remove
> non-`ADMIN` roles, but may not remove the `ADMIN` role or modify their own
> roles. Future privileged-administrator concepts — including a
> `SUPER_ADMIN` role and role/permission CRUD — remain deferred (see Roles &
> Permissions Matrix §10).

---

# 5. Functional Requirements

## Registration

The system shall allow users to:

- Register using mobile number
- Enter first and last name
- Set password
- Accept Terms of Service
- Receive OTP
- Verify OTP
- Activate account

---

## Login

Users shall authenticate using:

- Mobile number
- Password

Future support:

- Passwordless OTP login
- OAuth (Google/Apple)

---

## Logout

Users shall:

- Logout from current device
- Logout from all devices

---

## Password Recovery

The system shall:

- Verify identity using OTP
- Allow password reset
- Invalidate previous refresh tokens

---

## User Profile

Users may:

- Update profile
- Change password
- Upload avatar
- Manage addresses
- Update email

---

# 6. User Stories

### AUTH-US-001

As a guest,

I want to register using my mobile number,

so I can create an account.

Acceptance Criteria

- Mobile number is unique.
- Password meets security requirements.
- OTP is sent.
- Account remains inactive until OTP verification.

---

### AUTH-US-002

As a user,

I want to log in,

so I can access my account.

Acceptance Criteria

- Valid credentials return JWT access and refresh tokens.
- Invalid credentials return an appropriate error.
- Inactive accounts cannot log in.

---

### AUTH-US-003

As a user,

I want to recover my password,

so I can regain access if I forget it.

Acceptance Criteria

- Identity is verified via OTP.
- Password reset invalidates existing sessions.

---

### AUTH-US-004

As a user,

I want to manage my profile,

so my information remains up to date.

Acceptance Criteria

- Users can edit only their own profile.
- Changes are validated.
- Audit logs record profile updates.

---

# 7. API Endpoints

The current authentication flow is OTP-first: users authenticate by requesting and verifying an OTP, and the account is created and activated on first verification. Password-based registration and login are not yet implemented.

Current

POST /auth/request-otp

POST /auth/verify-otp

POST /auth/refresh

GET /auth/me

GET /auth/profile

PATCH /auth/profile

POST /auth/logout

Future / Not Yet Implemented

POST /auth/register

POST /auth/login

POST /auth/forgot-password

POST /auth/reset-password

POST /auth/logout-all

---

# 8. Validation Rules

Mobile Number

- Required
- Valid Iranian mobile format
- Unique

Password

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

First Name

- Required
- Maximum 100 characters

Last Name

- Required
- Maximum 100 characters

Email

- Optional
- Valid format
- Unique if provided

---

# 9. Authorization

Guest

- Register
- Login
- Request OTP

Authenticated User

- View own profile
- Update own profile
- Logout

Operator

- Read user profiles
- Suspend and unsuspend accounts (implemented in SS-062; operators may not act on `ADMIN`-role accounts)

Administrator (ADMIN)

- Full user management
- Suspend / unsuspend / unlock accounts (implemented in SS-062)
- Assign roles (future — deferred, see Roles & Permissions Matrix §10)

---

# 10. Session Management

Access Token

- Lifetime: 15 minutes

Refresh Token

- Lifetime: 30 days

The system shall:

- Support multiple concurrent devices.
- Allow revoking individual sessions.
- Allow revoking all sessions.

---

# 11. Security Requirements

Passwords

- Hashed using Argon2id.

OTP

- Six digits.
- Expires after 2 minutes.
- Maximum 3 failed verification attempts per issued code. Exceeding the per-code limit invalidates the code and requires a new OTP request.
- Maximum 5 failed verification attempts per mobile number per sliding 10-minute window, across all OTP requests. The window is refreshed by each failed attempt, so an active attacker stays blocked. Requesting a new OTP never resets this counter; only a successful verification does.
- Requesting a new OTP resets only the per-code attempt counter; the cross-code failure window is preserved.

Rate Limiting

- OTP request endpoint: maximum 3 OTP requests per mobile number per sliding 60-second window; maximum 15 OTP requests per client IP per sliding 60-second window (across all mobile numbers). Each attempt refreshes its own window.
- OTP verification endpoint: maximum 10 failed verification attempts per client IP per sliding 10-minute window (across all mobile numbers).
- Global per-IP, per-route throttling (100 requests / 60 seconds, configurable) applies to all endpoints, including OTP endpoints.
- All OTP abuse counters are stored in Redis and survive application restarts.
- Mobile numbers are canonicalized to the `+98` form at the API boundary (DTO transformation in the authentication flow) before any rate-limit key, database record, or audit entry is produced, so different input formats of the same number cannot bypass limits. Any future endpoint accepting a mobile number must apply the same normalization.
- Login endpoint (password-based login, not yet implemented)
- Password reset endpoint (not yet implemented)

Additional Controls

- CSRF protection where applicable.
- Secure HTTP-only cookies if refresh tokens are cookie-based.
- Account lockout after repeated failed login attempts.

---

# 12. Audit Events

The system shall record (implemented event names):

- Registration → `ACCOUNT_ACTIVATED` (first OTP verification activating a `PENDING_OTP` account)
- Login → `OTP_VERIFIED` + `SESSION_CREATED`
- OTP request → `OTP_REQUESTED`
- Failed OTP verification → `OTP_FAILED` (with a fixed reason)
- Failed refresh attempts → `AUTHENTICATION_FAILED` (identifiable invalid sessions only)
- Logout / session revocation → `SESSION_REVOKED`
- Profile update → `PROFILE_UPDATE`
- Role assignment → reserved for the future role-management flow
- Account suspension → `USER_SUSPENDED` (SS-062; also revokes the account's sessions)
- Account unsuspension → `USER_UNSUSPENDED` (SS-062)
- Account unlock → `USER_UNLOCKED` (SS-062)

Audit entries never contain OTP codes, tokens (raw or hashed), passwords, or secret material.

---

# 13. Error Handling

Common responses:

- Invalid credentials
- Duplicate mobile number
- Invalid OTP
- Expired OTP
- Locked account
- Unauthorized
- Forbidden
- Validation errors

No sensitive implementation details shall be exposed in error messages.

---

# 14. Dependencies

Required by:

- Partner Management
- Orders
- Pricing
- Inventory
- Administration
- Notifications

This module must be completed before development of dependent modules.

---

# 15. Test Scenarios

Positive Tests

- Register successfully.
- Verify OTP.
- Log in.
- Refresh token.
- Update profile.
- Reset password.
- Logout.

Negative Tests

- Duplicate mobile number.
- Invalid OTP.
- Expired OTP.
- Incorrect password.
- Locked account.
- Missing required fields.
- Expired refresh token.
- Unauthorized profile update.

---

# 16. Definition of Done

The Authentication & Identity module is complete when:

- All functional requirements are implemented.
- Acceptance criteria pass.
- Security requirements are satisfied.
- Audit logging is operational.
- Unit and integration tests pass.
- API documentation is updated.
- The module is accepted during the Milestone 1 review.