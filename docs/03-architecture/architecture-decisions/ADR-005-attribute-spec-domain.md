# ADR-005: Attribute and Specification Domain (SS-202)

## Status

Accepted

## Context

The WooCommerce export carries two attribute systems (verified by profiling
1152 rows): numbered global/local attributes (`نام N صفت` — the variant axis
`انتخاب رنگ` plus laptop/mobile spec groups) and `custom_attributes`
free-text spec lines (912 rows, the majority). The Sabz schema modeled
neither; specs survived only as description HTML. SS-202 must give both a
queryable home without copying WooCommerce's EAV internals and without a
JSON blob (ADR-004, Decision 3).

## Decision 1: Two roles, four tables

- `Attribute` (name/slug unique, `type: VARIANT_OPTION | SPEC`, `group?`,
  `isFilterable`, `isGlobal`) + `AttributeValue` (unique per attribute).
- `ProductAttributeValue` (product, value, `sortOrder`, `source`) for
  display/filterable specs.
- `VariantAttributeValue` (variant, value) for the purchasability axis, with
  **set semantics**: one value per attribute per variant (enforced in
  `AttributesService`, not by partial index).

`AttributeType` is an enum because it is our closed domain vocabulary.
`ProductAttributeValue.source` (`WOO_ATTR` / `WOO_CUSTOM` constants) is a
plain string: parser provenance is an open, importer-owned vocabulary, same
reasoning as `sourceSystem` in ADR-004.

A SPEC attribute reused where a VARIANT_OPTION is required (or vice versa)
is a 409: roles never share a definition. The importer dry-run (SS-206)
surfaces these collisions before any write.

## Decision 2: No soft-delete on attribute tables

Unlike the rest of the catalog, the four attribute tables have no
`deletedAt`. Rationale:

1. Definitions are importer-recreated reference data, not user history.
2. Assignments are derived rows; their audit trail is `ImportRecord`.
3. Soft-delete would force partial unique indexes (Prisma cannot express
   them) or resurrected-name collisions.

In-use guards replace it: attributes with values and values with assignments
cannot be deleted (409, backed by `Restrict` FKs); assignments cascade with
their product/variant. No `AuditLog` writes for attribute mutations:
importer volume would spam the log; runs are audited via `ImportRun`.

## Decision 3: custom_attributes parsing contract

`parseCustomAttributeLine` (pure, unit-tested) splits on the first colon
(full-width included) or spaced dash; unspaced in-word hyphens never split.
Unparseable lines return null and the importer must preserve them raw in
`ImportRecord.sourceData` and report them — never coerce, never drop.

## Decision 4: No HTTP routes in v1

`AttributesService` is service-only, exported from `ProductsModule` for the
future importer module. Admin attribute UI is deferred until real
management needs exist; the importer (bulk, transactional, Prisma-level)
does not need HTTP. Public reads expose ordered specs on the product detail
DTO only (`specs: CatalogProductSpecDto[]`); listing cards stay lean and
facets arrive with the filterable allowlist (SS-206 seeds `isFilterable`
from a curated list, never auto-everything).

## Consequences

### Positive

- Variant-defining vs display-only stays a first-class distinction the
  storefront (SS-214) and facets (SS-213) can rely on.
- Re-imports upsert definitions by name and skip duplicate assignments
  (unique constraints → 409-as-skip).
- No JSON blob, no per-spec tables, no new infrastructure.

### Negative

- Attribute renames are definition migrations the importer must handle
  explicitly (SS-206 policy).
- Dotted Woo namespaces (`مشخصات کلی.وزن`) collapse into `group` + flat
  names; nested grouping beyond one level is out of scope.

## Related Decisions

- ADR-004: Catalog Import Foundation (identity, raw-data boundary,
  no-blob rule this ADR extends)
- docs/01-planning/milestone-2-deep-audit.md (dataset profile)
