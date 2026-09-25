# Brand kit (SS-209)

Single source of truth for the Sabz System storefront brand. Every component
renders the logo through `src/lib/brand.ts` — **replacing the logo means
swapping files here, never editing components**.

## Files

| File | Format / dimensions | Purpose |
|---|---|---|
| `logo.png` | PNG 141×141 RGBA (transparent) | Raster master: the real company mark (green/grey interlocking-S), ingested from root `company-logo.png` |
| `logo-64.png` / `logo-128.png` | PNG 64×64 / 128×128 RGBA | Downscaled derivatives for header/footer/mobile nav (`next/image`; 64px file at 32 CSS px = retina) |
| `icon-32.png` | PNG 32×32 RGBA | Favicon |
| `apple-touch-icon.png` | PNG 180×180 RGB (opaque) | iOS home-screen icon (mild 1.28x upscale of the 141px master — acceptable interim) |
| `og-1200x630.png` | PNG 1200×630 RGB (opaque) | OpenGraph link-preview image (sand backdrop, mark capped at 200px to avoid a soft 2x+ upscale) |

All paths are referenced from `apps/storefront/src/lib/brand.ts`
(`/brand/…`, consumed by header, footer, mobile nav and the app metadata in
`src/app/layout.tsx`).

## Replacing the logo / favicon / OG image

1. Drop the new master over `logo.png` (keep the file name, keep 141×141 or
   larger, keep transparency) and re-render the derivatives at the same
   sizes: `logo-64.png`, `logo-128.png`, `icon-32.png` (32×32, transparent),
   `apple-touch-icon.png` (180×180, opaque).
2. Re-render `og-1200x630.png` (1200×630, opaque) with the real lockup if a
   wordmark is supplied.
3. No code changes: `brand.ts` paths stay valid.

## Validation checklist (after any replacement)

- [ ] Storefront header, footer and mobile drawer logo (360px and 1440px)
- [ ] Browser tab favicon (hard-refresh; favicons cache aggressively)
- [ ] Link preview (OG image) via a paste into a chat/scrape tool
- [ ] No broken asset references (all `/brand/…` paths resolve under
      `apps/storefront/public/brand/`)
- [ ] `pnpm --filter @sabz/storefront build` passes (Next.js inlines the
      metadata at build time; restart the dev server or rebuild to see
      favicon/OG changes)

## API watermark asset

The product-image watermark reads a separate copy of the mark:
`apps/api/assets/brand/logo.png` (PNG 141×141 RGBA). It is served through the
media-processing pipeline, not the storefront, and is configured by the
`WATERMARK_*` variables in the root `.env.example` — `WATERMARK_LOGO_PATH`
(default `assets/brand/logo.png`, resolved against the API package
directory). Replace it by swapping that file (a larger transparent master is
better here: the pipeline downscales, never upscales) or by pointing
`WATERMARK_LOGO_PATH` at a new file, then restarting the API. Already-stored
images keep the mark they were watermarked with; listing thumbnails rendered
under `WATERMARK_THUMBNAIL_MODE=smaller` draw their own smaller mark from the
same logo file.

## Still wanted (vector master)

A real SVG master would sharpen large-size uses (OG, print, future
high-DPI surfaces) and remove the 180px upscale. Until then the 141px
raster master covers every shipped size: the largest render is the 128px
nav derivative and the ~120px watermark logo (downscales, never upscaled).

## Palette (AGENTS.md)

Primary `#3a5a40` · Primary dark `#344e41` · Secondary `#588157` ·
Accent `#a3b18a` · Background `#f8f7f5` · Text `#312e24` · Border `#dad7cd`
