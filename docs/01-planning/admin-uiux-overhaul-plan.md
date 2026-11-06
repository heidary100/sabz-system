# Sabz System — Admin UI/UX Overhaul & Catalog Grid Improvements

**Audit report & implementation plan** — 2026-11-07, ZCode session.
Basis: PR #328 (SS-257 catalog grid, commits `6b5d1fc` / `328ddfc` / `da8d54a`), branch `feat/ss-257-catalog-grid`.
Untracked-by-design (like `docs/07-development/session-handoff.md`); commit to a `docs/` branch + PR only on user go-ahead.

**Evidence base**

- Two code audits: admin-wide (routes, layout, tokens, tables, patterns) and SS-257 grid deep-dive — exact paths/lines cited inline.
- Live browser inspection (dev stack, OTP session): 1920 / 1280 / 768 / 360 px × light & dark; dashboard, products grid, orders, product editor.
- DOM census of the grid at 50 rows/page: **2,855 DOM nodes, 500 cells, 200 live `<input>`s, 50 `<img>`s**, 10 visible columns, content width 1,758 px in a 1,191 px scroller.
- Synthetic scroll probe (rAF-driven horizontal scroll of the real scroller, 119 frames): **avg 22.97 ms/frame (~43.5 fps), median 16.7 ms, p95 33.5 ms, max 66.7 ms; 39/119 frames >33 ms** — directionally confirms the "laggy" report. Caveat stated honestly: synthetic input on a Vite dev build; absolute numbers are not production figures, the jank *pattern* (fine median, doubled p95) is the signal.

**Skill usage report (per task instruction)**

- Loaded & applied: `ui-ux-pro-max` (its CLI search DB is script-execution-blocked in plan mode → its inline Quick Reference used: 4.5:1/3:1 contrast floors, dark-mode parity, 4/8dp rhythm, icon discipline), `frontend-design` (distinctive-direction + anti-template rules), `ui-taste` (anti-slop audit workflow, "preserve established system for polish"), `design-system` (3-layer token architecture), `vercel-react-best-practices` (scroll/render perf rules: passive listeners, content-visibility, memo discipline).
- **Not installed** (reported, not pretended): `web-design-guidelines`, and the project-specific `Sabz UI/UX` skill. The latter's intended content (RTL conventions, Catalyst usage, design consistency) is covered by AGENTS.md §9 Admin UI Standards + the codebase recon in this document.
- Not loaded as out-of-scope or conflicting: `banner-design` / `design` / `slides` (banners, logos, decks are not deliverables of an in-app audit), `ui-styling` (shadcn-focused — introducing shadcn would violate the Catalyst-only mandate in AGENTS.md §9), `brand` (brand constraints already fixed in AGENTS.md §9), `grill-me`, `find-skills` (no missing capability).

---

## A. Current-state audit

### A.1 Route inventory (30 routes, `apps/admin/src/app/App.tsx:40-313`)

All authenticated routes render inside `AdminLayout`; guards `RequireAuth` (`src/auth/require-auth.tsx`) + `RequireRole` (`src/auth/require-role.tsx`); `ADMIN_ROLES = ['OPERATOR','ADMIN']` (`src/auth/auth-provider.tsx:18`); `/roles`, `/warehouses` ADMIN-only.

| Path | Page (`src/pages/`) | Type | Pagination |
|---|---|---|---|
| `/login` | login-page.tsx | OTP 2-step form, outside layout | — |
| `/access-denied` | access-denied-page.tsx | standalone card | — |
| `/dashboard` | dashboard-page.tsx | stat cards + 2 small fixed tables | none |
| `/products` | products-page.tsx | **editable server-paginated grid (SS-257)** | URL-driven, page-size + go-to |
| `/products/new` | product-editor-page.tsx | form (largest editor) | — |
| `/products/:id/edit` | product-editor-page.tsx | form | — |
| `/products/:id` | product-detail-page.tsx | detail + variants table | none |
| `/categories` | → components/categories/category-manager.tsx | tree manager | none |
| `/brands` | brands-page.tsx | table + form dialog | shared Pagination |
| `/orders` | orders-page.tsx | table | shared Pagination (20/page fixed) |
| `/orders/:id` | order-detail-page.tsx | detail (items/events tables + forms) | — |
| `/returns` | returns-page.tsx | table | shared Pagination |
| `/returns/:id` | return-detail-page.tsx | detail | — |
| `/notifications` | notifications-page.tsx | table | shared Pagination |
| `/pricing` | pricing-page.tsx | tabbed (4 sections), each a table | shared Pagination ×4 |
| `/rfq` | rfq-page.tsx | table | shared Pagination |
| `/rfq/:id` | rfq-detail-page.tsx | detail | — |
| `/reviews` | reviews-page.tsx | table | shared Pagination |
| `/blog` | blog-page.tsx | table + category manager dialog | shared Pagination |
| `/blog/new`, `/blog/:id/edit` | blog-editor-page.tsx | form (TipTap) | — |
| `/partners` | partners-page.tsx | table | shared Pagination |
| `/partners/:id` | partner-detail-page.tsx | detail | — |
| `/users` | users-page.tsx | table | shared Pagination |
| `/users/:id` | user-detail-page.tsx | detail | — |
| `/roles` | roles-page.tsx | read-only cards (ADMIN only) | none |
| `/audit` | audit-page.tsx | table + details dialog | shared Pagination |
| `/warehouses` | warehouses-page.tsx | table (ADMIN only) | shared Pagination |
| `/inventory` | inventory-page.tsx | table | shared Pagination |
| `/inventory/movements` | inventory-movements-page.tsx | table (`?variantId=`) | shared Pagination |
| `/inventory/reservations` | inventory-reservations-page.tsx | table (`?variantId=`) | shared Pagination |
| `/inventory/variants/:variantId` | variant-inventory-page.tsx | detail cards + action dialogs | — |
| `/inventory/warehouses/:warehouseId` | warehouse-inventory-page.tsx | table | shared Pagination |

**17 routes** render the shared `Pagination` set. Non-paginated tables: dashboard queue/trend, product-detail variants, order/return/rfq line items — these must NOT gain pagination (§5 boundary).

### A.2 Layout shell & whitespace sources (measured)

Chain viewport → table (normal list page):

1. `admin-layout.tsx:41` — `<main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">` ← width constraint #1
2. Page wrapper — **`mx-auto max-w-6xl space-y-6` on ~20 pages** (detail pages `space-y-8`) ← constraint #2; products page is the only full-width page (`products-page.tsx:516` → `w-full space-y-6`), product editor `max-w-7xl`
3. `table-card.tsx:14` — `rounded-xl border bg-surface p-4 shadow-sm sm:p-5`; footer slot `px-4 pt-4 sm:px-5`
4. Catalyst table `components/catalyst/table.tsx:36-47` — inner `-mx-(--gutter) overflow-x-auto whitespace-nowrap` → `inline-block min-w-full`; cells `px-4 py-4` (dense `py-2.5`); `--gutter` CSS var is defined nowhere in the app (grep = 0) so the fallback always applies

At 1920: constraints #1+#2 leave ~350 px dead margin per side (orders' 6 columns float in ~60% of the card width). At 1280 the products filter stack consumes ~450 px vertical before the table; at 360 ~1,400 px of scroll. Editor inputs stretch ~1,100 px full-width. Sidebar `w-64` / `w-[4.75rem]` collapsed (`sidebar.tsx:168`), header `h-16` (`app-header.tsx:11`).

### A.3 Theme / tokens / RTL today

Single CSS entry `src/index.css` (623 lines): Tailwind v4 `@variant dark` class-based; `@theme` with five brand ramps (`dust`, `dry-sage`, `fern`, `hunter` — `hunter-500 #35703f`, `pine-teal`) + remapped stock scales (`zinc-*`→warm neutral, `green/amber/orange/red/sky`→status hues, `blue-300–700`→brand greens for Catalyst focus rings); `@theme inline` semantic layer `bg-background/text-foreground/border-border/bg-surface/-strong/bg-glass/text-muted/primary family/success/warning/danger/info (+ -subtle/-border)` backed by `--sabz-*` in `:root` (`:215-256`) and `.dark` (`:258-300`); component classes `.glass/.glass-strong/.danger-box/.warning-box/.rule-double*/.ambient` (`:319-393`); Vazirmatn Variable via `@fontsource-variable/vazirmatn`; `<html lang="fa" dir="rtl">`; dark toggle via `localStorage['sabz-admin-theme']` + inline script (`index.html:7-20`) + `lib/theme.ts`.

**Dark mode is fully implemented but under-designed**: grey-on-grey with green accents only in the chrome; no status color inside grid rows; low border visibility; the theme toggle itself is nearly invisible in light mode.

### A.4 Shared components inventory

`src/components/ui/`: `pagination.tsx` (Catalyst-style port, Persian labels) + `lib/pagination.ts` `pageNumbers()`; `table-card.tsx`; `page-header.tsx` (title/subtitle/actions — used by all list pages); `empty-state.tsx`; `loading.tsx`; `delete-confirm-dialog.tsx`; `horizontal-scroll.tsx` (grid-only); `tooltip.tsx` (portal, RTL-aware); `icon-button.tsx`; `theme-toggle.tsx`; `info-item.tsx`; `multi-select-checkbox.tsx`; `slug-field.tsx`; `rich-text.tsx`.
`src/components/catalyst/` (vendored, 12 files): alert, badge (17 colors), button (+`TouchTarget`, one added `primary` color `button.tsx:65-68`), fieldset, heading, input, link, select, table, textarea, text. ~30 domain `*-status-badge.tsx` components; ~30 dialogs on Catalyst `Alert`. **Missing**: shared Dialog/Dropdown-Menu/Checkbox/Toast/Switch/Radio/Avatar/Separator.

### A.5 Patterns

- Forms: hand-rolled controlled state, minimal manual validation with Persian messages; catalyst `Field/Label/ErrorMessage`.
- Errors: **no toasts anywhere** — inline `danger-box` pills (23 files) + 12 identical page-level glass error cards + dashboard retry variant; success = dialog closes + refetch.
- Confirmations: shared `DeleteConfirmDialog`; domain dialogs follow the same Alert shape.
- Loading/empty: `Loading compact` + `EmptyState`, consistent loading→error→empty→table branch order.
- **No help affordance anywhere**; only Tooltips = collapsed-sidebar nav labels + category-manager.
- Dashboard shows raw audit codes (`PRODUCT_VARIANT_UPDATED`) untranslated — Persian-first violation.
- Possible wrong-direction RTL prev/next arrows on orders pagination (verify during PR 3).

### A.6 Grid-specific findings (SS-257 as shipped in PR #328)

- Editable variant fields: sku, barcode, variantName, price, compareAtPrice, priceStatus, stock (only when `stockEditable` — exactly one qualifying warehouse; else read-only link to `/inventory/variants/:id`). Product name/brand/category/status/condition/createdAt are display-only by design (`packages/types/src/product/catalog-grid.ts:10-13`).
- Dirty model (`hooks/use-catalog-drafts.ts`): per-row `baseUpdatedAt` captured at first edit; revert-to-server drops the field from the draft; locally-invalid rows never reach the API; `BATCH_CHUNK_SIZE = 50` sequential POSTs; conflict rows excluded from blind resubmit; `applyRowPatches` reconciles authoritative values + fresh `updatedAt` tokens without refetch.
- API (`apps/api/src/modules/products/catalog-grid.{controller,service}.ts` + `dto/`): `GET/POST /admin/catalog-grid[/batch]`; per-row interactive `prisma.$transaction` with `SET LOCAL lock_timeout` (default 3000 ms → per-row `CONFLICT_LOCKED` on SQLSTATE 55P03); conditional `updateMany … where updatedAt: expected` (no read/compare/write race); stock via SS-113 `applyAbsoluteSet`; SS-251 `validatePricing` on effective values; duplicate-SKU P2002 → row `VALIDATION_ERROR`; archived product → row `CONFLICT_CHANGED`. Batch DTO accepts **only variant-level fields**; unknown fields silently stripped by the global `ValidationPipe({transform:true,whitelist:true})` (`app.setup.ts:44`).
- Brand/category editing today lives only in `ProductEditor` → `PATCH /admin/products/:productId` (`UpdateProductDto` with optional `brandId` nullable + `categoryId`; service runs `assertBrandAndCategory` + archived 409 guard). Options endpoints: `GET /admin/brands`, `GET /admin/categories[/tree]`; hooks `use-brand-options.ts`/`use-category-options.ts` fetch `{page:1,limit:100}` (**100-item cap**).
- Scroll architecture: `horizontal-scroll.tsx` (76 lines) — top mirrored bar (aria-hidden, 8 px spacer at `contentWidth`) + body scroller; React `onScroll` on both doing direct `scrollLeft` writes guarded by `syncingRef`; `ResizeObserver`→`setState` unthrottled; **no sticky header, no sticky column**; Catalyst `Table` renders a second inner `overflow-x-auto` (currently expands to fit content — one active scroller — but the `inline-block min-w-full` chain is fragile); row imgs have no width/height/lazy attrs.
- Visual noise: every editable cell renders a permanently-bordered `Input`/`Select` (`editable-cell.tsx:70-88`) incl. ~50 empty compareAt boxes; priceStatus rendered as a bare per-row select instead of a badge when not editing.

### A.7 High-priority issue list (ranked)

1. Grid scroll jank (200 inputs + blur chrome + unthrottled sync) — §D.
2. Filter panel: inconsistent label/field association (live-verified scramble), always expanded, huge vertical cost at ≤1280.
3. Wasted width on ~20 `max-w-6xl` pages + double nesting (§G).
4. Pagination inconsistent per route; totals text outside the card; page-size/go-to only on grid (§F).
5. Visual language: washed-out light mode, monochrome dark mode, glass over content, no elevation hierarchy (§B/C).
6. Grid rows render raw form controls instead of badges/text-with-affordance (§E).
7. No route help anywhere (§H); dashboard raw audit codes.
8. 100-item brand/category options cap (documented gap).
9. `--gutter` undefined → dead CSS path in vendored table; possible RTL pagination arrow direction bug.
10. Grid keyboard support: no Enter/Tab/Esc cell navigation at all today.

---

## B. UX & design direction — «دفتر باغ» (Orchard Ledger)

One coherent direction, grounded in the fixed AGENTS.md §9 palette (hunter greens, `#f8f7f5` paper, `#dad7cd` rules, Vazirmatn, RTL-first). The distinctive Sabz device: **promote the existing `.rule-double` Persian-manuscript double-rule from a sidebar decoration to the system signature** — section headers, table headers, active-nav marker — replacing glass as the identity element. Glass stays only on dialogs/overlays (scrimmed, static backdrop).

- **Base**: warm paper (`#f8f7f5`), white cards, visible borders (`#dad7cd` + a new stronger `border-strong` for table headers/inputs), ink-green primary actions. Not a rainbow: one accent family (green) + four semantic status hues; everything else neutral.
- **Expressiveness** (the "more colorful" ask) comes from semantic status color used *consistently*: every status in every table renders through the same badge token map (published/in-stock=success, pending=warning, rejected/cancelled=danger, draft/archived=neutral, info) — light+dark tuned.
- **Typography**: Vazirmatn stays. Scale: 12/13 (captions, meta), 14 (body/table), 16 (section body), 18 (subheading), 24 (page title). Table numerals `font-variant-numeric: tabular-nums`; SKU/prices/codes in `dir="ltr"` spans. Persian digits preserved where the app already uses them.
- **Density**: data tables compact (`py-2.5`), forms comfortable two-column rhythm, chrome tight (header `h-14` option to evaluate in PR 2).
- **Elevation**: page bg flat → cards `shadow-xs` + 1px border → dialogs `shadow-sm` + glass. No `ambient` gradient noise on data pages.
- **Motion**: 150–200 ms ease-out state transitions only; saved-flash and spinner respect `prefers-reduced-motion`; zero entrance animations (AGENTS.md "avoid unnecessary animation").

**Rationale**: the brief demands "more expressive, colorful, polished" *and* AGENTS.md forbids generic blue/purple dashboard styling, excessive gradients/shadows/animation. Status-ink expressiveness + the manuscript-rule signature delivers color and identity without violating either. (Anti-template check per frontend-design skill: the direction deliberately avoids the cream+terracotta and near-black+acid-green clichés; the cream base is the AGENTS.md brand mandate, not a default.)

## C. Design tokens & component standards

3-layer architecture (design-system skill) extending the existing `index.css` — primitives (ramps) → semantics (`--sabz-*` per theme) → component tokens. **Values below are the proposal; existing values are kept where already defined — diff against `index.css:215-300` during PR 2 and validate every pair with a contrast script (≥4.5:1 body, ≥3:1 UI components).**

### C.1 Semantic tokens — light / dark (proposed)

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#f8f7f5` (fixed) | `#191713` | page canvas |
| `surface` | `#ffffff` | `#201e19` | cards, table |
| `surface-strong` | `#fdfcfa` | `#262420` | inputs, header/sidebar chrome |
| `border` | `#dad7cd` (fixed) | `#3a372f` | default rules |
| `border-strong` (new) | `#b8b3a4` | `#4a463c` | table headers, input borders, dividers |
| `foreground` | `#312e24` (fixed) | `#ece9e1` | body text |
| `muted` | `#6f6a5e` | `#a8a396` | secondary text (≥4.5:1 verified pair) |
| `primary` | `#3a5a40` (fixed) | `#7caa87` | primary actions, links |
| `primary-hover` / `primary-active` | `#344e41` / `#2d4034` | `#8fb899` / `#a3c6ad` | button states |
| `primary-strong` | `#35703f` (existing) | `#4f8a5c` | badges, selected nav |
| `primary-subtle` | `#eef1e6` | `rgba(124,170,135,.14)` | dirty cells, selected rows |
| `accent` | `#a3b18a` (fixed) | `#a3b18a` | rules, signature |
| `success` (+`-subtle/-border/-text`) | `#3a7d44` / `#e8f1e6` / `#a8cba9` | `#8fc79a` / `rgba(58,125,68,.16)` / `rgba(143,199,154,.4)` | saved, paid, in-stock, approved |
| `warning` (+) | `#b07d2b` / `#f7ecd7` / `#dcc598` | `#d9a852` / `rgba(176,125,43,.16)` / `rgba(217,168,82,.4)` | pending, conflict, low stock |
| `danger` (+) | `#b3382e` / `#f7e3e0` / `#e0b1ac` | `#e08a80` / `rgba(179,56,46,.16)` / `rgba(224,138,128,.4)` | error, destructive, cancelled |
| `info` (+, pine-teal — **no generic blue**) | `#2f6d68` / `#e2efec` / `#b3d3ce` | `#7fb3ac` / `rgba(47,109,104,.16)` / `rgba(127,179,172,.4)` | hints, neutral notices |
| `focus-ring` (new) | `#3a5a40` | `#7caa87` | 2px, offset 2, keyboard only |

### C.2 Component standards

- **Buttons** (`catalyst/button.tsx` variants): primary (solid hunter), secondary (outline `border-strong`), ghost (plain, hover `primary-subtle`), destructive (solid danger), icon (44px target), disabled (`opacity-50` + `cursor-not-allowed`, no shadow), loading (spinner inline, label preserved, `aria-busy`).
- **Badges**: single `StatusBadge`-style token map on top of catalyst `Badge` — 5 semantic tones × light/dark; migrate the ~30 domain badges opportunistically (PR 6).
- **Alerts**: `danger-box`/`warning-box` generalized to info/success box classes from tokens.
- **Form controls**: input/select states — default, hover, focus (ring token), readonly, disabled, invalid (`border-danger` + `ErrorMessage`), all defined per theme.
- **Table states**: see §E.4 (9 editing states) + striped→zebra kept but tokenized.
- **Radius/shadow scale** (new, small): `radius: 8/12/16`, `shadow-xs: 0 1px 2px rgb(49 46 36 / .06)`, `shadow-sm: 0 2px 8px rgb(49 46 36 / .10)`; dark-mode shadows deepened.
- **Icon discipline** (ui-ux-pro-max rules): one icon family (current set), consistent 1.5px stroke level per layer, size tokens 16/20/24, meaningful icons ≥3:1, decorative icons `aria-hidden`.

## D. Scrolling architecture

### D.1 Diagnosis (root causes, ranked)

1. **200 always-mounted boxed inputs + 50 selects + 50 imgs** (2,543 table elements): dominant style-recalc/paint cost per frame; also the visual "form instead of table" noise.
2. **`.glass` backdrop-blur on sticky header + sidebar** recomputes blur every frame rows scroll beneath — matches the probe's bimodal jank (median OK, p95 doubled).
3. **Unthrottled scroll sync**: React synthetic `onScroll` on both scrollers doing direct `scrollLeft` writes (`horizontal-scroll.tsx:43-50`), no rAF, no passive listeners; `ResizeObserver`→setState on every resize tick.
4. **Fragile single-scroller**: Catalyst's inner `overflow-x-auto` currently expands to fit (one active scroller — measured), but the `inline-block min-w-full` + `whitespace-nowrap` chain is fragile and reflows as one giant layout unit; no sticky header row; imgs lack dimensions (layout shift).

### D.2 Options evaluated (against the task's 12 criteria)

| Option | Verdict |
|---|---|
| **Native scroll + the 4 fixes below + hand-rolled drag-to-pan hook** | ✅ **Recommended.** Zero dependencies; best trackpad/wheel/touch/RTL behavior (native); keyboard free; smallest bundle impact. |
| `overlayscrollbars` v2 (~30 kB) | Rejected for now: styling-only benefit; custom scrollbars do not fix paint cost; revisit only if native scrollbar visibility/styling proves insufficient after measurement. |
| `react-virtuoso` / TanStack Virtual | Rejected: server-side pagination is the chosen strategy; 20–100 rows don't need virtualization (explicit task boundary). |
| AG Grid / TanStack Table full grid | Rejected: would replace Catalyst (AGENTS.md violation) and rewrite the working SS-257 API contract for marginal gain. |

### D.3 Recommended implementation (4 fixes + drag-to-pan)

1. **Click-to-edit cells** (`editable-cell.tsx` rewrite): render editable cells as styled text by default (subtle hover affordance: dashed underline + muted edit pencil on row hover); mount the real input/select **only while editing**. DOM: ~200 inputs → ~1–2. Same `use-catalog-drafts` pipeline, same batch save, same per-row outcomes — only the cell shell changes.
2. **Solid chrome** (user-approved): `admin-layout.tsx` header + `sidebar.tsx` drop `.glass` for opaque `bg-surface-strong` + `border-b`/`border-s`; glass retained for dialogs/overlays only.
3. **rAF-throttled sync** (`horizontal-scroll.tsx` rewrite): manual `addEventListener('scroll', fn, {passive:true})` on both scrollers, sync writes batched in `requestAnimationFrame` (coalesced, loop-guarded via direction check), `ResizeObserver` callback rAF-coalesced; drop React synthetic handlers.
4. **Scroller hardening** (vendored `catalyst/table.tsx`): opt-out prop so exactly one `overflow-x-auto` exists; dense cells (`py-2.5`) default for data tables; grid row imgs get `width/height` + `loading="lazy"` + `decoding="async"`; evaluate a sticky `thead` (sticky within the page scroller, RTL-safe) as a stretch goal.
5. **Drag-to-pan hook** (`src/hooks/use-drag-scroll.ts`, ~60 lines, no dependency). Guard rules (the "do not make normal interactions difficult" constraints):
   - Mouse only (`event.pointerType !== 'mouse'` → never activate; touch/trackpad stay native).
   - Never starts on `event.target.closest('input, select, textarea, button, a, [role="listbox"], [role="option"], label')`.
   - Activates after a 6 px horizontal move threshold (plain clicks unaffected).
   - Pans with `scrollBy({left: -dx})` — direction-agnostic under RTL (no negative-`scrollLeft` math).
   - Text selection disabled only during an active drag (`user-select: none` on the scroller, restored after).
   - Trailing click suppressed once via capture-phase listener when a drag actually occurred.
   - `cursor: grab/grabbing` on the table surface; native scrollbar stays visible; keyboard/wheel alternatives untouched.

### D.4 Required interactions — coverage

Vertical/horizontal smooth scroll: native after fixes. Mouse-wheel: native. Trackpad horizontal: native. Touch swipe: native (untouched). Drag-to-pan: hook (mouse). Visible scrollbar: native + mirrored top bar (kept). Keyboard: cell model in §E.5 + native scroller focus.

## E. Catalog editing interaction model

### E.1 Editable fields (source-of-truth based)

| Field | Level | Control (not editing → editing) | Validation | API |
|---|---|---|---|---|
| SKU | variant | `dir=ltr` text → input | non-empty ≤64, duplicate-SKU row error | existing |
| Barcode | variant | `dir=ltr` text → input | ≤64, explicit-null clear | existing |
| Variant name | variant | text → input | ≤255, explicit-null clear | existing |
| Regular price | variant | tabular text → money input (SS-265 grouping) | `^\d{1,10}(\.\d{1,2})?$`, SS-251 | existing |
| Sale price (compareAt) | variant | tabular text → money input | > price when set; PRICED required; explicit-null clear | existing |
| Price status | variant | **badge when idle** → select when editing | PRICED ↔ CALL_FOR_PRICE (true domain field, not derived — but auto-guarded: compareAt requires PRICED) | existing |
| Stock | variant | tabular text → integer input | int ≥0; read-only + link when multi-warehouse | existing |
| **Product name** (new) | product | text → input | ≤ limits per `UpdateProductDto` | **new in batch** |
| **Brand** (new) | product | badge/link → searchable select | must exist (nullable per PATCH semantics; create requires both) | **new in batch** |
| **Category** (new) | product | badge/link → searchable select | must exist, required non-null | **new in batch** |

Thumbnail stays non-editable (no workflow justification in the current model). All fields reuse existing backend validation/business rules — no fake local option lists; brand/category options come from `GET /admin/brands` / `GET /admin/categories` via the existing option hooks.

### E.2 API extension (user-approved decision)

Extend `CatalogGridBatchRowDto` with optional `productId` (UUID), `productName`, `brandId`, `categoryId`. Same guarantees preserved: ≤50 rows per request, duplicate-`variantId` rejection, per-row interactive transaction (variant write + product write in the same tx), `validatePricing` unchanged, `assertBrandAndCategory` + archived-guard reused for product fields, per-row outcomes (`SUCCESS`/`VALIDATION_ERROR`/`CONFLICT_CHANGED`/`CONFLICT_LOCKED`/`NOT_FOUND`), audit events + storefront cache invalidation for touched products. Concurrency: grid rows gain a product `updatedAt` token (add to `GRID_ROW_SELECT`/`toGridRow` if absent) and rows carrying product edits require the matching `expectedProductUpdatedAt`; mismatch → row `CONFLICT_CHANGED` (same semantics as variant token). Extend `admin-catalog-grid.e2e-spec.ts` (product-field success/invariant/conflict/atomicity cases) and `packages/types` grid types. Zero-drift oracle re-run after this lands.

### E.3 Editing lifecycle

Enter edit: click cell / `Enter` / `F2` on focused cell. Commit-and-move: `Enter` (next editable cell in row, then next row's first editable cell), `Tab`/`Shift+Tab` natural order. Cancel: `Esc` (revert to pre-edit draft value; second `Esc` reverts the whole cell to server value via existing revert-to-server semantics). Edit mode is per-cell (not per-row) to keep the DOM light. Errors: field-level Persian message inline under the cell (existing `grid-messages.ts` fallbacks), row stays editable; locally-invalid rows never reach the API (existing behavior).

### E.4 Visual state model (9 states — never color alone)

| State | Background | Border/accent | Icon/text cue | Scope | Duration |
|---|---|---|---|---|---|
| Unchanged | transparent | none | — | cell | — |
| Editing/focused | `surface` | `ring-2` `focus-ring` | caret | cell | while editing |
| Dirty cell | `primary-subtle` | `border-primary` | ● + tooltip «ذخیره نشده» | cell | until save |
| Dirty row | primary @2% | start accent bar 2px | row start marker | row | until save |
| Saving | `primary-subtle` | `border-primary` | corner spinner, inputs disabled, `aria-busy` | cell/row | until response |
| Saved | `success-subtle` | `border-success` | ✓ transient | cell | flash ≤2 s (reduced-motion: static 1 s) |
| Validation error | `danger-subtle` | `border-danger` | ⚠ + inline Persian message | cell | until fixed |
| Conflict | `warning-subtle` | `border-warning` | ⟲ + row action «بررسی تغییر نسخه» / «تلاش مجدد» | cell+row | until resolved |
| Read-only | transparent | none | muted text + lock tooltip + link | cell | — |
| Column pending | — | header dot | `aria-label` «ستون دارای تغییر ذخیره‌نشده» | column header | until save |

Distinctness guarantees: dirty (green) ≠ error (red) ≠ conflict (amber) are hue-differentiated **and** icon-differentiated; the whole table never saturates (subtles only, ≤2% row tints); batch results announced in an `aria-live="polite"` region («۳ ردیف ذخیره شد، ۱ خطای اعتبارسنجی، ۱ تداخل نسخه»); `Ctrl+S` triggers save-all when the save bar is visible.

## F. Shared pagination

**Component** `components/ui/table-pagination.tsx` — props contract:

```ts
{ page: number; totalPages: number; total: number; limit: number;
  onPageChange(p: number): void; onLimitChange(n: number): void;
  position: 'top' | 'bottom' }   // aria-label «صفحه‌بندی بالا/پایین»
```

Contains: page-size select (20/50/100), `pageNumbers()` page list, prev/next (RTL arrow direction verified at implementation), go-to-page input, totals «مجموع: X مورد» **inside the bar**. Top and bottom instances share one state source — same page object in the hook / same URL params on the grid — so edits propagate by construction. Filter/sort changes clamp page to a valid value (pattern already present in some hooks; standardized).

**Affected routes (17)**: products (grid), orders, pricing ×4 tabs, rfq, reviews, notifications, returns, blog, partners, users, audit, brands, warehouses, inventory, inventory/movements, inventory/reservations, inventory/warehouses/:id. Migration = replace the copy-pasted footer composition with the component rendered twice. Hook consolidation: extract a small shared `usePaginatedList`-style helper for page-state + clamp (opportunistic migration; do not rewrite all 16 hooks in one PR). No pagination on static/non-paginated tables.

## G. Admin layout — remove wasted space

1. `main` drops `max-w-7xl` (keeps `px-4 sm:px-6`; vertical tightened `py-4 sm:py-6`).
2. Page-width system: each page declares `data-page-width="full | wide | narrow"` on its wrapper (`full` = data tables/grid; `wide` = max-w-7xl detail/editors; `narrow` = max-w-3xl forms like roles) — kills constraint #2, one decision per page, no per-page CSS hacks.
3. `table-card.tsx` → `p-3 sm:p-4` (footer slot adjusted).
4. Data-table cells dense (`py-2.5`) by default; comfortable `py-4` only on detail-line tables.
5. Products filter panel → collapsible (collapsed below xl by default; chips row always visible; active-filter chips still visible when collapsed) with a fixed 2-column label+field grid and proper `htmlFor`/`id` association (fixes the live-observed scramble).
6. Forms: consistent two-column field rhythm (max-w for single-line inputs), section cards keep hierarchy without dead padding.

Result at 1920: tables use the full content column (~1,660 px usable vs ~1,150 px today on list pages); no nesting-level spacing stacking.

## H. Route-specific help

**Component**: `PageHeader` gains a `help` slot → `components/ui/page-help.tsx`: `CircleHelp` icon-button with tooltip «راهنمای این صفحه»; opens a Headless Dialog **side panel** (slides from the start side, RTL-safe, focus-trapped, Esc-dismiss, mouse+keyboard, closable) — never the whole documentation in a tooltip. **Content**: typed centralized registry `src/lib/route-help.ts`: `Record<RoutePath, { title, summary, sections: {heading, body}[], workflows? }>` — Persian, maintainable in one file, no scattered hardcoded text; easy to extend with new routes.

**Per-route Persian drafts** (v1 — verify domain phrasing against the live pages when implemented, marked ✓ where verified by recon):

| Route | Draft (title / summary / key points) |
|---|---|
| `/dashboard` | پیشخوان — نمای کلی عملیات: آمار کاربران/نقش‌ها/همکاران/سفارش‌ها، صف‌های انتظار بررسی، روند ۱۴روزه. «به‌روزرسانی» آمار را تازه می‌کند؛ درآمد فقط سفارش‌های تسویه‌شده را می‌شمارد؛ گروه‌بندی روزها بر پایه UTC. ✓ |
| `/products` | شبکه کاتالوگ — ویرایش سریع قیمت/موجودی/شناسه‌ها. فیلترها و مرتب‌سازی در نشانی صفحه ذخیره می‌شوند (قابل اشتراک). ویرایش درج‌دار با ذخیرهٔ دسته‌ای حداکثر ۵۰ ردیف؛ هر ردیف با «نسخه» (updatedAt) محافظت می‌شود؛ تداخل یعنی نسخهٔ سرور تغییر کرده — با «بررسی تغییر نسخه» تصمیم بگیرید. «تماس بگیرید» یعنی قیمت نمایشی ندارد. حذف واریانت از «عملیات» هر ردیف. ✓ |
| `/products/new` | ایجاد محصول — نام، نشانی (slug خودکار/دستی)، برند و دسته‌بندی الزامی‌اند. توضیح کامل اختیاری. تا انتشار، محصول پیش‌نویس می‌ماند. |
| `/products/:id/edit` | ویرایش محصول — تغییر برند/دسته‌بندی/ابعاد/گارانتری؛ نشانی را با احتیاط عوض کنید (لینک‌های فروشگاه). محصول بایگانی‌شده قابل ویرایش نیست (خطای ۴۰۹). |
| `/products/:id` | جزئیات محصول — مشخصات، واریانت‌ها و وضعیت چرخه عمر؛ عملیات انتشار/بایگانی از همین‌جا. |
| `/categories` | دسته‌بندی‌ها — مدیریت درختی؛ ترتیب و والد/فرزند؛ حذف دستهٔ دارای محصول با محدودیت. ✓ |
| `/brands` | برندها — فهرست، جستجو، ایجاد/ویرایش در گفت‌وگو؛ حذف با تأیید. ✓ |
| `/inventory` | موجودی — نمای واریانت‌محور؛ تعداد کل، رزرو، قابل‌فروش؛ ورود/اصلاح/رزرو/آزادسازی از اقدامات هر ردیف. ✓ |
| `/inventory/movements` | گردش موجودی — تاریخچه ورود/خروج با دلیل؛ فیلتر با `?variantId=`. ✓ |
| `/inventory/reservations` | رزروها — رزروهای فعال، منبع و انقضا؛ آزادسازی/مصرف از اقدامات. ✓ |
| `/inventory/variants/:variantId` | موجودی واریانت — همهٔ اقلام انبار این واریانت؛ دریافت/اصلاح per-warehouse. |
| `/inventory/warehouses/:warehouseId` | موجودی انبار — موجودی این انبار؛ اقلام per-variant. |
| `/warehouses` | انبارها — تعریف انبارها و وضعیت فعال/غیرفعال (فقط مدیر). ✓ |
| `/orders` | سفارش‌ها — فهرست با وضعیت پرداخت/ارسال؛ «در انتظار بررسی» یعنی نیازمند اقدام شما؛ ورود به جزئیات برای بررسی پرداخت در محل و تغییر وضعیت. ✓ |
| `/orders/:id` | جزئیات سفارش — اقلام، رویدادها، تغییر وضعیت، ثبت ارسال/ردیابی. |
| `/returns` | مرجوعی‌ها — درخواست‌های مرجوعی؛ بررسی/تأیید/رد با دلیل. ✓ |
| `/returns/:id` | جزئیات مرجوعی — اقلام و رویدادها؛ تصمیم‌های گردش کار. |
| `/notifications` | اعلان‌ها — اعلان‌های سیستمی؛ خواندن/حذف. ✓ |
| `/pricing` | قیمت‌گذاری — ۴ بخش: کش‌های قیمتی، قانون‌ها، کارمزد/برگه‌ها (tierها)؛ تغییر قیمت اینجا در فروشگاه با تقسیم بر ۱۰ (تومان) نمایش داده می‌شود. ✓ |
| `/rfq` | استعلام‌ها — درخواست‌های قیمت همکاران؛ «در انتظار بررسی» در صف داشبورد هم می‌آید. ✓ |
| `/rfq/:id` | جزئیات استعلام — اقلام و پاسخ‌ها؛ ثبت پیشنهاد. |
| `/reviews` | نقدها — تأیید/رد نقدهای مشتریان با دلیل. ✓ |
| `/blog` | وبلاگ — مقالات + مدیر دسته‌ها؛ پیش‌نویس‌ها در صف داشبورد. ✓ |
| `/blog/new` `/:id/edit` | ویرایشگر وبلاگ — متن غنی (TipTap)، پیش‌نمایش، تصویر شاخص؛ انتشار/بازگشت به پیش‌نویس. |
| `/partners` | درخواست‌های همکاری — گردش بررسی: پیش‌نویس→در انتظار→تأیید/رد؛ سطح همکاری پس از تأیید. ✓ |
| `/partners/:id` | جزئیات همکار — پروفایل، سطح، وضعیت؛ تغییر سطح/تعلیق. |
| `/users` | کاربران — جستجو، تعلیق/رفع تعلیق، بازکردن قفل، نقش‌ها. ✓ |
| `/users/:id` | جزئیات کاربر — پروفایل، نقش‌ها، نشست‌ها، تاریخچه. |
| `/roles` | نقش‌ها — نمای معنایی نقش‌ها و مجوزها (فقط مدیر، بدون ویرایش). ✓ |
| `/audit` | گزارش فعالیت‌ها — لاگ ممیزی با فیلتر؛ هر ردیف جزئیات payload دارد. ✓ |
| `/login` | خارج از چیدمان — بدون کمک صفحه (ورود با موبایل + کد یک‌بارمصرف). ✓ |

## I. Component architecture (exact paths)

**New**: `apps/admin/src/components/ui/table-pagination.tsx` · `apps/admin/src/components/ui/page-help.tsx` · `apps/admin/src/lib/route-help.ts` · `apps/admin/src/hooks/use-drag-scroll.ts` (+ test) · rewrite `apps/admin/src/components/catalog/editable-cell.tsx` (+ test updates).
**Modified**: `apps/admin/src/components/ui/horizontal-scroll.tsx` (rAF sync) · `table-card.tsx` · `page-header.tsx` (help slot) · `apps/admin/src/layouts/admin-layout.tsx` · `components/layout/{sidebar,app-header}.tsx` (solid chrome) · `apps/admin/src/index.css` (tokens, glass scope) · `components/catalyst/{table,button,badge,alert}.tsx` (single-scroller opt-out, semantic variants) · `pages/products-page.tsx` (filters, new fields) · `pages/dashboard-page.tsx` (translate audit codes) · `hooks/use-catalog-grid.ts` + `services/catalog-grid.ts` · `apps/api/src/modules/products/catalog-grid.{controller,service}.ts` + `dto/catalog-grid-batch.dto.ts` · `packages/types/src/product/catalog-grid.ts`.
**Extended (PR 5)**: `apps/api/test/admin-catalog-grid.e2e-spec.ts`.
**Reused as-is**: `use-catalog-drafts.ts` pipeline, `Pagination`+`pageNumbers()`, `multi-select-checkbox.tsx`, `slug-field.tsx`, `money-input.ts`, `DeleteConfirmDialog`, option hooks, `translateApiError()`.

## J. Implementation roadmap (PR boundaries — one issue each)

| PR | Scope | Files | Depends | Risk | Tests | Acceptance |
|---|---|---|---|---|---|---|
| **1. Scroll & grid perf** (pain point first — §15 order adjusted per findings) | D.3 fixes 1–4 + drag-to-pan + solid chrome + token groundwork | horizontal-scroll, editable-cell, catalyst/table, admin-layout, sidebar, app-header, index.css, products-page (cell wiring) | PR #328 merged | touches pinned grid tests | updated products-page tests; new use-drag-scroll tests | synthetic probe p95 <20 ms on preview build; all interactions preserved; gates green |
| **2. Design system & themes** | full token set, dark retune, button/badge/alert variants, glass→overlays-only, `.rule-double` promotion, focus rings, contrast validation | index.css, catalyst/*, sidebar, app-header | PR 1 | visual churn | vitest token/gate test, axe spot | contrast script report ≥4.5:1/≥3:1; both themes reviewed at 3 viewports |
| **3. Shared table infra** | TablePagination + 17-route migration + dense tables + page-width system + filter-panel collapse for grid | table-pagination (new), 17 pages, table-card, catalyst/table, page wrappers | PR 2 | mechanical breadth; may split into 3a (component+grid) / 3b (routes) | per-page vitest where pagination behavior is pinned | top+bottom controls synced on every paginated table; no pagination on static tables |
| **4. Contextual help** | PageHelp + route-help registry + all-route content | page-help (new), route-help (new), page-header, 30 page files (one-line slot) | PR 2 | content accuracy | a11y test (dialog focus/esc) | help available & keyboard-operable on every route; RTL verified |
| **5. Grid editing expansion** | API batch extension + e2e + product fields + 9-state visuals + filter redesign + keyboard model | dto/service/controller, types, use-catalog-grid, use-catalog-drafts, editable-cell, products-page | PRs 1–3 | API contract change | extended admin-catalog-grid e2e; draft/hook tests | all SS-257 guarantees preserved (≤50, per-row outcomes, updatedAt, SS-251); zero-drift oracle re-run |
| **6. Consistency & QA** | status-badge consolidation, empty/loading/error unification, dashboard raw-code fix, full matrix QA | ~30 badges, 12 error cards, dashboard | PRs 1–5 | breadth only | root gates + axe | matrix 1920/1440/1280/768/360 × light/dark × RTL complete; WCAG 2.2 AA spot checks |

## K. Verification strategy

- **Gates per PR**: `pnpm lint` / `typecheck` / `test` / `build` (root). Existing pins must survive: grid zero-drift cancel oracle, batch ≤50 chunking, per-row outcomes, conflict flows, column-chip persistence.
- **Scroll perf**: re-run the same synthetic probe before/after on `vite preview` (production build), plus a real-operator timed comparison mirroring the B-1 methodology (10 actions × 3 reps, median).
- **E2E**: API e2e extended only in PR 5; admin browser QA via the IAB oracle per session handoff (fresh-tab lesson), optional Playwright admin smoke if time allows.
- **A11y (WCAG 2.2 AA targets)**: axe scans on key pages; keyboard-only pass over the grid (edit→tab→save→conflict flow); focus-visible everywhere; `aria-live` save announcements; reduced-motion honored; contrast script over every token pair in C.1.
- **Theme/RTL/responsive**: matrix per §12/J-6; RTL arrow directions verified explicitly; Persian typography + LTR data spans checked.
- **DB integrity**: `apps/api/scripts/catalog-grid-zero-drift.sql` re-run after PR 5.

## L. Decisions

**Settled with the user (2026-11-07)**:
1. Product-level grid editing (name/brand/category) → **extend the catalog-grid batch API** (same guarantees), not client-side PATCH fan-out, not defer.
2. **Solid chrome** — glass removed from sticky header/sidebar; retained for dialogs/overlays.
3. Report delivered as **untracked doc now**; docs-branch PR only on explicit go-ahead (task rule: no new branches during the audit).

**Defaults taken (flag any to change)**:
- Brand/category pickers keep the existing 100-item option endpoints + client-side search; a server-search endpoint is documented as a gap, not built now.
- Drag-to-pan is mouse-only; touch/trackpad stay native; no new runtime dependencies (hook hand-rolled).
- Page-size default stays 50; no virtualization; sticky `thead` is a stretch goal inside PR 1.
- Dashboard raw audit codes are translated in PR 6 (not a schema change).
