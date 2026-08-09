# Sabz System Platform
# Authentication Flow

Version: 1.0

---

# Customer Registration & Login Flow

## Registration

```
[Customer] -> POST /auth/register (phone, password, name)
    -> [System] creates User with status UNVERIFIED
    -> [System] generates OTP
    -> [SMS Provider] sends OTP to customer phone
    -> [Customer] -> POST /auth/verify-otp (phone, code)
    -> [System] validates OTP via Redis
    -> [System] sets User status to ACTIVE
    -> [System] returns JWT tokens
```

## Login

```
[Customer] -> POST /auth/login (phone, password)
    -> [System] validates credentials
    -> [System] generates JWT access token + refresh token
    -> [System] stores refresh token in Redis
    -> [System] returns tokens to customer
```

## Token Refresh

```
[Customer] -> POST /auth/refresh (refreshToken)
    -> [System] validates refresh token via Redis
    -> [System] generates new access token + refresh token
    -> [System] invalidates old refresh token
    -> [System] returns new tokens
```

## Partner Registration

```
[Partner] -> POST /auth/partner/register (phone, password, company info)
    -> [System] creates User with role PARTNER, status UNVERIFIED
    -> [System] creates Partner record with verification PENDING
    -> [SMS Provider] sends OTP for phone verification
    -> [Partner] -> POST /auth/verify-otp
    -> [System] activates account (phone verified, business pending)
    -> [Operator] reviews business documents
    -> [Operator] approves/rejects partner application
    -> [System] assigns PartnerTier
    -> [System] notifies partner via SMS
```

---

# Security Notes

- Passwords are hashed using bcrypt.
- JWT tokens have configurable expiration (default: 15min access, 7d refresh).
- OTP codes expire after 2 minutes.
- Rate limiting applies to login and OTP endpoints.
- Failed login attempts are tracked and locked after 5 failures.
