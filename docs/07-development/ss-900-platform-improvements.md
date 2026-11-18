# SS-900 Platform Improvements — Implementation Notes

Status: implemented on `feat/ss-900-platform-improvements`; not merged or
deployed. Source brief: [`docs/02-requirements/sabz-system-improvements-implementation-brief.md`](../02-requirements/sabz-system-improvements-implementation-brief.md).

This page records the operational contract for the SS-900 work: what changed,
which environment variables exist, how to provision optional local assets, and
what is intentionally blocked. It is not a replacement for the feature brief.

## 1. Data model and migration

Migration: `apps/api/prisma/migrations/20261117224022_ss_900_platform_improvements/`.

The migration is additive/backfilling and was exercised against disposable
PostgreSQL databases only. It adds:

- typed attributes: `Attribute.valueType`, `unit`, `isComparable`,
  `AttributeValue.normalizedValue/numericValue/isActive`;
- category assignments/inheritance: `CategoryAttribute`;
- normalized product values: `ProductAttributeValue` (TEXT/NUMBER/BOOLEAN,
  single SELECT via `optionId`, multi-select rows);
- manual FX history: `CurrencyRate` (`USD`/`AED`, Rial per unit);
- purpose-built chat: `ChatConversation`, `ChatMessage`;
- notification priority/preferences/push: `Notification.priority`,
  `NotificationPreference`, `PushSubscription`;
- order identity/note/provider snapshot fields and payment audit:
  `PaymentAttempt`, `PaymentWebhookEvent`;
- editable footer content: `SiteSetting` key `footer`;
- media originals/reprocessing: original path retention plus
  `ProductProcessingStatus` and background-removal metadata.

No generic notification table was introduced: existing notification rows keep
their domain-specific payloads, and chat uses its own conversation/message
tables.

## 2. Money and currency

- Storefront money is **Rial only**. USD/AED are admin-side reference rates;
  the storefront never shows a currency selector or FX conversion.
- Single rounding rule: `apps/api/src/common/money/rial.ts` —
  `roundRialUp(price) = ceil(price / 100000) * 100000`, preserving exact
  multiples and zero/invalid handling.
- Pricing, cart snapshots, checkout totals, shipping fees, RFQ acceptance,
  catalog cards, compare-at prices and the product-detail price use the shared
  helper. Limits/fees are server-authoritative; client-sent money is ignored.
- Admin API: `GET/POST /api/v1/admin/currency-rates`,
  `GET /api/v1/admin/currency-rates/convert`. Writes are admin-only and
  audited; rates are manual, never fetched from an external service.

## 3. Product attributes, facets, comparison and bulk editing

Admin endpoints:

- `GET/POST /api/v1/admin/attributes`
- `PATCH/DELETE /api/v1/admin/attributes/:id`
- `POST /api/v1/admin/attributes/:id/values`
- `PATCH/DELETE /api/v1/admin/attribute-values/:id`
- `GET/PUT /api/v1/admin/categories/:categoryId/attributes`
- `GET/PUT /api/v1/admin/products/:productId/attributes`
- `POST /api/v1/admin/products/bulk-attributes/preview`
- `POST /api/v1/admin/products/bulk-attributes/apply`

Behavior:

- category assignments inherit down the category tree; child categories can
  add or override assignments;
- required assigned attributes block publication/order eligibility until
  populated;
- value validation is type-aware (number/boolean/select/multi-select/text);
  changing an attribute definition preserves now-incompatible historical rows
  instead of silently deleting them;
- bulk apply requires a preview token tied to the selected product
  `updatedAt` values, so a stale preview cannot overwrite concurrent edits;
  the response reports per-product outcomes;
- public facets: `GET /api/v1/catalog/facets?category=...` returns only
  category-assigned value attrs plus brands, with counts;
- filtering: `GET /api/v1/catalog/products?category=...&attrs={"slug":["value"]}`;
  unknown attributes are rejected and numeric bounds are validated; price
  bounds use the same rounded Rial value shown on the storefront;
- comparison: `GET /api/v1/catalog/products/compare?slugs=a,b` uses
  category-configured comparable attributes and returns typed display values.

Admin UX includes an attributes management page, a category-aware product
editor section, and a preview/apply bulk dialog launched from the products
table selection.

## 4. Product media and local background removal

- Originals are retained on disk and recorded in `ProductMedia`; derived
  processed/thumbnail files are separate. Reprocessing is reversible
  (`restore original`), and admin can download the original.
- Local segmentation uses U2-Net via `onnxruntime-node`; no product image is
  sent to a cloud service. The pipeline performs mask normalization, soft
  alpha, edge smoothing, source-bbox cropping (never product cropping), and
  square transparent PNG output with balanced padding.
- Quality gates reject damaged/empty results; on failure the original is kept
  and the derivative is not published.
- Already-transparent PNGs are padded rather than re-segmented.
- Watermarking is logo-only on a transparent PNG asset by default; the mark
  reads on light and dark product shots.
- Provision the model locally (not committed; 168 MB):

  ```bash
  pnpm --filter @sabz/api model:provision
  ```

  The script downloads the pinned U2-Net ONNX file and verifies
  SHA-256 `8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491`.
  Upstream: U-2-Net, Apache-2.0. If the model is absent, background removal
  fails closed with a clear error; uploads still work.

## 5. Notifications and realtime transport

- REST: `GET /api/v1/notifications`, `GET unread-count`,
  `PATCH :id/read`, `POST read-all`, `GET/PATCH preferences`,
  `GET push/config`, `POST/DELETE push/subscribe`.
- WebSocket: Socket.IO namespace `/notifications`, JWT authenticated during
  the handshake. A Redis pub/sub bridge lets multiple API instances fan out
  events while PostgreSQL remains the source of truth.
- Notification priority (`LOW/NORMAL/HIGH/URGENT`) drives visual treatment,
  sound, and toast behavior. Preferences are per-user and category-aware.
- Admin and storefront have a bell, live counter, popup/toast/sound, a
  notifications page and a preferences UI. Browser push is opt-in only —
  permission is never requested on page load.
- Web Push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
  `VAPID_SUBJECT`. When absent, the API reports push disabled and in-app
  realtime continues to work. Subscription endpoints are restricted to the
  supported browser push-service hosts to prevent blind SSRF.

## 6. Customer support chat

- Customer REST: `/api/v1/chat/conversation`, `/messages`, `/read`, `/close`.
- Admin REST: `/api/v1/admin/chat/conversations`, per-conversation messages,
  read state and status changes.
- Conversations and messages persist; realtime delivery reuses the
  authenticated notification transport. Rate limits and URL-context
  sanitization prevent abuse/cursor leakage.
- Storefront has a floating chat widget; admin has a split inbox with
  unread/status filters and reply composer.
- Current-page URL is passed as sanitized page context (path/query only, no
  credentials/tokens); cursor position is never shared.

## 7. Orders, checkout and invoices

- National code is mandatory at checkout. A valid code is validated with the
  shared MOD-11 rule, snapshotted on the order, and persisted to the profile
  for later checkouts. Invalid/missing values are `422` with Persian messages;
  only a masked value (`****1234`) is returned to clients or written to logs.
- Order notes are optional, trimmed/control-character-stripped, bounded to
  1000 characters, stored on the order, and shown to customer/admin.
- RFQ acceptance supports the same national ID/note contract.
- Customer invoice data: `GET /api/v1/orders/:id/invoice`; print-ready PDF:
  `GET /api/v1/orders/:id/invoice/pdf`. Operators use
  `GET /api/v1/admin/orders/:id/invoice/pdf`. The customer PDF is owner-scoped
  and the admin PDF is staff-only; both are rendered by headless Chromium with
  embedded Vazirmatn and a transparent logo. Missing Chromium/font/logo
  returns a clear `503` instead of a corrupt file.

## 8. Payments and SMS (honest blockers)

- **SnappPay/DigiPay:** adapters and readiness endpoints exist, but no
  merchant credentials and no authoritative provider protocol details are
  available in this repository. The adapters fail closed; they make no
  provider HTTP calls and cannot report fake success. `ONLINE` stays disabled
  unless explicitly enabled with verified credentials.
- **SMS:** provider-neutral abstraction only. No provider was selected and no
  delivery is claimed; the development stub logs only when enabled.
- These are documented blockers, not completed integrations.

## 9. Footer, Persian localization and admin tables

- Footer content is editable in admin (`GET/PUT /api/v1/admin/settings/footer`)
  with optimistic versioning; the storefront consumes the public
  `GET /api/v1/catalog/settings/footer` response and revalidates the cache tag
  after updates.
- Admin is Persian-first/RTL with Vazirmatn and the brand palette. Jalali
  date/time pickers are available for audit/currency/inventory filters.
- Large admin tables reuse the products-table horizontal-scroll pattern on
  orders, inventory, movements and reservations; inventory has filter chips.
- Storefront sharing uses the selected variant, short description, brand,
  compare-at/current price, image and canonical URL, with native Web Share and
  a clipboard fallback.

## 10. Environment variables added

See the root `.env.example` and `apps/api/.env.example` for full comments.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push; all three required | unset (disabled) |
| `PREVIEW_TOKEN_SECRET` | HMAC for bulk-attribute previews | `JWT_ACCESS_SECRET` |
| `BACKGROUND_REMOVAL_ENABLED` | Enable the admin removal action | `true` |
| `BACKGROUND_REMOVAL_MODEL_PATH` | Local ONNX weights | `assets/models/u2net.onnx` |
| `CHROME_PATH` | Headless Chromium binary | auto-detect |
| `PDF_CHROME_NO_SANDBOX` | Pass `--no-sandbox` in containers | `true` |
| `INVOICE_FONT_PATH` / `INVOICE_LOGO_PATH` | Embedded PDF assets | bundled Vazirmatn/logo |
| `COMPANY_LEGAL_NAME` / `COMPANY_ADDRESS` / `COMPANY_PHONE` / `COMPANY_WEBSITE` | Invoice header | `سبز سیستم` / empty |
| `SNAPPAY_*` / `DIGIPAY_*` | Payment readiness credentials; fail closed until protocol is complete | disabled/empty |

Generate VAPID keys once per deployment:

```bash
pnpm --filter @sabz/api exec web-push generate-vapid-keys
```

## 11. Verification

Final verification commands (run from the repository root unless noted):

```bash
pnpm --filter @sabz/api test
pnpm --filter @sabz/api test:e2e
pnpm --filter @sabz/api test:integration
pnpm --filter @sabz/admin test
pnpm --filter @sabz/storefront test
pnpm lint
pnpm typecheck
pnpm build
```

Integration/e2e suites use a dedicated database whose name ends in `_test`
(see `apps/api/test/test-database.setup.ts`); they refuse any other database.
Browser QA covered desktop/mobile, RTL, light/dark and the major journeys
(attributes → facets → compare, upload → background removal → preview, FX →
Rial, notifications realtime, chat, checkout national ID/note, invoice PDF).
Visual evidence is kept outside Git under `/tmp/opencode/screens`.
