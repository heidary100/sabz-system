# Sabz System — brand and UI redesign

Status: implemented on `feat/ss-900-platform-improvements`; changes are not
committed, merged, or deployed. This note is the design-system contract for the
Admin Panel and Storefront refresh.

## 1. Official assets

The client supplied one authoritative logo file:

- source: `/home/mohammad/Downloads/IMG_20261118_234522_096.png`
- 256×256 RGBA, transparent
- SHA-256 `58357887b73dd681b3d0fff89803d324b70406b14942856b73a4cd4f133fb016`

The exact bytes are used in all three applications. No artwork was recreated,
recolored, cropped, distorted, or given extra text.

| Location | Purpose |
|---|---|
| `apps/admin/public/brand/logo.png` | Admin master (exact copy) |
| `apps/admin/public/brand/logo-64.png` | Sidebar/header mark |
| `apps/admin/public/favicon-16.png`, `favicon-32.png`, `favicon.ico` | Admin favicons |
| `apps/admin/public/apple-touch-icon.png` | Admin iOS icon (mark on `#F4F6F5`) |
| `apps/storefront/public/brand/logo.png` | Storefront master (exact copy) |
| `apps/storefront/public/brand/logo-64.png`, `logo-128.png` | Header/footer/mobile marks |
| `apps/storefront/public/brand/icon-16.png`, `icon-32.png` | Storefront favicons |
| `apps/storefront/public/brand/apple-touch-icon.png` | Storefront iOS icon |
| `apps/storefront/public/brand/og-1200x630.png` | Storefront OpenGraph image |
| `apps/api/assets/brand/logo.png` | PDF invoice and product-image watermark |
| `apps/api/assets/watermark/logo-placeholder.svg` | Fallback watermark lockup embedding the exact master |
| `company-logo.png` (repo root) | Kept in sync with the same master |

`apps/storefront/src/lib/brand.ts` is the single storefront asset registry;
header, footer, mobile drawer, login, metadata and OpenGraph all resolve through
it. The invoice embeds the API master as a data URI, so the PDF is
self-contained and offline-safe.

## 2. Palette and token architecture

Primitive values live in `packages/config/design-tokens.css`. Both apps import
that file and map it into their existing semantic names, so components were not
renamed just to change colors.

Official brand values:

- primary green `#16A54B`
- neutral gray `#707271`

Derived green ramp: `#F1FBF5` … `#16A54B` … `#042B14`. On light surfaces the
action/link green is `#0B6B2F` because white text reaches 6.65:1; official
`#16A54B` is used as the filled action in dark mode and for stage accents.
Muted copy uses accessible neutral derivatives (`#646765` light, `#A7AEA9`
dark) while `#707271` remains the neutral ramp anchor.

Semantic tokens:

| Role | Admin | Storefront |
|---|---|---|
| page canvas | `--sabz-background` | `--ss-bg` |
| card/plate | `--sabz-surface` / `--sabz-surface-strong` | `--ss-surface` / `--ss-plate` |
| body / secondary / muted | `--sabz-foreground` / `--sabz-muted` | `--ss-fg` / `--ss-fg-secondary` / `--ss-fg-muted` |
| border / strong / control | `--sabz-border`, `--sabz-border-strong` | `--ss-border`, `--ss-border-strong`, `--ss-border-control` |
| primary action | `--sabz-primary-strong`, `--sabz-on-primary` | `--ss-accent`, `--ss-on-accent` |
| hover / active | `--sabz-primary-hover`, `--sabz-primary-active` | `--ss-accent-hover` |
| selected / soft | `--sabz-primary-subtle`, `--sabz-primary-border` | `--ss-accent-soft` |
| focus | `--sabz-focus-ring` | `--ss-focus`, `--ss-focus-stage` |
| success / warning / danger / info | `--sabz-*` + `-subtle` + `-border` + `on-danger` | `--ss-success`, `--ss-warning`, `--ss-danger`, `--ss-sale` + soft |
| stage (footer/hero) | n/a | `--ss-stage`, `--ss-on-stage*`, `--ss-focus-stage` |

Light theme: `#F4F6F5` canvas, white cards, charcoal text, cool gray borders.
Dark theme: `#0F1210` canvas, `#171B18` cards (`#1C211D` raised chrome),
green-charcoal stage, never pure black. Shadows are reserved for overlays,
dialogs and lift; cards are border-first. Radii are constrained to
control/card/panel/pill (10/16/22/full), and both apps use the same Vazirmatn
stack.

## 3. Major UI/UX changes

Admin:

- brand lockup replaces the old sprout/text badge in the sidebar, mobile drawer
  and login; `AdminBrandLockup` renders the exact mark and Persian wordmark;
- grouped, scrollable navigation (نمای کلی، کاتالوگ، فروش، پشتیبانی، محتوا،
  تنظیمات و دسترسی) with a clear active rail, collapse mode and RTL-aware
  content-boundary rule;
- lighter dashboard cards with semantic value colours instead of a rainbow of
  accent bars; the revenue value no longer wraps; table cards, dialogs,
  notifications, forms and the footer preview use the shared surfaces and
  status tokens;
- primary save/action buttons on currency and footer settings now use the brand
  action colour; notification badge uses an accessible `on-danger` foreground;
- login is a focused brand card with the real mark, green rule and RTL form.

Storefront:

- header/footer/mobile drawer/login all render the same mark; header mark is
  40 CSS px (served from the 128 px derivative) and remains uncropped;
- category sibling chips, filter sheets, active filter pills, product cards and
  the compare table use the unified semantic surfaces; active chips invert
  correctly between themes;
- mobile filter sheet keeps its footer CTA and closes on a valid submit;
- focus rings on the dark hero/footer/gallery stage use `--ss-focus-stage` so
  keyboard focus stays visible; muted text and control borders were darkened to
  clear AA on tinted surfaces;
- footer uses the deep stage, green top rule and the real mark.

## 4. Verification

Commands run from the workspace:

```bash
pnpm --filter @sabz/admin contrast
pnpm --filter @sabz/admin typecheck
pnpm --filter @sabz/admin test
pnpm --filter @sabz/admin build
pnpm --filter @sabz/storefront typecheck
pnpm --filter @sabz/storefront test
pnpm --filter @sabz/storefront build
pnpm --filter @sabz/api typecheck
```

Contrast evidence:

- `apps/admin/scripts/check-contrast.mjs` reports “All pairs pass.” for body,
  muted, badge, danger-fill, primary-button, focus and border pairs in light and
  dark themes.
- `apps/storefront/src/lib/theme-contrast.test.ts` pins 56 light/dark pairs,
  including muted copy on every surface, accent/on-accent, sale, danger, stage
  and focus-stage pairs.

Browser evidence (Playwright + real Chrome against the running stack):

- Admin: login, dashboard light/dark, collapsed sidebar, mobile drawer,
  notifications popover, currency, footer settings, category delete dialog,
  product detail.
- Storefront: home light/dark, category light/dark, subcategory navigation,
  search overlay, login, PDP, footer, compare with two products, mobile filter
  sheet light/dark and a filtered result (`?brand=seagate`).
- Invoice: a real headless-Chromium PDF was rendered with the API service; the
  embedded logo decodes to the exact master SHA-256. Product cards show the new
  watermark mark.

Screenshots from the final pass are under
`/tmp/opencode/screens/qa2/` (local evidence only; not committed).

## 5. Known environment issue

The container’s seeded catalog has `ProductMedia` rows whose backing files are
missing, so some product cards show the designed image placeholder and emit
`404` requests for `/catalog/media/<id>`. The catalog shell, typography,
watermark, cards and interactions are unaffected; this is dev-data drift, not a
redesign regression.
