# Cloud Demo Deploy Runbook (SS-247)

> Free cloud deployment of the whole stack for customer pre-launch
> preview/testing. Complements `deploy-runbook.md` (the production
> procedure) — this runbook produces a **temporary demo**, not production.
> Issue: #297. Architecture decided 2026-10-01/02 with the client (no local
> tunnels, cloud-only, temporary random URLs acceptable).

## 1. Architecture

| Component | Host | Notes |
|---|---|---|
| API (`@sabz/api`) | Hugging Face Space (Docker SDK, free CPU tier) | Product media + business documents **baked into the image** (no persistent disk on free Spaces); ephemeral in-container Redis; `app_port` 7860 |
| Postgres | Neon free tier | Restored from a `pg_dump` of the dev DB — catalog, orders, tiers all ride along |
| Redis | In-container (same Space) | OTP codes / OTP rate counters / throttle buckets only (deploy-runbook §1: all recreatable). Chosen over Upstash because `RedisService` (ioredis) has no TLS support |
| Storefront (`@sabz/storefront`) | Vercel Hobby | Next.js SSR; `NEXT_PUBLIC_*` inlined at **build time** |
| Admin (`@sabz/admin`) | Vercel Hobby (second project) | Static Vite SPA; `vercel.json` SPA rewrites; `VITE_API_BASE_URL` inlined at **build time**. (Cloudflare Pages was the original pick — the client could not complete its login — so both frontends ride the same Vercel account.) |

Cost: $0 (Neon, HF Spaces and Vercel Hobby all have no-credit-card free
tiers; both frontends share one Vercel account). Distinct
hostnames per frontend = the #290 refresh-cookie mitigation
(deploy-runbook §1).

**Deliberate demo deviations from the production runbook:**

- `NODE_ENV=development` on the demo API — keeps the hard-coded dev OTP
  (`123456`, `otp.service.ts`) working so the customer can self-serve the
  admin login. Trade-off: Swagger UI at `/api/docs` is public for the demo
  period. Production runs `NODE_ENV=production` (deploy-runbook §1).
- JWT secrets are fresh randoms (not the production ones).
- Runtime-written files (media/documents uploaded through the demo, admin
  uploads) are **lost on Space restart**; Postgres records persist in Neon.

## 2. Data export (from the dev machine)

```bash
mkdir -p /tmp/sabz-demo-export/{media,documents}

# Database (9.9 MB with the dev catalog)
docker exec sabz-postgres pg_dump -U sabz -d sabz -Fc -f /tmp/sabz-demo.dump
docker cp sabz-postgres:/tmp/sabz-demo.dump /tmp/sabz-demo-export/sabz-demo.dump

# Media + documents volumes (~500 MB / 88 KB as of 2026-10-02)
docker run --rm -v sabz-system_api_product_media:/from -v /tmp/sabz-demo-export/media:/to \
  alpine sh -c 'cp -a /from/. /to/'
docker run --rm -v sabz-system_api_documents:/from -v /tmp/sabz-demo-export/documents:/to \
  alpine sh -c 'cp -a /from/. /to/'
```

Demo secrets (never committed): `openssl rand -hex 48` ×2 for
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, `openssl rand -hex 32` for
`REVALIDATE_TOKEN`.

## 3. Neon setup

1. Create a Neon project (region close to the customer, e.g. AWS Frankfurt).
2. Copy the **pooled** connection string; append `?sslmode=require` if absent.
3. Restore from the dev machine (the `sabz-postgres` container has the
   Postgres 16 client and outbound network):

```bash
docker cp /tmp/sabz-demo-export/sabz-demo.dump sabz-postgres:/tmp/
docker exec sabz-postgres pg_restore -d "<NEON_POOLED_URL>" --no-owner --role=sabz /tmp/sabz-demo.dump
```

4. Verify counts match dev (products ≈ 1100):

```bash
docker exec sabz-postgres psql "<NEON_POOLED_URL>" -c \
  "select (select count(*) from \"Product\") products, (select count(*) from \"ProductMedia\") media, (select count(*) from \"PartnerTier\") tiers, (select count(*) from \"User\") users;"
```

`seed:reference` is NOT needed after a dump restore (the dev DB has the 3
tiers); it remains the fallback for a fresh empty database.

## 4. Hugging Face Space (API + media + Redis)

Artifacts: `deploy/hf-space/` (Dockerfile.space, start.sh, README.space.md,
assemble.sh). HF Docker Spaces require a root `Dockerfile` + `README.md`
with `sdk: docker` / `app_port: 7860` front-matter — assemble.sh produces
both from the **current commit** (`git archive`; commit your changes first).

```bash
deploy/hf-space/assemble.sh            # → /tmp/sabz-demo-space (~509 MB)
# validate locally before pushing (optional but recommended):
cd /tmp/sabz-demo-space && docker build -t sabz-demo-api:test .

# push (Space repo is empty over HTTPS; token = HF write token)
cd /tmp/sabz-demo-space
git init -b main
git add -A && git commit -m "Sabz demo API (SS-247)"
git remote add origin https://<HF-USERNAME>:<HF-WRITE-TOKEN>@huggingface.co/spaces/<HF-USERNAME>/sabz-demo
git push -u origin main --force
```

No git-lfs needed (largest media file ~4.7 MB). Every push uploads the full
~509 MB context — expect a slow one-time upload.

### Space configuration (Settings → Variables and secrets)

Variables (non-secret):

| Variable | Value |
|---|---|
| `NODE_ENV` | `development` (demo OTP gate — see §1) |
| `PORT` | `7860` |
| `TRUST_PROXY` | `true` |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |
| `CORS_ORIGINS` | `https://<vercel-storefront>,https://<cf-admin>` (fill after §5/§6, then restart) |
| `PRODUCT_MEDIA_STORAGE_DRIVER` | `local` |
| `PRODUCT_MEDIA_STORAGE_DIR` | `/app/.data/product-media` |
| `PRODUCT_MEDIA_TEMP_DIR` | `/app/.data/product-media/tmp` |
| `DOCUMENT_STORAGE_DRIVER` | `local` |
| `DOCUMENT_STORAGE_DIR` | `/app/.data/documents` |
| `COD_ENABLED` | `true` |
| `SHIPPING_TIPAX_ENABLED` / `_FEE` | `true` / `250000` |
| `SHIPPING_POST_ENABLED` / `_FEE` | `true` / `180000` |
| `SHIPPING_LOCAL_ENABLED` / `_FEE` | `true` / `50000` |
| `SHIPPING_PICKUP_ENABLED` / `_FEE` | `true` / `0` |
| `WATERMARK_ENABLED` | `true` |

Secrets:

| Secret | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL with `sslmode=require` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | fresh randoms (§2) |
| `STOREFRONT_REVALIDATE_TOKEN` | `REVALIDATE_TOKEN` from §2 |

The Space URL is `https://<HF-USERNAME>-sabz-demo.hf.space`. First build
takes ~10 min (pnpm install + nest build + 500 MB context upload).

## 5. Vercel storefront

1. Dashboard → Import the repo; **Root Directory = `apps/storefront`**
   (Vercel runs the pnpm workspace install at the repo root).
2. Project settings → Node.js Version 22; build command (workspace deps are
   consumed via dist):
   `cd ../.. && pnpm --filter @sabz/types build && pnpm --filter @sabz/api-client build && pnpm --filter @sabz/search build && pnpm --filter @sabz/storefront build`
3. Environment variables — **set before the first deploy** (all inlined at
   build time):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://<HF-USERNAME>-sabz-demo.hf.space/api/v1` |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | same as above (browser media/videos; the image optimizer uses it server-side) |
| `API_INTERNAL_BASE_URL` | same as above (server components) |
| `NEXT_PUBLIC_SITE_URL` | the final `*.vercel.app` URL (set after the first deploy assigns it, then redeploy) |
| `REVALIDATE_TOKEN` | same secret as the API |

## 6. Vercel admin (second project)

Same account as §5; the two frontends deploy as separate projects with
distinct hostnames (#290 mitigation).

Project settings: **Root Directory = `apps/admin`**, Node 22, output
directory `apps/admin/dist` (auto-detected Vite), build command:

```
cd ../.. && pnpm --filter @sabz/types build && pnpm --filter @sabz/api-client build && pnpm --filter @sabz/admin build
```

Environment variable — **set before the first deploy** (inlined at build
time):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://<HF-USERNAME>-sabz-demo.hf.space/api/v1` |

`apps/admin/vercel.json` rewrites unmatched paths to `/index.html` so SPA
deep links (`/orders`, `/pricing`, …) survive a hard refresh (Vercel serves
static files before applying rewrites, so `/assets/*` is unaffected).

## 7. Wiring + smoke test

1. Set the API's `CORS_ORIGINS` (§4 table) to the two frontend origins and
   restart the Space (Settings → Factory rebuild not needed; a restart is
   enough).
2. Redeploy the storefront if `NEXT_PUBLIC_SITE_URL` changed.
3. Smoke (from an Iranian mobile network, not just WiFi) — mirrors
   deploy-runbook §3 plus demo flows:

```bash
curl -f https://<HF-USERNAME>-sabz-demo.hf.space/api/v1/health   # {"status":"ok","redis":"ok"}
curl -f -o /dev/null -w '%{http_code}\n' \
  "https://<HF-USERNAME>-sabz-demo.hf.space/api/v1/catalog/products?limit=1"   # 200
```

- Storefront: home → category → product page (**image + thumbnail + video
  load**), search, cart → COD checkout with a shipping method → order shows
  in admin.
- Admin: login `+989170000001` / OTP `123456`, edit a product (media upload
  works but is lost on restart), «پله‌های همکاری» tier tab, notifications
  page.
- Storefront + admin signed in **in the same browser** must coexist
  (distinct hostnames, #290).

## 8. Redeploy / teardown

- **Redeploy API**: commit → `assemble.sh` → push (full context upload
  again). **Storefront**: redeploy from Vercel. **Admin**: rebuild +
  `wrangler pages deploy`.
- **Teardown**: delete the Space, both Vercel projects, and the Neon
  project — all free-tier resources, nothing persistent left behind. Neon
  data dies with the project; re-export from dev if needed.

## 9. Known caveats (customer factsheet material)

- Free Spaces **sleep after 48 h of inactivity**; the first visit after a
  sleep waits ~1–2 min (Space wakes on request). Keep-alive pings (free
  GitHub Actions cron) can prevent this.
- Space **source is public** (code + watermarked product images; secrets
  stay encrypted in Space settings).
- Runtime uploads (product media/documents created during the demo) are
  **lost when the Space restarts**; database records persist in Neon.
- Refresh-token sessions reset on Space restart (in-container Redis holds
  nothing persistent; the cookie references a session that stays in the DB
  but API restarts are safe — re-login if odd auth states appear).
- Vercel Hobby is non-commercial per its ToS — acceptable for a short demo.
- The dev DB contains intentional SS-245 QA test data (order ۱۰۰٬۰۰۷, a
  return request, a review, a blog draft, 4 notifications).
- Fallback if the HF free tier misbehaves: ClawCloud Run ($5/mo credit,
  GitHub login) for the API container; everything else unchanged.
