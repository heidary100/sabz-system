# Session Handoff — Sabz System storefront track (opencode-driven)

> Refreshed 2026-10-02 (SS-245 session): everything needed to
> continue after Stage 3 of the storefront master plan. Long-lived context:
> `docs/01-planning/storefront-master-plan.md` (committed — the authority for
> scope §5/§6/§7, acceptance §9, QA §10) and
> `docs/01-planning/storefront-ux-audit.md`.
> This file is untracked-by-design — update it at session end, never commit.

---

## 1. Where we are

**SS-257 catalog grid — IMPLEMENTED + REWORKED + LIVE-VERIFIED (2026-11-03→07,
ZCode, issue #308). Branch `feat/ss-257-catalog-grid`, 3 commits pushed =
**PR #328 (USER REVIEWS/MERGES; CI green at last push)**. Final shape: the
PRODUCTS PAGE (/products) IS the grid — variant-keyed, server-paginated,
URL-driven filters (`q,sku,status,category,brand,pstatus,cond,min,max,
stock,sort,dir,page,size` via useSearchParams, shareable/back-button),
global search (name/slug/brand name+nameEn/category/SKU), multi-select
brand/category/status, price range + stock bucket, sortable headers, ALWAYS-
VISIBLE column toggle CHIPS (lean 9-col default; localStorage
`sabz-admin-catalog-grid-columns`; fixed core = name/sku/stock/prices/
actions), inline VARIANT-field editing (sku/barcode/variantName/price/
compareAt/priceStatus/stock) behind explicit ≤50-row chunked batch save
with per-row outcomes + optimistic `updatedAt` concurrency + per-row tx
(lock_timeout LOCK_TIMEOUT_MS default 3000), row actions (detail/edit/
variant-delete via DeleteConfirmDialog), page-size selector + go-to-page
input, full-width layout + mirrored top scrollbar
(components/ui/horizontal-scroll.tsx). API: GET/POST
/api/v1/admin/catalog-grid[/batch]; NO migration; SS-251 CHECK untouched;
zero-drift oracle committed at apps/api/scripts/catalog-grid-zero-drift.sql
(dev-DB checksum 0f5541b4… deterministic, diagnostics 0/0 — paste outputs
in PR per §H). **Bugs found+fixed this session (both are lessons):**
(1) CONTAINER STALENESS: compose mounts only apps/* — node_modules/@sabz/*
symlink into IMAGE-BAKED /app/packages, so new type exports made the API
container's nest --watch fail (6× TS2305) → API down → LOGIN BROKE.
Unblocked via docker cp of fresh packages dists + restart; durable fix =
`- ./packages:/app/packages` on api/admin/storefront in docker-compose.yml
= **PR #329 (chore/dev-packages-mount, USER MERGES)** — until merged, after
touching packages/*: docker cp each package into the container + restart.
(2) MOCK-BLINDSPOT: hook passed sortBy/multi-select/price/stock params but
services/catalog-grid.ts buildListQuery never serialized them → sort and
ALL advanced filters silently no-oped live (v2 added hook+DTO+API, missed
the service layer). Fixed + services/catalog-grid.test.ts now pins every
param name. LIVE-BROWSER VERIFIED (IAB): OTP login → sort
?sort=price&dir=asc → ANKER filter ?brand=… (1125→2 rows server-side) →
size=20 → page=3 — all URL-driven; screenshots in session artifacts.
IAB quirks: Playwright click times out on Catalyst login buttons → use
tab.cua.click at screenshot coords; getByRole name is substring unless
exact:true; Headless listbox covers elements below → Escape first.
Gates: admin vitest 140/140, API e2e 25/25 (admin-catalog-grid), unit
1507/1507, root lint/typecheck/test/build green (root-owned apps/api/dist
recreated by the api container's nest --watch — docker exec rm before
pnpm build; also dist.root-owned.bak was deleted this session).
PENDING for #328: B-1 timed comparison (10 SKUs ×3 reps, median; needs
real operator/browser session) + user real-browser QA. NOT STARTED:
**#309 (SS-258 dual-brand merge+guard) is the confirmed next issue**,
then SS-260/#310, SS-262/#311; BLOCKED B-1…B-5 client-side. Dev DB has
SS-257 e2e residue self-cleaned (specs delete in afterAll); pre-existing
test data (آزمون SS254/255/256, QA.rev brands) untouched.**


**UX-redesign evidence pass (2026-10-24, ZCode, plan-approved): executed
Phase E + Pass 0 of the client's "Product UX Redesign" engagement
(pasted prompt, deepened per user request into an evidence-first method).
NO code changes, NO issues created. Deliverable:
`docs/01-planning/ux-redesign-audit-2026-10.md` (untracked, like this
file) — contains frozen instruments, risk ledger, kill/defer list,
red-teamed pricing record, and a 17-issue breakdown (SS-248…SS-263, next
free IDs verified; BLOCKED items gated on client evidence B-1…B-5).
USER REVIEW of the breakdown is the next action; then issues get created
and committed together with the audit doc.** → **REVIEWED+APPROVED
("looks good" 2026-10-24): 16 issues CREATED #299–#315 in milestone
"UX Redesign (SS-248+)" (#6) — SS-248→#299, 250→#300, 251→#301, 259→#302,
249→#303, 254→#304, 255→#305, 256→#306, 264→#307, 257→#308, 258→#309,
260→#310, 262→#311, 252→#312, 253→#313, 261→#314, 263→#315 (last 4
labeled `blocked`); #51 + #290 extended via comments; audit doc committed
on `docs/ss-248-ux-redesign-audit` = **PR #316 (USER MERGES)**.
SS-248 IMPLEMENTED same session (`fix/ss-248-share-origin-bale`, **PR
#317, Closes #299) — CI GREEN first try (Validate + E2E), USER MERGES.**
NEW `lib/site-url.ts` (chain NEXT_PUBLIC_SITE_URL → https://<VERCEL_URL>
→ http://localhost:3002; invalid values fall through) replaces the 3
duplicated :3001 fallbacks (layout/PDP/blog); Bale action in ProductShare
= COPY fallback (verified vs docs.bale.ai 2026-10-24: Bale has NO web
share deep-link — nothing invented); `.env.example` → :3002; 10 new tests
→ vitest 302/302, lint 0 errors (2 pre-existing), build ✓; BROWSER ORACLE
PASS: all 6 share anchors on live PDP now carry
http://localhost:3002/products/<slug> (was :3001). next-env.d.ts reverted.
**Next: PR #316/#317 merge status → SS-250 (#300 تومان→ریال relabel) per
approved order; BLOCKED items B-1…B-5 stay with the client.** → **#316 +
#317 MERGED (a215c4d). SS-250 IMPLEMENTED (`fix/ss-250-variant-price-rial-label`,
**PR #318, Closes #300) — CI GREEN first try, USER MERGES.** Labels →
«قیمت (ریال)»/«قیمت فروش ویژه (ریال)» + hint «مبنا ریال است؛ فروشگاه قیمت
را به تومان (ریال ÷ ۱۰) نمایش میدهد»; NEW `lib/digits.ts`
foldDigitsToEnglish (۰-۹ + ٠-٩ → ASCII) applied to price/compareAtPrice
onChange; grep-gate test pins labels + folding (regression-proof).
Admin vitest 23/23 (6 new), lint/typecheck/build ✓. BROWSER ORACLE: fresh
tab → dialog shows ریال labels; fill('۱۲۳۴۵۶') → save ENABLES (ASCII-only
pattern passes ⇒ folding worked); انصراف → DB untouched (15500000.00
verified by SQL). NEW LESSON: after editing admin source, the open IAB tab
can hold a stale Vite module graph even across reload AND `docker restart
sabz-admin` (disk + served modules were already correct) — open a FRESH
TAB (handoff "old-tab screenshot drift" lesson generalizes to module
state). → **#318 MERGED (b2f614d). SS-251 IMPLEMENTED
(`feat/ss-251-compareat-invariant`, **PR #319, Closes #301) — CI GREEN
first try, USER MERGES.** SCOPE DISCOVERY: the service layer already
enforced compareAt>price on BOTH paths (validatePricing on effective
values, SS-201) and woo-write drops unsatisfiable compareAt — the real
gaps were the STRUCTURAL layer + update-path tests, so the PR is exactly
that: migration `20261026000000_ss_251_compareat_check` (CHECK
"compareAtPrice" IS NULL OR > price on ProductVariant; drift note in the
SQL — Prisma doesn't model CHECKs, keep it in future diffs like SS-216
indexes), +3 unit (update overlay: price dropped to/below stored
compareAt → 400, compareAt at/below stored price → 400, valid → 200;
updateMany never runs on reject), +3 e2e PATCH assertions in the
public-catalog sale test. Applied to dev + sabz_test (33 migrations,
status clean). ORACLE: BEGIN/ROLLBACK red-team on live DB — UPDATE
price=compareAtPrice → constraint ERROR; valid write UPDATE 1; data
intact. Gates: unit 1501/1501 (113 suites), FULL e2e 395/395, build ✓
(root-owned dist needed the alpine rm workaround first — pre-existing).
NOTE: repo pins 400 (not 422) for this contract. → **#319 MERGED
(3ea926b) after a user-requested double-check (PR comment with evidence:
scratch-DB fresh-env proof — migrate+full seed PASS under the CHECK;
prisma migrate diff generates NO DROP CONSTRAINT so the drift note was
over-cautious; constraint verified in dev+sabz_test+CI). SS-249
IMPLEMENTED (`feat/ss-249-share-payload`, **PR #320, Closes #303) — CI
GREEN first try, USER MERGES.** NEW `lib/share-message.ts` pure composer
(title/brand/price/link) reusing the EXACT card helpers/rules (CFP label /
exact / «از») → pricing-display consistency by construction; anonymous
BASE values only (guest tierApplied=false already e2e-pinned at
public-catalog.e2e-spec:1439 — referenced, not duplicated); ProductShare
gains optional shareText (Telegram text param = payload minus trailing
URL via shareTextWithoutUrl; WhatsApp = full message; Bale copies
message; blog stays URL-only); PDP derives min PRICED price + total
variant count with the card rule. Storefront vitest 312/312 (+10).
BROWSER ORACLE (fresh tab): priced PDP → Telegram text «پاوربانک … /
Green Lion / قیمت: ۷٬۳۰۰٬۰۰۰ تومان» (URL param separate), WhatsApp full
message, price == card display; CFP PDP → «قیمت: تماس بگیرید», no
fabricated price; Bale present. → **#320 MERGED (ce5b951). SS-259
IMPLEMENTED (`fix/ss-259-minprice-backfill`, **PR #321, Closes #302) —
CI GREEN (Validate + E2E&Integration 9m), USER MERGES.** ROOT CAUSE
(forensic SQL): the 23 NULL rows were raw direct-DB writes dated
2026-09-25 (SS-217 day), empty sourceSystem, updatedAt==createdAt —
bypassed services; SS-217 backfill itself was correct and every
legitimate writer recomputes (call sites verified). Fix: migration
`20261026010000` = SS-217 UPDATE restricted to NULL rows (idempotent;
dev+test applied, 34 migrations) + committed probe
`apps/api/scripts/minprice-drift-check.sql` (NULL-drift must be 0 +
diagnostic value-drift) + integration test simulating the exact raw-write
bypass inside an ALWAYS-ROLLED-BACK tx (assertion OUTSIDE the tx — a
rolled-back expect would false-pass; `SELECT 1/0` forces rollback).
Gates: unit 1501/1501, integration 383/383, e2e 395/395, build ✓.
Live: drift 0/0; repaired mobile-2690-slim serves priceFrom 2900000 via
public API. NOTE: integration specs run via `test:integration` (own jest
config); Prisma product.create in tests needs condition+createdBy (TS
pin). Transient `pnpm --filter lint` exit-2 seen once (watcher race on
bind mount) — direct eslint clean, rerun green. **Wave 1+2 COMPLETE
(SS-248/250/251/249/259). → #321 MERGED (30017b6). SS-254 IMPLEMENTED
via a user-pasted PLAN-ONLY prompt (plan mode, 2 decisions asked: jsdom
devDeps YES, product debounced search YES; plan approved) then
implemented (`feat/ss-254-slug-suggestions`, **PR #322, Closes #304) —
CI GREEN (Validate 3m17 + E2E 3m02 after TWO infra cancellations at
service-container startup — job hung 20m pre-step twice, rerun clean,
no test ever failed), USER MERGES.** Contents: admin `lib/slug.ts` =
verbatim port of server slugger (no crypto; §5.8 forbids @sabz runtime
imports; parity fixtures GENERATED by executing the server generator —
16 vectors, one plan-guess corrected by the oracle: چرخ خیاطی→chrkh not
chwrkh); `components/ui/slug-field.tsx` + `useSlugSuggestion` (two-mode:
auto displays slugify(currentName), first keystroke locks manual, «ساخت
مجدد از روی نام» regenerates from current name; EDIT initializes manual
= persisted slug can never be implicitly rewritten); collision hints
`lib/slug-collision.ts` exact-match only (brand: one-shot listBrands
limit100 complete; category: full tree; product: approved debounced
300ms probe of EXISTING GET /admin/products?search=<slug> + sequence
guard; hints only warn on found matches — NO available-indicator
anywhere); 409 → field-level Persian message, input+lock preserved.
devDeps jsdom+@testing-library/react in admin (approved; per-file jsdom
docblock, default env stays node). Gates: admin vitest 72/72 (+49),
lint/typecheck/build ✓. BROWSER ORACLE: suggestion/manual-lock/
regenerate/auto-resume live; brand ANKER→hint ON, «دل»→no hint
(correct: existing slug is `dell`); category «کیبورد و ماوس»→ON;
product existing-slug→ON live vs 1,100 rows; SAVE ROUND-TRIP: created
«آزمون SS254 محصول» → server stored azmvn-ss254-mhsvl == server
slugify (DB-verified); test product left in dev DB as documented data.
→ **#322 MERGED (8cb63ab). SS-255 IMPLEMENTED via user-pasted PLAN-ONLY
prompt (plan mode; 3 decisions asked: nameEn vertical slice YES, jsdom+
real-browser QA over Playwright YES, SlugField in dialogs YES) then
implemented (`feat/ss-255-inline-entity-creation`, **PR #323, Closes
#305) — CI GREEN first try, USER MERGES.** Contents: (1) BRAND nameEn
end-to-end — API DTO create/update (null clears), brands.service
(create/update/audit deltas/toSummary + the TWO nested brand selects in
products.service so admin product rows carry brand.nameEn), types
BrandSummary.nameEn + Create/UpdateBrandInput (NO migration — column
existed; §3 container sync REQUIRED post-merge: types cp+build BOTH
containers + restart, already applied locally), standalone brand-form
gains optional nameEn field; (2) NEW BrandQuickCreateDialog +
CategoryQuickCreateDialog (name/(+nameEn)/parent-with-(ریشه)+
maxSiblingSortOrder + SS-254 SlugField; one-shot collision datasets;
translateApiError 400-arrays + 409 strings in-dialog; values never
cleared); (3) ProductEditor: `+ برند جدید`/`+ دسته‌بندی جدید` triggers,
onSuccess = await refetch → select returned id → close (hooks' refetch
was always exposed, now used). Tests: FIRST admin vi.mock usage
(ApiError from services/api for 400-array/409 payloads; stateful list
mocks so refetch returns the created entity; Headless UI leaves the
dialog mounted during close-transition → waitFor removal; aria-hides
background while open → assert parent form AFTER close); api unit
1503/1503, brands e2e 9/9, admin vitest 91/91, all builds ✓. LIVE
ORACLE: brand journey (dialog closed + brand auto-selected + fields
intact + DB nameEn verified), 409 journey (stayed open + Persian
message ×2 + values intact), category journey (parent کیبورد و ماوس,
sortOrder 0, auto-selected), Esc closed the NEW brand dialog.
**ANOMALY UPDATE: REPRODUCED today on the ORIGINAL surface — pricing
«افزودن قانون» dialog ignores ESCAPE (stays open) while انصراف CLOSES
it (IAB). The new SS-255 dialogs close on BOTH → shared Alert
exonerated for Esc; suspicion narrows to the pricing dialog's caller.
Real-browser gate = USER (steps in PR #323).**
**⚠ SS-255 REVISION (2026-10-27, user-pasted prompt — PRODUCT OWNER
REJECTED the dialog design; `feat/ss-255-inline-entity-creation`
e6c8112 pushed to the SAME PR #323, description rewritten + comment;
CI: E2E 2m33 pass, Validate pass 19m36 after one infra cancellation at
FFmpeg-install; USER MERGES).** ProductEditor now EMBEDS the canonical
`CategoryManager` (NEW component = the whole Category Management page:
search+highlight, expand/collapse+localStorage, dnd-kit reorder/
reparent, row menu, editor+delete dialogs, optimistic reorder+recovery;
`variant="page"` = standalone page exactly as before — CategoriesPage
is a thin wrapper; `variant="compact"` = same capabilities, tighter
framing) with controlled `selectedId/onSelect` (row click = ASSIGNMENT,
banner «دسته منتخب: <full path>» — lookupNode().path is ANCESTORS-ONLY,
append the node yourself) + `onCreated` (auto-assign created category).
Brand Select replaced by `BrandSection` (NEW): chip + search +
click-to-select listbox + inline create form (name/nameEn/SlugField)
→ refetch+select+collapse. Quick-create dialogs DELETED (no second
implementation). CategoryEditor.onSuccess now returns (CategoryDetail,
mode). Tests: admin 87/87 (manager 6, embedded 5, wiring 5; dialog
suites removed) + all gates. LIVE QA: assignment banner, brand search/
select, inline create (DB-verified برند QA.rev), 409 inline intact,
category create+auto-assign, parent change persisted to standalone
page (level-2), edit-mode banner = full 3-level path, form fields
intact throughout. **dnd NOT automatable (dnd-kit PointerSensor
ignores synthetic pointer stream — user real-mouse gate); stuck-dialog
anomaly REFINED: async-success closes get STUCK (CategoryEditor after
create — data persisted, dialog resists Esc+انصراف; pricing dialog
same), user-event closes WORK → pattern = headlessui 2.2.10 + React 19
close-from-async; new flows avoid dialogs entirely.** Test data: برند
QA.rev, دسته QA.rev (now under کالای دیجیتال), برند/دسته آزمون SS255.
Test data in dev DB:
brand «برند آزمون SS255» + category «دسته آزمون SS255» (parent کیبورد
و ماوس). **Next iteration: SS-256 (#306, SKU suggestion), then
SS-264 (#307, search precision).** Key live findings (all probed,
not read): (1) every PDP share link is dead in dev — site URL falls back
to localhost:3001 via NEXT_PUBLIC_SITE_URL default; (2) admin variant
price fields mislabeled تومان while contract is Rial (variant-form.tsx:200);
(3) +5% rate recalc breaks compareAt>price on 6/13 rows (BEGIN/ROLLBACK
probe, checksum-verified zero-drift rollback); (4) search recall fine
(0/32 zero-hits) but precision broken — word_similarity≥0.3 fuzzy branches
with no token-length gate (ورتی→25% of catalog, Anker→136 incl.
استارتر); (5) catalog truth: 76% of published products have NO priced
variant, 72% variants out of stock, 46% SKUs synthetic WOO-, 23 products
minPrice NULL despite PRICED variant, dual brands live (گرین لاین/Green
Lion); (6) responsive clean: 0 overflow in 24 viewport×route combos;
(7) commerce tables are QA-only (6 orders, 0 RFQ) → no funnel exists,
instruments frozen pre-launch instead; (8) search API is heaviest public
read (~250-300ms; seq scan, GIN unused through similarity ORs); admin
overlay-open 11.4s in dev needs prod-build recheck. User merges/reviews
per standing rules.**

`origin/master` tip is `24d1f0f` (= merge #287, SS-244B).
**SS-245 launch QA (issue #288, branch `feat/ss-245-launch-qa`, PR #293,
Closes #288) EXECUTED 2026-10-02 — QA sweep S1–S9 done against the live
stack, 2 launch-blocker fixes + deploy runbook + Persian UAT checklist
committed. Full results in the SS-245 section below. CI: watch Validate +
E2E on PR #293. USER MERGES (standing rule).**

Stage 3 is now functionally complete: SS-241 shipping, SS-242 returns,
SS-243 notifications, SS-244A/B hardening/perf, SS-245 QA/deploy docs.
**PR #293 MERGED 2026-10-02 (`d2ab1c1`) — CI green first try.**
**Next session: launch-quality follow-ups #289 (mobile filter sheet typed
price inputs never commit), #291 (product-page hydration mismatch), #292
(storefront login ignores ?next=) — one branch `fix/ss-245-qa-followups`,
one PR closing all three, plan-then-approve per AGENTS.md §14. #290
(refresh-cookie collision) stays open behind the distinct-hostname
mitigation; SS-234B gateway still deferred (no PSP credentials).**
**SS-245B follow-ups (#289/#291/#292, branch `fix/ss-245-qa-followups`,
PR #294 `Closes #289, Closes #291, Closes #292`) EXECUTED 2026-10-02 —
3 commits (chore devDeps + 3 fixes), CI green (Validate + E2E),
MERGEABLE/CLEAN. USER MERGES. Root causes: #289 sheet footer button was
type=button close() only, price form id + submit now committed via
`form={…}` across the portal (PriceFacet gained formId/onApplied,
FiltersPanel threads priceFormId/onPriceApplied; closes only on valid
commit, Persian error stays); #291 ReviewForm `useState(() => hasSession())`
read localStorage during hydration → both ReviewForm + TierPriceLine now
use SS-231 useHasSession(); #292 login hardcoded /account → new
`lib/redirect.ts` resolveNextTarget (rejects //, /\, absolute; reads
window.location.search at submit — no useSearchParams). Tests: NEW
filters-sheet.test.tsx (4, jsdom component test), review-form.test.tsx
(2, renderToString+hydrateRoot pin — reproduced the exact mismatch pre-fix),
redirect.test.ts (4); vitest 292/292. New dev-only deps approved by user:
jsdom + @testing-library/react in @sabz/storefront (env stays node; use
per-file `// @vitest-environment jsdom`; no jest-dom — assert truthiness).
Live-verified on :3002 (mobile 390px sheet Persian-digit commit → URL
priceFrom/priceTo + sheet closes; desktop sidebar اعمال unaffected;
/orders→login?next=/orders→OTP→/orders; //evil.example.com→/account;
signed-in product page clean, dev overlay CSS-only). Prod-build evidence
for #291: SSR HTML has the signed-out card while signed-in client renders
form (not dev-only). Notes: stale next-server from an old session occupied
:3005 (left alone, used :3006); storefront container was stopped/started
for the host prod build, dev server healthy; a real dev login session now
exists for 09121234567 (OTP QA, harmless dev data); fake token planted in
localhost:3006 localStorage (origin now defunct).
**Issue cleanup + SS-042 (#90) session (2026-10-02, after #294 merged
`6adda31`): #49 closed (SS-244A audit: 32/33 guarded), #225 epic closed
(Stage 2–3 complete), NEW milestone `Production Launch` (#5) holds #51
(real SMS/OTP), #290 (cookie collision — verify distinct hostnames at
deploy), and NEW #295 (SS-234B online gateway, unblock = PSP
credentials; scope in the issue body). #90 implemented on
`feat/ss-042-partner-tier-admin`, PR #296 `Closes #90` — CI green
(Validate + E2E), MERGEABLE/CLEAN, USER MERGES. Contents: (1)
`prisma/seed-reference.ts` + `seed:reference` script — idempotent
insert-missing-by-name, neutral defaults 0%/qty1, runbook updated, dev
DB seeded (3 tiers, idempotency verified); (2) API tier CRUD on
`/admin/partners/tiers` (POST/PATCH/DELETE, 409 duplicate/delete-guard,
Persian 400 for 0–100 range, PARTNER_TIER_* audits + ipAddress; GET
gains additive partnerCount) + 7 unit + 1 controller + 6 e2e (395/395;
delete-guard test references tier from a PENDING partner via prisma to
stay state-safe for list-pagination assertions); (3) types
CreatePartnerTierInput/UpdatePartnerTierInput + optional
PartnerTierSummary.partnerCount (barrel+dist); (4) admin 4th pricing
tab «پله‌های همکاری» (services/partner-tiers.ts,
hooks/use-partner-tier-list.ts, PartnerTierForm in pricing-forms,
labels extended). Container types synced in sabz-api + sabz-admin
(§3 recipe) + restarted; live UI round trip (create → edit → delete)
verified against the live API.**
**⚠️ OPEN ANOMALY (pre-existing, not from #296): in the IAB automation
browser, admin Catalyst-Alert dialogs (pricing create/edit + delete
confirm) do not CLOSE on انصراف/Esc — `data-headlessui-state` stays
`open`; reproduced identically on unmodified master code (rules dialog,
stash test), so NOT a #296 regression. Data operations all succeed; the
dialog merely stays visually open. Needs one manual check in the
user's real browser (trusted events); if it reproduces there, it's a
new admin bug (headlessui 2.2.10 + React 19 close path) and deserves a
ticket. Also: admin IAB automation quirks — physical cua.click often
no-ops on admin pages (login, buttons) while programmatic
el.click()/React-props onClick always works; admin localStorage token
key differs from storefront's `sabz.accessToken`.**

### SS-245 session notes (2026-10-02)

- Container sync was **stale since SS-242**: types cp+build in
  sabz-api/sabz-admin/storefront + `prisma generate` in sabz-api +
  restart (§3 recipe; cp via /tmp then swap avoids the src/src nesting
  trap). Verify: `/health` ok, `/notifications` 401.
- QA evidence in `/tmp/ss-245-qa/` (screenshots per scenario).
- Findings A + C fixed in PR #293; B/D/E/F ticketed (#289–#292).
- Topology decisions recorded in the new
  `docs/07-development/deploy-runbook.md` §1: single replica at launch
  (multi-replica safe), Redis ephemeral, WAL/PITR deferred (trigger:
  client requires RPO <24h). backup.md §Notes updated.
- Tooling lessons for future GUI QA: IAB screenshot capture can hang on
  continuously-animating pages (home hero); cua.scroll/keypress and
  Playwright actionability loops are unreliable — use scrollIntoView +
  cua.click with in-viewport assertion, Playwright fill/click work in a
  fresh tab; Playwright fill fights the 6-box OTP auto-advance (click
  box 1 + cua.type "123456" instead).
- Old-tab screenshot drift: after dialog/overlay interactions a tab's
  capture can gain a vertical offset while layout stays clean — open a
  fresh tab instead of debugging the page.
- Dev-stack shipping methods default ENABLED with 0 fees
  (`SHIPPING_*_ENABLED !== 'false'`), so checkout smokes run as-is.
- Order ۱۰۰٬۰۰۷ (customer +989121000099 «کاربر آزمونی»), return request
  (APPROVED), review on PMG55 (APPROVED), blog draft «آزمون SS-245…»,
  and 4 storefront notifications are intentional test data in the dev DB.
**SS-240F reports/dashboard v2 (PR #277, Closes #269, branch
`feat/ss-240f-reports-dashboard`) MERGED — CI green first try (Validate +
E2E). SS-240 admin track complete (A–F all merged).**
**SS-242 returns (issue #278, branch `feat/ss-242-returns`, PR #279)
MERGED 2026-09-30 (`244d8da`) — CI green first try (Validate + E2E),
MERGEABLE/CLEAN at merge. Full notes in the SS-242 section below.**
**SS-241 shipping (issue #280, branch `feat/ss-241-shipping`, PR #281)
MERGED 2026-09-30 (`dc7c33c`) — Validate failed once on an unused e2e
const (fixed, pushed), then Validate + E2E green, MERGEABLE/CLEAN at
merge. Full notes in the SS-241 section below.**
SS-240 sub-issues: #264 (A orders, CLOSED), #265 (B pricing, CLOSED),
#266 (C RFQ, CLOSED), #267 (D reviews, CLOSED), #268 (E blog, CLOSED),
#269 (F reports/dashboard, CLOSED — merged). Returns deferred to SS-242
per user decision.

**Next session: sync master (expect tip past `81a99b6`, the SS-244A merge),
then SS-244B perf/cache/DB (follow-up slice, no issue yet — create per
#284 pattern before starting), then SS-245 launch QA. User chose the
A-then-B sequence 2026-10-01. SS-244A decisions locked: forbidNonWhitelisted
REJECTED (admin-brands e2e pins whitelist-strip as contract — needs a
dedicated ticket with client audit); cart/wishlist/notify/markRead stay
unaudited (high-frequency, low forensic value); host-cron pg_dump, no
compose sidecar; Redis/WAL-PITR out of scope until SS-245 topology.**

SS-244A (#284, branch `feat/ss-244a-hardening`, PR #285) — opencode-implemented:
- Throttling: per-route `@Throttle` on auth `request-otp` (20/min),
  `verify-otp` + `refresh` (30/min) — below global 100/min, above OtpService
  Redis limits (15 req/min/IP, 10 failures/10min/IP) so Persian service
  messages fire first. Throttler v6 named-override
  `@Throttle({ default: { limit, ttl } })`; no new deps. No e2e hits OTP
  routes directly (seeds use tokenService.createSession).
- Audit gaps (returns-service precedent: direct await, ipAddress threaded):
  `addresses` create/update/remove → `ADDRESS_CREATED/UPDATED/DELETED`
  (entity `Address`; no-op remove silent; module imports AuditModule) +
  `placeOrder`/`placeQuotedOrder` → `ORDER_PLACED` + owner cancel →
  `ORDER_CANCELLED` (entity `Order`; optional trailing `ipAddress`, RFQ path
  logs without ip — no rfq signature churn). Skipped
  cart/wishlist/notify/markRead. Count-pinning e2e filter by action name —
  new actions are safe.
- Backup: NEW `scripts/backup/postgres-backup.sh` (executable, host-cron
  `pg_dump -Fc` via compose postgres + `BACKUP_RETENTION_DAYS=14` prune) +
  `.env.example` BACKUP_* + NEW `docs/04-database/backup.md` (RPO ≤24h /
  RTO ≤2h, quarterly restore-test log) + `.gitignore` `backups/`.
- Permission audit (read-only, no holes): 32/33 controllers guarded; sole
  public is `public-media` (UUID + PUBLISHED gate, intentional).
- Deviation: `forbidNonWhitelisted` REJECTED — `admin-brands.e2e-spec:291`
  pins whitelist-strip (`logoKey: 'hack'` → 201); flipping to 400 is a
  breaking contract change for a dedicated ticket.
- Tests: 3 new unit (2 addresses + 1 quoted ORDER_PLACED).
- Gates: api lint ✓ typecheck ✓ unit 1486/1486 (112 suites) ✓ build ✓;
  FULL e2e 389/389 (37 suites) ✓. CI green first try, MERGEABLE/CLEAN,
  merged `81a99b6`. No migration/types change → no container sync needed.
- SS-244B sketch (NEXT, separate issue+PR): Redis throttler storage,
  cached public reviews w/ tag invalidation (SS-217 pattern), single index
  migration (`Notification.entity/entityId`, `Order[userId,status]`),
  checkout/cart round-trip batching review.

SS-243 (#282, branch `feat/ss-243-notifications`, PR #283) — opencode-implemented:
- Prisma: NEW `Notification` (scalar `userId` — AuditLog precedent, NO FK:
  Prisma rejects a relation field without a `User` back-reference, P1012;
  do NOT add `@relation` without the opposite field) + `NotificationType`
  enum (11 events) + migration `20260930140000_ss_243_notifications`
  (diff+deploy, zero drift; 31 migrations, status clean).
- API: NEW `notifications/` leaf module (imports nothing — Prisma/Config
  global, no cycle). `NotificationService.notify`/`notifyOperators` never
  reject (internal try/catch → warn), so emitters are one-line awaits that
  cannot break primary mutations. `notifyOperators` resolves OPERATOR/ADMIN
  via userRole join, empty staff = no-op. SMS = log-only stub gated by
  `NOTIFICATIONS_SMS_ENABLED=false` (resolves mobile, logs; provider ticket
  swaps `maybeSms` only). Owner `GET /notifications` (newest-first,
  unreadOnly, page/limit, Persian DTO errors) + `GET /notifications/
  unread-count` (badge) + idempotent `PATCH :id/read` (404 non-disclosure).
  Registered in `app.module.ts` (alphabetical: after inventory).
- Emitters (no status-logic changes): placeOrder/placeQuotedOrder (owner +
  operators; lost-race replay stays silent — winner already notified),
  transitionStatus/updateShipment/addTrackingEvent (owner; additive `userId`
  to internal selects only, zero DTO/e2e-pin churn), approve/reject (owner;
  defensive `profile?.userId ?? ''` + non-empty guard — unit mocks omit the
  join, see lesson), partner submit (operators), return create (operators) +
  approve/reject/receive/complete (owner), RFQ create (operators) +
  quote/reject/accept (owner). Owner self-actions (cancel) silent. No
  expiry notifies (read-path side effect, out of minimal scope).
- Wiring: Orders/Partners/Returns/Rfq modules import NotificationsModule;
  RfqService already injects CheckoutService — shared leaf, no cycle.
  `.env.example` gains the SMS flag. 8 ctor-churn sites fixed in specs
  (mock `{notify, notifyOperators}`; integration spec uses the real service
  with stub ConfigService).
- Types: NEW `packages/types/src/notifications/notifications.ts` +
  `NOTIFICATION_TYPE_FA` + barrel + dist.
- Admin: `/notifications` (اعلان‌ها, Bell icon after مرجوعی‌ها):
  unread-default filter + mark-read + entity links (Order/Rfq/ReturnRequest/
  Partner → detail routes) + unread subtitle + pagination; service/hook/
  badge (green/lime/amber/orange/red/zinc — no blue/indigo); local
  `lib/notification-labels.ts` (import type only, §5.8); RequireRole
  ADMIN_ROLES.
- Storefront: `lib/notifications.ts` (authFetch, stale-dist-tolerant
  labels) + `/notifications` (unread/all toggle + mark-read, guest
  redirect) + header bell with live unread badge (hidden logged-out,
  failure → badge-less bell) + account tile.
- Tests: 12 new unit (never-reject, fan-out incl. empty-staff, SMS on/off,
  unreadOnly, idempotent read, cross-user 404) + NEW `notifications.e2e-spec`
  (4: 401s, place→owner+operator rows + transition row, pins + newest-first
  + unreadOnly + count, idempotent read + cross-user 404 + bad-UUID 400).
  E2e cleanup mirrors returns-spec reservation sweep (Reservation Restricts
  inventoryItem — delete reservations by item relation first).
- Gates: api lint ✓ typecheck ✓ unit 1483/1483 (112 suites) ✓ build ✓;
  admin lint ✓ typecheck ✓ vitest 14 ✓ build ✓; storefront lint 0 errors
  (2 pre-existing warnings) ✓ typecheck ✓ vitest 277 ✓ build ✓
  (/notifications live; next-env.d.ts reverted); FULL e2e 389/389 (37
  suites) ✓. CI green first try (Validate + E2E), MERGEABLE/CLEAN, merged
  `7151de9`.
- Container sync NOT done (no live-verify requested): sabz-api/sabz-admin
  still run pre-SS-243 code — cp types+schema + rebuild + restart per §3
  before any live check (types+schema change, same as SS-241).

SS-241 (#280, branch `feat/ss-241-shipping`, PR #281) — opencode-implemented:
- Prisma: NEW `Shipment` (1:1 order, method/trackingNumber/status/
  shippedAt/deliveredAt) + `TrackingEvent` (append-only) + `ShipmentStatus`
  enum (PENDING→PICKED_UP→IN_TRANSIT→OUT_FOR_DELIVERY→DELIVERED +
  CANCELLED) + `Order.shippingMethod`; migration
  `20260930120000_ss_241_shipping` (diff+deploy, zero drift; 30
  migrations, status clean). No carrier credentials exist — Tipax/Post are
  env-flag stubs, no external HTTP.
- API (extends `orders/`, no new module): `shippingMethods()` env-driven
  (`SHIPPING_<CODE>_ENABLED/_FEE`, flat Rial, unset/invalid → 0);
  `ShippingMethodDto` gains `enabled` (SS-234 payment precedent);
  validate/placeOrder/placeQuotedOrder thread `shippingMethod` (required on
  place/accept: 400 missing, 422 unknown/disabled); totals = subtotal +
  fee; shipment created eagerly in the order tx. Operator `PATCH
  /admin/orders/:id/shipment` (tracking + forward-only status,
  lazy-creates for pre-SS-241 orders) + `POST .../tracking-events`
  (appends checkpoint + advances); audits `SHIPMENT_UPDATED` /
  `SHIPMENT_TRACKING_ADDED`. Order lifecycle auto-syncs the timeline
  (bypasses the forward-only guard — manual edits keep it; found live in
  e2e: SHIPPED→DELIVERED jumps the carrier middle-states). No audit for
  the sync (covered by ORDER_STATUS_CHANGED).
- Types: NEW `packages/types/src/shipping/shipping.ts` + barrel + dist;
  `PlaceOrderInput`/`AcceptRfqInput` gain `shippingMethod`.
- Admin: order-detail shipping section (method/fee/status/tracking +
  status form, event form gated to legal moves, event timeline) +
  `ShipmentStatusBadge` (PENDING amber/PICKED_UP+IN_TRANSIT orange/
  OUT_FOR_DELIVERY lime/DELIVERED green/CANCELLED zinc); `services/
  orders.ts` + `use-order-detail.ts` mutators; local
  `lib/shipping-labels.ts` (import type only, §5.8).
- Storefront: `lib/checkout.ts` (`shippingMethod` params, `isShippingEnabled`
  / `defaultShippingMethod` + 4 vitests); wizard sends the method (was
  local-only), review preview carries the fee, real Toman fees + disabled
  states; order-detail shipment card (hidden when null); RFQ accept gains
  a shipping picker. `lib/orders.ts` stale-tolerant shipment labels.
- Tests: 11 new unit (fees/flags, preview totals, 422s, shipment CRUD,
  transition auto-advance, DTO specs) + e2e pins (`enabled`,
  `shipment`/`shippingMethod` keys) + 3 new e2e (fee round-trip, disabled
  422, full operator shipment flow). All `*/checkout` + RFQ-accept call
  sites updated for required `shippingMethod`.
- Gates: types ✓; api lint ✓ typecheck ✓ unit 1471/1471 (110 suites) ✓
  build ✓ (alpine dist workaround); admin lint ✓ typecheck ✓ vitest 13 ✓
  build ✓; storefront lint 0 errors (2 pre-existing warnings) ✓ typecheck
  ✓ vitest 275 ✓ build ✓ (next-env.d.ts reverted); FULL e2e 385/385 (36
  suites) ✓. CI: first run Validate failed on unused `TRACKING_EVENT_KEYS`
  (local api lint passed it — CI lints test/ too; fixed + pushed), rerun
  Validate + E2E green, MERGEABLE/CLEAN, merged `dc7c33c`.
- Container sync NOT done (no live-verify requested): sabz-api/sabz-admin
  still run pre-SS-241 code — cp types+schema + rebuild + restart per §3
  before any live check. Storefront container was restarted after build.

SS-242 (#278, branch `feat/ss-242-returns`) — opencode-implemented:
- API: NEW `returns/` module (`ReturnsService` + owner `ReturnsController`
  + `AdminReturnsController`, OPERATOR/ADMIN; module imports Auth+Audit).
  NEW `ReturnRequest` + `ReturnItem` + `ReturnStatus` (PENDING→APPROVED→
  RECEIVED→COMPLETED + REJECTED + owner CANCELLED) + migration
  `20260930040000_ss_242_returns` (diff+deploy, zero drift; 29 migrations,
  status clean). Eligibility: owned DELIVERED + 7d window (RETURN_WINDOW_DAYS)
  + per-item qty guards + one-open-request 409; 422s for non-delivered/bad
  lines; non-disclosure 404s. One audit per mutation (RETURN_REQUESTED/
  APPROVED/REJECTED/RECEIVED/COMPLETED/CANCELLED). No order-status mutation,
  no restock/refund side effects. Additive `OrderItemDto.id` (SS-242: the
  request form references lines) + pins updated in orders-checkout +
  admin-orders e2e.
- Types: NEW `packages/types/src/returns/returns.ts` + barrel + dist.
- Admin: `/returns` queue (PENDING default + filter, pagination, inline
  تأیید/ثبت دریافت/تکمیل + رد via NEW `RejectReturnDialog` with required
  reason textarea) + `/returns/:id` detail (summary, items, order link,
  status-gated actions); `services/returns.ts`, `use-return-list.ts`
  (D-pattern + receive/complete), `use-return-detail.ts`, local
  `lib/return-labels.ts` (import type only, §5.8); `ReturnStatusBadge`
  (PENDING amber/APPROVED lime/RECEIVED orange/COMPLETED green/REJECTED
  red/CANCELLED zinc); sidebar مرجوعی‌ها (Undo2, after سفارش‌ها);
  `RequireRole ADMIN_ROLES`.
- Storefront: `lib/returns.ts` (authFetch, stale-dist-tolerant labels) +
  `/returns` list + `/returns/:id` detail (PENDING-only cancel) +
  `/orders/:id/return` request form (line checkboxes + qty steppers +
  reason ≤1000 → POST → redirect); DELIVERED orders show درخواست مرجوعی
  link; account tile مرجوعی‌ها.
- Tests: 15 new unit + NEW `returns.e2e-spec` (3) + `admin-returns.e2e-spec`
  (4, incl. full lifecycle + audit counts + 400/409 paths).
- Gates: types ✓; api lint ✓ typecheck ✓ unit 1460/1460 (110 suites) ✓
  build ✓ (alpine dist workaround); admin lint ✓ typecheck ✓ vitest 13 ✓
  build ✓; storefront lint 0 errors ✓ typecheck ✓ vitest 271 ✓ build ✓
  (next-env.d.ts reverted); FULL e2e 382/382 (36 suites) ✓.
- Container sync done (types+schema change): types cp+nesting-fix+build in
  BOTH sabz-api and sabz-admin, schema cp + prisma:generate in sabz-api,
  both restarted; live `/returns` + `/admin/returns` + `/admin/orders`
  401, `/returns` admin page Vite 200. User to hard-refresh both browser
  tabs (new sidebar entry + storefront routes).

SS-240F (#269, PR #277) — implemented this session:
- API read-only extension, NO migration: `DashboardService.getSummary`
  gains 7 commerce reads in the same `$transaction` (order groupBy status
  and paymentMethod, PAID `_sum total`, PENDING rfq/review counts, DRAFT
  post count, bounded 14-day scan bucketed per UTC day; revenue =
  sum(total) WHERE PAID only, Decimal-to-string; COD share =
  round(cod/total*100)). `??` defaults keep old 5-element unit mocks green.
- Types: `DashboardOrdersByStatus` / `DashboardPaymentSplit` /
  `DashboardDayPoint` / `DashboardCommerce` + `DashboardSummary.commerce`
  + barrel + dist.
- Admin, no new route or sidebar (dashboard v2 in-page): order-report
  cards (total + 5 statuses) + PAID-revenue card via `formatRial` (admin
  stays Rial) + COD/online/share cards + queue table (links to /rfq,
  /reviews, /blog) + 14-day Catalyst table with UTC note. Local labels +
  import type only (§5.8 holds — Vite serves page 200).
- Tests: 3 new unit (buckets + revenue + queues, null-sum to "0", UTC
  day-bucketing) + controller-spec commerce mock + e2e key pins (8
  commerce keys, 3 day-point keys, 14 rows) + self-consistency test.
- Gates: types ✓; api lint ✓ typecheck ✓ unit 1445/1445 (108 suites) ✓
  build ✓ (alpine dist workaround); admin lint ✓ typecheck ✓ vitest 13 ✓
  build ✓; dashboard e2e 9/9 ✓; FULL e2e 375/375 (34 suites) ✓; CI green
  first try, MERGEABLE/CLEAN, no flake.
- Container sync done (types change): cp + nesting-fix + types-build in
  BOTH sabz-api and sabz-admin, both restarted; live `/admin/dashboard`
  401, `/admin/orders` 401 unaffected, dashboard-page Vite 200. User to
  hard-refresh the admin browser tab for the new sections.

SS-240E (#268, PR #274) — merged `e0790d2`, notes kept for reference:
- API (reads-only; SS-238 shipped the writes): NEW `AdminBlogController`
  (`admin/blog/posts`, OPERATOR/ADMIN — unscoped DRAFT+PUBLISHED queue list
  + get-by-id incl. drafts, newest-first createdAt DESC/id DESC, default
  limit 20/max 50) + `BlogService.listForAdmin`/`getPostByIdForAdmin`
  (read-only, no audit; list rows are card+status, bodies stay out).
  NEW `ListAdminBlogPostsQueryDto` (optional status, no default = all;
  Persian messages). NO migration (Blog models shipped in SS-238).
  Writes reuse the SS-238 `/blog*` routes directly (admin service calls
  `/blog*`, same non-admin-prefix shape as C's `/rfq/*` and D's
  `/reviews/*`).
- Types: `AdminBlogPostListItemDto` (= BlogPostCardDto + status/statusFa)
  / `AdminBlogPostListResponse` + barrel + dist (barrel lesson re-hit:
  missing index.ts export = TS2724).
- Admin: `/blog` queue (status filter default همه + pagination) with inline
  انتشار (DRAFT, green Button) + بایگانی via `DeleteConfirmDialog`
  (PUBLISHED only, DELETE→DRAFT; 409 → banner + refetch) + ویرایش link;
  categories section (Catalyst create/edit dialogs via NEW
  `BlogCategoryForm`, brand-form pattern; delete-409 → banner).
  NEW `/blog/new` + `/blog/:id/edit` full-page editor (title/slug/category/
  author/cover-URL/excerpt + shared TipTap `ContentEditor` WITHOUT
  productId — image upload stays disabled, covers via URL field — + SEO
  metaTitle/metaDescription + status select; create navigates to edit,
  product-editor-page pattern). `services/blog.ts`, `use-blog-list.ts`
  (D-pattern hook + publish/archive mutators, `mutatingId` +
  `actionError`), local `lib/blog-labels.ts` (import type only, §5.8);
  `BlogStatusBadge` (DRAFT amber / PUBLISHED green); sidebar وبلاگ
  (Newspaper icon, after نقدها); `RequireRole ADMIN_ROLES`.
- Tests: admin-blog controller spec (roles + delegation, both routes) +
  NEW `admin-blog.e2e-spec` (3 tests: 401/403, queue key pins +
  newest-first + filters + pagination + public-still-hides-drafts,
  detail-by-id + 404).
- Gates at push: api lint ✓ typecheck ✓ unit 1442/1442 (108 suites) ✓
  FULL e2e 374/374 (34 suites) ✓ build ✓ (alpine dist workaround);
  admin lint ✓ typecheck ✓ vitest 13 ✓ build ✓; CI green first try,
  MERGEABLE/CLEAN, no flake.
- Test-DB lesson: e2e runs against `sabz_test` (derived from DATABASE_URL),
  NOT dev `sabz` — probes must target `sabz_test`. Found + deleted one
  stray DRAFT (`post-1790604471250-lb0uxc`, leaked by an old blog.e2e run)
  with 0 audit rows; suite deterministic again.
- Container sync done (types change): cp+nesting-fix+types-build in
  BOTH sabz-api and sabz-admin, both restarted; live `/admin/blog/posts`
  (+ `?status=DRAFT`) 401 = registered + guarded, `/blog/categories` 200,
  blog-page + hook modules serve 200 from Vite (no import crash —
  local-labels pattern holds). User to hard-refresh the admin browser tab
  for the وبلاگ sidebar entry.

SS-240D (#267, PR #273) — opencode-implemented this session:
- API: NEW `AdminReviewsController` (`admin/reviews`, OPERATOR/ADMIN,
  queue-list only) + `ReviewsService.listForModeration` (PENDING
  default, newest-first createdAt DESC/id DESC, default limit 20/max
  50, denormalized `productName`/`productSlug` — SS-240B precedent;
  read-only, no audit). NEW `ListAdminReviewsQueryDto` (status enum +
  page/limit, Persian messages). NO migration (Review model + [status,
  createdAt] index shipped in SS-236). Approve/reject reuse the SS-236
  `reviews/:id/*` routes directly (admin service calls `/reviews/*`,
  same non-admin-prefix shape as C's `/rfq/*`).
- Types: `AdminReviewListItemDto` (= ReviewDto + productName/
  productSlug) / `AdminReviewListResponse` + barrel + dist.
- Admin (queue-only per user decision — NO detail page): `/reviews`
  (PENDING default + همه وضعیت‌ها filter, pagination) with product
  link → `/products/:id`, inline تأیید (green Button) + رد via
  `DeleteConfirmDialog` (hook swallows errors into an alert banner, so
  the dialog always closes; 409 → banner + refetch). `services/
  reviews.ts`, `use-review-list.ts` (C-pattern hook + approve/reject
  mutators, `mutatingId` + `actionError`), local `lib/review-labels.ts`
  (import type only, §5.8); `ReviewStatusBadge` (PENDING amber /
  APPROVED green / REJECTED red); sidebar نقدها (Star icon, after
  استعلام‌ها); `RequireRole ADMIN_ROLES`.
- Tests: 2 new unit (defaults + explicit paging) + admin controller
  spec (roles + delegation) + NEW `admin-reviews.e2e-spec` (2 tests:
  401/403, queue key pins + newest-first + filters + approve-moves-row
  + pagination + 400 path). Lint fix en route: empty-object-type in the
  unit mock (`[{}, {}]` → `[[unknown, unknown]]`).
- Gates at push: api lint ✓ typecheck ✓ unit 1439/1439 (107 suites) ✓
  FULL e2e 371/371 (33 suites) ✓ build ✓ (alpine dist workaround);
  admin lint ✓ typecheck ✓ vitest 13 ✓ build ✓; CI green first try,
  MERGEABLE/CLEAN, no flake.
- Container sync done (types change): cp+nesting-fix+types-build in
  BOTH sabz-api and sabz-admin, both restarted; live `/admin/reviews`
  (+ `?status=APPROVED`) 401 = registered + guarded, pricing/rfq 401s
  unaffected, reviews page + hook modules serve 200 from Vite (no
  import crash — local-labels pattern holds). User to hard-refresh the
  admin browser tab for the نقدها sidebar entry.

SS-240C (#266, PR #272) — implemented this session (build mode, direct):
- Admin-only, UI-only (RFQ API ready since SS-235 B2 — no API changes,
  no migration, no types changes, no e2e churn). 9 files, +689.
- NEW `lib/rfq-labels.ts` (RFQ_STATUS_LABELS + RFQ_STATUS_ORDER,
  import type only, §5.8); NEW `services/rfq.ts` (listRfqs/getRfq/
  quoteRfq/rejectRfq via `request()` — note routes are `/rfq/*`, NOT
  `/admin/*`: the RfqController has no admin prefix; the operator
  branch is server-side via `isOperator`).
- NEW `hooks/use-rfq-list.ts` (use-order-list clone, DEFAULT_LIMIT 20)
  + `hooks/use-rfq-detail.ts` (quote/reject mutators, `mutating` flag).
- NEW `components/rfq/rfq-status-badge.tsx` (Catalyst Badge:
  PENDING amber / QUOTED lime / ACCEPTED green / REJECTED red /
  EXPIRED zinc — no blue/indigo per admin standards).
- NEW `pages/rfq-page.tsx` (status-filter + paginated queue table,
  orders-page pattern) + `pages/rfq-detail-page.tsx` (summary grid,
  quoted block with /orders/:orderId link, inline quote form gated to
  PENDING with Rial + ≤2dp + future-expiry client validation, reject
  via DeleteConfirmDialog gated to PENDING/QUOTED mirroring the API
  409 guards). `InfoItem` takes string|null only — order link uses a
  custom dt/dd block.
- Edits: `app/App.tsx` (rfq + rfq/:id, RequireRole ADMIN_ROLES) +
  `sidebar.tsx` (استعلام‌ها, FileText icon, after pricing).
- Gates at push: admin lint ✓ typecheck ✓ vitest 13/13 ✓ build ✓.
  CI green first try, MERGEABLE/CLEAN. No container sync needed (no
  @sabz/types change).

SS-240A (#264, PR #270) — opencode-implemented this session:
- API: NEW `AdminOrdersController` (`admin/orders`, OPERATOR/ADMIN) —
  unscoped list (owner + mobile + payment columns), unscoped detail,
  `PATCH :id/status` (legal lifecycle only, operator cancel restocks via
  `order-cancel:` ledger notes, COD PENDING→PAID exactly on DELIVERED,
  one `ORDER_STATUS_CHANGED` audit per transition). NEW
  `UpdateOrderStatusDto`; `CheckoutService` + `AuditService` (module
  imports `AuditModule` — no cycle). NO migration (Order model ready).
- Types: `AdminOrderListItemDto` / `AdminOrderListResponse` /
  `AdminOrderDetailDto` / `AdminOrderTransition` + barrel + dist.
- Admin: `/orders` list + `/orders/:id` detail + status-gated confirm
  transitions + sidebar سفارش‌ها; `formatRial` helper; order-labels.
- Tests: 7 new unit (transitions + reads) + NEW `admin-orders.e2e-spec`
  (6 tests: 401/403, list keys + filter, detail keys + 404, lifecycle to
  DELIVERED + PAID + audit count, 409/400 paths, operator cancel restock).
- Gates at push: api lint ✓ typecheck ✓ unit 1422/1422 ✓ e2e 364/364
  (31 suites) ✓ build ✓ (alpine dist workaround); admin lint ✓
  typecheck ✓ vitest 13 ✓ build ✓; live 401s on new routes.
- Post-push fix (commit `287a30a`): admin runtime-import crash — see
  standing decisions §5 items 8–9. CI rerun pending at session end.

SS-240B (#265, PR #271, branch `feat/ss-240b-pricing`, commit
`f3eb9bb`) — opencode-implemented, CI green first try, MERGEABLE:
- API: NEW `AdminPricingController` (`admin/pricing`, OPERATOR/ADMIN,
  12 routes: GET/POST + GET/PATCH/DELETE per resource) + NEW
  `AdminPricingService` (paginated newest-first lists, Persian
  404/400/409s: missing FK, inverted window, PERCENT > 100, duplicate
  override/code, P2002 race → 409; Decimals as strings, ISO/null dates,
  createdBy/updatedBy). One audit per mutation:
  `CATEGORY_PRICE_RULE_*` / `PRODUCT_PRICE_OVERRIDE_*` / `PROMOTION_*`
  (user chose audit YES). `PricingModule` also imports `AuthModule`
  (RolesGuard needs RolesService — same as blog/reviews/inventory, no
  cycle). Engine (`resolveLine`) untouched; bulk tiers hardcoded; NO
  migration (models existed).
- Types: NEW `packages/types/src/pricing/pricing.ts` + barrel + dist.
- Admin: single `/pricing` page with 3 tabs (rules/overrides/
  promotions) + Catalyst create/edit dialogs + `DeleteConfirmDialog` +
  pagination; `services/pricing.ts`, `use-pricing-list.ts` (shared
  helper + 3 thin hooks), local `lib/pricing-labels.ts` (import type
  only, §5.8); sidebar قیمت‌گذاری (Percent icon); `RequireRole
  ADMIN_ROLES`. Money Rial via `formatRial`.
- Tests: 13 new unit (service incl. audit actions + Decimal
  normalization) + NEW `admin-pricing.e2e-spec` (5 tests: 401/403,
  per-resource round-trips with pinned keys + audits, 400/409 paths).
- Gates: types build ✓; api lint ✓ typecheck ✓ unit 1435/1435 ✓
  build ✓ (alpine dist wipe); admin lint ✓ typecheck ✓ vitest 13 ✓;
  new e2e 5/5 ✓; FULL e2e 369/369 (32 suites) ✓ — no existing suite
  touched.
- Post-push live incident (stale containers, §3 lesson hit live):
  `/admin/pricing/*` 404'd (`Cannot GET/POST`) + sidebar missing —
  `sabz-api`/`sabz-admin` predated the code with baked types lacking
  `pricing.ts`. Fixed per §3/§5.9: cp+nesting-fix+types-build in BOTH
  containers, `docker restart sabz-api sabz-admin`; verified live
  (all route groups 401 = registered + guarded; admin serves
  pricing-page + قیمت‌گذاری sidebar). User to hard-refresh browser tab.
- Deviations: list rows denormalize `categoryName`/`productName`
  (SS-240A `customerMobile` precedent); explicit-`null` clears window
  bounds (blog pattern); scope FKs unvalidated (scalars, no DB
  constraints); Decimal trailing zeros strip (`'10.00'`→`'10'`);
  product picker = ID input + on-blur name lookup; e2e seeds via
  `tokenService.createSession` (actual admin-orders pattern).

SS-239 (#262, PR #263) — ZCode-implemented directly (user choice, not
opencode):
- API-only, NO new Prisma model/migration (feed projects the published
  catalog). New `torob/` module: `POST /api/v1/torob/products` (feed v3:
  `page_urls` / `page_uniques` / `{page,sort}` / `{cursor,sort}`, sorts
  date_added_desc/date_updated_desc/product_id_desc, missing sort = 400
  with the spec `{error}` envelope via manual parse — NOT class-validator,
  which would clobber the envelope). `@HttpCode(200)` + `@SkipThrottle()`
  (global 100/min would break Torob's full-catalog sweep).
- Auth: Ed25519 JWT (alg pinned EdDSA, exp/nbf/aud) verified with the
  published Torob public key embedded in `torob-auth.ts` +
  `TOROB_JWT_PUBLIC_KEY_PEM` override (e2e signs with a generated
  keypair). Bare 401 on failure. Header: `Authorization` (Bearer
  optional) with `X-Torob-Token` fallback (header name unverifiable —
  spec docs unreachable; contract carried over from prior session's
  fetched docs per user decision).
- Projection: one row per PRICED variant grouped by product_group_id;
  Rial→Toman floor ÷10; old_price only when compareAt > price;
  availability from inventory aggregate (activeInventoryWhere); absolute
  page_url (`TOROB_FEED_STOREFRONT_BASE_URL`) + image_links
  (`TOROB_FEED_API_BASE_URL` + PUBLIC_MEDIA_URL_PREFIX, now exported
  from public-catalog.service). Pagination product-grained (100/page);
  cursor = versioned base64url (sort key, id); invalid cursor = fresh
  sweep, not error.
- Env: TOROB_JWT_AUDIENCE, TOROB_JWT_PUBLIC_KEY_PEM (optional),
  TOROB_FEED_STOREFRONT_BASE_URL, TOROB_FEED_API_BASE_URL (both
  .env.example files updated).
- Types: `packages/types/src/torob/torob.ts` + barrel + dist (prior
  session groundwork, reused).
- Gates at push: api lint ✓ typecheck ✓ unit 1415/1415 (105 suites, +30
  torob) ✓ e2e 358/358 (30 suites, +torob 12) ✓ build ✓. CI green first
  try, no flake.
- Local verification: container sync done (with the src/src docker-cp
  fix, §3) — live route answers 401 unauthenticated.

SS-238 (#259, PR #260):
- NEW `BlogStatus` enum (DRAFT/PUBLISHED) + `BlogCategory` (slug unique,
  sortOrder) + `BlogPost` (slug unique, optional category FK null-on-delete,
  excerpt/sanitized-HTML content, coverImageUrl, authorName byline, SEO
  fields, publishedAt) + migration `20260928030000_ss_238_blog`
  (diff+deploy, zero drift; 28 migrations, status clean).
- NEW `blog/` module (reviews pattern): public GET /blog (PUBLISHED-only,
  newest-first, ?category=) + GET /blog/categories + GET /blog/:slug
  (drafts 404); OPERATOR/ADMIN POST/PATCH/DELETE posts (DELETE = archive
  → DRAFT) + category CRUD (delete 409 while referenced). Slugs explicit or
  auto via shared slugify+ensureUniqueSlug; bodies via shared
  sanitizeRichText; publish stamps publishedAt; BLOG_* audit; invalidates
  NEW `blog:*` tags (mirrored in both tag files + revalidate allowlist).
- Types: NEW `packages/types/src/blog/blog.ts` + barrel + dist build.
- Storefront: NEW `lib/blog.ts` cached fetchers (SS-217) + vitest; NEW
  /blog index (category pills, URL-state) + /blog/[slug] (OG/meta,
  BlogPosting JSON-LD, RichText body, ProductShare reuse) + loading/error;
  NEW BlogTeaser on home (latest 3, hidden until first post); footer
  وبلاگ link. Covers via plain lazy <img> (optimizer allow-lists API/media
  hosts only — operator URLs are arbitrary).
- Gates at push: api lint ✓ typecheck ✓ unit 1385/1385 (102 suites) ✓
  e2e 346/346 (29 suites, +blog 6) ✓ build ✓; storefront lint 0 errors ✓
  typecheck ✓ vitest 271/271 ✓ build ✓ (/blog live); types dist ✓;
  next-env.d.ts reverted. Full CI e2e run green, no flake this time.
- Post-merge local fix (NOT a code change — dev-env only): /blog 500'd
  with `Cannot GET /api/v1/blog` because sabz-api container served stale
  code (image-baked /app/packages predates SS-235B2; watcher had 74 type
  errors). Fixed by `docker cp` of host packages/types/src into the
  container + in-container types build + prisma:generate + `docker restart
  sabz-api`. See §3 dev-container lesson. No blog posts seeded
  (anti-fabrication); /blog correctly shows the Persian empty state.

SS-237 (#257, PR #258):
- Storefront-only (no API/migration/types changes — master plan §5.9 needs
  no backend model). NEW `lib/compare.ts`: pure helpers + `sabz.compare.v1`
  localStorage boundary (`{id,slug}` entries, never prices) + 12 vitests.
- NEW `CompareProvider` (cart-provider pattern, ready flag, guest-friendly,
  no auth) mounted in layout inside `CartProvider`; `CompareToggle` island
  (aria-pressed, 4-slot block with Persian full-notice) on cards
  (bottom/start sibling overlay, SS-218) + detail slot with /compare link;
  `CompareHeaderIcon` with honest count badge (ready + non-empty only).
- NEW `/compare?products=` server component via cached `fetchProductBySlug`
  (SS-217-safe, zero client catalog fetch) + `CompareTable` (price via
  format helpers/currency.ts, Rating reuse, stock/brand/condition/promotion
  countdown, spec union via groupSpecs+physicalSpecRows+specLabelFa with —
  for missing, per-column AddToCart + remove with URL rewrite) +
  loading/error + Persian empty/stale-link states; storage↔URL sync
  (shared links adopt into provider; bare /compare with stored list replaces
  URL, no empty-state flash).
- Gates at push: storefront lint 0 errors (only pre-existing
  product-gallery ref warning) ✓ typecheck ✓ vitest 268/268 ✓ build ✓
  (/compare live); next-env.d.ts reverted.

SS-236 (#255, PR #256):
- NEW `Review` model + `ReviewStatus` enum (PENDING→APPROVED/REJECTED;
  rating 1–5, optional comment ≤2000, unique user×product) + migration
  `20260928020000_ss_236_reviews` (diff+deploy, zero drift; 27
  migrations, status clean).
- NEW `reviews/` module: POST /reviews (authed, published gate 404,
  duplicate 409 incl. race), GET /reviews/product/:id (public,
  paginated, APPROVED-only + aggregate), PATCH /reviews/:id/approve +
  POST /reviews/:id/reject (OPERATOR/ADMIN; full admin UI stays SS-240).
- Catalog: `ratingAverage` (1-decimal) + `ratingCount` on card + detail
  DTOs (batched APPROVED-only groupBy, never N+1); star-bucket `rating`
  facet (5→≥4.5 … 1→<1.5 exact ranges, user chose buckets over
  min-threshold) on q-less + search paths, intersecting inStockOnly.
- Storefront: Rating primitive (SS-221) live on cards + detail,
  `ProductReviews` section + `ReviewForm` island (authFetch, Persian,
  guest login link), facet in shared FiltersPanel (desktop + mobile
  sheet) with pills/clear-all, `aggregateRating` in JSON-LD (omitted
  until first approval).
- Gates at push: api lint ✓ typecheck ✓ unit 1378/1378 (101 suites) ✓
  e2e 340/340 (28 suites, +reviews) ✓ build ✓; storefront vitest 256 ✓
  typecheck ✓ lint 0 errors ✓ build ✓; types dist + barrel ✓;
  next-env.d.ts reverted; card/wishlist e2e pins updated.
- CI note: first E2E run failed on a pre-existing flake
  (`admin-products.integration-spec` timestamp slug off by 1ms,
  unrelated file); rerun green. E2E itself was 340/340 on both runs.

SS-235 B2 (#253, PR #254, branch `feat/ss-235b2-rfq-workflow`):
- NEW `Rfq` model + `RfqStatus` enum (PENDING→QUOTED→ACCEPTED,
  +REJECTED/EXPIRED; quotedUnitPrice Rial, 7d default expiry, unique
  orderId) + migration `20260928010000_ss_235b2_rfq` (diff+deploy, zero
  drift; 26 migrations, status clean).
- NEW `rfq/` module: POST /rfq (APPROVED partner, CALL_FOR_PRICE only —
  PRICED → 422), GET /rfq (+status filter), GET /rfq/:id
  (owner-or-operator, else 404), PATCH /rfq/:id/quote + POST
  /rfq/:id/reject (OPERATOR/ADMIN; full admin UI stays SS-240),
  POST /rfq/:id/accept (→order, expiry 410, double-accept replays,
  lost-race replays winner after restock).
- `CheckoutService.placeQuotedOrder`: RFQ accept reuses the single
  order-creation path (reserve→consume→sequence→payment gates); quoted
  unit frozen, never resolveLine. Extracted `assertPaymentEnabled` +
  `consumeAll`; `reserveAll` widened to `QuotableLine`.
- Audit: RFQ_CREATED / QUOTED / ACCEPTED / EXPIRED / REJECTED
  (UPPER_SNAKE, entity 'Rfq'). Cart/checkout CALL_FOR_PRICE blocks
  untouched (PRICE-008).
- Storefront: `RfqRequestButton` island in the CALL_FOR_PRICE slot
  (quantity + submit; guests get partner-login link); `/rfq` list +
  `/rfq/:id` detail with accept form (AddressPicker + payment +
  countdown → order page). `lib/rfq.ts` + 1 vitest.
- Gates at push: api lint ✓ typecheck ✓ unit 1352/1352 (98 suites) ✓
  e2e 337/337 (27 suites, +5 rfq) ✓ build ✓; storefront vitest 248 ✓
  typecheck ✓ build ✓ (/rfq routes live); types dist + barrel ✓;
  next-env.d.ts reverted.
- Deferred: full admin RFQ UI (SS-240); coupons + tax (excluded).

SS-235 B1 (#251, PR #252, branch `feat/ss-235b-pricing-rules`):
- NEW `CategoryPriceRule` (priority-ordered, windowed, FK→Category) +
  `ProductPriceOverride` (unique per product, FK→Product) + migration
  `20260928000000_ss_235b_pricing_rules` (diff+deploy, no reset).
- `PricingService`: `categoryRuleFor` / `productOverrideFor` (never throw,
  invalid rows ignored) + extended pure `resolveLine` chain
  Base → Rule → Override → Tier → Bulk → Promo (5th optional param, old
  callers untouched); `promotionEndsAtByProduct` batch (one query/page).
- Public `GET /catalog/products/:slug/price` (`quantity`, `variantId`
  filter) behind NEW `OptionalJwtAuthGuard` (guests retail, APPROVED
  partners tier via `tierApplied`); CALL_FOR_PRICE quotes null.
- Catalog cards/detail/related expose `promotionEndsAt`; e2e pins updated
  (catalog, wishlist). Storefront: «فروش ویژه» badge + countdowns,
  `TierPriceLine` (signed-in tier via authFetch), cooperation note updated.
- Gates at push: api lint ✓ typecheck ✓ unit 96/1318→1326 ✓ e2e
  26/331→332 ✓ build ✓; storefront vitest 247 ✓ build ✓; types dist +
  barrel ✓; next-env.d.ts reverted.
- Deferred: RFQ workflow (B2), admin pricing CRUD (SS-240), coupons + tax
  (excluded per user 2026-09-28).

## 2. How to run a ticket through opencode (the loop that worked)

```bash
# 0. sync + branch per ticket
git checkout master && git pull
git checkout -b feat/ss-236-reviews        # feat/ss-NNN-description

# 1. brief → opencode (non-interactive, free model)
opencode run --model opencode/muse-spark-1.3-contributor-free \
  --title "SS-236 reviews" "<BRIEF>"

# 2. REVIEW the diff yourself — never skip
git status && git diff

# 3. gates (from repo root with --filter, or per-package)
pnpm --filter @sabz/api lint && pnpm --filter @sabz/api typecheck
pnpm --filter @sabz/api test
DATABASE_URL="postgresql://sabz:sabz@localhost:5432/sabz?schema=public" \
REDIS_HOST=localhost REDIS_PORT=6379 NODE_ENV=test \
JWT_ACCESS_SECRET=dev_access_secret_change_me \
JWT_REFRESH_SECRET=dev_refresh_secret_change_me \
pnpm --filter @sabz/api test:e2e
pnpm --filter @sabz/api build

# 4. corrections: continue the same session
opencode run -c "<specific corrections>"

# 5. commit (conventional), push, PR with Closes #NNN, watch CI
git add <explicit paths>     # NEVER git add -A
gh pr create ... && gh pr checks <N> --watch
```

**Review checklist before any commit:**
- [ ] No invented business claims/links (anti-fabrication rule in lib/site.ts).
- [ ] Persian-first RTL; UI primitives (Button/Badge/SectionHeader) reused; 44px targets.
- [ ] Authed calls go through `authFetch` (lib/auth-client.ts) — Bearer + credentials:'include'.
- [ ] No API DTO shape change without updating `apps/api/test/*.e2e-spec.ts`
      (they pin exact `Object.keys` lists — CI "E2E & Integration" fails otherwise).
- [ ] Prisma schema changes → migration committed; never edit generated client.
- [ ] `apps/storefront/next-env.d.ts` flips between dev/build — revert it, don't commit.
- [ ] `@sabz/types` is consumed via dist: after ANY `packages/types/src`
      change run `pnpm --filter @sabz/types build` AND add the export to
      `packages/types/src/index.ts` (missing barrel = TS2724).

## 3. Environment cheatsheet

- **Host has node v24 + pnpm 11** — run gates on host. API tests = **jest**
  (`test` unit, `test:e2e` with the env above — NOT bare `test`);
  storefront = **vitest**.
- **Live stack (docker compose):** API :3000, storefront :3002 (runs `next
  dev` over a bind mount), admin :5173, postgres :5432, redis :6379.
- **Dev auth:** OTP always `123456`; admin `+989170000001`. OTP: 3
  attempts/code, 2-min expiry, 3 req/min (429 → wait 60s).
- **Auth client contract:** access token in
  `localStorage['sabz.accessToken']`; refresh in httpOnly cookie — every
  request needs `credentials:'include'`; use `authFetch` for ALL authed calls.
- **Migration lesson (SS-235, 2026-09-27):** `prisma migrate dev` demanded a
  full reset over a PRE-EXISTING SS-233 checksum drift (`20260927131416`
  file differs from applied). Refused (live catalog ~1100 products);
  generated SQL via `migrate diff --from-migrations ... --to-schema-datamodel
  ... --script`, wrote `migrations/<ts>_name/migration.sql` manually,
  applied with `migrate deploy` — clean, `migrate status` up to date.
  ✅ RESOLVED 2026-09-28: pre-B1 `migrate status` reported "Database schema
  is up to date" (25 migrations); the B1 migration applied via the same
  diff+deploy path with zero drift. Keep the pattern anyway — never
  `migrate dev` reset on the live DB. `migrate diff` needs explicit
  `--shadow-database-url` (shadow DB `sabz_shadow` exists; no .env files in
  repo — pass `DATABASE_URL`/`SHADOW_DATABASE_URL` inline per §2 loop).
- **Root-owned `apps/api/dist`:** container watcher writes root-owned files;
  host `nest build` fails EACCES — clear with
  `docker run --rm -v $PWD/apps/api/dist:/work alpine sh -c 'rm -rf /work/*'`
  (gitignored, safe), then rebuild.
- **Root-owned `.next`:** stop storefront, `docker run --rm -v $PWD:/work
  alpine sh -c 'rm -rf /work/apps/storefront/.next'` (remove the DIR),
  host build, restart storefront.
- **Dev-container staleness (SS-238, 2026-09-28):** `sabz-api` runs `nest
  dev` over the `apps/api` bind mount, but `/app/packages` is baked into the
  image — after ANY `@sabz/types` change the container's types dist (and its
  image-time Prisma client) go stale, the watcher accrues type errors, and
  new routes 404 locally while CI stays green. Fix without an image rebuild
  (registry often unreachable): copy types src in, build types, prisma:generate
  when the schema changed, then `docker restart sabz-api` (also clears
  EADDRINUSE from stale node processes). Verify with
  `curl localhost:3000/api/v1/<new-route>`.
  ⚠️ SS-239 (2026-09-29): `docker cp packages/types/src sabz-api:/app/packages/types/src`
  NESTS the copy as `/app/packages/types/src/src` when the target dir exists
  — tsc then still sees the stale src and exits 2 with no diagnostics past
  `$ tsc`. Fix in-container:
  `docker exec sabz-api sh -c 'cp -a /app/packages/types/src/src/. /app/packages/types/src/ && rm -rf /app/packages/types/src/src'`
  then `docker exec sabz-api pnpm --filter @sabz/types build`. With no
  schema change, skip prisma:generate; rebuild the API in-container
  (`pnpm --filter @sabz/api build`) if `nest dev` isn't picking it up.
- **Untracked by design:** `.zcode/`, `wc-product-export-*.csv`,
  `company-logo.png`, this handoff file, `milestone-2-deep-audit.md`.
- Dev DB live catalog (~1100 products); `sabz_order_number_seq` past 100001
  (e2e asserts relative +1, unaffected).

## 4. Remaining tickets, in order (master plan §5–§7 is the authority)

IDs continue SS-2xx; create a GitHub issue per ticket before starting
(copy the pattern of #249). **M = mostly API, U = mostly storefront.**

### SS-234B — Payments gateway (M+U) ⏸ DEFERRED (no credentials)
CLIENT DECISION (user 2026-09-27): defer gateway code until PSP
credentials arrive (Zarinpal is the common default). When unblocked: add
`Payment` model + migration, `POST request / verify / callback` (public
callback, server-side amount+authority verify, idempotent PAID/FAILED),
flip `PAYMENTS_ONLINE_ENABLED`, gateway redirect + return routes, update
`PAYMENT_METHOD_KEYS` pins. Never trust callbacks without verification.

### SS-235 B2 — RFQ workflow (M+U) ✅ DONE (#253, PR #254, CI-green OPEN)
Shipped per plan above. Next: merge #254, then continue below in order.

### Then (SS-240, master plan §5)
SS-236 reviews ✅, SS-237 compare ✅, SS-238 blog ✅ (#260, merged),
SS-239 Torob feed ✅ (#263, CI-green OPEN). Next: admin commerce screens
(order list + status transitions, pricing management incl. RFQ handling
from B2, blog management UI (deferred from SS-238), COD PAID-on-delivery
from SS-234, returns views, reports, dashboard v2).
Stage 3: SS-241 shipping ✅ (#280, PR #281, merged `dc7c33c`), SS-242
returns ✅, SS-243 notifications (NEXT), SS-244 hardening, SS-245 launch QA.

## 5. Standing decisions (don't relitigate)

1. **Prices: DB stores Rial verbatim (SS-207 O-1); storefront presents Toman
   ÷10** via `lib/currency.ts` (single conversion point). Admin stays Rial.
2. **No fake UI**: commerce buttons appear only with their feature;
   unverified facts stay `null`/hidden; sections hide when unconfigured.
3. **seed-demo prices are Toman** (pre-SS-228) — re-normalize when touching
   the seed, or ignore (imported catalog is Rial and correct).
4. **SS-217 caching + SS-218 a11y are constraints** — no client-side catalog
   fetching, dialog-a11y contracts, reduced-motion-safe.
5. **Server resolves prices; storefront never discounts** (SS-235):
   `PricingService.resolveLine` is the single apply path for cart/checkout
   (B1: 5th optional `adjustments` param). Catalog cards show BASE
   `priceFrom` (anonymous, cacheable) + `promotionEndsAt` countdown only;
   tier personalization lives in cart/checkout + price endpoint.
6. **User decision 2026-09-27:** gateway deferred, pricing before reviews.
7. **User decisions 2026-09-28:** B1 without RFQ; admin pricing CRUD in
   SS-240; coupons + tax excluded; public price route is
   `GET /catalog/products/:slug/price` (spec's `/products/{slug}/price`
   mapped onto the catalog router) with `OptionalJwtAuthGuard`.
8. **Admin must NEVER runtime-import from `@sabz/types`** (SS-240A,
   2026-09-29): the package ships a CJS dist, which Vite dev serves raw
   via `/@fs` — named ESM imports fail in the browser (`PAYMENT_STATUS_FA`
   SyntaxError broke the whole panel). Keep runtime label maps in
   `apps/admin/src/lib/*-labels.ts` (partner-labels pattern); `import type`
   only from `@sabz/types`. Fixed files: `components/orders/status-badge`,
   `pages/orders-page`, `pages/order-detail-page` → local `order-labels`.
9. **Container staleness covers BOTH `sabz-api` and `sabz-admin`**: the
   admin image also bakes `/app/packages` (only `apps/admin` is
   bind-mounted). Any `@sabz/types` change needs cp+build in both
   containers (host `pnpm --filter @sabz/types build` is for gates, not
   the containers).

## 6. Open mystery — admin login access-denied (RESOLVED 2026-09-29)

- User reported login FIXED (SS-245 RequireRole loading guard resolved it).
- Separate incident same day: whole panel failed to load with console
  `PAYMENT_STATUS_FA` SyntaxError — root-caused to SS-240A's runtime
  `@sabz/types` imports (CJS dist vs Vite dev /@fs); fixed via local
  `lib/order-labels.ts` (§5 items 8–9). User was about to reload-verify
  at session end — if the panel still fails, re-check console first.
