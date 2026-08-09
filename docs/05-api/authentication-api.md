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

---

# Authentication Flow

1. User registers with phone number and password.
2. System sends OTP via SMS.
3. User verifies OTP to activate account.
4. On login, system returns JWT access token and refresh token.
5. Client includes access token in `Authorization: Bearer` header.
6. When access token expires, client uses refresh token to get new tokens.
