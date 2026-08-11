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

Response (successful verification activates the account and issues a token pair):
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

Request Body:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Response (a new token pair; the presented refresh token is rotated and the old one invalidated):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Errors: `401` when the refresh token is invalid, expired, revoked, or already rotated.

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

Revokes the current session; its refresh token can no longer be used. The access token remains valid until it expires (15 minutes).

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
