# Brand kit

Single source of truth for the Sabz System storefront brand. Every component
renders the logo through `src/lib/brand.ts` — **replacing the logo means
swapping files here, never editing components**.

## Official mark

The client supplied the official transparent PNG master at
`/home/mohammad/Downloads/IMG_20261118_234522_096.png` (256×256 RGBA,
SHA-256 `58357887b73dd681b3d0fff89803d324b70406b14942856b73a4cd4f133fb016`).
The exact bytes are copied to `logo.png` in this folder and to the API brand
asset. Derivatives are resized only; the artwork is never recolored,
recreated, cropped, or given added text.

| File | Format / dimensions | Purpose |
|---|---|---|
| `logo.png` | PNG 256×256 RGBA (transparent) | Exact official master |
| `logo-64.png` / `logo-128.png` | PNG 64×64 / 128×128 RGBA | Header/footer/mobile derivatives |
| `icon-32.png` / `icon-16.png` | PNG 32×32 / 16×16 RGBA | Browser favicons |
| `apple-touch-icon.png` | PNG 180×180 RGB | iOS home-screen icon (mark centred on neutral brand surface) |
| `og-1200x630.png` | PNG 1200×630 RGB | OpenGraph preview (mark centred on neutral brand surface) |

All paths are referenced from `apps/storefront/src/lib/brand.ts`
(`/brand/…`, consumed by header, footer, mobile nav and the app metadata in
`src/app/layout.tsx`).

## Replacing the logo / favicon / OG image

1. Replace `logo.png` with the supplied transparent master (keep the file
   name and square proportions).
2. Re-render `logo-64.png`, `logo-128.png`, `icon-32.png`, `icon-16.png`,
   `apple-touch-icon.png`, `og-1200x630.png` from that master.
3. No code changes: `brand.ts` paths stay valid.

## API watermark / invoice assets

The product-image watermark and PDF invoice read
`apps/api/assets/brand/logo.png`, which is byte-identical to this master.
It is configured by `WATERMARK_LOGO_PATH` / `INVOICE_LOGO_PATH`.

## Palette

Official primary `#16A54B` · neutral `#707271`. The accessible action/text
variant on light surfaces is `#0B6B2F`; full semantic tokens live in
`packages/config/design-tokens.css`.
