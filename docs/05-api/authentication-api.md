# Sabz System Platform
# Authentication API

Version: 1.0

---

# Overview

This document specifies the authentication and identity management API endpoints. For the complete API specification, see [API Specification](api-specification.md).

---

# Endpoints

## Customer Registration

```
POST /api/v1/auth/register
```

Request Body:
```json
{
  "phone": "+989123456789",
  "password": "securePassword123",
  "firstName": "Ali",
  "lastName": "Ahmadi"
}
```

## OTP Verification

```
POST /api/v1/auth/verify-otp
```

Request Body:
```json
{
  "phone": "+989123456789",
  "code": "1234"
}
```

Response (successful verification activates the account and issues a token pair, and sets the `sabz_refresh_token` HttpOnly cookie for web clients):
```json
{
  "verified": true,
  "user": {
    "id": "uuid",
    "phone": "+989123456789",
    "status": "ACTIVE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Optional request header `x-device-id` records a client device identifier on the session.

## Login

```
POST /api/v1/auth/login
```

Request Body:
```json
{
  "phone": "+989123456789",
  "password": "securePassword123"
}
```

Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "phone": "+989123456789",
    "role": "CUSTOMER"
  }
}
```

## Refresh Token

```
POST /api/v1/auth/refresh
```

Request Body (optional):
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

The `refreshToken` field may be omitted when the refresh token is sent as an HttpOnly cookie (`sabz_refresh_token`). Web clients are expected to use the cookie.

Response (a new token pair; the presented refresh token is rotated and the old one invalidated, and the `sabz_refresh_token` cookie is rotated):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Errors: `401` when the refresh token is invalid, expired, revoked, or already rotated.

## Current User

```
GET /api/v1/auth/me
```

Headers:
```
Authorization: Bearer <accessToken>
```

Response:
```json
{
  "id": "uuid",
  "mobile": "+989123456789",
  "status": "ACTIVE",
  "roles": ["OPERATOR", "ADMIN"]
}
```

Returns the authenticated user's identity and role names. Used by the admin application to gate navigation; authorization on backend endpoints is enforced independently via RBAC.

## Get Profile

```
GET /api/v1/auth/profile
```

Headers:
```
Authorization: Bearer <accessToken>
```

Response:
```json
{
  "id": "uuid",
  "mobile": "+989123456789",
  "email": null,
  "status": "ACTIVE",
  "firstName": "Ali",
  "lastName": "Ahmadi",
  "address": null,
  "avatarUrl": null,
  "roles": ["CUSTOMER"]
}
```

Returns the authenticated user's identity, profile, and role names. Roles are resolved from the `UserRole` → `Role` tables and are the authorization source of truth. The target user is always resolved from the JWT identity; no user identifier is accepted from the client. Authentication data (password hash, refresh tokens, OTP data) is never returned.

## Update Profile

```
PATCH /api/v1/auth/profile
```

Headers:
```
Authorization: Bearer <accessToken>
```

Request Body (all fields optional; an empty payload is a no-op returning the profile unchanged):
```json
{
  "firstName": "Ali",
  "lastName": "Ahmadi",
  "address": "Tehran, Iran"
}
```

Response: the updated profile in the same shape as `GET /api/v1/auth/profile`.

Only the editable profile fields (`firstName`, `lastName`, `address`) are accepted. All other fields — including user id, mobile, status, roles, and verification state — are ignored/stripped; the target user is always resolved from the JWT identity, so a user can never modify another user's profile. Phone identity changes are not supported through this endpoint (they require a dedicated verification flow). Every profile update is recorded in the audit log.

Validation: `firstName` and `lastName` must be non-null strings of at most 100 characters; `address` must be a string of at most 500 characters and may be set to `null` to clear it.

Errors: `401` when unauthenticated; `400` when the payload is invalid (e.g. a field exceeds its maximum length).

## Partner Registration

```
POST /api/v1/auth/partner/register
```

Request Body:
```json
{
  "phone": "+989123456789",
  "password": "securePassword123",
  "companyName": "Example Co.",
  "businessType": "WHOLESALER",
  "nationalId": "1234567890"
}
```

## Logout

```
POST /api/v1/auth/logout
```

Headers:
```
Authorization: Bearer <accessToken>
```

Response:
```json
{
  "loggedOut": true
}
```

Revokes the current session; its refresh token can no longer be used and the `sabz_refresh_token` cookie is cleared. The access token remains valid until it expires (15 minutes).

---

# Authentication Flow

1. User registers with phone number and password.
2. System sends OTP via SMS.
3. User verifies OTP to activate account and receives a JWT access token and refresh token.
4. Client includes access token in `Authorization: Bearer` header.
5. When access token expires, client uses refresh token to get new tokens.

# Session & Token Rules

- Access token lifetime: 15 minutes.
- Refresh token lifetime: 30 days.
- Each refresh request rotates the refresh token; the previously issued refresh token becomes invalid.
- Refresh tokens are stored only as SHA-256 hashes in the `UserSession` table. Raw refresh tokens are never persisted.
- Logout revokes the session, disabling its refresh token.
- Web clients store the access token in memory and use the `sabz_refresh_token` HttpOnly cookie (`SameSite=Lax`, `Secure` in production, scoped to `/api/v1/auth`) for refresh and logout. The refresh token is additionally returned in response bodies for non-browser clients (e.g. mobile applications).
- The API must be called with credentials (`credentials: include`); the allowed browser origins are configured via the `CORS_ORIGINS` environment variable.
