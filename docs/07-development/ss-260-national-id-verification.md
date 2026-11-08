# SS-260 — Personal National ID verification note

Status: automated and local live-browser evidence recorded. The production
release checklist below remains a release-gate step for the real environment.
All fixture values are synthetic or published illustrative examples, never a
real person's National ID.

## Fixtures

| Constant | Value | Purpose |
|---|---|---|
| Valid primary | `6059926746` | Global IDs synthetic checksum-valid value |
| Valid replacement | `7291363357` | Global IDs published example |
| Leading-zero reject | `0013542419` | Checksum-valid example rejected by the explicit non-zero-first-digit rule |
| Leading-zero reject 2 | `0012345679` | Checksum-valid example rejected by the same rule |
| Invalid checksum | `6059926747` | Wrong check digit |
| Transposed invalid | `6509926746` | 2nd/3rd digits swapped |
| Placeholder | `0000000000` | Rejected by explicit policy |

Persian/Arabic-Indic vectors: `۶۰۵۹۹۲۶۷۴۶`, `٦٠٥٩٩٢٦٧٤٦`, `۶05۹92۶7۴6`.

## Automated evidence

```bash
pnpm --filter @sabz/api prisma:generate
pnpm --filter @sabz/api typecheck
pnpm --filter @sabz/api exec jest --runInBand \
  src/common/validation/personal-national-id.spec.ts \
  src/modules/auth/services/profile.service.spec.ts \
  src/modules/users/users.service.spec.ts \
  src/modules/partners/partners.service.spec.ts \
  src/common/database/prisma-schema.spec.ts

DATABASE_URL='postgresql://sabz:sabz@localhost:5432/sabz?schema=public' \
REDIS_HOST=localhost REDIS_PORT=6379 NODE_ENV=test \
JWT_ACCESS_SECRET=dev_access_secret_change_me \
JWT_REFRESH_SECRET=dev_refresh_secret_change_me \
pnpm --filter @sabz/api exec jest --config ./test/jest-e2e.json \
  --runInBand profile-national-id
```

Observed at implementation time:

- Backend focused suites: 199 tests passed.
- Full backend unit suite: 1574 tests passed.
- SS-260 API e2e: 9 tests passed.
- Full API e2e suite: 446 tests passed.
- Full API integration suite: 446 tests passed.
- Storefront focused suites: 20 tests passed; full storefront suite: 341 passed.
- Admin audit suites: 6 tests passed; full admin suite: 185 passed.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed (the only lint
  output was two pre-existing storefront warnings unrelated to SS-260).

## Privacy greps

Run from the repository root. These target dangerous sinks, not every
legitimate occurrence of the property name.

```bash
grep -rEn "(logger|console)\.(log|warn|error|debug).*nationalId|nationalId.*(logger|console)" apps/api/src

grep -rEn "nationalId.*(href|url|searchParams|URLSearchParams)|(href|url|searchParams|URLSearchParams).*nationalId" \
  apps/storefront/src apps/admin/src

grep -rEn "(localStorage|sessionStorage|indexedDB).*nationalId|nationalId.*(localStorage|sessionStorage|indexedDB)" \
  apps/storefront/src

grep -rEn "(gtag|dataLayer|analytics|posthog|sentry).*nationalId|nationalId.*(gtag|dataLayer|analytics|posthog|sentry)" \
  apps/storefront/src apps/admin/src

grep -rEn "JSON\.stringify\([^)]*nationalId|nationalId[^)]*JSON\.stringify" apps/api/src
```

Expected: no output except the intentional negative assertion in
`profile.service.spec.ts`. The last command is intentionally narrow;
legitimate model/DTO/service/form references are reviewed separately.

## Migration checks

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'User' AND column_name = 'nationalId';
-- expected: nationalId | YES | text

SELECT indexname
FROM pg_indexes
WHERE tablename = 'User' AND indexdef ILIKE '%nationalId%';
-- expected: 0 rows

SELECT count(*) FILTER (WHERE "nationalId" IS NULL) AS nulls, count(*) AS total
FROM "User";
-- expected after migration: nulls = total (no backfill)
-- observed on the dev database after cleanup: 7 | 7
```

## Live browser evidence (2026-11-08)

Executed against the local storefront/API with a synthetic customer and
`6059926746`:

- `/account` rendered the unset state, label, helper and disclaimer.
- The input was not autofocused on page load.
- Typing `۶۰۵۹۹۲۶۷۴۶` folded to `6059926746` and showed the
  “قالب کد ملی درست است.” advisory.
- Submitting leading-zero `0013542419` showed the explicit
  “کد ملی نمی‌تواند با صفر شروع شود.” error without calling the server.
- Saving produced `****6746`; the full value was absent from the DOM.
- Reload preserved the mask, removed the input, and did not prefill it.
- localStorage/sessionStorage contained no National ID.
- Console had no errors.
- “تغییر کد ملی” opened an empty input with the replacement note.
- Submitting invalid checksum `6059926747` showed the inline error and kept
  the previous `****6746` visible; neither raw value appeared in the DOM.
- The synthetic live-test user and its audit/session rows were removed from
  the dev database afterwards.

## Manual browser checklist (release gate)

1. Log in as a customer and open `/account`.
2. Confirm the unset state and helper/disclaimer text.
3. Type Persian digits; confirm they fold to ASCII.
4. Submit a valid value; confirm the success notice and `****1234`.
5. Reload; confirm only the mask is rendered and the input is never prefilled.
6. Confirm the full value is absent from the DOM, localStorage,
   sessionStorage, console output, and analytics/network metadata.
7. Confirm the request URL contains no National ID (the value is in the HTTPS
   body only).
8. Click “تغییر کد ملی”; confirm the input is empty and the replacement note
   is shown.
9. Submit an invalid replacement; confirm the inline error and that the old
   mask remains after reload.
10. Simulate a network failure; confirm the error state and preserved value.
11. Keyboard-only navigation, visible focus, `aria-invalid`,
    `aria-describedby`, screen-reader announcement, 390px layout, RTL layout,
    and LTR digit presentation.
12. Confirm the main “ذخیره تغییرات” form still sends only names/address and
    never includes `nationalId`.
