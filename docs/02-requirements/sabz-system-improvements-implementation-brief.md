# Sabz System — Consolidated Improvements & Autonomous Implementation Brief

**Version:** 1.0  
**Date:** 18 November 2026  
**Status:** Approved requirements brief for implementation planning  
**Product:** Sabz System — Persian-first electronics commerce platform

## 1. Purpose and expected outcome

This document consolidates the requested improvements into one implementation brief for OpenCode. The agent is expected to inspect the existing application, design a dependency-aware implementation plan, implement all work that can safely be completed, validate it, fix discovered problems, and document genuine blockers. It must not stop after producing another audit or plan.

The outcome should be a cohesive improvement across the admin panel, product/catalog model, storefront, checkout, notifications, customer support, media pipeline, pricing, and printed invoices. Extend existing functionality wherever possible. Do not create duplicate systems merely because the current implementation is imperfect.

## 2. Product and engineering context

The known application architecture is a modular monolith with a NestJS API, React-based admin panel, Next.js storefront, PostgreSQL/Prisma, and Redis. Confirm the actual repository state, package versions, modules, conventions, design system, and deployment topology before making decisions. This brief does not authorize replacing the architecture.

The current Admin Products table is the reference implementation for responsive data tables. It already has the responsive behavior and table attributes the user wants reused elsewhere. The existing product attribute implementation must be inspected and extended; it is not permission to introduce a competing attribute model.

## 3. Confirmed decisions and constraints

1. **Admin tables:** Reuse the existing Products table's responsive behavior and useful capabilities for other large admin tables. Do not unnecessarily redesign Products.
2. **Product attributes:** Support category-aware attributes, product values, storefront comparison/filtering, and bulk editing. Bulk import/export is explicitly out of scope.
3. **Image processing:** Background removal must run locally. Do not send product images to cloud background-removal services or third-party inference APIs.
4. **Product imagery:** Processed product images must have transparent backgrounds where background removal is appropriate and must always use a square canvas. Preserve the source; add transparent padding to rectangular images rather than cropping or distorting them.
5. **Watermark:** Use a logo-only watermark asset, without text, in transparent PNG format.
6. **Currency:** Admin manually maintains USD and AED exchange rates. Currency management/conversion is admin-side only. Storefront customers see Rial only.
7. **Price rounding:** Round customer-facing Rial prices UP to the next 100,000 Rial (equivalent to 10,000 Toman). Example: 7,650,000 Rial becomes **7,700,000 Rial**. The earlier handwritten `770000` is interpreted as a missing zero because it conflicts with the stated Rial amount and rounding increment.
8. **Payments:** SnappPay and DigiPay credentials are not available yet. Implement only what can be safely implemented and tested without merchant credentials; never simulate a successful live payment.
9. **SMS:** No SMS provider has been selected. Prepare a provider boundary/configuration contract if appropriate, but do not choose a provider or claim SMS delivery works.
10. **Notifications:** Build a high-quality notification experience, not a generic table. Live WebSocket delivery, immediate unread-counter updates, popups/toasts, and sound are required.
11. **Customer chat:** Provide customer-to-admin chat and include the current storefront URL as context. Cursor/mouse-position sharing is explicitly NOT required.
12. **Product sharing:** Use the product's short description, not its full description.
13. **PDF:** The PDF work is specifically for a professional, print-ready order invoice.
14. **UI/UX:** OpenCode must discover and use the globally installed UI/UX and frontend skills for all interface work, then verify the actual UI in a browser.

## 4. Functional requirements

### 4.1 Admin data tables

**Reference:** Existing Admin Products table.

Audit its current responsive implementation and identify the actual reusable patterns and features. Apply suitable equivalents to other large data tables, particularly:

- Inventory
- Inventory movement/history
- Orders
- Other large admin management/reporting tables where table interaction is appropriate

Reuse existing conventions for responsive layout, horizontal scrolling, sorting, filters, pagination, page-size selection, column visibility/selection, row actions, loading/empty/error states, and narrow-screen usability. Preserve the semantic needs and actions of each table; do not blindly copy product-specific controls into unrelated tables. Avoid nested competing scroll containers. Ensure keyboard and touch accessibility.

**Acceptance criteria:** Large tables remain usable on desktop and mobile; common table capabilities behave consistently; existing Products behavior is not regressed; table tests and browser checks cover representative pages.

### 4.2 Product attributes, comparison, filtering, and bulk editing

First map the current product attribute schema, admin forms, category hierarchy, product variants, API contracts, and any existing comparison/filter functionality. Preserve existing product data and extend the current model where possible.

**Recommended conceptual model:**

- Reusable **attribute definitions**: e.g. RAM, storage capacity, screen size, refresh rate, processor, resolution, color, connectivity.
- **Category-attribute assignments**: define which attributes apply to a category, with ordering and configuration such as required, filterable, comparable, and optionally variant-related.
- **Product attribute values**: store each product's actual value against the reusable definition.
- Support inheritance from parent categories where the existing category hierarchy makes that appropriate. Child categories may add or override applicable configuration without creating duplicate definitions.
- Keep purchase-selectable product variants/options distinct from descriptive specifications. An attribute should be a variant only when it represents an actual selectable purchasable configuration in the existing product model.

Support suitable value types (at minimum text, number/decimal, boolean, select, and multi-select), units, normalized option values, ordering, validation, and display labels. Avoid storing every value as unvalidated display text if it prevents correct numeric filtering/comparison. Define safe migration/backfill behavior for existing attributes.

**Admin experience:**

- Category management must allow administrators to manage reusable attributes and assign them to categories.
- Add/Edit Product must show the attributes applicable to the selected category and validate required values.
- Changing a product's category must handle obsolete/incompatible values safely; never silently discard data.
- Provide bulk editing for selected products and their applicable attributes. Include selection, filters, clear feedback, preview of affected product count/changes, validation, confirmation for destructive clearing/replacement, concurrency handling, and an outcome report for per-product failures.
- Bulk edit must support practical operations such as setting/replacing values and clearing values where permitted.
- **Do not implement attribute import/export.**

**Storefront:**

- Generate relevant filters from the selected category's configured filterable attributes.
- Support appropriate controls for numeric ranges, booleans, single-select, and multi-select values.
- Keep brand filtering relevant to the selected category and available products.
- Make product comparison category-aware and use comparable attributes with consistent labels and units. Handle missing values clearly; do not compare unrelated attributes as if equivalent.
- Ensure comparison data is available from the real API and not hardcoded in the frontend.

**Acceptance criteria:** Existing attribute data survives migrations; Add/Edit Product supports category attributes; bulk editing is safe and testable; category-specific storefront filters work; comparison displays consistent specifications; no import/export UI or API is introduced.

### 4.3 Local product-image processing and branding assets

Implement a high-quality **local** image-processing pipeline. Inspect existing upload/storage infrastructure first and place processing in the appropriate API/worker boundary. It must work without calling external image-processing or inference services at runtime.

**Background removal quality:**

- Use a locally executed segmentation/background-removal model or equivalent robust local technique. Do not use simplistic white-pixel thresholding as the primary method: many products contain white surfaces that must remain visible.
- Run inference locally (CPU must be supported unless the existing deployment contract explicitly guarantees suitable GPU hardware). Model weights may be provisioned as versioned local artifacts, but runtime inference must not depend on a remote service.
- Pin and document model/library versions, model source, license, storage location, and operational resource requirements.
- Preserve fine edges, thin components, reflective/metallic surfaces, white product details, and subtle contours. Avoid halos, jagged edges, color contamination, missing white areas, and accidental removal of the product.
- Use appropriate alpha refinement/edge decontamination where supported. Provide a safe failure path: retain the original and do not publish a damaged derivative when processing quality checks fail.

**Output and preservation:**

- Never destructively overwrite the original upload. Keep the original and a separately versioned processed derivative.
- Produce transparent PNG output for the processed master.
- Always make the final canvas square (1:1). Use transparent padding around rectangular images; never stretch or crop away product content to force a square. Center the product consistently with a balanced margin.
- Inspect existing storefront image standards and choose an appropriate square output size. If there is no established standard, use a documented high-resolution default (for example 1200×1200) and avoid needless upscaling of low-resolution sources.
- Optimized delivery formats may be generated as derivatives only if transparency and visual quality are preserved; retain the transparent PNG master.
- Sanitize and validate image type, dimensions, file size, and decoded content; handle corrupt/unsupported images safely.
- Provide an admin preview of original versus processed output and clear processing status/errors. Do not silently replace a good image with a poor result.
- Design for upload-time processing or a durable background job according to existing infrastructure; avoid blocking API requests for long model inference.
- Consider an explicit, previewable reprocessing path for existing product images. Do not mass-rewrite the catalog automatically during deployment.

**Watermark/logo:**

- The watermark source asset must be logo-only, with no accompanying text, and be a transparent PNG.
- Preserve its proportions and alpha channel. Use the existing watermark behavior if present; do not invent a new stamping behavior without inspecting the current system.
- Ensure logo/theme colors are coherent with the approved logo. Do not fabricate a new official brand mark; use existing project assets or report that a proper asset is required.

**Quality validation:** Build a representative fixture set covering white products on white backgrounds, dark products, metallic/reflective objects, thin components, rectangular photos, and already-transparent images. Review output visually, not only through successful function return codes. Compare original and result for retained product pixels, edge quality, square canvas, transparency, and file validity.

### 4.4 Admin currency management and storefront Rial pricing

No external exchange-rate API is requested. Administrators manually enter and maintain:

- USD-to-Rial exchange rate
- AED-to-Rial exchange rate

Provide validation, clear currency labels/units, last-updated/effective timestamp, editor/audit information, and a history or audit trail consistent with existing admin practices. Prevent zero, negative, malformed, or ambiguous rates. Do not imply the rates are live market data.

Inspect the existing product-price model before changing it. Preserve the current authoritative product price representation and existing B2B/tier/variant pricing semantics. Use the manual rates to calculate admin-side equivalents or the existing supported source-currency pricing flow. Do not invent per-product currency semantics if the current domain does not support them.

**Customer-facing behavior:**

- Customers see Rial only. Do not display USD/AED conversion controls or currency labels on the storefront.
- Apply one shared, server-authoritative rounding rule to customer-facing Rial prices: `ceil(priceInRial / 100000) * 100000` for positive values; exact multiples remain unchanged. Preserve correct behavior for zero/null/invalid values and avoid floating-point currency errors.
- Example: 7,650,000 → 7,700,000 Rial.
- Ensure product cards, product detail, variant selection, cart, checkout, and order price snapshots do not show one amount and charge another. Decide and document where rounding occurs in the authoritative pricing pipeline; do not scatter independent frontend rounding functions.
- Ensure sale price remains lower than regular price after rounding; do not show a misleading discount if rounding makes the values equal or invalid.
- Keep internal/admin raw values and calculated values clearly distinguishable.

### 4.5 Notifications: real-time delivery and high-quality UI

Implement persistent, authorized notifications for the relevant customer and administrator audiences. Inspect existing event sources and notification data before adding new tables or parallel event systems.

**Real-time behavior:**

- Deliver new notifications through authenticated WebSocket connections using the existing JWT/session and role model.
- Enforce recipient/role authorization on both subscription and event delivery. A customer must never receive another customer's notifications; non-authorized staff must not receive admin-only events.
- Update unread counters immediately when new notifications arrive and when read state changes.
- Display an attractive toast/popup for new events, with sensible deduplication and navigation to the relevant order/product/customer/context.
- Play a notification sound for new notifications when enabled. Provide mute/sound preferences and respect browser autoplay/user-interaction restrictions.
- Handle initial unread-state synchronization, reconnects, missed events, duplicate events, multiple tabs, offline periods, and read-state consistency. The database remains the source of truth; WebSockets are delivery, not storage.
- Support browser push notifications with opt-in permission and secure subscription handling where the current deployment can support service workers/VAPID configuration. Never request permission unexpectedly on page load.

**Notification center UI:**

- Do not implement a generic data table.
- Build a polished notification popover/center or panel consistent with the admin design system and appropriate customer storefront experience.
- Include unread count, clear read/unread visual hierarchy, useful preview text, category/priority cues where meaningful, timestamps, links/actions, loading/empty/error states, mark-read, and mark-all-read.
- Group or filter notifications only where it improves real usability. Avoid excessive controls and visual clutter.
- Provide accessible keyboard behavior, focus handling, contrast, and responsive behavior.

**SMS boundary:** No SMS provider has been chosen. Do not select one, add provider-specific credentials, or claim SMS works. If the existing architecture benefits from it, define a provider-neutral interface and disabled configuration state so a provider can be added later. In-app WebSocket notifications must work independently of SMS.

### 4.6 Customer support chat

Implement customer-to-admin chat integrated into the storefront and admin panel.

- Add a floating chat entry point throughout the storefront, respecting responsive layouts and not obstructing important controls.
- Customers can start/open a conversation and exchange messages with administrators.
- Include the current storefront URL as conversation context when the chat is opened or a message is sent; validate/sanitize it and do not treat it as trusted HTML.
- Provide an admin conversation inbox, conversation view, message history, unread state, and sensible assignment/status behavior consistent with existing operator roles.
- Reuse authenticated real-time infrastructure where practical; persist messages so reconnects do not lose history.
- Enforce conversation ownership and admin authorization server-side.
- Sanitize/render message content safely and prevent XSS. Add rate limiting/abuse controls appropriate to the existing auth model.
- **Do not implement cursor, mouse-position, or live location sharing.**
- Do not add attachments unless there is already a secure, reusable upload capability and it is genuinely required for the baseline conversation flow.

### 4.7 Product sharing

Provide share actions for Telegram, Bale, and other supported native/web sharing destinations. Use a canonical public product URL and a well-formed share payload containing:

- Product name
- Product image URL
- **Short product description** (not full description)
- Brand
- Selected variant, when applicable
- Regular price and discounted price, when applicable
- Product link

Use the actual selected variant and current customer-facing Rial price. Do not leak internal/admin currency values. Provide a graceful fallback when a destination is unavailable or the browser lacks native sharing support. Ensure link previews use correct metadata where supported.

### 4.8 Orders and checkout

- Add an order note field to the appropriate customer order flow and display the submitted note in the admin order detail. First inspect whether order notes already exist; extend rather than duplicate them.
- Make Iran's national identification code (`کد ملی`) mandatory during order submission.
- Enforce requiredness and appropriate format validation on the server, not only in the browser. Preserve the value securely, restrict visibility to authorized roles, avoid logging it, and do not expose it in public APIs or product/share content.
- Review checkout UX and validation errors in Persian.
- Ensure order-related notifications can be generated for the customer and relevant administrators.

### 4.9 Payment provider readiness: SnappPay and DigiPay

Merchant credentials are not currently available.

- Inspect official provider integration documentation and the current payment architecture before implementing provider-specific behavior.
- Implement provider-neutral contracts and SnappPay/DigiPay adapters only to the extent supported by authoritative documentation and without credentials.
- Add configuration validation, disabled/unconfigured states, status handling, idempotency, callback/webhook verification structure, and tests that do not pretend to perform real transactions.
- Use provider sandbox only if official sandbox access and credentials are actually available.
- Never hardcode secrets, invent endpoints/signatures, mark an order paid without verified provider confirmation, or simulate successful live payments.
- Clearly document the exact remaining merchant onboarding/credential requirements. All unrelated work must continue even while these integrations are gated.

### 4.10 Storefront footer customization

Provide admin-managed footer content using existing settings patterns. Inspect existing footer structure and support the meaningful editable content already present, such as footer text, navigation/link groups, contact information, and social links. Validate URLs and render safely. Include a preview if consistent with the admin settings experience. Do not invent contact details, legal claims, certifications, or social accounts.

### 4.11 Persian localization and date/time inputs

- Use Persian translations for storefront and admin user-facing validation/error states, including the reported English login-page error.
- Audit translation overrides and avoid scattered hardcoded strings.
- Use a Persian/Jalali calendar in date/time inputs where the user-facing business context requires it.
- Preserve standard machine-readable timestamps and existing UTC/database storage conventions; format/parse at the UI boundary using the project's configured timezone and tested calendar library. Do not store Jalali display strings as canonical timestamps.
- Test RTL, keyboard navigation, date selection, time selection, validation, and boundary cases.

### 4.12 Print-ready PDF invoices

Improve the **order invoice intended for physical printing**, not just generic PDF exports.

Requirements:

- Professional, uncluttered invoice layout with correct Persian RTL reading order.
- Reliable Persian font embedding/rendering and correct shaping of Persian/Arabic text and numerals.
- Appropriate paper dimensions, margins, print contrast, and page breaks.
- Readable product/quantity/unit-price/discount/total tables.
- Correct Rial formatting and consistent order/payment totals.
- Logo placement using the approved transparent logo asset.
- Customer/order details with appropriate privacy controls.
- Long product names, many line items, multi-page invoices, and totals must render correctly.
- Do not clip columns, split rows badly, omit totals, or render blank glyphs.

Generate actual PDFs and inspect rendered pages visually. Unit tests alone are not adequate evidence of print quality.

## 5. Mandatory design and frontend workflow

Before any interface implementation, OpenCode must discover globally installed skills and read the applicable instructions. Expected relevant skill names may include `ui-ux-pro-max`, `frontend-design`, `design-system`, `ui-styling`, `ui-taste`, `web-design-guidelines`, and `design`; use the exact skills actually installed and do not assume a missing skill exists.

Apply these skills throughout interface research, information architecture, interaction design, component implementation, and visual QA. Inspect the existing Sabz design system and reuse its tokens/components. Do not create an unrelated visual language or use generic tables for experiences that require a purpose-designed interface.

Use the available browser automation to inspect real running screens. Validate at desktop and mobile widths, Persian RTL, both light and dark themes, loading/empty/error states, keyboard accessibility, and actual interactions. Capture screenshots or equivalent visual evidence for major new experiences. Iterate on visible defects rather than reporting them as known issues without attempting a fix.

## 6. Suggested dependency-aware execution plan

The agent may adjust ordering after repository inspection, but must continue autonomously through all unblocked phases.

### Phase 0 — Repository reconnaissance and safety
- Identify the current primary worktree, branch, base branch, worktree status, remotes, and existing homepage integration state.
- Preserve all pre-existing changes and other worktrees. Do not assume the old homepage branches/folders are disposable.
- Inventory existing models, APIs, admin/storefront screens, test suites, queues, WebSocket infrastructure, pricing, image storage, PDF implementation, localization, and design skills.
- Record current behavior and identify reusable implementation.
- Create a concise task/dependency checklist and proceed without waiting for routine approval.

### Phase 1 — Data-model and API foundations
- Design/migrate category attributes, product values, bulk-edit operations, manual FX settings/audit, notification persistence, chat conversations/messages, order notes, and any required settings.
- Prefer small, safe, additive migrations and explicit backfills. Add constraints and indexes appropriately.
- Test migrations on a disposable database. Never apply schema changes to production or an unidentified/shared database.

### Phase 2 — Product attributes and catalog experience
- Category attribute configuration and inherited applicability.
- Add/Edit Product integration and safe legacy data handling.
- Bulk attribute editing, including preview and failure reporting.
- Storefront category-aware filters and product comparison.
- Reuse Products table patterns across other large admin tables.

### Phase 3 — Image pipeline and branding
- Local model/runtime selection, licensing and model provisioning.
- High-quality background removal, alpha refinement, square transparent PNG output, original preservation, preview, and safe errors.
- Logo-only transparent PNG watermark integration.
- Fixture-based and visual quality validation.

### Phase 4 — Pricing and currency
- Manual USD/Rial and AED/Rial admin rates with audit/history.
- Shared authoritative Rial calculation/rounding logic.
- Consistency across listing, detail, cart, checkout, order snapshot, and invoices.

### Phase 5 — Real-time notifications
- Persistent notification model/API and recipient authorization.
- Authenticated WebSocket delivery, reconnect/reconciliation, unread count, sound, toast, notification center, and opt-in browser push where configured.
- Provider-neutral SMS boundary only; no provider selection or real SMS claim.

### Phase 6 — Customer support chat
- Persistent conversations/messages, customer widget, admin inbox, URL context, real-time updates, access control, abuse protection, and responsive UX.

### Phase 7 — Orders and payment readiness
- Order notes and mandatory national code validation.
- SnappPay/DigiPay documented adapter/configuration readiness without claiming live processing while credentials are unavailable.

### Phase 8 — Storefront/admin finishing work
- Product sharing payload and destinations.
- Footer customization.
- Persian error/localization and Jalali date/time inputs.
- Print-ready invoice redesign and visual PDF inspection.

### Phase 9 — Integrated quality and delivery
- Run full relevant tests, typechecks, lint, builds, migration tests, API tests, and browser workflows.
- Fix regressions and rerun final quality gates after the last code change.
- Review security, accessibility, performance, observability, responsive behavior, RTL, dark/light themes, and data integrity.
- Update docs, environment examples, operational runbooks, and credential onboarding instructions.
- Inspect the complete final diff and leave a reviewable feature branch. Do not deploy or merge automatically.

## 7. Security, data, and operational safeguards

- Do not modify production data or use production credentials for development/testing.
- Do not run normal API startup/seed commands against shared databases as a shortcut.
- Use a newly provisioned disposable database for migration and integration tests; verify its identity before every destructive action.
- Never reset, clean, stash, overwrite, or delete existing worktree changes. Do not remove old worktrees or branches as part of this task.
- Preserve original product images and existing data. Reprocessing existing assets must be explicit, previewable, backed up, and reversible.
- Never expose national identification codes, customer messages, tokens, or credentials in logs, test artifacts, screenshots, or public APIs.
- Authenticate and authorize every WebSocket subscription, notification recipient, chat conversation, and admin action server-side.
- Keep secrets in environment/secret configuration; provide `.env.example` placeholders only.
- No fake payment success, fake SMS delivery, fabricated customer/testimonial content, or invented business claims.
- Do not claim a feature is complete when it is only mocked, scaffolded, or blocked by external credentials.
- Do not push, merge, or deploy unless separately requested.

## 8. Definition of done and evidence

A feature is complete only when its real implementation, relevant tests, and user-visible behavior are verified. Mocks are useful for unit tests but do not replace integration evidence for persistence, WebSockets, image processing, PDF rendering, or checkout flows.

At minimum run relevant API/admin/storefront tests, Prisma migration tests on disposable PostgreSQL, typechecks, lint, builds, and browser verification. Exercise the major user journeys: category attribute setup → product edit → bulk edit → storefront filter → comparison; product upload → local processing → preview → transparent square result; admin FX update → Rial storefront display → cart/checkout consistency; notification creation → WebSocket → counter/toast/sound/read state; customer chat → admin reply; order note/national code validation; PDF invoice print review.

For local image processing, retain representative before/after fixtures and visual evidence. For notifications/chat, test reconnects, unauthorized access, duplicate events, and multiple users. For invoices, inspect actual rendered pages. For payment/SMS, report the exact unblocked implementation and the remaining credential/provider gate.

The final report must include:

1. Verdict: `PASS`, `PARTIAL — EXTERNAL BLOCKER`, or `FAIL`.
2. Worktree/branch/base branch and initial/final Git status.
3. Feature-by-feature implementation summary and changed files.
4. Data-model/migration summary and disposable database validation evidence.
5. Exact test/build commands, counts, and results.
6. Browser/visual verification, including desktop/mobile and RTL/light/dark evidence.
7. Image model, license, runtime requirements, quality results, and limitations.
8. WebSocket notification/chat behavior and security test results.
9. Pricing formula and end-to-end amount consistency evidence.
10. Invoice PDF render evidence.
11. SnappPay/DigiPay and SMS work completed versus what remains blocked by missing credentials/provider selection.
12. Remaining risks, unexecuted tests, and operational steps.
13. Confirmation that shared/production data and other worktrees were not modified.
14. Commit/push/deploy status.

**Overall success:** the improvements that do not depend on external credentials are implemented and verified end-to-end, with clear, truthful integration boundaries for payments and SMS. The result is a coherent, polished Sabz System experience rather than a collection of disconnected UI patches.