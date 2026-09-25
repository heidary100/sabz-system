# SS-217 Performance Report — cache, skeletons, minPrice denormalization

Branch: `feat/ss-217-storefront-cache-minprice`
All measurements below were captured on 2026-09-25 during SS-217 implementation. No numbers are estimated; anything not measured is listed under "Known limitations".

## Environment

- Host: Fedora Linux, Node v22.21.1 (host-native build), PostgreSQL 16 via Docker Compose.
- Storefront: production builds (`pnpm --filter @sabz/storefront build` + `next start`), never the Docker dev server.
- API: production build (`node dist/main.js`) for the DB benchmark; Docker Compose API for the storefront comparison.
- Tools: `curl` timing (`time_starttransfer` = TTFB, `time_total`), `EXPLAIN (ANALYZE, BUFFERS)` via `apps/api/scripts/minprice-explain.ts`, Chrome PerformanceObserver `largest-contentful-paint` (in-app browser, desktop, no throttling).

## Datasets

| Dataset | Products (published) | Live variants | Priced variants | Used for |
| --- | ---: | ---: | ---: | --- |
| Dev seed (`sabz`) | 23 | 24 | 24 | sanity probes |
| Production-shaped (`sabz_perf`, imported from `wc-product-export-20-9-2026-*.csv`) | 1,072 | 1,101 | 240 | backend before/after, EXPLAIN |

Note: only 240 imported variants carry `PRICED` prices (861 are `CALL_FOR_PRICE`), matching the production catalog reality; NULL-minPrice products are therefore a large share of any price-sorted result.

## Backend: price sorting (same dataset before/after)

"Old" is the pre-SS-217 algorithm (load every candidate `(id, createdAt, variants[{price, priceStatus}])`, sort in JS, slice). "New" is `ORDER BY Product.minPrice … NULLS LAST` with `skip/take`. Both return the **identical page id sequence** on this dataset (verified in the benchmark and by the integration/e2e suites).

Median of 20 samples after 1 warm-up, `sabz_perf` dataset:

| Query | Old (median) | New (median) | Δ |
| --- | ---: | ---: | ---: |
| `price_asc` page 1 | 14.10 ms | 2.04 ms | −86% |
| `price_desc` page 1 | 14.95 ms | 2.24 ms | −85% |

The old cost grows with the whole matching set (it materializes all 1,072 products + variants each request); the new cost is per-page. Node no longer loads the candidate set for price sorts — the important requirement of the issue.

## EXPLAIN (ANALYZE, BUFFERS) — production-shaped dataset

`apps/api/scripts/minprice-explain.ts` (slugs auto-discovered from the target DB; category = `lp-tap-astvk`, brand = `vryty`, search term = most frequent product-name word):

| Case | Execution | Scans observed |
| --- | ---: | --- |
| price ascending (unfiltered) | 0.023 ms | index (`Product_public_minPrice_asc_idx`) |
| price descending (unfiltered) | 0.025 ms | index (`Product_public_minPrice_desc_idx`) |
| category + price sort | 0.229 ms | bitmap index |
| brand + price sort | 0.233 ms | bitmap index + index |
| in-stock + price sort | 0.065 ms | index |
| price range + price sort | 0.274 ms | index + seq (variant subquery) |
| search + price sort | 0.064 ms | index |
| newest (control) | 0.324 ms | index |

On the 23-row dev seed the planner honestly prefers sequential scans (all plans < 0.07 ms); the indexes are only chosen at the production-shaped volume — recorded as observed, not assumed.

## Storefront: TTFB / total (same API + dataset both sides)

Both builds (pre-SS-217 `master@529384b` worktree vs this branch) served by their production `next start` against the same Compose API (dev dataset, 23 products). Median of 10 samples after 3 warm-ups. The dataset is small, so these understate the production effect; they still isolate the cache change.

| Route | Old TTFB/total (ms) | New TTFB/total (ms) | Δ total |
| --- | ---: | ---: | ---: |
| `/products` | 24.2 / 24.3 | 13.5 / 13.9 | −43% |
| `/products?sort=price_asc` | 20.7 / 20.8 | 11.5 / 11.5 | −45% |
| `/products/<real-slug>` | 19.1 / 19.2 | 8.1 / 8.2 | −57% |
| `/categories/<real-slug>` | 19.3 / 19.4 | 7.5 / 7.7 | −60% |

Cold (Data Cache wiped, server restarted): `/products` first request 113.8 ms TTFB (cache population), next request 21.6 ms — the cold hit pays for the fetch the old code paid on every request.

## LCP (local desktop, unthrottled, Chrome PerformanceObserver)

| Route | Old (ms) | New (ms) |
| --- | ---: | ---: |
| `/products` | 400 | 356 |
| `/products/<real-slug>` | 252 | 248 |
| `/categories/<real-slug>` | 296 | 236 |

## Cache behavior (production build, `NEXT_PRIVATE_DEBUG_CACHE`)

- First `/products` request: tagged fetches `FETCH false` (miss) then cache `set` for `catalog:products` and the layout tree.
- Second request: `FETCH true` (hit) for the same entries; the API receives no catalog requests during the window.
- `POST /api/revalidate` with a valid token (`204`) removes the tagged entries; the next request re-fetches (`FETCH false`). Wrong/missing token → `401`; disallowed tag → `400`; unset token → the endpoint refuses all requests (`503`).
- Category tree: one API fetch per cache window instead of one per page view (previously the layout re-fetched the tree on every catalog page render).

## API-blip drill (production build, API unreachable)

- Cached routes keep serving from the Data Cache (stale-while-down) — graceful.
- Uncached routes return HTTP 200 with the streamed shell + skeleton; after hydration the route error boundary renders: heading «خطا در بارگذاری صفحه», Persian explanation, and a working «تلاش مجدد» retry button (`reset()`), inside the intact degraded shell. No framework 500 screen.
- `notFound()` (unknown product slug) still renders the dedicated not-found page — the boundary does not mask 404s.

## Interpretation

1. The in-memory price sort is gone: DB ordering is ~7× faster at production shape, plan-verified, and the page contract (ids, `priceFrom`, `callForPrice`, NULLS-last, tie-breaks) is byte-identical per the test suites.
2. The Data Cache removes per-request catalog re-fetching; warm route latency drops 43–60% even on a tiny dataset where the API is a local container (production API latency amplifies the saving).
3. The invalidation loop (API mutation → `catalog:*` tags) is verified end-to-end against the real `revalidateTag(tag, { expire: 0 })` semantics of Next 16.

## Known limitations

- LCP was measured locally and unthrottled; a throttled mobile Lighthouse run was not available in this environment. The dataset for storefront TTFB was the 23-product dev seed (same for both sides); production-shaped storefront numbers would need a prod-data storefront benchmark environment.
- `docker compose` dev images required a one-time rebuild to pick up `packages/search` (pre-existing image drift from SS-216, unrelated to SS-217); the storefront container also needs `packages/search/dist` built inside the volume. Both are environment notes, not code changes.
- Host-native `node dist/main.js` API runs fail on `require('multer')` — `multer` is imported directly by `media.controller.ts` but not declared in `apps/api/package.json` (pnpm strict layout). Pre-existing issue exposed during benchmarking; Docker runs are unaffected (multer resolves there).
