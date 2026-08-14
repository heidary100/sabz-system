# Sabz System Platform
# Authentication API

Version: 1.0

---

# Overview

This document specifies the authentication and identity management API endpoints. For the complete API specification, see [API Specification](api-specification.md).

The current authentication flow is OTP-first: there is no password-based registration or login. A user authenticates by requesting an OTP for their mobile number and verifying it. The account is created and activated on first successful verification.

---

# Endpoints

## Request OTP

```
POST /api/v1/auth/request-otp
```

Request Body:
```json
{
  "mobile": "+989123456789"
}
```

Response:
```json
{
  "sent": true,
  "expiresIn": 120
}
```

- `expiresIn` is the OTP lifetime in seconds (2 minutes). The OTP is stored server-side only and is **never** returned in the API response — in any environment, including development.
- In development only (`NODE_ENV=development`), the OTP code is always `123456`; see [Local Environment](../07-development/local-environment.md). It is never returned by the API.

Errors: `400` when `mobile` is not a valid Iranian mobile number; `429` when more than 3 OTP requests are made for the same mobile number within a 60-second window, or more than 15 OTP requests are made from the same IP within a 60-second window.

## OTP Verification

```
POST /api/v1/auth/verify-otp
```

Request Body:
```json
{
  "mobile": "+989123456789",
  "code": "123456"
}
```

- `code` must be exactly 6 digits.

Response (successful verification creates the account on first use, activates it, issues a token pair, and sets the `sabz_refresh_token` HttpOnly cookie for web clients):
```json
{
  "verified": true,
  "user": {
    "id": "uuid",
    "mobile": "+989123456789",
    "status": "ACTIVE"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

- The user record is created on first successful verification; subsequent verifications reuse the existing record. The account is marked `ACTIVE` unless it is `SUSPENDED` or `LOCKED`. Soft-deleted accounts are hidden from authentication lookups and cannot be reactivated through OTP verification; re-registering a soft-deleted mobile requires an explicit restoration or permanent cleanup step (see [Identity Data Model](../04-database/identity-data-model.md) §4).

Optional request header `x-device-id` records a client device identifier on the session.

Errors: `400` when the payload is invalid or the OTP code is incorrect; `410` when the OTP has expired; `429` when more than 3 failed verification attempts have been made for the current OTP, or more than 5 failed verifications have been made for the mobile within a rolling 10-minute window (across all OTP requests), or more than 10 failed verifications have been made from the same IP within a rolling 10-minute window (the OTP is then invalidated and a new one must be requested); `403` when the account is `SUSPENDED`, `LOCKED`, or soft-deleted.

Expired-OTP attempts (`410`) do not count toward any failed-verification limit.

## OTP Abuse Prevention

All OTP state and abuse-prevention counters live in Redis and therefore survive application restarts. Mobile numbers are canonicalized to the `+98` form by DTO transformation at the API boundary before any key is derived, so `09123456789` and `+989123456789` are treated as the same number. All sliding-window counters are refreshed by every attempt, including blocked ones, so an actively retrying client keeps extending its own block.

| State/control | Redis key (conceptual) | TTL | Semantics |
|---|---|---|---|
| Issued OTP code | `auth:otp:{mobile}` | 120 s | The current code, stored server-side only; never returned by the API. A new request overwrites it. |
| Per-code failed attempts | `auth:otp:attempts:{mobile}` | 120 s (sliding) | Failed guesses against the currently issued code; reset when a new code is requested. Exceeding 3 invalidates the code and a new OTP must be requested. |
| Cross-code failure window | `auth:otp:fail:{mobile}` | 600 s (sliding) | Failed verifications per mobile across all OTP requests; **never reset by requesting a new OTP**; cleared by a successful verification. Exceeding 5 invalidates the current code. |
| Request limit, per mobile | `auth:otp:rate:{mobile}` | 60 s (sliding) | 3 OTP requests per minute per mobile. |
| Request limit, per IP | `auth:otp:rate:ip:{ip}` | 60 s (sliding) | 15 OTP requests per minute per IP, across all mobile numbers. |
| Failure window, per IP | `auth:otp:fail:ip:{ip}` | 600 s (sliding) | 10 failed verifications per 10 minutes per IP, across all mobile numbers; cleared by a successful verification from that IP. |

All counters are incremented atomically in Redis; expired-OTP attempts do not consume them. Per-IP limits depend on the client IP the application observes: set the `TRUST_PROXY` environment variable (`true`, a hop count, or a proxy address) when the API runs behind a reverse proxy or load balancer; leave it unset when the API is reached directly. The response for every `429` is intentionally generic and does not reveal which limit was exceeded.

Mobile canonicalization applies to newly created records only; mobile numbers already stored in a non-canonical form (e.g. `09123456789`) are not rewritten. Pre-release, no production data exists in a non-canonical form, so no backfill is performed; future deployments must store mobiles in the canonical `+98` form.

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

Errors: `401` when the refresh token is missing, invalid, expired, revoked, or already rotated, or when the user is no longer `ACTIVE`.

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

Returns the authenticated user's identity, profile, and role names. `address` is the user's personal/contact address (SS-028) — it is not the partner business address, which is managed through the partner application flow. Roles are resolved from the `UserRole` → `Role` tables and are the authorization source of truth. The target user is always resolved from the JWT identity; no user identifier is accepted from the client. Authentication data (password hash, refresh tokens, OTP data) is never returned.

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

Only the editable profile fields (`firstName`, `lastName`, `address`) are accepted. `address` is the user's personal/contact address (SS-028), not a business address; partner business address fields are managed through the partner application. All other fields — including user id, mobile, status, roles, and verification state — are ignored/stripped; the target user is always resolved from the JWT identity, so a user can never modify another user's profile. Phone identity changes are not supported through this endpoint (they require a dedicated verification flow). Every profile update is recorded in the audit log.

Validation: `firstName` and `lastName` must be non-null strings of at most 100 characters; `address` must be a string of at most 500 characters and may be set to `null` to clear it.

Errors: `401` when unauthenticated; `400` when the payload is invalid (e.g. a field exceeds its maximum length).

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

# Audit Events

Authentication and authorization security events are recorded in the `AuditLog` table (see [Database Design Specification](../04-database/database-design-specification.md) §8). Session and account events are written atomically in the same database transaction as the state change; OTP events are best-effort (a failure to persist an audit entry never blocks or changes the OTP flow).

Recorded events:

| Event | Entity | Context |
|---|---|---|
| `OTP_REQUESTED` | `User` | mobile, request IP |
| `OTP_VERIFIED` | `User` | mobile, request IP |
| `OTP_FAILED` | `User` | mobile, fixed reason (`INVALID_CODE`, `EXPIRED`, `MAX_ATTEMPTS`), request IP |
| `ACCOUNT_ACTIVATED` | `User` | userId, status before/after, request IP |
| `SESSION_CREATED` | `UserSession` | userId, session id, request IP |
| `SESSION_REFRESHED` | `UserSession` | userId, session id, request IP |
| `SESSION_REVOKED` | `UserSession` | userId, session id, request IP |
| `AUTHENTICATION_FAILED` | `UserSession` | userId, session id, fixed reason (`SESSION_NOT_FOUND`, `SESSION_REVOKED`, `USER_MISMATCH`, `ACCOUNT_NOT_ACTIVE`, `TOKEN_REUSE`), request IP |

Audit entries never contain OTP codes, tokens (raw or hashed), JWT payloads, passwords, or any secret material. `LOGOUT` maps to a single `SESSION_REVOKED` entry. Role assignment/removal events are reserved for the future role-management flow. Account suspension/lockout audit events are reserved for when those workflows exist.

---

# Future Endpoints (Not Yet Implemented)

The following endpoints are documented in earlier requirements and remain **planned only**. They are not implemented and must not be relied upon:

- `POST /api/v1/auth/register` — password-based customer registration.
- `POST /api/v1/auth/login` — password-based login.
- `POST /api/v1/auth/partner/register` — partner registration.
- `POST /api/v1/auth/forgot-password` / `POST /api/v1/auth/reset-password` — password recovery.
- `POST /api/v1/auth/logout-all` — revoke all sessions.

The current flow is OTP-first and password-based functionality has no defined timeline.

---

# Authentication Flow

1. Client requests an OTP for the mobile number (`POST /api/v1/auth/request-otp`). The OTP is generated and stored server-side with a 2-minute lifetime; it is never returned in the response.
2. Client submits the OTP (`POST /api/v1/auth/verify-otp`). On success, the user account is created on first verification (or its existing record reused) and set to `ACTIVE`, and a JWT access token plus refresh token pair is issued. Web clients also receive the refresh token as the `sabz_refresh_token` HttpOnly cookie.
3. Client includes the access token in `Authorization: Bearer` header for protected endpoints.
4. When the access token expires, client uses the refresh token (`POST /api/v1/auth/refresh`) to get a new token pair.
5. Client logs out (`POST /api/v1/auth/logout`) to revoke the session.

# Session & Token Rules

- Access token lifetime: 15 minutes.
- Refresh token lifetime: 30 days.
- Each refresh request rotates the refresh token; the previously issued refresh token becomes invalid.
- Refresh tokens are stored only as SHA-256 hashes in the `UserSession` table. Raw refresh tokens are never persisted.
- Logout revokes the session, disabling its refresh token.
- Web clients store the access token in memory and use the `sabz_refresh_token` HttpOnly cookie (`SameSite=Lax`, `Secure` in production, scoped to `/api/v1/auth`) for refresh and logout. The refresh token is additionally returned in response bodies for non-browser clients (e.g. mobile applications).
- The API must be called with credentials (`credentials: include`); the allowed browser origins are configured via the `CORS_ORIGINS` environment variable.
