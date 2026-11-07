# SS-271 Admin Consistency QA Evidence

Date: 2026-11-07
Branch: `feat/ss-271-admin-consistency`
Environment: local admin dev server (`http://localhost:5174`), local API (`http://localhost:3000/api/v1`), seeded admin `+989170000001`, deterministic dev OTP.

## Automated gates

| Gate | Result |
|---|---|
| `pnpm lint` | PASS (2 pre-existing storefront warnings) |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS — admin 180, API 1507, storefront 312, search 29, api-client 11 |
| `pnpm build` | PASS |
| `pnpm --filter @sabz/admin contrast` | PASS — 38 token pairs (light/dark, text ≥4.5:1, UI ≥3:1) |
| `pnpm --filter @sabz/admin check:audit-labels` | PASS — 88 actions, 25 entities, zero raw fallbacks |
| axe-core 4.10.2 (WCAG 2.0/2.1/2.2 A+AA tags) | PASS — 0 violations across the 40 configurations below |

## Matrix method

Each configuration was rendered in a same-origin 100%-scale iframe sized to the target viewport, with the seeded admin session, RTL direction, and the requested theme (`dark` class or light). Before each scan, transitions/animations were disabled and layout was forced; axe was then run against the full document. Horizontal overflow was measured as `document.documentElement.scrollWidth - innerWidth`; any positive value is a failure.

Pages: `/products` (grid), `/orders` (dense table + two badge families), `/audit` (filters + long labels + dialog), `/pricing` (tabs + four tables + inline status).

## 40-configuration results

| Viewport | Theme | `/products` | `/orders` | `/audit` | `/pricing` |
|---|---|---|---|---|---|
| 1920×1080 | Light | PASS | PASS | PASS | PASS |
| 1920×1080 | Dark | PASS | PASS | PASS | PASS |
| 1440×900 | Light | PASS | PASS | PASS | PASS |
| 1440×900 | Dark | PASS | PASS | PASS | PASS |
| 1280×800 | Light | PASS | PASS | PASS | PASS |
| 1280×800 | Dark | PASS | PASS | PASS | PASS |
| 768×1024 | Light | PASS | PASS | PASS | PASS |
| 768×1024 | Dark | PASS | PASS | PASS | PASS |
| 360×800 | Light | PASS | PASS | PASS | PASS |
| 360×800 | Dark | PASS | PASS | PASS | PASS |

All 40 rows: axe violations `0`, no positive horizontal overflow.

## Additional checks

- **RTL**: admin shell and all four pages render `dir="rtl"`; LTR data spans (UUID, SKU, phone, dates) retain `dir="ltr"` where present.
- **Audit localization**: dashboard, audit table, audit details dialog, and both filter selects render Persian labels only; the label drift gate covers 88 actions / 25 entities.
- **Badges**: orders, audit, pricing, dashboard, returns, and RFQ smoke checks render semantic token classes (`bg-success-subtle text-success`, `bg-warning-subtle text-warning`, `bg-info-subtle text-info`, `bg-danger-subtle text-danger`, neutral surface/muted). No `lime` status badges remain.
- **Error/empty/loading**: page-level failures use `ErrorState` (`role="alert"` + retry), inline failures use `InlineError` (`danger-box` + alert), empty states share `EmptyState` (default/compact), loading spinner honors `motion-reduce`.
- **Reduced motion**: `Loading`, `Alert`, `PageHelp`, and sidebar transitions carry `motion-reduce` variants.
- **Focus-visible**: Catalyst buttons, inputs, selects, pagination, and row actions retain their focus-ring classes; pricing tabs now expose `role="tab"`, `aria-selected`, and `aria-controls`.
- **Contrast fixes found by axe**: dark primary button label now uses `--sabz-on-primary` on a darker `primary-strong` fill; token pair is gated.

## Known limitation

This matrix verifies DOM structure, accessibility rules, theme tokens, and horizontal overflow programmatically. It is not a substitute for a human visual sign-off on spacing, typography rhythm, or Persian copy nuance; those remain an operator review item.
