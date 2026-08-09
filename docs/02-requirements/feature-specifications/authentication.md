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
- Super Administrator

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

Public

POST /auth/register

POST /auth/login

POST /auth/send-otp

POST /auth/verify-otp

POST /auth/forgot-password

POST /auth/reset-password

Authenticated

GET /auth/profile

PATCH /auth/profile

POST /auth/logout

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
- Suspend accounts

Super Administrator

- Full user management
- Assign roles
- Unlock accounts

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
- Maximum 5 verification attempts.

Rate Limiting

- Login endpoint
- OTP endpoint
- Password reset endpoint

Additional Controls

- CSRF protection where applicable.
- Secure HTTP-only cookies if refresh tokens are cookie-based.
- Account lockout after repeated failed login attempts.

---

# 12. Audit Events

The system shall record:

- Registration
- Login
- Logout
- Failed login
- Password change
- Password reset
- Profile update
- Role assignment
- Account suspension
- Session revocation

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