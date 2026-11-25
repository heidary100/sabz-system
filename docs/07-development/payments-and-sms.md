# Payments and SMS Readiness

Status: intentionally fail-closed. No live payment or SMS traffic is sent.

## SnappPay / DigiPay

The API exposes readiness only. The official merchant protocol, callback
signature rules, sandbox credentials and idempotency semantics are not present
in this repository, so `PaymentProviderService` never calls a provider and
never marks an order paid. `POST /api/v1/payments/providers/:code/initiate`
returns `initialized: false` with an operator-safe reason.

Environment keys (provider code = prefix):

```dotenv
SNAPPAY_ENABLED=false
SNAPPAY_CLIENT_ID=
SNAPPAY_CLIENT_SECRET=
SNAPPAY_BASE_URL=
SNAPPAY_CALLBACK_URL=
SNAPPAY_SANDBOX=false

DIGIPAY_ENABLED=false
DIGIPAY_CLIENT_ID=
DIGIPAY_CLIENT_SECRET=
DIGIPAY_BASE_URL=
DIGIPAY_CALLBACK_URL=
DIGIPAY_SANDBOX=false
```

Even with every key populated, the provider state remains `UNCONFIGURED`
until a verified protocol adapter is implemented. `ONLINE` checkout also
remains gated by `PAYMENTS_ONLINE_ENABLED`.

## SMS

No SMS provider has been selected. `NOTIFICATIONS_SMS_ENABLED=true` only emits
a log line through the provider-neutral stub in `NotificationService`; there
is no delivery claim. A real provider must be added behind an injected port
without changing notification emitters.

## Release-readiness status (2026-11-19)

The first-party catalog, checkout, COD, invoices, chat, notifications, PWAs
and admin workflows are implemented and verified. Only the two external
provider connections below remain unconnected:

| Provider | Current state | Why it cannot be connected here | What is already verified |
|---|---|---|---|
| SnappPay | `DISABLED` / `UNCONFIGURED`, fail-closed | No merchant agreement, official API contract, sandbox credentials or callback-signing details | Readiness endpoint, missing-key reporting, disabled state, no-payment-success behavior |
| DigiPay | `DISABLED` / `UNCONFIGURED`, fail-closed | Same missing merchant/API contract and credentials | Readiness endpoint, missing-key reporting, disabled state, no-payment-success behavior |
| SMS | provider-neutral stub; disabled | No provider selected; no account, sender line or delivery-receipt contract | Disabled default, log-only stub, notification persistence and WebSocket delivery remain independent |

### SnappPay onboarding steps

1. Obtain the official SnappPay merchant onboarding pack: merchant ID,
   client ID/secret (or the provider's current auth contract), sandbox and
   production base URLs, and the official API/OpenAPI document.
2. Obtain the documented callback/IPN URL requirements, signature algorithm,
   replay/idempotency rules and required return URL.
3. Set `SNAPPAY_ENABLED=true`, `SNAPPAY_CLIENT_ID`, `SNAPPAY_CLIENT_SECRET`,
   `SNAPPAY_BASE_URL`, `SNAPPAY_CALLBACK_URL`, and `SNAPPAY_SANDBOX=true` in
   a non-production secret store. Start with sandbox only.
4. Implement the provider-specific token flow, payment creation, redirect,
   callback verification and settlement in the existing
   `PaymentProviderService` boundary. `initiate()` must not return a redirect
   until the provider has returned a verified payment handle.
5. Add provider contract tests and an isolated sandbox E2E test. Do not mark
   an order paid from a frontend redirect; only a verified, idempotent provider
   callback may settle it.
6. Keep `PAYMENTS_ONLINE_ENABLED=false` until the complete sandbox flow,
   callback replay tests, amount tamper tests and operator runbook are signed
   off.

### DigiPay onboarding steps

The same steps apply with the `DIGIPAY_*` variables. Confirm the provider's
current authentication flow and callback signature contract from its official
merchant documentation; do not reuse guessed SnappPay fields.

### SMS onboarding steps

1. Select a provider and obtain an account, sender line, API base URL,
   credentials and delivery-report/webhook contract.
2. Implement a provider-neutral `SmsProvider` port and inject it into
   `NotificationService`; keep the current disabled/fail-closed behavior when
   configuration is absent.
3. Add opt-in messaging policy, retry/backoff, idempotency keys, delivery
   receipts and tests for missing credentials and provider failure.
4. Set `NOTIFICATIONS_SMS_ENABLED=true` only after the provider adapter is
   verified. In-app notifications must remain fully functional without SMS.
5. Never log message bodies, national IDs or credentials in production.
