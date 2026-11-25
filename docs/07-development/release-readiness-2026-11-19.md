# Release-readiness verification — 2026-11-19

Verdict: **PARTIAL — EXTERNAL BLOCKER**. Every first-party workflow in the
release-readiness specification is implemented and verified. SnappPay, DigiPay
and real SMS delivery remain intentionally unconnected because merchant
credentials, provider contracts and a selected SMS provider are unavailable;
their readiness boundaries fail closed and are documented in
[`payments-and-sms.md`](./payments-and-sms.md).

Branch: `feat/ss-900-platform-improvements`
Base commit: `7f9be30 fix(platform): address SS-900 review findings`
All changes are reviewable but **not committed, pushed, merged or deployed**.

## Migrations

Two additive migrations were applied to disposable databases and the local
development database:

- `20261119030000_release_readiness`
  - category images (`Category.imageStorageKey/MimeType/SizeBytes/Width/
    Height/UpdatedAt`);
  - product source-currency fields (`ProductVariant.priceSourceCurrency/
    priceSourceAmount/compareAtSourceAmount/priceSourceRate/priceSourceRateAt/
    priceSourceRateId`) with a Rial backfill;
  - live chat page context on conversations and immutable per-message snapshots;
  - backend footer default row (idempotent `ON CONFLICT DO NOTHING`).
- `20261119040000_release_readiness_order_source`
  - source-currency/rate snapshot columns on `OrderItem`.

Disposable databases used for validation (never production):

- `sabz_release_r1_test` / `sabz_release_r1_shadow` — migration smoke.
- `sabz_release_final_e2e_test` — final full e2e.
- `sabz_release_final_int_test` — final full integration.
- `sabz_release_demo3_test` — demo-seed integration.
- isolated media/document roots under `/tmp/opencode/release-*`.

The running development database is `sabz`; the running containers were used
for browser QA only. No production or unidentified database was touched.

## Requirement matrix

| Area | Status | Evidence |
|---|---|---|
| Admin responsive tables (products reference; orders/inventory/movements) | PASS | Existing `HorizontalScroll`, pagination, filters, row actions; desktop/mobile browser captures |
| Category-aware attributes, values, facets, compare, bulk preview/apply | PASS | `attribute-spec.integration-spec`, `ss900-platform.e2e-spec`, full e2e suite |
| Local U-2-Net background removal, square transparent PNG, original retention, preview/reprocess | PASS | `background-removal.service.spec`, `media-processing.spec`, manual fixture contact sheet (`/tmp/opencode/image-quality/contact-sheet.png`) |
| Logo-only transparent watermark | PASS | Watermark config tests; storefront product images |
| Manual USD/AED rates; Rial-only storefront; shared upward rounding | PASS | `rial.spec`, pricing/cart/checkout tests, browser 46,300,000 Rial conversion and cart/checkout consistency |
| Persistent notifications, WebSocket, unread, toast/sound, push opt-in | PASS | `ss900-realtime-chat.e2e-spec`, `notifications.e2e-spec`, admin UI |
| Customer/admin chat, URL context, live context, per-message snapshots | PASS | e2e live-context test; browser customer → admin flow |
| Product sharing (native file share + Telegram/Bale/URL metadata) | PASS | `product-share.test.tsx` verifies the native share receives the public image file when `canShare` allows it; rendered HTML carries absolute `og:image` and short-description metadata |
| Order note, mandatory national ID, checkout validation | PASS | `orders-checkout.e2e-spec`, checkout browser |
| Payment provider readiness and fail-closed states | BLOCKED — EXTERNAL PROVIDER | `payment-provider.service.spec`, `ss900-platform.e2e-spec`; no merchant credentials |
| Backend-driven footer defaults and admin editing | PASS | migration default; settings service tests; browser edit → public API → storefront |
| Persian/Jalali date-time inputs | PASS | `JalaliDateTimeInput` used for pricing, campaigns, homepage scheduling, RFQ, currency, audit, inventory; tests |
| Print-ready invoice | PASS | real Chromium PDF + rendered page inspection; long-invoice render |
| Live storefront page context in chat | PASS | API e2e and two-browser UI test; canonical origin only, `variant` allowlist |
| Transparent product-image presentation | PASS | product cards, gallery, compare, cart, admin media preview; `object-contain` + transparent stages |
| Installable Admin + Storefront PWAs | PASS | headed normal-profile Chrome 158: zero installability errors, real `PWA.install`, standalone launch, offline reload, and SW v1→v2 update/activation for both apps |
| Richer visual design | PASS | official palette, category imagery, dashboard status-mix visualization, stage surfaces, badges, dark/light tokens |
| Pricing page migration into Products | PASS | `/products/pricing` route; sidebar entry removed; old `/pricing` redirects; create/delete rule browser test |
| Source-currency product pricing and order rate snapshots | PASS | variant conversion unit tests (create and partial update); browser USD edit; DB source/rate snapshot; Rial cart/checkout; catalog grid rejects inline Rial edits on a USD/AED variant so the snapshot cannot diverge |
| Category image upload/reload/replace/remove and public display | PASS | admin e2e uploads, reloads, replaces with a new version, serves WebP publicly and removes; browser upload; storefront category image |
| Product storefront link in Admin | PASS | row action + detail action produce canonical `VITE_STOREFRONT_URL/products/<slug>`; draft disabled |
| Product sharing image previews | PASS | absolute `og:image`, short-description OG, native file-share capability check |
| Demo-seed tooling and storage | PASS | demo-seed integration 20/20; isolated storage 8 passed / 1 filesystem skip |
| PWA caching safety | PASS | admin caches only public shell/assets; storefront caches only offline/static assets; no API/auth data |



## Design process and accessibility

The final pass loaded and applied the installed `ui-ux-pro-max`,
`frontend-design`, `design-system`, `ui-styling`, `ui-taste` and
`web-design-guidelines` skills. Their token, focus, contrast and interaction
checklists were used for the final audit:

- three-layer tokens (primitive → semantic → component) in
  `packages/config/design-tokens.css`, mapped by both apps;
- official logo/palette, Vazirmatn, RTL-first layouts and deliberate
  light/dark surfaces;
- visible focus rings on sidebar, filters, hero/footer, dialogs and toasts;
- focusable error states, labelled icon controls and live-region toasts;
- a new admin skip link (`پرش به محتوای اصلی`) that is visible on first Tab,
  moves focus to `main#admin-main`, and was verified in the production preview;
- the admin and storefront contrast gates (56 storefront pairs + admin
  light/dark pairs) both pass.

## Full repository feature/workflow inventory

The table below is the release-readiness inventory required by the
specification. Evidence is a real test suite, a disposable-database
integration run, or a browser workflow (not a page's mere existence).

| Feature / workflow | Status | Entry point and evidence |
|---|---|---|
| Admin/customer OTP auth, session refresh, roles and boundaries | PASS | `/login`, `/auth/*`; `auth.e2e-spec`, `security.e2e-spec`, `users.e2e-spec`, `admin-users.e2e-spec`; browser 429/500 refresh interception preserved the admin session, retry recovered; explicit 401 returned to login |
| Customer account, profile, personal national ID, addresses | PASS | `/account`; `addresses.e2e-spec`, `profile-national-id.e2e-spec`; account page smoke |
| Categories, brands, products, variants CRUD and soft delete | PASS | `/categories`, `/brands`, `/products`; admin-categories/brands/products/variants e2e and integration suites; full admin route smoke |
| Category-aware attributes, normalized values, facets, compare, bulk preview/apply | PASS | `/attributes`, product editor, storefront filters/compare; `attribute-spec.integration-spec`, `ss900-platform.e2e-spec`, `public-catalog.e2e-spec`; browser filter/compare flows |
| Product media upload, dedup, thumbnails, description images, local transparency | PASS | `/products/:id/edit`; `admin-product-media`, `public-catalog-media`, `public-media-thumbnails`, `media-dedup` suites; background-removal fixtures |
| Inventory, warehouses, movements, reservations and stock availability | PASS | `/inventory`, `/warehouses`; admin-inventory/history/mutation/reservation/warehouse e2e and integration suites; browser desktop/mobile tables |
| Catalog search, filtering, sorting, product detail and availability | PASS | `/products`, `/categories/*`, `/products/:slug`; `public-catalog.e2e-spec`, catalog-search integration/regression suites; browser category and PDP smoke |
| Admin responsive tables, CRUD/bulk/status actions | PASS | `/products` reference plus orders/inventory/movements; existing `HorizontalScroll`/pagination/filters; desktop+mobile browser captures; inline source-currency guard |
| Merchandising homepage, draft/publication, scheduling, rollback and media | PASS | `/merchandising/homepage`, `/merchandising/publications`; `merch-homepage`, `public-homepage`, `homepage-activation`, `merch-media` e2e; admin route smoke |
| Campaigns and public campaign content | PASS | `/merchandising/campaigns`; `merch-campaign.e2e-spec`, `merchandising-schema.integration-spec`; admin route smoke |
| Public homepage ETag, cache and revalidation behavior | PASS | `/api/v1/catalog/homepage`; `public-homepage.e2e-spec` covers `ETag`, `If-None-Match`, `304` and price/stock invalidation; storefront `/api/revalidate` route |
| Cart, checkout, COD, national-ID/note validation, order creation | PASS | `/cart`, `/checkout`; `cart.e2e-spec`, `orders-checkout.e2e-spec`; browser cart/checkout for converted Rial |
| Order history/detail, admin order transitions, returns, RFQ | PASS | `/orders`, `/returns`, `/rfq`; admin-orders/returns/rfq e2e; `returns.e2e-spec`, `rfq.e2e-spec`; route smoke |
| Pricing rules, promotions, tiers, source currency, rounding and snapshots | PASS | `/products/pricing`, `/currency`; `admin-pricing`, `variant-pricing`, `rial.spec`; order-line source/rate DB snapshot; browser USD→Rial conversion |
| Notifications persistence, authorization, WebSocket, counters, read state | PASS | `/notifications`; `notifications.e2e-spec`, `ss900-realtime-chat.e2e-spec`; browser notification popover |
| Browser push opt-in and safe service-worker push handlers | PASS | Admin/storefront push settings and `sw.js`; unit/UI tests; PWA production check |
| Support chat, replies, live page context, per-message URL snapshots | PASS | Storefront chat widget, `/chat`; `ss900-realtime-chat.e2e-spec`; two-browser product→category flow |
| Footer settings and backend-owned defaults | PASS | `/settings/footer`; settings unit tests, footer e2e, migration default; browser edit→API→storefront |
| Product sharing, short-description OG and native image share | PASS | `/products/:slug`; `product-share.test.tsx`, `share-message.test.ts`; rendered HTML OG/canonical check |
| Installable Admin and Storefront PWAs, offline safety, update path | PASS | `/manifest.webmanifest`, `/sw.js`, `/offline`; real headed install, standalone display, offline reload and SW cache v1→v2 activation verified for both apps |
| Persian RTL UI, Vazirmatn, Jalali date/time, light/dark themes | PASS | Both apps render `dir="rtl"`, `lang="fa"`, Vazirmatn; `JalaliDateTimeInput` across pricing/campaigns/homepage/RFQ/currency/audit/inventory; contrast gates |
| Blog, reviews and content management | PASS | `/blog`, `/reviews`; `blog.e2e-spec`, `admin-blog.e2e-spec`, `reviews.e2e-spec`, `admin-reviews.e2e-spec`; route smoke |
| Import foundation and Torob feed | PASS | Import CLI modules and `/api/torob`; import/woo/torob test suites (CLI, no public UI) |
| Invoice PDF rendering and print layout | PASS | Customer/admin invoice endpoints; real Chromium PDF, official logo hash, 4-page long invoice with repeated table header and final totals |
| Demo-seed guards, idempotency, storage and cleanup | PASS | demo-seed CLI/tests; 20/20 PostgreSQL integration; 8 storage tests + 1 filesystem-capability skip |
| SnappPay / DigiPay live payments | BLOCKED — EXTERNAL PROVIDER | Readiness endpoint and fail-closed states tested; no merchant credentials or verified protocol; see `payments-and-sms.md` |
| Real SMS delivery | BLOCKED — EXTERNAL PROVIDER | Provider-neutral disabled stub and notification persistence tested; no provider/sender/receipt contract; see `payments-and-sms.md` |

## Verification commands and results

### API

- `pnpm --filter @sabz/api test` — **160 suites / 1865 tests passed**.
- Full e2e against `sabz_release_final_e2e_test`:
  **47 suites / 561 tests passed** (includes the order source/rate snapshot and
  live chat-context tests).
- Full integration against `sabz_release_final_int_test`:
  **34 suites / 454 tests passed**.
- Demo-seed PostgreSQL integration: `20 tests passed`.
- Demo-seed isolated storage: `8 passed, 1 skipped` (real hard-link filesystem
  capability on this host).
- API typecheck: passed.
- The invoice was rendered through the real headless Chromium service; the
  embedded logo decodes to the exact official master SHA-256
  `58357887b73dd681b3d0fff89803d324b70406b14942856b73a4cd4f133fb016`.

### Admin

- `pnpm --filter @sabz/admin lint` — passed.
- `pnpm --filter @sabz/admin typecheck` — passed.
- `pnpm --filter @sabz/admin test` — **92 files / 561 tests passed**.
  This includes the new refresh-classification and AuthProvider transient-failure
  tests.
  The large jsdom grid tests use a 15 s timeout because parallel workers made
  the default 5 s load-dependent.
- Build: passed.
- Contrast gate: **All pairs pass.**

### Storefront

- `pnpm --filter @sabz/storefront lint` — passed.
- `pnpm --filter @sabz/storefront typecheck` — passed.
- `pnpm --filter @sabz/storefront test` — **66 files / 583 tests passed**
  (native file sharing plus transient 429/5xx refresh preservation).
- Build: passed.

### Workspace gates

Executed from the repository root after the final edits:

```bash
pnpm lint       # 7/7 tasks passed
pnpm typecheck  # 10/10 tasks passed
pnpm test       # 10/10 tasks passed (API 1865, admin 561, storefront 583)
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1 \
NEXT_PUBLIC_SITE_URL=http://localhost:3002 pnpm build  # 7/7 tasks passed
```

### Browser and PWA

Evidence root: `/tmp/opencode/screens/release/` and
`/tmp/opencode/screens/qa2/`.

- Category image upload previews and merged storefront category tile.
- Footer admin edit persisted, public API returned the new value, and
  storefront revalidation showed it.
- USD variant conversion: `50 USD × 925,000 = 46,250,000 → 46,300,000 Rial`;
  cart and checkout both displayed `۴۶٬۳۰۰٬۰۰۰ ریال`.
- Chat: customer on a product page → admin current context link; client-side
  navigation to `/categories/ssd` updated the admin current context; each
  message retained its own page link.
- Reconnect: after the customer browser was taken offline for 3.5 s and brought
  back online, an admin reply arrived over the reconnected WebSocket, the
  original message and new reply both remained, and a page reload rehydrated
  the persisted history.
- Live notification UI: the customer bell changed from `1 خوانده‌نشده` to
  `2 خوانده‌نشده` on a real admin chat reply, and the in-app toast showed the
  `پاسخ پشتیبانی` title and the reply body (screenshot
  `store-notification-toast-final.png`).
- PWA production check against rebuilt apps, headed normal-profile Chrome
  158.0.8127.0 (not an incognito context):
  - `Page.getInstallabilityErrors` returned `[]` for both apps.
  - `PWA.install` succeeded for both manifest identities; `PWA.getOsAppState`
    confirmed the installed app; `PWA.changeAppUserSettings` set
    `displayMode: standalone`; `PWA.launch` opened an installed app window.
  - Admin standalone: `matchMedia('(display-mode: standalone)') === true`,
    browser mode false, SW controller true, offline reload rendered the login
    shell. Storefront standalone: standalone mode true, browser mode false,
    SW controller true, offline reload rendered the offline page.
  - Update path: served a new SW cache version from the same origin and called
    `registration.update()`; both apps reported `updatefound: true`,
    `installed: true`, activation, and after reload only the v2 cache
    (`sabz-admin-shell-v2` / `sabz-storefront-shell-v2`) remained. The built SW
    files were restored afterward and matched their original checksums.
  - Evidence: `/tmp/opencode/pwa-admin-full.json`,
    `/tmp/opencode/pwa-store-full.json`,
    `pwa-admin-standalone-final.png`, `pwa-admin-offline-standalone-final.png`,
    `pwa-store-standalone-final.png`,
    `pwa-store-offline-standalone-final.png`.
- Print invoice: A4 PDF rendered and inspected for logo, RTL Persian shaping
  and totals. A 35-line fixture rendered as a 4-page A4 PDF with the table
  header repeated on continuation pages and the subtotal/shipping/total block
  intact on the final page (`/tmp/opencode/qa2/sabz-invoice-long.pdf` and
  `invoice-long-page-*.png`).
- Accessibility: the admin skip link is the first Tab stop, appears at
  151×36 px on focus, and Enter moves focus to `main#admin-main` in the
  production preview (`admin-skip-link-focus.png`).
- Session resilience: in the production admin build, intercepted
  `/auth/refresh` `429` and `500` responses left the URL at `/dashboard`, kept
  the session, and showed the retry screen; removing the interception and
  clicking `تلاش دوباره` restored the dashboard. An intercepted `401` refresh
  correctly returned to `/login` (`admin-refresh-429-session-preserved.png`).

## Pricing examples

- Rial widening: `7,650,000 → 7,700,000`.
- Exact multiple: `7,700,000 → 7,700,000`.
- USD source: `50 × 925,000 = 46,250,000 → 46,300,000`.
- The order line stores the Rial unit price plus source currency/amount/rate
  and rate id; the checkout cart/order totals are computed server-side.
- A discount whose rounded selling and reference prices are equal is not
  rendered as a discount (`roundedCompareAt` returns null).

## Image model and quality

- U-2-Net ONNX weights, pinned in `apps/api/assets/models/README.md`; source
  rembg v0.0.0; Apache-2.0; SHA-256 pinned; CPU-only `onnxruntime-node`; no
  remote inference.
- Outputs are transparent PNG, square padded canvases; originals retained.
- Fixture contact sheet covers white-on-white, metallic, thin, rectangular
  and already-transparent images. Outputs retained the product, kept thin
  components and produced square alpha canvases. Approximate CPU inference
  per fixture: 0.45–0.9 s on this host.
- Safe failure path preserves the original and records `SKIPPED/FAILED`; the
  admin can preview/reprocess/restore explicitly.

## Remaining risks / limitations

1. SnappPay/DigiPay and real SMS are not connected; see the precise onboarding
   steps in `payments-and-sms.md`. Their disabled and fail-closed states are
   tested; no successful live transaction or SMS delivery is claimed.
2. PWA install/standalone/offline/update was validated on localhost, which
   Chrome treats as a secure origin. Production must serve both apps over
   HTTPS and set `VITE_STOREFRONT_URL`, `STOREFRONT_PUBLIC_URL`, and the
   storefront site URL in the deployment.
3. The demo-seed storage suite skips one test when the host filesystem cannot
   create hard links; this is an environment capability check, not a product
   failure.
4. Existing product images that predate the source-currency/category-image
   migrations have no source-currency snapshot; the admin can explicitly
   reprocess/repricing them.
5. The admin production bundle still has the pre-existing large-chunk warning.
6. The native share chooser itself is a platform UI; the tested contract covers
   capability detection, the public image fetch and the `ShareData.files`
   payload. Browser/platform availability remains a client capability, with
   anchor and copy fallbacks always present.
7. The auth refresh endpoint remains deliberately throttled (30/min). A
   transient `429`/`5xx` now preserves the session and shows a retry screen
   instead of logging the admin out; only an explicit `401/403` refresh ends
   the session. Shared-NAT deployments should still review the throttle
   window if many admins reload simultaneously.
8. Some dev catalog media rows point at missing backing files, so a few
   storefront cards show the designed placeholder and log 404s for
   `/catalog/media/<id>`. This is dev-seed drift, not a rendering regression.

## Safety and Git

- No production/shared database was modified; disposable databases ended in
  `_test` and were verified before use.
- No existing worktree was removed or reset; no unrelated untracked work was
  overwritten.
- No deployment, merge, push or production publish was performed.
- Branch `feat/ss-900-platform-improvements`, base HEAD `7f9be30`; the work is
  uncommitted and ready for review.
- Handoff Git state: **148 modified tracked files** and **44 untracked files**
  (36 new feature/test/docs/asset files plus the preserved pre-existing
  `.zcodeignore`, storefront `AGENTS.md`/`CLAUDE.md`, the milestone audit,
  merchandising UI spec, implementation brief, release spec and handoff note).
- `git diff --check` passes except for the pre-existing trailing whitespace in
  the user-owned `.gitignore`, which was not modified.
- The other worktrees `sabz-system-ss284a` and `sabz-system-ss284b` were left
  untouched.
