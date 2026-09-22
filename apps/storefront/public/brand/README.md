# Brand kit (SS-209)

Single source of truth for the Sabz System storefront brand. Every component
renders the logo through `src/lib/brand.ts` — **replacing the logo means
swapping files here, never editing components**.

## Files

| File | Purpose |
|---|---|
| `logo.png` | Raster master: the real company mark (green/grey interlocking-S, transparent), 141px RGBA ingested from root `company-logo.png` |
| `logo-64.png` / `logo-128.png` | Downscaled derivatives for header/footer/mobile nav (`next/image`; 64px file at 32 CSS px = retina) |
| `icon-32.png` | 32px PNG favicon |
| `apple-touch-icon.png` | 180px iOS home-screen icon (mild 1.28x upscale of the 141px master — acceptable interim) |
| `og-1200x630.png` | OpenGraph link-preview image (sand backdrop, mark capped at 200px to avoid a soft 2x+ upscale) |

## Replacing the logo

1. Drop the new master over `logo.png` (keep the file name) and re-render
   the derivatives at the same sizes (any raster tool; keep transparency
   except `og-1200x630.png` and `apple-touch-icon.png`).
2. Re-render `og-1200x630.png` with the real lockup if a wordmark is supplied.
3. No code changes: `brand.ts` paths stay valid. Verify header / footer /
   mobile drawer / favicon / link preview at 360px and 1440px.

## Still wanted (vector master)

A real SVG master would sharpen large-size uses (OG, print, future
high-DPI surfaces) and remove the 180px upscale. Until then the 141px
raster master covers every shipped size: the largest render is the 128px
nav derivative and the ~120px watermark logo (downscales, never upscaled).

## Palette (AGENTS.md)

Primary `#3a5a40` · Primary dark `#344e41` · Secondary `#588157` ·
Accent `#a3b18a` · Background `#f8f7f5` · Text `#312e24` · Border `#dad7cd`
