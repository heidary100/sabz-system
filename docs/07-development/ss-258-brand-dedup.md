# SS-258 — Brand deduplication, safe merge and normalized-name guard

This change makes the seed/unsuffixed brand record canonical and retires the
importer-created English duplicates by reassigning their products, soft-deleting
them, and linking them through `Brand.mergedIntoBrandId`.

## Curated mappings

| Canonical | Duplicate | Products moved |
|---|---|---|
| `green-lion` — گرین لاین / Green Lion | `green-lion-2` — Green Lion | 60 (dev) |
| `porodo` — پرودو / Porodo | `porodo-2` — Porodo | 40 (dev) |
| `powerology` — پاورولوژی / Powerology | `powerology-2` — Powerology | 19 (dev) |
| `biva` — بیوا / Biva (requires sign-off) | `biva-2` — Biva | 5 (dev) |
| `ay-dyta` — ای دیتا | `adata` (already deleted) | 0 |
| `avrykv` — اوریکو | `orico` (already deleted) | 0 |
| `vryty` — وریتی | `verity` (already deleted) | 0 |

No fuzzy matching or transliteration is performed. Biva is separate in the
code and is only included with `--include-biva` after explicit approval.

## Commands

```bash
cd apps/api
DATABASE_URL=... pnpm brand:merge -- --dry-run --json /tmp/ss258-dry-run.json
DATABASE_URL=... pnpm brand:merge -- --apply --confirm=sabz --include-biva \
  --expect=/tmp/ss258-dry-run.json --json /tmp/ss258-apply.json
```

Default mode is read-only dry-run. `--apply` re-runs every precondition inside
one serializable transaction, takes an advisory lock and row locks, reassigns
products/promotions/aliases, verifies no dependents remain, then soft-deletes
the duplicate. A clean second run reports `changes 0`.

## Probes

Run the committed read-only SQL:

```bash
psql "$DATABASE_URL" -f apps/api/scripts/brand-dedup-baseline.sql
psql "$DATABASE_URL" -f apps/api/scripts/brand-dedup-post-merge.sql
```

Paste both outputs into the implementation PR. The post-merge probes must show:

- zero duplicate `BrandAlias.normalizedKey` rows;
- zero active brand `name`/`nameEn` collisions;
- full alias coverage for active brands;
- unchanged product totals and expected canonical counts;
- zero products/promotions referencing merged duplicates;
- duplicated rows soft-deleted with `mergedIntoBrandId` set;
- unchanged canonical slugs and total brand count.

## Release order

1. Apply the `20261108000000_ss_258_brand_aliases_and_merge` migration.
2. Run the merge `--dry-run`, review, then `--apply`.
3. Run the post-merge probes.
4. Deploy the guard-enabled API code (create/update/import) after aliases exist.
5. Invalidate storefront catalog caches (the CLI does this when
   `STOREFRONT_REVALIDATE_URL` is configured; otherwise purge/deploy).

## Normalization

`normalizeBrandName` reuses the SS-216 `normalizeFa` search normalizer and adds
tatweel removal. It deliberately does **not** fold digits, punctuation, alef
variants, or perform Persian↔Latin transliteration. `brand_name_key(text)` is
the SQL mirror used only by the probes/parity test; persisted alias keys are
the runtime authority.

## Guard

- `BrandAlias.normalizedKey` is globally unique.
- Create/update/import write aliases in the same transaction as the brand.
- A duplicate normalized name or approved cross-language alias returns
  `409 Conflict` with a Persian message.
- A concurrent create race produces exactly one brand/alias row and one 409.
- Former names of merged/renamed brands remain protected as `LEGACY` aliases.
