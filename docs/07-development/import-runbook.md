# Sabz System Platform
# Catalog Import Runbook

Version: 1.0 (SS-219)

---

# Purpose

This runbook documents the verified path from an **empty machine** to a
working storefront, in two clearly separated variants:

- **Path A — demo development**: fresh environment → PostgreSQL → migrations
  → demo seed → storefront. Small deterministic dataset for local
  development, tests, and UI work.
- **Path B — real catalog**: fresh environment → PostgreSQL → migrations →
  WooCommerce CSV export → `woo:import` → media download → storefront with
  the production-shaped catalog (~1100 products).

Do not mix the two paths on one database. The demo seed and the real import
must never be merged into the same catalog.

Executable sources of truth: `apps/api/src/modules/import/` (importer),
`apps/api/prisma/seed.ts` + `seed-catalog.ts` (demo seed),
`docker-compose.yml` (environment). Field-mapping semantics live in
[the WooCommerce import mapping](../04-database/woo-import-mapping.md).

---

# Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker + Docker Compose | 24+ / v2.20+ | The primary way to run everything, including the import CLIs |
| Node.js | 22 (`.nvmrc`; `engines` floor is 20) | Only needed for host-native (non-Docker) runs |
| pnpm | 11.3 (`packageManager` in root `package.json`) | Only needed for host-native runs |
| Git | 2.40+ | |

Outbound internet access is required for the media download step (Path B):
images are fetched from `sabzsistem.com` through a host allowlist.

---

# Shared bootstrap

```bash
git clone <repository-url>
cd sabz-system
cp .env.example .env        # optional — Docker Compose defaults work without it
docker compose up -d --build
```

`docker compose up` starts five services:

| Service | Host port | Notes |
|---|---|---|
| postgres | 5432 | PostgreSQL 16, credentials from `POSTGRES_*` (default `sabz`/`sabz`) |
| redis | 6379 | Redis 7 |
| api | 3000 | Dev server; on start it runs `prisma generate` → `prisma migrate deploy` → seed (idempotent, development-only) |
| admin | 5173 | Vite dev server |
| storefront | 3002 | Next.js dev server (container port 3001) |

**Checkpoint** — the API is ready when this returns HTTP 200 (first start
compiles TypeScript and generates the Prisma client; allow up to ~90 s):

```bash
curl -s http://localhost:3000/api/v1/health
```

> **Known fresh-boot gap (SS-216 regression):** on a brand-new environment
> the `@sabz/search` workspace package ships without its built `dist`, and
> the API and storefront dev servers fail to compile with
> `Cannot find module '@sabz/search'`. Build it inside each application
> container once, then restart:
>
> ```bash
> docker compose exec api pnpm --filter @sabz/search build
> docker compose restart api
> docker compose exec storefront pnpm --filter @sabz/search build
> docker compose restart storefront
> ```
>
> (Verified: after these two commands both services come up healthy.) A
> follow-up issue should add the build step to the Dockerfiles.

---

# Path A — demo development

On the shared bootstrap above, the API container has already applied
migrations and seeded automatically. The seed (development-only, gated on
`NODE_ENV=development`) creates roles, a development admin, and a 23-product
demo catalog watermarked through the real media pipeline.

**Checkpoints:**

```bash
# Storefront renders the demo catalog (23 products):
open http://localhost:3002

# Admin CMS — log in with the development admin:
#   mobile: +989170000001   OTP: 123456
open http://localhost:5173

# Storefront home shows published products:
curl -s "http://localhost:3000/api/v1/catalog/products?limit=1" | head
```

No further commands are needed for demo development.

---

# Path B — real catalog

## B1. Obtain the CSV

The canonical WooCommerce export ships **out of band** — it is ~14 MB and
must never be committed (`.gitignore` excludes `wc-product-export-*.csv`
everywhere in the tree).

- The current canonical file is `wc-product-export-20-9-2026-1789870382306.csv`
  (14,157,043 bytes), produced by the WooCommerce native product exporter on
  sabzsistem.com.
- For a fresh re-export, use the same exporter on the live site
  (wp-admin → Products → Export). A re-export gets a new filename and a new
  checksum — **re-record both** and re-baseline the dry-run numbers before
  importing. (Verify the exact export options against the live site's plugin
  set on first re-export; the CSV must be UTF-8 and include all product
  metadata columns.)

Place the file at the repository root (or anywhere local):

```bash
# example: file already present at repo root
ls wc-product-export-*.csv
```

## B2. Verify the CSV

```bash
sha256sum wc-product-export-20-9-2026-1789870382306.csv
# expected:
# 055a5cc407d56e2609777cf01ff5927c7cf4caef64b1bba0bb569adddfb80a27
```

If the checksum differs, you have a different export: re-record the checksum
with it and treat the baseline numbers below as stale until a fresh dry-run
re-establishes them.

## B3. Make the CSV visible to the importer

Only `./apps/api` is bind-mounted into the API container, and the CLIs
resolve `--file` relative to the `apps/api` package directory. The
`wc-product-export-*.csv` ignore pattern covers any directory, so copying it
into `apps/api/` is safe:

```bash
cp wc-product-export-20-9-2026-1789870382306.csv apps/api/
```

All commands below are run **inside the API container** (the project's dev
machines have no host Node):

```bash
docker compose exec api pnpm --filter @sabz/api <script> -- <args>
```

Host-native alternative: install pnpm 11.3 + Node 22, `cp apps/api/.env.example apps/api/.env`,
set `DATABASE_URL`, run `docker compose up -d postgres redis`, `pnpm install`,
`pnpm --filter @sabz/api prisma:migrate`, then run the same `pnpm --filter
@sabz/api …` scripts from the repository root.

## B4. Dry run (writes nothing, ever)

```bash
docker compose exec api pnpm --filter @sabz/api woo:dry-run -- \
  --file wc-product-export-20-9-2026-1789870382306.csv
```

The dry run parses the CSV, resolves every row to a verdict, and prints the
report matrix. It writes no database rows; reference data (existing
categories/brands/slugs/SKUs) is read from `DATABASE_URL`. A JSON artifact is
written next to the input (`<file>.dry-run.json`).

**Expected baseline** (verified against the Sep 2026 export on an empty
catalog — re-baseline after any re-export):

- Rows: 1152 (1069 simple, 24 variable, 59 variation)
- Verdicts: CREATE ~1125 / SKIP ~27
- Price states: PRICED ~240, CALL_FOR_PRICE ~852
- Image refs: ~5174 (~4488 distinct URLs, all `sabzsistem.com`)

Full interpretation: [woo-import-mapping.md §1](../04-database/woo-import-mapping.md).

## B5. Product import

```bash
docker compose exec api pnpm --filter @sabz/api woo:import -- \
  --file wc-product-export-20-9-2026-1789870382306.csv --with-media-refs
```

Behavior:

- Upserts products/variants by source identity
  `(sourceSystem, sourceId)` — one transaction per product, per-row
  isolation (one bad row never aborts the run).
- `--with-media-refs` stores `pending-woo:*` media placeholders in CSV
  order (first image becomes primary); without it, **no media rows are
  written** and the media step creates them.
- Inventory: one `INITIAL_STOCK` ledger receipt per variant on the DEFAULT
  warehouse (created automatically if missing).
- Ends with **one batched storefront cache invalidation** for the whole run.
- A JSON report artifact is written to `<file>.import.json`.

**Checkpoint** — the printed summary must show the verdict matrix and exit
status 0. Example shape (numbers are the Sep 2026 baseline on an empty
catalog):

```text
WooCommerce import write: 1152 rows from …
verdicts: create 1125 / update 0 / skip 27
products: created 1125 / updated 0 / skipped 27 / failed 0
variants: created … / failed 0
shells published 24 / resumed 0
```

Any `FAILED line …` entries are listed with their error; the process exits
non-zero only if failures exceed `--failure-threshold` (default 0).

**Known caveat (currency):** the importer stores CSV prices **verbatim in
Rial** (decided O-1, SS-207), while the catalog API/storefront contract
formats stored values as **Toman** (`packages/types/src/catalog/catalog.ts`).
A real-catalog import therefore displays Rial-magnitude numbers under the
Toman label until the currency reconciliation decision lands. Do not
"fix" this by converting at import time — that ruling is deliberate and
owned by the mapping doc.

## B6. Media download

```bash
# rehearsal — reports what would be downloaded, writes nothing:
docker compose exec api pnpm --filter @sabz/api woo:media -- \
  --file wc-product-export-20-9-2026-1789870382306.csv --dry-run

# real run (~4488 distinct images; runs at concurrency 6 by default):
docker compose exec api pnpm --filter @sabz/api woo:media -- \
  --file wc-product-export-20-9-2026-1789870382306.csv
```

Behavior:

- Downloads every referenced image through the standard watermark +
  thumbnail pipeline and backfills the `pending-woo:*` placeholders in
  place (order preserved). Run after `woo:import --with-media-refs`.
- Dedup on `(productId, sourceUrl)` and `(productId, contentHash)` —
  re-runs are no-ops.
- Guards: `sabzsistem.com` host allowlist (extend with `--allow-host
  host1,host2`), 10 MB image / 200 MB video caps, per-item timeout,
  3 attempts with backoff, per-URL dead-lettering — a failed image never
  fails its product.
- Binaries are stored under the product-media volume
  (`PRODUCT_MEDIA_STORAGE_DIR`); served by the API at
  `/api/v1/catalog/media/:id[/thumbnail]`.
- Report artifact: `<file>.media.json` with the
  `refs / downloaded / processed / failed / skipped-dedup` matrix.

There is no separate `media:process` command — watermarking and thumbnails
happen inside the download pipeline itself.

**Known environment gotcha (fake-IP proxy DNS):** the downloader's SSRF guard
pins every URL to a *public* IP before connecting and rejects
benchmark/reserved ranges — including `198.18.0.0/15`, the fake-IP range
used by local proxy/VPN DNS tools (Clash, mihomo, …). On a machine whose
DNS answers with fake-IPs, **every** URL fails with
`آدرس تصویر نامعتبر است.` and the report shows `failed` equal to `refs`
(verified signature). The failure is environmental: run the media step from
a network with real DNS resolution (staging/production, or a machine with
the proxy's fake-IP DNS disabled). Do **not** "work around" this with
`--allow-private` — it is a test-only flag that disables the SSRF
protection. Container-level `dns:` overrides do not help when the proxy
intercepts DNS transparently.

## B7. Re-runs and resume

Resume is **default behavior, not a flag**: every run records per-row status
in `ImportRun`/`ImportRecord`, and a re-run skips rows whose source hash is
unchanged (`resumed` count in the summary). Pass `--no-resume` to force full
reprocessing. Interrupted imports are recovered simply by re-running the
same command.

**Idempotency checkpoint** — run the same import twice; the database row
counts must not grow (verified: repeated 50-row runs kept 46 products /
38 variants with zero new ledger movements or media refs).

**Known quirk (alternating resume):** the resume lookup honors a row's
*latest* `ImportRecord` only when its status is `IMPORTED`/`UPDATED` — but a
resumed run records its skips as `SKIPPED`, so the run immediately after a
resumed run re-processes every unchanged row as a benign update pass before
resume kicks in again. This is harmless (upsert writes identical data: zero
new rows, zero new ledger movements/media refs) but means "everything
resumed" appears only on alternating runs. If deterministic single-pass
resume matters (e.g. scheduled re-imports), the lookup should ignore
resume-skip records — tracked as a follow-up issue; do not "fix" it from
the docs.

## B8. How to know the import succeeded

1. `woo:import` summary: `failed 0` on products and variants, exit code 0,
   report artifact matches the summary.
2. `woo:media` summary: `failed` within tolerance (each failure is listed
   per URL in the artifact; re-running the media command retries them).
3. Rough row counts (example only, Sep 2026 baseline — do not treat as
   frozen constants):

   ```bash
   docker compose exec postgres psql -U sabz -d sabz -tc \
     'SELECT count(*) FROM "Product"; SELECT count(*) FROM "ProductVariant";'
   ```

   Expected: the 1125 CREATE verdicts decompose into ~1077 `Product` rows
   (simple rows + 24 variable shells) and ~1100 `ProductVariant` rows (one
   per simple + the ~48 resolvable variations — 11 orphan variations are
   SKIPped). Plus ~60 category paths and 12 brands; most products are
   intentionally unbranded (nullable by policy Q2).

## B9. Verify the storefront

- Home, category landing (parents must show child-subtree products —
  roll-up counts), listing with filters/sort/pagination, search (Persian
  with ZWNJ variants, English name, SKU), product detail with variants and
  gallery, image + thumbnail delivery.
- `curl http://localhost:3000/api/v1/catalog/products?limit=1` returns
  published products.
- Mobile width (360 px) and RTL sanity.

---

# Demo seed vs real import

| | `prisma:seed` (Path A) | `woo:import` + `woo:media` (Path B) |
|---|---|---|
| Purpose | local dev, tests, UI work | real catalog, staging, production-shaped validation |
| Data source | committed fixtures under `apps/api/prisma/seed-catalog/` | uncommitted WooCommerce CSV export |
| Size | 23 products / 24 variants | ~1125 products, ~4488 images |
| Gate | refuses without `NODE_ENV=development` | none (no seed gating) |
| Idempotency | upserts keyed by slug/SKU | upserts keyed by source identity + hash-based resume |

Never run both against the same database: slug/SKU collisions between demo
fixtures and the real catalog would corrupt both. Use `docker compose down
-v` (wipes volumes, including media) before switching paths.

---

# Recovery & troubleshooting

- **`Cannot find module '@sabz/search'` on first boot**: see the fresh-boot
  note under "Shared bootstrap" — build the package inside the api and
  storefront containers and restart them.
- **`docker compose down -v` destroys data** — including all imported media
  (the `api_product_media` volume). A plain `restart` never deletes media.
- **Interrupted import**: re-run the same command; resume skips unchanged
  rows (`--no-resume` to force).
- **Failed images**: listed per URL in the media report; fix the cause
  (network, allowlist) and re-run `woo:media` — dedup skips everything
  already downloaded.
- **Import runs slow / rate-limited**: lower `--concurrency` (default 6) on
  the media step; the product writer is single-threaded by design
  (transaction-per-product).
- **CSV not found**: the CLIs resolve `--file` against the `apps/api`
  directory; inside Docker the file must be under `apps/api/` (bind mount).
- **Cache not refreshing after import**: the import invalidates the
  storefront cache once per run; verify `STOREFRONT_REVALIDATE_URL` /
  `STOREFRONT_REVALIDATE_TOKEN` (API) match `REVALIDATE_TOKEN`
  (storefront) — see root `.env.example`.

---

# Importer CLI reference

All scripts run via `pnpm --filter @sabz/api <script> -- <args>` and write a
JSON report next to the input file. Environment touchpoints: `DATABASE_URL`
(required) and `PRODUCT_MEDIA_STORAGE_DIR` (media step). No importer-specific
environment variables exist; operational control is CLI-only.

| Script | Flags | Default |
|---|---|---|
| `woo:dry-run` | `--file` (required), `--out`, `--limit N` | writes nothing; report to `<file>.dry-run.json` |
| `woo:import` | `--file` (required), `--out`, `--limit N`, `--with-media-refs`, `--failure-threshold N`, `--no-resume` | resume ON; no media rows; threshold 0 |
| `woo:media` | `--file` (required), `--out`, `--limit N`, `--concurrency N`, `--allow-host h1,h2`, `--allow-private` (test-only), `--dry-run`, `--failure-threshold N`, `--no-resume` | concurrency 6; allowlist seed `sabzsistem.com`; resume ON |

---

# Related documents

- [WooCommerce → Sabz import mapping](../04-database/woo-import-mapping.md) —
  field-by-field dispositions, dataset traps, policy rulings.
- [Docker Development Environment](development-environment.md) — the
  containerized stack in depth.
- [Local Environment Setup](local-environment.md) — host-native environment
  variable contract.
- [Development Guide](development-guide.md) — day-to-day development.
