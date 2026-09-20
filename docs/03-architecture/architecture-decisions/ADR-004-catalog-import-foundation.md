# ADR-004: Catalog Import Foundation (External Source Identity + Import Audit)

## Status

Accepted

## Context

Milestone 2 built the catalog domain around a 23-product demo seed. The real
WooCommerce export (~1152 rows: simples, variable parents, variations) must be
imported repeatedly and safely: re-running the future importer must update
existing records, never create duplicates, and no source field may be silently
lost before the normalized domain learns to represent it.

This ADR records the persistence foundation (SS-200). It covers identity and
audit tables only — no importer, parser, downloader, or writer is built here.

## Decision 1: Explicit external source identity on Product and ProductVariant

`Product` and `ProductVariant` each carry a nullable triple:

```text
sourceSystem  e.g. WOOCOMMERCE
sourceId      the source row id (WooCommerce شناسه)
sourceType    the source row kind (simple | variable | variation)
```

with a composite unique constraint `@@unique([sourceSystem, sourceId])` per
table. The unique constraint is backed by a btree index, which also serves
the lookup path (find-by-source) the importer needs.

### Why SKU is not the external identity

- SKU is a **commerce identifier**: it can be edited by operators, regenerated
  during normalization (collisions across suppliers are real — the export
  reuses similar English codes), and some source rows share or lack usable
  codes. Identity that can be edited is not identity.
- SKU is **variant-scoped and globally unique** in our schema, while a source
  row maps to a product shell (variable parents have no price/SKU of their
  own) or to a variant. One source concept, two domain homes — a single SKU
  column cannot address both.
- Source identity must survive slug changes, renames, re-categorization, and
  re-pricing. Slugs and names are display concerns; `شناسه` is stable at the
  source. The importer resolves by `(sourceSystem, sourceId)` and only then
  reconciles mutable fields.

### Why String, not an enum, for sourceSystem/sourceType

The set of sources is open (WooCommerce now, Holo later) and each source has
its own row-kind vocabulary (`simple | variable | variation` is
WooCommerce-specific and meaningless for the next source). An enum would force
a migration per new source for zero type-safety benefit at the boundary.
Precedent: `AuditLog.action`/`entity` are free strings. The closed,
importer-defined vocabulary (`ImportRecordStatus`) **is** an enum, because we
own that state machine.

### Why product and variant identities are independent

A variable parent row and its variation rows are different source records that
land in different tables. Enforcing cross-table uniqueness would couple the
two lifecycles for no benefit; the importer links them via its own resolution
(`productId` on the variant), not via shared identity.

## Decision 2: ImportRun / ImportRecord audit tables, no importer yet

```text
ImportRun     one importer execution (sourceSystem, status, started/finished)
ImportRecord  one source row within a run (source ref, row hash, status,
              attempts, error, bounded source snapshot, result refs)
```

Statuses (`ImportRecordStatus`): `PENDING → IMPORTED | UPDATED | SKIPPED | FAILED`.
`FAILED` carries a Persian error message and a bumped `attempts` counter so a
later run can resume exactly the failed/skipped subset
(`WHERE runId + status IN (PENDING, FAILED)`).

- Runs are append-only: no soft-delete, one source per run. History queries
  (`WHERE sourceSystem + sourceId ORDER BY createdAt`) show every attempt for
  a source row across runs.
- `ImportRecord.productId/variantId` are **plain nullable strings, not foreign
  keys**, so the audit trail survives later catalog deletes. The cascade goes
  the other way: deleting a run deletes its records.
- No counters are denormalized on the run; the reporter aggregates record
  statuses. Counters drift, queries do not.

## Decision 3: Raw source data lives in the import layer, never in Product

Requirement: the WooCommerce catalog must be imported **completely** — fields
the normalized domain does not model yet (wholesale columns, fulfilment
strings, unparsed spec lines, theme metadata) must be preserved for auditing,
troubleshooting, future mappings, and change detection (`sourceRowHash`).

`ImportRecord.sourceData` (JSONB, nullable) holds a **bounded snapshot of the
original source row** — bounded meaning: exactly the source row the importer
consumed, stored once per attempt chain, written and read only by import
tooling. Commerce code (services, controllers, storefront) must never read it.

The normalized `Product`/`ProductVariant` models must **not** gain an
arbitrary `data JSON` blob because:

1. It is unqueryable — Postgres cannot index intent, only paths; every new
   consumer invents its own path convention and they diverge.
2. It hides domain growth — real concepts (compare-at price, specs, tags)
   stay invisible instead of becoming modeled, indexed, validated fields.
3. It leaks across boundaries — blobs get serialized into API responses,
   cached, and depended upon by the storefront, freezing the "temporary"
   shape forever.
4. It defeats validation — DTOs, the Persian-message contract, and audit
   diffs all operate on known fields.

Rule for future agents: a new WooCommerce field either maps to a modeled
column/relation (with migration + DTO + test), is recorded in the documented
ignore-list with a reason, or is preserved **only** inside
`ImportRecord.sourceData`. There is no fourth option.

## Consequences

### Positive

- Re-imports are updates by construction: unique identity + row hashes give
  the future importer `find-or-create` semantics per row.
- Draft → published transitions, renames, re-pricing, and re-categorization
  are safe: identity is orthogonal to every mutable field.
- Every import is inspectable (run → records → errors → source snapshot) and
  resumable (status-filtered replay) with no broker, queue, or Redis state.
- The domain stays clean: admin DTOs and public contracts are unchanged by
  this ADR.

### Negative

- Nullable identity columns rely on importer discipline (always set all three
  together); the database permits partial nulls. The importer issue must
  validate the triple as a unit.
- `sourceData` duplicates source bytes per record; acceptable at ~1152 rows,
  to be revisited only if a future source is orders of magnitude larger.

## Related Decisions

- ADR-001: Modular Monolith (importer will be a module, not a service)
- docs/01-planning/milestone-2-deep-audit.md (dataset profile, mapping table)
