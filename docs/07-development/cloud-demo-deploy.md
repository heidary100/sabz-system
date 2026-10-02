# Cloud Demo Deploy Runbook (SS-247)

> Free cloud deployment of the whole stack for customer pre-launch
> preview/testing. Complements `deploy-runbook.md` (the production
> procedure) — this runbook produces a **temporary demo**, not production.
> Issue: #297. Architecture decided 2026-10-01/02 with the client (no local
> tunnels, cloud-only, temporary random URLs acceptable).

## 1. Architecture

| Component | Host | Notes |
|---|---|---|
| API (`@sabz/api`) | GitHub Codespace (2-core/8 GB, West Europe) + Cloudflare quick tunnel | Product media + business documents **baked into the image**, pulled from the public `ghcr.io/heidary100/sabz-demo-api:demo` package; ephemeral in-container Redis. The Codespace runs the container and `cloudflared` publishes it at a trycloudflare.com URL. Render was tried first (402 card-required even on its free tier, 2026) and HF free Docker Spaces are PRO-only — the Codespace needs no new account and is included in GitHub Free (120 core-h/mo ≈ 60 h) |
| Postgres | Neon free tier | Restored from a `pg_dump` of the dev DB — catalog, orders, tiers all ride along |
| Redis | In-container (same Space) | OTP codes / OTP rate counters / throttle buckets only (deploy-runbook §1: all recreatable). Chosen over Upstash because `RedisService` (ioredis) has no TLS support |
| Storefront (`@sabz/storefront`) | Vercel Hobby | Next.js SSR; `NEXT_PUBLIC_*` inlined at **build time** |
| Admin (`@sabz/admin`) | Vercel Hobby (second project) | Static Vite SPA; `vercel.json` SPA rewrites; `VITE_API_BASE_URL` inlined at **build time**. (Cloudflare Pages was the original pick — the client could not complete its login — so both frontends ride the same Vercel account.) |

Cost: $0 (Neon free, GitHub Free Codespaces quota, Vercel Hobby free;
both frontends share one Vercel account). Distinct
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

## 4. Codespace + tunnel (API + media + Redis)

Artifacts: `deploy/hf-space/` (Dockerfile.space, start.sh, assemble.sh —
name kept for history). The image is built locally from the assembled
layout, pushed to GHCR (chunked blob upload — §8), then pulled and run
inside a Codespace.

```bash
deploy/hf-space/assemble.sh                      # → /tmp/sabz-demo-space
cd /tmp/sabz-demo-space && docker build -t ghcr.io/heidary100/sabz-demo-api:demo .
python3 chunked-push.py                          # chunked push (§8)
gh api --method PATCH /user/packages/container/sabz-demo-api  # n/a: flip
                                                 # visibility in the GitHub UI
                                                 # (Packages → sabz-demo-api →
                                                 # Danger Zone → Public)
gh cs create --repo heidary100/sabz-system --branch feat/ss-247-cloud-demo-deploy \
  --display-name sabz-demo --idle-timeout 240m --retention-period 720h --location WestEurope
# (old gh lacks these flags: POST /user/codespaces with repository_id, ref,
#  machine=basicLinux32gb, idle_timeout_minutes=240, retention_period_minutes=43200)
# write /tmp/demo-api.env (env table below) into the codespace, then:
gh cs ssh -c sabz-demo-… -- 'docker pull ghcr.io/heidary100/sabz-demo-api:demo \
  && docker run -d --name sabz-api -p 10000:10000 --env-file /tmp/demo-api.env \
     --restart unless-stopped ghcr.io/heidary100/sabz-demo-api:demo'
# public exposure (web-editor port forwarding stalls behind some proxies):
gh cs ssh -c sabz-demo-… -- 'curl -sL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  && chmod +x /tmp/cloudflared && nohup /tmp/cloudflared tunnel --url http://localhost:10000 > /tmp/cf.log 2>&1 &'
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cf.log   # the public API URL
```

### Container environment (in `/tmp/demo-api.env` inside the Codespace)

| Variable | Value |
|---|---|
| `NODE_ENV` | `development` (demo OTP gate — see §1) |
| `PORT` | `10000` |
| `TRUST_PROXY` | `true` |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` (in-container) |
| `DATABASE_URL` | Neon **pooled** URL with `sslmode=require&pgbouncer=true` (PgBouncer transaction mode needs `pgbouncer=true` for Prisma) |
| `CORS_ORIGINS` | `https://sabz-storefront-demo.vercel.app,https://sabz-admin-demo.vercel.app` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | fresh randoms (§2) |
| `STOREFRONT_REVALIDATE_TOKEN` | `REVALIDATE_TOKEN` from §2 |
| `COD_ENABLED` | `true` |
| `SHIPPING_TIPAX_ENABLED` / `_FEE` | `true` / `250000` |
| `SHIPPING_POST_ENABLED` / `_FEE` | `true` / `180000` |
| `SHIPPING_LOCAL_ENABLED` / `_FEE` | `true` / `50000` |
| `SHIPPING_PICKUP_ENABLED` / `_FEE` | `true` / `0` |
| `WATERMARK_ENABLED` | `true` |

Storage paths (`PRODUCT_MEDIA_STORAGE_DIR=/app/.data/product-media`,
`DOCUMENT_STORAGE_DIR=/app/.data/documents`) are **pinned as image ENV** in
`Dockerfile.space`.

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
| `NEXT_PUBLIC_API_BASE_URL` | the current tunnel URL + `/api/v1` |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | same as above (browser media/videos; the image optimizer uses it server-side) |
| `API_INTERNAL_BASE_URL` | same as above (server components) |
| `NEXT_PUBLIC_SITE_URL` | `https://sabz-storefront-demo.vercel.app` (set after the first deploy assigns it, then redeploy) |
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
| `VITE_API_BASE_URL` | the current tunnel URL + `/api/v1` |

`apps/admin/vercel.json` rewrites unmatched paths to `/index.html` so SPA
deep links (`/orders`, `/pricing`, …) survive a hard refresh (Vercel serves
static files before applying rewrites, so `/assets/*` is unaffected).

## 7. Wiring + smoke test

1. The API's `CORS_ORIGINS` is already set at service creation (§4 table).
2. Redeploy the storefront if `NEXT_PUBLIC_SITE_URL` changed.
3. Smoke (from an Iranian mobile network, not just WiFi) — mirrors
   deploy-runbook §3 plus demo flows:

```bash
curl -f https://<tunnel>/api/v1/health   # {"status":"ok","redis":"ok"}
curl -f -o /dev/null -w '%{http_code}\n' \
  "https://<tunnel>/api/v1/catalog/products?limit=1"   # 200
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

- **Redeploy API**: rebuild the image locally → chunked push (same `:demo`
  tag) → Render → Manual Deploy (re-pulls the image). **Storefront /
  admin**: `vercel deploy --prod` from the repo root (`.vercelignore` keeps
  the upload to workspace sources only — the `.turbo` cache alone is 2.5 GB
  and the Vercel CLI does not respect `.gitignore`).
- **Teardown**: delete the Render service, both Vercel projects, and the
  Neon project, remove the `demo-keepalive` workflow and the ghcr package —
  all free-tier resources, nothing persistent left behind. Neon data dies
  with the project; re-export from dev if needed.
- **Chunked uploader summary**: `docker save` the image, resolve the OCI
  index → `linux/amd64` manifest, then per blob: HEAD (skip if present) →
  POST upload session → PATCH in ≤4 MB chunks (adaptive halving on ghcr's
  416 "body too large") → PUT `?digest=` finalize → PUT the tag manifest.

## 9. Known caveats (customer factsheet material)

- Render free **spins the API down after 15 idle minutes** (~1 min cold
  start on the next request). `.github/workflows/demo-keepalive.yml` pings
  `/api/v1/health` every 5 minutes to keep it warm (disable after the demo;
  scheduled Actions on a private repo bill against the free 2000
  min/month, ~300 min/mo for this).
- Free tier is 512 MB RAM / 0.1 CPU: image serving is slower than a real
  server, and re-watermarking large uploaded videos during the demo may OOM.
- The ghcr package is **public** (image layers contain the code +
  watermarked product images; all credentials are injected as Render env
  vars, never baked into the image).
- Runtime uploads (product media/documents created during the demo) are
  **lost when the service redeploys or restarts**; database records persist
  in Neon.
- Refresh sessions reset on API restart (in-container Redis holds nothing
  persistent; re-login if odd auth states appear).
- Vercel Hobby is non-commercial per its ToS — acceptable for a short demo.
- The dev DB contains intentional SS-245 QA test data (order ۱۰۰٬۰۰۷, a
  return request, a review, a blog draft, 4 notifications). The
  `ImportRecord` table (import history metadata) was excluded from the
  restore — the flaky network path could not move its single large COPY
  stream; it has no demo or production value (production imports fresh per
  the import runbook).
- Fallback if the Render free tier proves unusable: ClawCloud Run ($5/mo
  credit with a GitHub login) for the API container; everything else
  unchanged.
