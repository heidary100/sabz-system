# Sabz System — Final Stabilization, Workflow Verification & WooCommerce Catalog Reimport

**Document type:** Implementation and release-readiness specification  
**Status:** Ready for OpenCode execution  
**Scope:** Final defect fixes, UX improvements, and controlled product/catalog/media reimport from a WooCommerce CSV export.

## 1. Objective

Bring the current Sabz System implementation to a stable, verifiable state by fixing the specific defects below, validating the affected end-to-end workflows, and safely re-importing the intended product data and images from the customer's WooCommerce CSV export.

This is not permission to perform a blind catalog reset. The import must be source-driven, idempotent, auditable, previewable, and reversible to the extent supported by the database and media-storage architecture. Preserve existing functionality and unrelated data.

## 2. Required repository and context discovery

Before editing:

1. Inspect the current repository/worktree, branch, HEAD, staged, unstaged and untracked changes, remotes, and worktree topology. Preserve all existing work. Do not reset, clean, stash, force-push, switch branches, or remove worktrees.
2. Read the current project instructions (`AGENTS.md`, OpenCode instructions and relevant module guidance), current product/pricing/release specifications, and the implementation of every affected workflow.
3. Identify the actual Admin, Storefront, API, database, storage and test architecture. Do not assume old route names, schema fields, or earlier reports still describe the current code.
4. Locate the intended WooCommerce CSV export and associated image source files/URLs. Search only relevant project/user-provided locations. Record the exact source file, size, checksum, date if available, and image-source strategy. Do not choose an unrelated CSV merely because it is present.
5. If the export or required images are unavailable, complete independent bug fixes and import tooling/validation, but do not fabricate catalog data or run an import. Report the precise missing input.

## 3. Admin reviews — “همه وضعیت ها” must show all reviews

### Expected behavior

- Selecting **همه وضعیت ها** means no status restriction: show every review status that the system supports, including pending, approved/published, rejected/hidden, and any other existing state.
- Selecting an individual status filters only to that status.
- Search, pagination, sorting, date filters and other filters must continue to combine correctly with the status selection.
- Changing filters must reset or reconcile pagination so the UI does not show an empty page caused by a stale page index.
- The displayed count and pagination totals must reflect the same filtered result set.

### Investigation and acceptance

Trace the filter from UI state through request parameters, controller/DTO, service/query and database predicate. Fix the root cause rather than adding a frontend-only workaround. Pay particular attention to `all`/empty/null status serialization, enum handling, default filters, and query-builder conditions.

Add regression tests proving that “all statuses” returns records from every supported status, a specific status returns only matching rows, and other filters still compose correctly. Verify the real Admin UI and API behavior with representative data.

## 4. Customer support chat — full workflow stabilization

Audit the complete customer/admin chat experience rather than patching one visible symptom.

### Required workflows

- Customer can open the storefront chat, start or resume the correct conversation, send a message, and see delivery/persistence reflected accurately.
- Admin can discover incoming conversations, open them, read history, reply, and see new messages without stale state or duplicate entries.
- Conversation ownership and access are enforced: customers can only access their own conversations; staff access follows existing roles/permissions.
- Message ordering is stable and based on persisted server timestamps/identifiers. Refresh/reconnect must not duplicate or lose messages.
- Loading, empty, offline, reconnecting, sending, failed-send, and retry states are explicit and usable.
- Unread counts, read state, conversation list previews, and active conversation state stay synchronized.
- If WebSockets are used, reconnect, authentication, authorization, room membership, duplicate delivery and missed-event recovery are tested. Persist messages before broadcasting them; use a reliable fetch/re-sync path after reconnect.
- The customer’s current storefront URL/context must be visible to the admin and hyperlinked to the corresponding storefront page, according to the already agreed support-context requirement. Do not add cursor/mouse-position sharing.

### Investigation and acceptance

Inspect browser console, server logs, network traces, API responses, WebSocket events, persistence and authorization. Identify each actual defect and its root cause. Add focused unit/integration/E2E tests for customer-to-admin and admin-to-customer journeys, reconnection, refresh, multiple conversations, unread/read state, authorization, failed sends and URL context. Verify using real backend persistence, not only mocked sockets.

## 5. Cart and order — show “price changed” only for a real price change

The price-changed indicator must not appear by default or merely because a product, cart row, price record, timestamp, object reference, or unrelated field was updated.

### Required semantics

- Compare the price the customer was shown/accepted when the cart/order line was created or last acknowledged with the current authoritative price calculated for the same product, selected variant, customer pricing tier, applicable discount/rule, currency and quantity context.
- Show the warning only when the relevant payable unit price or line total genuinely differs under the agreed comparison semantics.
- Do not flag changes to unrelated metadata, stock, descriptions, image, `updatedAt`, serialization order, or equivalent values.
- Do not show a warning when the old and current effective prices are equal after the system’s authoritative pricing and rounding rules.
- Distinguish a genuine price change from unavailable product, stock/quantity change, or invalid variant; those should use their own appropriate states.
- Once the customer accepts/reconfirms the new price, update the comparison baseline so the warning clears and does not reappear on refresh.
- Ensure the backend independently validates the current price at checkout/order submission. Client state must never be the sole price-integrity control.
- For existing orders, preserve the agreed order-time price snapshot; do not silently rewrite historical amounts.

### Acceptance

Test unchanged prices, a real increase, a real decrease, discount activation/expiry, pricing-rule changes, variant changes, customer-tier changes, rounding boundaries, refreshed sessions, repeated cart loads, and acceptance of an updated price. Verify both cart and order workflows and ensure the indicator is absent for unchanged effective prices.

## 6. Watermark sizing

Reduce the existing product-image watermark slightly while preserving its logo-only appearance, transparency, aspect ratio and legibility. Do not alter the source product image or stretch/crop the logo. Inspect representative square images, light/dark product surfaces, different resolutions and responsive storefront placements. Define the sizing/opacity/placement centrally rather than creating inconsistent one-off values. Add or update visual tests where practical.

## 7. Admin profile and identity in the header

### Profile area

Add a discoverable profile section in the Admin Panel where the authenticated administrator can view and edit their own permitted profile fields.

- Reuse the existing identity/user model and validation conventions.
- Show current saved values and clear loading/saving/success/error states.
- Validate required fields, email format and field lengths on both client and server.
- Enforce authorization server-side: an administrator editing their own profile must not gain the ability to change roles, permissions, account status, or another user's data.
- Treat phone-number changes carefully. If the phone is an authentication identifier, do not allow an unverified direct change; use the existing verification flow or make it read-only until one exists.
- Do not invent profile fields or expose sensitive account data. Password change/reset should use the established secure authentication workflow if one already exists.

### Header identity

- Display the administrator’s name in the Admin header when a non-empty, usable name is available.
- Fall back to the phone number only when the name is absent/blank.
- Keep the account/profile menu accessible and responsive.
- Update the header immediately after a successful profile edit without requiring logout/login.

Add API authorization and UI tests for self-edit, forbidden role/permission changes, phone-number constraints, name display and phone fallback.

## 8. Storefront product detail page — Next.js errors, discounts, UX and breadcrumbs

Audit the actual product-detail route and resolve all Next.js errors, warnings that indicate defects, failed requests, hydration issues, server/client boundary errors, missing metadata, image errors and runtime exceptions.

### Discount visibility and price presentation

- Display a valid active discount whenever the authoritative pricing engine says the product has a current promotional price.
- Show regular price, discounted price and discount amount/percentage clearly and consistently with the storefront’s Rial/Toman display and rounding rules.
- Do not display expired, not-yet-active, invalid or higher-than-regular sale prices as active discounts.
- Respect category/product pricing rules, variants and customer eligibility where applicable.
- Ensure product listing, product detail, cart and checkout calculate/present compatible effective prices. Do not implement a separate frontend-only discount calculation.

### Breadcrumbs

- Render a valid breadcrumb hierarchy from the real category/product relationships.
- Handle nested categories, products with multiple categories, missing category relations, and fallback paths without broken labels or incorrect links.
- Every breadcrumb link must navigate to the intended page. The current product crumb should be clear and non-misleading.
- Avoid duplicate, empty, undefined or malformed crumbs.

### UX redesign

Re-evaluate the complete product detail experience: information hierarchy, image gallery, title/SKU/brand/category, price and discount presentation, variants, stock/availability, quantity, add-to-cart, attributes/specifications, delivery information, reviews, related products and mobile layout. Improve the page without removing existing functionality.

Use installed global UI/UX and frontend skills before interface work. Inspect the real page in browser at desktop/mobile, Persian RTL and English LTR, and light/dark modes. Check keyboard/accessibility and loading/error/empty states. Add regression tests and verify actual API-backed data.

## 9. WooCommerce CSV product and image reimport

This is a controlled catalog migration, not a blind truncate-and-reseed operation.

### 9.1 Source inspection and import mapping

Inspect the exact provided WooCommerce export before implementation. Produce a source profile and mapping report covering at least:

- WooCommerce product ID, SKU, type, parent/variation relationship, slug and status.
- Name, short description, full description.
- Categories, hierarchy, tags and brands (where represented).
- Global/custom attributes, options and variation attributes.
- Regular price, sale price, sale start/end dates, and source currency/unit.
- Stock quantity/status and backorder information where supported.
- Featured image and ordered gallery images.
- Other fields only where the Sabz schema has a clear equivalent and the value is safe to migrate.

Identify missing values, duplicates, invalid rows, unsupported fields, conflicting SKUs, parent/variation inconsistencies, malformed image URLs, and ambiguous currency units. Preserve Persian text, UTF-8 and RTL content correctly.

### 9.2 Matching and duplicate prevention

- Prefer stable SKU matching when populated and unique; use a persisted WooCommerce source ID mapping if available.
- Do not match products by title alone.
- Define safe behavior for products without SKU and report ambiguous matches for review instead of guessing.
- Preserve Sabz product IDs and internal relationships for matched records.
- Make re-running the same import idempotent.
- Do not delete Sabz products merely because they are absent from the CSV. Produce an unmatched/orphan report; any archival/deletion requires an explicit, separate approval.

### 9.3 Price and business-data safety

- Confirm whether WooCommerce exported prices are Rial, Toman, or another currency before writing. Never infer units from digit length alone or multiply/divide silently.
- Map regular and sale prices to the existing authoritative pricing model; validate sale price is strictly below regular price and preserve schedules if supported.
- Do not overwrite manually maintained USD/AED rates or derived pricing data with ambiguous source values.
- Identify fields that the import will update and retain a per-product before/after audit.
- Do not import customers, orders, payments or credentials as part of the product export task.

### 9.4 Image migration

- Use image URLs/files explicitly listed in the export, preserving image order and featured-vs-gallery roles.
- Validate source URLs and reject unsafe schemes, localhost/private-network destinations, path traversal and unexpected redirects. Do not fetch arbitrary URLs found in unrelated product text.
- Download with timeouts, size/type limits, content validation, checksum and retry reporting.
- Preserve a recoverable original image asset. Feed images through the approved local image-processing pipeline where applicable, including transparent background handling, square transparent canvas and the reduced logo-only watermark. Never crop/distort the product to force a square aspect ratio.
- Verify that each imported image is retrievable and associated with the correct product. Detect wrong-product images, failed downloads, duplicates and broken gallery order.
- Never delete old media until replacements are verified and the rollback/retention policy is satisfied.

### 9.5 Dry-run, apply and reconciliation

Implement or reuse a dedicated, guarded import workflow with:

1. Read-only analysis/dry-run: no DB or storage mutation.
2. A detailed report: rows to create/update/skip, conflicts, ambiguous matches, price-unit interpretation, category/brand/attribute mappings, image successes/failures, and expected changes.
3. A verified backup of affected database records and media references before apply.
4. Explicit target database identity checks and development-only guardrails.
5. Bounded batches, resumability, idempotency, per-row error isolation and an import run ID.
6. Apply only to the positively identified intended development environment until a separate production migration plan is approved.
7. Post-import reconciliation: source row counts vs created/updated/skipped/failed; SKU uniqueness; parent/variation relations; prices; category/brand/attribute associations; media links and public image retrieval.
8. A rollback/recovery procedure appropriate to the actual schema and media storage.

Do not apply if the CSV is missing, currency units are ambiguous, matching conflicts are unresolved, the destination database is unidentified, or a safe backup cannot be verified. Complete independent fixes and report the blocker.

## 10. Cross-workflow quality and verification

- Keep one authoritative pricing calculation across product detail, listing, cart, order and checkout.
- Verify permissions and server-side validation for every write operation.
- Preserve audit/history semantics for existing orders and prices.
- Ensure Persian RTL, English LTR, responsive behavior, accessibility and light/dark themes.
- Use globally installed UI/UX and frontend skills for all interface work. Discover and read relevant skills before coding; apply them in the actual implementation and browser review.
- Use real database/storage integration tests where behavior depends on persistence. Clearly distinguish unit, mocked, integration and browser/E2E evidence.
- Run relevant tests, typecheck, lint and production builds for affected applications. Fix discovered regressions and rerun final gates.

## 11. Final acceptance criteria

The work is complete only when:

1. The Admin review “all statuses” filter returns all supported states correctly.
2. Customer/admin chat works through its important end-to-end and reconnect workflows, with correct URL context and authorization.
3. Cart/order price-change warnings appear only for genuine effective-price changes and clear after acknowledgement.
4. The watermark is visibly smaller and remains correct across image contexts.
5. Admins can securely view/edit their own permitted profile fields; header identity uses name with phone fallback.
6. Product detail has no unresolved Next.js runtime/build errors, displays valid discounts, and has correct breadcrumbs and verified responsive UX.
7. WooCommerce import has a source mapping, safe dry-run, audited apply, verified images, idempotency and reconciliation. If source data is missing or ambiguous, the import is explicitly reported as blocked—not falsely passed.
8. All relevant workflows have automated regression coverage and actual verification evidence.

## 12. Required final report

Report `PASS`, `PARTIAL — SOURCE/ENVIRONMENT BLOCKER`, or `FAIL` and provide:

- Starting/ending branch, HEAD and complete Git status; changed files.
- Each defect's root cause and fix.
- Tests with exact commands, counts and results, separated into unit/integration/E2E/build.
- Browser evidence for product detail, admin profile, reviews, chat, cart/order and image presentation.
- WooCommerce source filename/checksum, mapping decisions, dry-run summary, apply summary, image results, reconciliation and rollback evidence—or the exact blocker.
- Database identity (secrets redacted), backup evidence and confirmation that production/shared data was untouched.
- Remaining risks and any work not actually verified.

Do not claim a workflow is working based only on a successful build or mocks. Do not deploy, push or merge unless separately authorized.

## Mandatory WooCommerce image migration requirements

The WooCommerce source directory is:

`imports/woocommerce/`


Do not commit imported source files. Ensure the import directory is Git-ignored without changing unrelated ignore rules.

### Image processing is mandatory

Every imported product image must pass through the current, newly implemented image-processing pipeline before becoming an active product image.

1. Preserve the original source image.
2. Perform local white-background removal with high-quality edge preservation. Protect naturally white product surfaces and fine details.
3. Produce transparent PNG output.
4. Normalize the image to a square canvas using transparent padding. Never stretch or crop products to achieve square dimensions.
5. Apply the new transparent, logo-only PNG watermark at its revised smaller size. Never use the old text watermark.
6. Generate and store required derivatives and thumbnails through the existing media pipeline.
7. Verify stored image bytes, transparency, dimensions, watermark appearance and public retrieval.
8. Update product-image associations only after successful processing and storage verification.

The migration must not bypass image processing, reuse unprocessed WooCommerce URLs as final product images, or silently fall back to old watermark assets.

Before applying the catalog import, generate a dry-run report covering product matching, variations, categories, attributes, price units, image availability, processing failures and conflicts. Preserve existing records and relationships wherever possible. Back up affected data and require an explicit safe target-database identity check.

If the CSV, image source, official watermark asset, processing capability, or database safety cannot be verified, stop the import stage without destructive changes. Continue independent stabilization work.

Final verification must include representative imported images in product cards, product detail pages, category displays and both storefront themes.