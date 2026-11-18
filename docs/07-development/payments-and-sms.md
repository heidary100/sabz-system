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
