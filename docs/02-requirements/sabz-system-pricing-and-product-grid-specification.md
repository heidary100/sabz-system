# Sabz System — Product Management, Pricing Engine & Discount Workflows

**Specification status:** Implementation-ready, subject to the explicit policy notes in §3  
**Scope:** Admin product grid, product pricing, discounts, override prices, currency conversion, B2B partner pricing, product sharing, and directly related order workflows  
**Source:** User requirements plus the client meeting notes supplied on 21 November 2026

---

## 1. Objective

Replace the current fragmented and confusing product pricing/discount experience with a fast, reliable, spreadsheet-style product management workspace. Routine product, stock, and price operations should be possible from the Products page without opening each product or navigating to a separate pricing page.

The implementation must make pricing behavior understandable to administrators, enforce financial invariants on the server, support selected-product and category-level operations, and expose accurate customer-facing prices. Existing functionality must be inspected and preserved where valid; broken or duplicate implementations should be consolidated rather than layered with another pricing system.

This specification is an addendum to the broader Sabz System release-readiness specification. The implementation agent must read both this document and the existing product/pricing/merchandising specifications before changing code.

## 2. Product requirements

### 2.1 Products page becomes the pricing workspace

The Products page is the single operational entry point for product pricing, discounts, and price overrides.

- Remove the separate Pricing page from the Admin navigation after all its useful functionality has been migrated into Products.
- Do not simply delete the old page/API behavior. Inventory every existing Pricing page action, validation, permission, and data model first; migrate or intentionally retire each one.
- Remove duplicate or obsolete UI only after parity tests prove that required workflows remain available from Products.
- Keep product creation/editing and the product grid consistent with the same pricing rules and validation.

### 2.2 Product selection and bulk actions

The Products grid must support selecting one, many, or all filtered products, with clear selected counts and safe selection behavior across pagination/filtering.

Provide contextual bulk actions, including:

1. **Apply discount** to selected products using either:
   - a fixed amount in Rial per product; or
   - a percentage of each product's eligible regular price.
2. **Remove/clear discount** from selected products, with preview and confirmation.
3. **Set/adjust prices** where authorized, including percentage increase/decrease of regular prices.
4. **Apply category discount rule** through category management or a contextual category action.
5. **Set/modify an override price** for selected products without manually entering product UUIDs.

Before an operation is committed, show a preview with affected product count, original price, proposed discount/price, effective result, validation failures, and skipped products. Allow the administrator to cancel. Do not silently partially apply an operation unless the UI clearly reports per-product success/failure and the operation is designed to be partial.

For fixed-amount discounts, define whether the same nominal Rial amount is subtracted from each eligible product. Prevent a result less than or equal to zero. For percentage discounts, validate the permitted range and ensure the resulting sale price is strictly below the regular price. Use server-side validation as the authority.

### 2.3 Inline product pricing grid

Provide a high-density but usable grid with configurable column visibility. Suggested default columns:

- Product thumbnail
- Product title
- Category/tags
- SKU
- Stock quantity
- Regular price (Rial)
- Special/discounted price (Rial)
- Dirham price (AED)
- Dollar price (USD)
- Effective customer price / sale state
- Last price/rate calculation timestamp
- Storefront product link

Not every column must be visible by default. Persist column preferences per administrator where the existing architecture supports it.

Grid behavior:

- Inline-edit eligible cells without navigating away.
- Format large monetary values with readable separators while preserving exact integer values.
- Provide instant client-side search/filter interaction without full page reloads; server-side pagination/filtering must remain authoritative for large catalogs.
- Clearly distinguish unchanged, modified, saving, saved, conflicted, and invalid rows.
- Mark invalid rows and fields accessibly; do not rely on red background alone.
- Provide a sticky or persistently accessible Save action for pending edits, with a count of changed rows.
- Save multiple changed rows through a validated batch API, with per-row outcomes and concurrency protection.
- Warn before navigating away with unsaved changes.
- Use optimistic concurrency/version checks (for example `updatedAt` or an established revision field) to prevent silently overwriting another administrator's changes.
- Retain the existing Products table responsive behavior and useful table features; enhance it rather than regress it.

The meeting notes specifically call for editable title, categories/tags, SKU, stock, regular price, special sale price, AED price, and USD price. Audit field ownership and permissions before enabling edits to each field.

### 2.4 Category-level pricing and discount rules

Administrators must be able to assign a pricing/discount rule to a specific category, without manually selecting or entering every product UUID.

Support at least:

- Percentage discount for a category.
- Fixed-amount discount for selected products; category fixed-amount support may be added if it can be applied safely and unambiguously.
- Percentage increase/decrease to regular price for a selected category, as a distinct operation from a discount.
- Optional start/end schedule for rules where supported by the existing campaign/pricing architecture.
- Preview of matching products, resulting prices, excluded products, and validation errors.
- Explicit scope choice: only products directly in the category, or products in the category and descendants.
- Rule enable/disable and clear visibility into active, scheduled, expired, and conflicting rules.

A category rule must not blindly rewrite source regular prices when the intent is a promotion. Keep regular/base price adjustments separate from promotional discounts.

### 2.5 Discounted price and promotional schedule

Use clear concepts and labels:

- **Regular price:** normal retail price, stored in Rial.
- **Discounted/special price:** promotional selling price, stored in Rial, optional.
- **Promotion start/end:** optional date/time controlling when the special price becomes effective.

The client notes explicitly request replacing `compareAtPrice` with `discountedPrice` in the product model. Inspect the existing schema and data first. If this rename is appropriate, add a safe migration/backfill preserving existing meanings and values; do not blindly rename or discard data. Update API DTOs, services, storefront presentation, admin forms, tests, seeds, and documentation consistently.

Validation:

- Discounted price must be strictly less than regular price.
- It must be positive and use the correct currency/unit.
- Start time must precede end time when both are supplied.
- Expired/not-yet-active promotions must not be displayed as active discounts.
- Server-side validation is mandatory; client validation is supplementary.
- A sale/discount must never produce a negative, zero, or higher-than-regular effective price.

### 2.6 Override price workflow

The current override-price UI requires an administrator to manually enter a product UUID. Replace this workflow.

- Add “Set override price” to the selected-product contextual actions and/or row menu in Products.
- Show selected product names/SKUs in the dialog; no UUID entry is required.
- Allow an administrator to set, update, inspect, and clear the override for selected products, subject to existing permissions.
- Explain in the UI what an override changes, its scope, currency, duration, and precedence relative to regular price, category discount, scheduled sale price, and B2B price.
- Preview the effective result before saving.
- Preserve audit history/actor/timestamps if the current domain supports them; otherwise implement appropriate auditability.
- Inspect the existing override implementation first. Do not assume its semantics from its label; document what it currently overrides and migrate it safely.

## 3. Currency, accounting, and rounding policy

### 3.1 Authoritative storage and display

- Store financial accounting values in integer Rial (IRR) in the backend, consistent with the client meeting notes and existing project requirements.
- Keep AED and USD values as administrative/internal product pricing fields only.
- Customers must see Toman only on the storefront; do not expose AED/USD customer-facing prices.
- Convert Rial to Toman by dividing by 10 after applying the authoritative Rial rounding rule.
- Avoid floating-point arithmetic for money. Use integer/decimal-safe arithmetic and explicit currency units.

### 3.2 Manual exchange rates

The user's confirmed operational preference is that administrators manually enter the USD-to-Rial and AED-to-Rial rates. These rates must be editable in the Admin settings and clearly show the last update time and updating administrator.

The client meeting notes also describe an AED/USD fixed peg of 3.66 and a workflow where one global AED rate drives USD conversion. These instructions conflict with independently manual USD/Rial and AED/Rial rates. **Do not silently hard-code one behavior.** Implement both independently editable rates as the authoritative values for now, and keep the AED/USD cross-rate configurable or informational. Document the 3.66 proposal as a policy decision requiring confirmation before it is made authoritative. Do not overwrite a manually entered USD rate using the peg.

When an administrator changes a rate, preview the affected products and resulting Rial/Toman prices before batch recalculation. The recalculation must be atomic or use a robust, resumable batch process with clear progress and failure reporting. Record `price_updated_at`/equivalent calculation timestamp and audit who changed the rate. Do not silently update prices if the product's source currency or pricing mode is ambiguous.

### 3.3 Rounding rule — authoritative user decision

The user's explicit example takes precedence over the smaller increment in the client notes:

- Round the calculated customer-facing Rial price **up to the next 100,000 Rial**.
- Formula: `ceil(rawRial / 100000) * 100000`.
- Example: 7,650,000 Rial becomes 7,700,000 Rial, then displays as 770,000 Toman.
- Exact multiples remain unchanged.
- Never round down.

The meeting notes mention increments of 10,000 Rial (1,000 Toman); this conflicts with the user's explicit 100,000-Rial example and must not be implemented.

Centralize rounding in one tested pricing function used consistently by APIs, storefront displays, product sharing, and relevant invoice/customer-facing price presentations. Keep the unrounded source/calculation values available for audit where appropriate.

### 3.4 Bi-directional grid calculations

The meeting notes request spreadsheet-style conversion when editing IRR, AED, or USD values. Implement predictable conversion using the authoritative manual rates, with clear indication of which field is the source of the current calculation. Avoid recalculation loops and precision drift. An administrator's direct edit to a currency field must not be immediately overwritten by a stale derived value.

## 4. B2B partner pricing

The meeting notes specify a secondary partner price tier (`قیمت همکار`) available only to authenticated, phone-verified wholesale partners.

- Inspect existing partner roles, customer tiers, authentication and pricing logic before implementation.
- Store B2B partner prices in Rial.
- Expose partner price only to authorized, authenticated, phone-verified partner accounts; unauthenticated and ordinary retail users must never receive it through HTML, API payloads, cache, or structured metadata.
- Keep retail and partner price calculations separate and test authorization at API level.
- SMS provider credentials are not currently available. Implement/verify the phone-verification state and provider adapter boundaries, but do not fake SMS delivery or bypass verification.

## 5. Product sharing / social cards

Support Telegram, WhatsApp, Bale, and the existing supported sharing mechanisms where practical.

The share payload/card should include:

- Product image.
- Concise product title, brand, model and selected variant/specifications when available.
- The product's **short description**, not its full description.
- Regular price with strikethrough where an actual discounted/partner price applies.
- Effective discounted or partner price only when the viewer is authorized to see it; public share cards must not leak B2B-only pricing.
- Direct product URL (including the appropriate B2B destination for authenticated partner workflows).

Use share metadata/Open Graph where supported so messaging platforms can show an image preview. Verify the real generated URLs and previews where the platform permits. Never invent a discount or share a price inconsistent with the price API.

## 6. Related order workflow from client meeting notes

These requirements are included because they are in the supplied meeting specification. Inspect current order statuses and workflows before adapting them; do not replace existing domain statuses blindly.

### 6.1 Inline order status management

Allow authorized operators to change order status from the main Orders list, with clear transitions, validation, and audit history. The meeting notes describe these stages:

1. Pending review (در انتظار بررسی)
2. Ready for dispatch (آماده ارسال)
3. Dispatched (ارسال شده)
4. Tracking code issued (کد رهگیری)
5. Completed (تکمیل شده)

Map these to the existing status model if possible. Show tracking-code entry at the correct stage and display order notes directly in the list or a usable row expansion.

### 6.2 Order notes and notifications

- Keep the customer checkout order-notes field and display notes to fulfillment staff.
- Status changes should create an in-app notification for the customer and update the real-time notification system where implemented.
- SMS status notifications should use an adapter/provider boundary. SMS cannot be considered delivered until a provider is configured and real delivery is verified.
- Preserve existing mandatory national-code checkout validation from the broader requirements.

## 7. UX and visual design requirements

Before frontend work, discover and read the user's globally installed UI/UX and frontend skills. Use applicable skills such as `ui-ux-pro-max`, `frontend-design`, `design-system`, `ui-styling`, `ui-taste`, and `web-design-guidelines` where installed.

The pricing experience must be purpose-designed, not a generic CRUD page:

- Make product selection and bulk actions obvious.
- Put the most common price/discount actions directly in the Products workspace.
- Use clear labels and Persian explanations for regular price, discounted price, override, category rule, and currency conversion.
- Provide calculation previews and meaningful validation feedback.
- Use accessible row states, sticky save controls, responsive table behavior, column customization, and keyboard-friendly interactions.
- Prevent destructive or broad price operations from executing without a preview and confirmation.
- Maintain Sabz System's established brand design tokens, light/dark themes, Persian RTL, English LTR, and responsive behavior.

## 8. Permissions, auditability, and data integrity

- Reuse the existing role/permission architecture; do not grant broader pricing rights as a shortcut.
- Distinguish permissions for editing a product price, applying a category-wide rule, changing currency rates, setting B2B pricing, and changing order states.
- Record the actor, timestamp, target scope, previous value, new value, and reason where the existing audit system supports it; extend audit records for financially sensitive batch operations when necessary.
- Batch operations must be idempotent where applicable, concurrency-safe, and report exact affected/skipped/failed counts.
- Never silently overwrite another administrator's concurrent edits.
- Preserve existing data and provide migrations/backfills with rollback considerations.
- Do not modify production or unidentified/shared databases during development validation.

## 9. Required discovery before implementation

The agent must inspect and document:

- Current Product, variant, category, pricing, discount, pricing-rule and override schemas.
- All current Pricing page capabilities and APIs.
- Current `price`, `compareAtPrice`, `discountedPrice` or equivalent semantics and existing data.
- Existing multi-currency fields, rates, conversions, and Toman/Rial conventions.
- Current B2B roles, partner verification, pricing visibility and cache behavior.
- Current Products grid table capabilities, batch endpoints, validation and optimistic concurrency.
- Existing order statuses, notes, tracking fields, notification events, and SMS adapter boundaries.

Do not create duplicate models or APIs before understanding what already exists. Prefer extending sound existing services and consolidating broken paths.

## 10. Acceptance criteria and verification

The implementation is accepted only when the following real workflows are verified:

### Products and bulk operations
- Select one, several, and all filtered products; selection counts and scope remain correct across pagination.
- Apply a fixed discount to selected products and verify each result.
- Apply a percentage discount to selected products and verify each result.
- Clear discounts safely.
- Preview and apply a percentage base-price adjustment to a category without confusing it with a discount.
- Apply, schedule, disable, expire, and inspect a category discount rule.
- Inline edit supported product fields and batch-save multiple rows.
- Invalid sale prices are rejected by both UI and API.
- Concurrent edits produce a visible conflict rather than lost updates.

### Override prices
- Set, update, inspect, and clear overrides through selected products/row actions.
- No manual UUID entry is required.
- Verify documented precedence among regular price, category discounts, product discounted price, override and B2B tier. If existing business rules imply a different precedence, document it and test it consistently.

### Currency and prices
- Manually update USD/Rial and AED/Rial rates.
- Verify conversion in both directions without floating-point drift.
- Verify rate propagation, progress, failures, audit data and timestamps.
- Verify 7,650,000 Rial displays as 770,000 Toman after upward rounding.
- Verify exact multiples remain unchanged and values are never rounded down.
- Confirm customers never receive AED/USD fields.
- Confirm B2B price is never leaked to unauthorized users.

### Sharing and orders
- Verify share payload uses short description, image, product URL and correct price visibility.
- Verify public sharing cannot leak partner prices.
- Verify order status transitions, tracking code, notes, audit and in-app notification.
- Verify SMS is reported as unavailable/unconfigured rather than falsely successful when no provider exists.

### Quality gates
- Add/adjust unit, API, integration and UI/E2E tests for every workflow above.
- Run relevant API and Admin/Storefront typechecks, lint, tests, and production builds.
- Run isolated PostgreSQL integration tests for migrations, batch updates, rule precedence, rollback and concurrency.
- Browser-test Persian RTL and English LTR, desktop and mobile, light and dark themes.
- Review the complete diff, migration safety, authorization, cache leakage, decimal handling, and regressions.
- Report exact commands, exit codes, test counts, and what was genuinely executed. Mocked tests do not count as real database/provider integration evidence.

## 11. Decisions and conflict resolution

The following decisions are authoritative for implementation:

1. **Storefront currency:** Toman only. Backend accounting values remain Rial. AED/USD are admin-side only.
2. **Rounding:** upward to 100,000 Rial, not the 10,000-Rial increment in the meeting notes.
3. **Exchange rates:** USD/Rial and AED/Rial are independently entered by administrators. The meeting note's 3.66 AED/USD peg is a proposed cross-rate, not permission to overwrite the independently entered rates. Keep it configurable/informational until explicitly approved as authoritative.
4. **Discount UX:** bulk fixed-amount and percentage discounts on selected products; category-specific discount rules; all operations originate from Products/category context, not UUID entry or a separate Pricing page.
5. **Discount field:** use a clear `discountedPrice`/special-price concept. Migrate from `compareAtPrice` only after confirming current schema semantics and preserving existing values.
6. **Provider gaps:** implement in-app status notifications and adapter boundaries. Do not claim SMS or payment-provider delivery without credentials and real provider verification.
7. **Product sharing:** use the short product description and never expose B2B pricing in public share metadata.

If an existing schema or business rule conflicts with these decisions, preserve data, document the conflict, and implement the closest safe compatible solution. Do not silently invent financial behavior.

## 12. Final delivery report

Return one evidence-based report containing:

- Discovery findings and existing behavior retained/replaced.
- Schema/API/UI changes and migrations.
- Exact Pricing page capabilities moved to Products.
- Bulk selection, discount, category-rule, override and inline-grid workflows implemented.
- Currency conversion formula, rate authority, rounding evidence and example results.
- B2B security/visibility results.
- Order/share workflow results.
- Exact tests/builds/browser checks and exit codes.
- Remaining defects, external-provider blockers and unverified items.
- Changed files and final Git status.

Do not claim completion based only on source review or passing unit tests. The goal is a reliable, end-to-end tested pricing and product-management workflow suitable for release.