# Pricing & Product Grid Implementation Notes

This document records the behaviour implemented for
`docs/02-requirements/sabz-system-pricing-and-product-grid-specification.md`.
It is the operational reference for administrators and reviewers.

## Single workspace

- `/products` is the pricing workspace. It has two tabs: **grid** and
  **rules/promotions/tiers**.
- `/products/pricing` redirects to `/products?view=rules`; `/pricing` redirects
  there too. The separate Pricing page is no longer a navigation destination.
- The four former Pricing-page capabilities remain available in the rules tab:
  category rules, product overrides, scheduled promotions, partner tiers.

## Price concepts and precedence

| Concept | Storage | Meaning |
| --- | --- | --- |
| Regular price | `ProductVariant.price` | Base retail price in Rial |
| Discounted price | `ProductVariant.discountedPrice` | Product sale price in Rial; must be `0 < discounted < price` |
| Sale window | `discountStartsAt` / `discountEndsAt` | Optional; outside it the regular price applies |
| Category rule | `CategoryPriceRule` | Percent/fixed promotion for a category, optionally descendants |
| Product override | `ProductPriceOverride` | Percent/fixed adjustment, or an absolute final Rial price |
| Partner price | `ProductVariant.partnerPrice` | B2B price in Rial; only for authenticated, phone-verified approved partners |
| Partner tier | `PartnerTier.discountPercent` | B2B percentage fallback when no explicit partner price exists |

Resolution order (`PricingService.resolveLine`):

1. **Regular price**.
2. If an **authorised partner has an explicit `partnerPrice`**: that price is
   the B2B base. Retail sale/category/override rules and the tier percentage
   are **not** stacked on it. Quantity bulk and one best scheduled promotion
   still apply.
3. Otherwise:
   - If a **product sale** is active (`discountedPrice` inside its window), it
     replaces the category rule and product override (product-specific beats
     category-wide; no double discount).
   - Otherwise apply the **category rule**, then the **product override**
     (absolute override replaces the running price; percent/fixed subtracts).
   - Then apply the **partner tier percentage** for an eligible partner.
4. Quantity **bulk discount**.
5. One **best scheduled promotion** (maximum Rial saving; ties prefer the
   narrower scope).
6. Round the customer-facing Rial price **UP** to 100,000 Rial exactly once.

The preview endpoint reports when an active sale shadows a category rule or
override, and category-rule preview skips sale rows explicitly.

## Currency policy

- Backend accounting values are integer Rial; no floating-point arithmetic is
  used for money.
- Customers see **Toman only**: `Rial ÷ 10`, after the authoritative Rial
  rounding. Example: 7,650,000 Rial → 7,700,000 Rial → **770,000 Toman**.
- AED and USD are admin-only. The Products grid shows derived AED/USD amounts
  from the current manual rates; editing one converts to Rial and stores the
  source amount/rate snapshot.
- USD→Rial and AED→Rial are independently editable manual rates. The meeting
  note's 3.66 AED/USD peg is **not** enforced over those rates; it remains only
  a proposed cross-rate pending an explicit policy decision.
- Changing a rate uses preview → token → atomic recalculation. Only variants
  whose `priceSourceCurrency` matches and whose source amount is present are
  changed; ambiguous rows are reported as skipped. `priceUpdatedAt`,
  `priceSourceRate`, `priceSourceRateAt` and the rate id are recorded, and the
  rate write plus price updates are audited.

## `compareAtPrice` migration

The legacy field was the **pre-discount higher reference**, not the sale price.
The migration preserves the customer-facing pair:

- old `price` (what customers paid) → new `discountedPrice`
- old `compareAtPrice` (the higher reference) → new `price` (regular)
- old source amounts are moved the same way; `Product.minPrice` is recomputed.

Rows without a sale keep their `price` and get no `discountedPrice`.
A CHECK constraint now enforces `discountedPrice < price` and a valid window.

## Bulk financial operations

- Scope: selected variants, selected products, or a category (direct only or
  including descendants).
- Operations: fixed/percentage discount, clear discount, percentage regular
  price adjustment, set/clear override.
- Every operation requires a server preview; apply uses an opaque token hashing
  the scope, operation, per-row `updatedAt` and current price state. A concurrent
  edit yields HTTP 409 and **no** rows are written.
- Apply is atomic: any row-level failure/validation conflict rolls back the
  whole batch. The response reports exact requested/affected/skipped/failed
  counts and per-row outcomes.
- Every batch writes `BULK_PRICE_OPERATION_APPLIED` audit data with scope and
  before/after prices.

## B2B visibility

- Partner price is exposed only by the optional-authenticated price API for an
  APPROVED partner whose owner user is `ACTIVE` (OTP/mobile verified).
- Public product detail, cards, JSON-LD, Open Graph, share text and public
  caches contain only base retail prices. The personalized price endpoint sends
  `Cache-Control: private, no-store` and `Vary: Authorization`.
- Partner price editing in the grid is ADMIN-only; product/retail price editing
  remains OPERATOR/ADMIN. Currency rates are ADMIN-only. Order status/tracking
  are OPERATOR/ADMIN.

## Order and SMS boundaries

- Operators can transition order status inline, enter a tracking code, and see
  the customer note in the Orders list. Status/tracking changes write audit rows
  and in-app notifications.
- SMS is a log-only adapter boundary. No provider credentials exist; the system
  never reports an SMS as delivered. In-app notifications are the verified
  channel.

## Locale scope

Persian RTL remains the primary admin locale. A real English/LTR operations
workspace is available at `/en/products` and `/en/orders` (linked as **EN** in
the Persian header). It uses the same APIs, permissions, design tokens, data and
workflow rules for the pricing grid and order operations; other admin modules
remain Persian-only. The English shell sets `lang="en"` and `dir="ltr"` on the
document while mounted and restores the Persian document attributes on exit.

## Known limitation

`Product.minPrice` is a denormalized index value recomputed on writes. Listing
cards and detail prices are projected from live variants at read time, so an
expired/future sale is never displayed; price **sort order** for a sale that
starts/ends without any variant write may lag until the next write or FX batch.
