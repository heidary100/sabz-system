# Sabz System Platform
# Authentication Flow

Version: 1.0

---

# OTP-First Authentication Flow

The current authentication flow is OTP-first. There is no password-based registration or login; password and OAuth flows are future functionality.

## OTP Request

```
[Client] -> POST /auth/request-otp (mobile)
    -> [System] rate limits requests (max 5 per 60 seconds per mobile number)
    -> [System] generates a 6-digit OTP, stored in Redis (2-minute lifetime)
    -> [System] returns { sent: true, expiresIn: 120 } — the code is never returned
```

## OTP Verification & Session Creation

```
[Client] -> POST /auth/verify-otp (mobile, code)
    -> [System] validates the OTP (max 5 attempts; invalid -> 400, expired -> 410, exhausted -> 429)
    -> [System] creates the user on first verification (status -> ACTIVE)
    -> [System] creates a UserSession record and issues a JWT access token + refresh token
    -> [System] sets the sabz_refresh_token HttpOnly cookie for web clients
    -> [System] returns { verified, user, accessToken, refreshToken }
```

## Token Refresh

```
[Client] -> POST /auth/refresh (refreshToken | sabz_refresh_token cookie)
    -> [System] verifies the refresh token and checks the UserSession (hash match, not revoked, not expired)
    -> [System] rotates the refresh token (new SHA-256 hash on the same session row)
    -> [System] returns a new token pair and rotates the cookie
```

## Logout

```
[Client] -> POST /auth/logout (Authorization: Bearer <accessToken>)
    -> [System] revokes the session
    -> [System] clears the sabz_refresh_token cookie
    -> [System] returns { loggedOut: true }
```

---

# Security Notes

- OTP codes are 6 digits and expire after 2 minutes. They are stored only in Redis and are never returned by the API. In development only (`NODE_ENV=development`) the code is always `123456`; it cannot be enabled in production.
- Rate limiting applies to the OTP endpoints: max 5 requests per 60 seconds per mobile number, and max 5 verification attempts per OTP.
- Refresh tokens are stored only as SHA-256 hashes in the `UserSession` table; raw refresh tokens are never persisted.
- JWT lifetimes are configurable (default: 15 minutes access, 30 days refresh).

---

# Future Flows (Not Yet Implemented)

- Password-based registration and login (`POST /auth/register`, `POST /auth/login`).
- Partner registration (`POST /auth/partner/register`).
- Password recovery (`POST /auth/forgot-password`, `POST /auth/reset-password`).
- Revoke all sessions (`POST /auth/logout-all`).
