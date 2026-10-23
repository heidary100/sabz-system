# UX Redesign Audit — Evidence-First First Pass (2026-10-24)

> Investigation and planning only. **No implementation files were changed.** Every
> number below was produced by an executed probe (SQL against the live dev DB,
> timed HTTP/browser journeys, or `BEGIN…ROLLBACK` dry-runs) — not by reading
> code or digested documents. Unverifiable claims are marked BLOCKED with the
> smallest probe that would unblock them. This file is untracked by design;
> it gets committed together with the approved issue batch.

Baseline: `master @ 03c267b` (PR #298 merged), working tree clean apart from
untracked planning docs. Stack live: API :3000, storefront :3002, admin :5173,
Postgres (real WooCommerce-imported catalog), Redis.

---

## A. Baseline + frozen instrument numbers

### A.1 Catalog ground truth (SELECT, not CSV)

| Dimension | Frozen value |
|---|---|
| Products | 1,100 (1,095 PUBLISHED, 5 DRAFT; 1,077 Woo-sourced) |
| Variants | 1,125 — 861 CALL_FOR_PRICE (76.5%) vs 264 PRICED (23.5%) |
| Published products with **no** priced variant | 832 / 1,095 = **76%** |
| Variants out of stock | 810 / 1,125 = 72% |
| Unbranded products | 609 (55%); 44 brands, 59 categories |
| Multi-variant products | 15 (2–4 variants); 1,082 single-variant |
| SKUs | 0 null; **513/1125 (46%) synthetic `WOO-<sourceId>`** |
| Media | 5,016 files; every product has ≥1; avg 4.6 |
| Specs | 3,785 assignments over 775 products; 643 SPEC attributes + 1 VARIANT_OPTION (رنگ, 54 rows) |
| nameEn / subtitle / warranty | 794 / 943 / 731 |
| Title length | 17–110 chars, avg 45 |
| PRICED price range | 690,000 – 5,890,000,000 Rial (avg 97.8M); **all 264 divisible by 10** (clean Toman render) |
| compareAtPrice rows | 13, **0 invariant violations today** |
| `Product.minPrice` drift | 0 drifted rows; **23 products NULL despite having a PRICED variant** |
| Integrity | 0 orphans (orders/items/variants/media), 0 dangling ACTIVE reservations, 0 negative on-hand, 0 unapplied migrations |

**Read of the data:** this is a quotation business with a catalog attached.
Three quarters of the published catalog is call-for-price and two thirds of
stock is zero — the revenue path is *find → evaluate → contact/quote*, not
*add-to-cart*. Every priority below is priced against that fact.

### A.2 Commerce funnel snapshot — empty by definition

6 orders (all SS-245 QA fixtures), **0 RFQs**, 1 return, 3 reviews, 6 users,
1 approved partner. There is no production funnel to measure. The funnel
instrument must therefore be *defined and frozen now* so post-launch claims
are provable: order count by status, RFQ create→quote→accept conversion,
search zero-result rate, quote acceptance latency. (DB queries for all four
are in this document's probes and take <100 ms.)

### A.3 Search battery (frozen 2026-10-24, API `/catalog/products?q=`)

- **Recall: 32/32 queries returned hits, 0 zero-results.** Battery: 10 Persian
  common nouns, 3 laptop spelling variants (لپ‌تاپ ZWNJ / لپ تاپ space / لپتاپ
  joined → 132/136/134 hits — normalization works), 6 Persian brand names,
  6 English names, 3 SKUs, Arabic-script control (كيبورد = کیبورد = 41),
  nonsense control = 0.
- **Precision is the broken half.** «ورتی» returns 276/1,100 (25% of the
  catalog) including «پارتی» and «ویوارکس»; «Anker» returns 136 while the
  ANKER brand has 2 products, including «جامپ استارتر» matches. Mechanism
  (read from `public-catalog-search.ts` `tokenMatch`): the fuzzy branches
  `word_similarity(token, field) >= 0.3` on name/brand/category/tag/subtitle
  have **no minimum token-length gate**, so short tokens fuzz-match unrelated
  words. No instrument today measures precision.
- **Frozen precision instrument (v0, labeled from samples):** top-5 relevance
  for 10 seeded queries, human-labeled. v0 sample: ورتی 3/5, Anker 2/5.
  Target after gating work: ≥ 4.5/5 average with the 32-query battery
  regression-free. Both fixtures get committed with the fix issue.

### A.4 Performance baseline (dev environment, localhost)

| Probe | Frozen value |
|---|---|
| TTFB curl ×3, warm — home / products / categories / category filter / PDP / blog | 0.04–0.21 s (cold first hit up to 0.68 s) |
| Home at 1440×900 (browser) | wall 1.0 s, DCL 532 ms |
| Mobile PDP 390×844 | wall 1.3 s |
| Search API endpoint (5×) | **0.25–0.30 s — heaviest public read** |
| Price-sorted listing API (5×) | 0.012 s (indexed: `minPrice` asc/desc indexes exist) |
| Category subtree walk (recursive CTE) | 0.12 ms |
| Search predicate `EXPLAIN ANALYZE` | **Seq Scan, 43 ms @ 1,100 products** — the GIN trigram indexes cannot serve the OR of `word_similarity` predicates; linear growth with catalog |
| Search overlay open (desktop, dev mode) | **11.4 s to visible** — suspected client-island hydration latency in `next dev`; needs a production-build measurement before being treated as a defect |

Caveat: all browser numbers are dev-mode on localhost fiber. Real-device
Iranian network numbers (throttled 4G, VPN) are BLOCKED — smallest probe:
one Playwright run with CPU/network throttling from a machine in-region, or
Lighthouse CI on a prod build.

### A.5 Responsive + journey evidence (executed, not assumed)

- **Horizontal overflow probe: 0 overflows across 24 combinations** (360×800,
  430×932, 768×1024, 1280×800 × 6 routes: home, products, PDP, categories,
  cart, login).
- Journey *search→PDP* (desktop): submit→results 243 ms; first-card click→PDP
  652 ms. Breadcrumbs render (`<nav>` مسیر دسته‌بندی), sibling product nav
  exists, gallery with per-item video buttons.
- Journey *call-for-price PDP* (mobile 390): variant radios **selectable with
  per-variant (ناموجود) states**, RFQ entry present, guest gets «ورود همکاران»,
  consultation block links Telegram/Bale/WhatsApp + phones.
- Admin journey (executed login OTP → `/products/new`): census below in §B.

### A.6 Two bugs the instruments caught (not found by reading code)

1. **Every social-share link is dead in this deployment.** PDP share URLs
   point to `http://localhost:3001/...` (storefront runs on :3002). Root
   cause: `NEXT_PUBLIC_SITE_URL` defaults to `localhost:3001`
   (`.env.example:15`) and no runtime override exists — the share/canonical
   builder trusts a wrong server-side constant instead of the actual origin.
   On the Vercel demo the env is presumably right, but the class of failure
   (share URL ≠ deployed origin) needs a structural fix, not an env value.
2. **Variant price fields in admin are labeled «قیمت (تومان)»** while the
   whole system contract is Rial-verbatim (`variant-form.tsx:200,213`; every
   other admin money surface says ریال). This is the exact UI that invites a
   10× mispricing — an operator keying Toman into a Rial field.

### A.7 Reversible-probe evidence (Pass 0)

- **Rate-recalculation dry-run (`BEGIN…ROLLBACK`)**: applied
  `price = round(price*1.05/1000)*1000` to all 264 PRICED rows, rolled back,
  checksum `md5(id:price|compareAt)` identical before/after
  (`5c018e7e…` → `5c018e7e…`) — the zero-drift report pattern works and is
  cheap. Execution inside one transaction: instant at this volume.
- **Red-team finding quantified**: a blanket **+5% recalc breaks the
  `compareAtPrice > price` invariant on 6 of 13 sale rows; +10% breaks 12 of
  13.** Any recalculation feature must define compareAt semantics
  (scale-with-price / clear-with-report / block) or it silently corrupts the
  sale-price contract.
- **Concurrency probe**: session B `UPDATE` on a row locked by session A
  fails after `lock_timeout` ("canceling statement due to lock timeout").
  Bulk editing must treat *row locked by another operator* as a first-class
  outcome (per-row 409 + refetch), not an exception path.

---

## B. Requirement traceability + work-as-performed reconciliation

### B.1 Matrix (client requirement A–E × evidence)

| Req | Current (verified) | Gap (evidence) | Money/path impact | Client decision needed |
|---|---|---|---|---|
| **A1 inline entity creation** | Brand/category are plain `<Select>`; both must pre-exist; product form requires both before submit | Admin journey census: no inline dialog anywhere in product form | Blocks product creation when a brand is missing; forces context-switch to /brands, /categories | none — build |
| **A2 auto slug** | Server generates from name when blank (`products/slug.ts`, Persian transliteration, collision-suffixed); UI shows only a placeholder | No live suggestion while typing; no collision hint; imported slugs are lossy (`hard-akstrnal-ay-dyta-…` — live examples unreadable but stable) | Low; slug quality is SEO-relevant, existing URLs must not change | confirm: never auto-rewrite persisted slugs |
| **A3 auto SKU** | SKU required from client; **46% of catalog carries synthetic `WOO-<id>` SKUs exposed to customers as «شناسه کالا»**; uniqueness = DB unique | No generator; policy for 513 WOO- rows undefined | Medium; SKU shown on PDP with copy button — customers see `WOO-14294` | confirm: keep WOO- ids stable, generate only for new variants |
| **A4 bulk grid** | List = 7 read-only columns (no price/stock/SKU), no SKU filter, limit 20, no inline edit, **no bulk endpoint exists in the API** (verified: zero bulk/batch routes) | Everything; but catalog is 1,100 rows — server-paginated inline editing is sufficient (probe: full-catalog recalc is instant in one tx) | High labor: 264 priced SKUs × manual form round-trips per rate move | none — build v1 at 1,100 scale |
| **B multi-currency** | Single-currency Rial verbatim; Toman is storefront display-only ÷10 (`lib/currency.ts`); pricing chain Base→Rule→Override→Tier→Bulk→Promo exists; **no FX/rate/currency field anywhere** (schema-wide grep: zero) | Entire domain. Blocked on semantics: what USD/AED values *are* (acquisition cost vs selling baseline), authoritative rate, rounding, compareAt policy | Largest on the board: manual re-pricing labor + 10× misquote exposure (A.6 #2 shows the mislabel already shipping) | **yes — accountant answers, see BLOCKED-4** |
| **C1 OTP** | Complete UX (6-box, 120 s resend cooldown, per-mobile/IP limits, `?next=` guard); dev code `123456` hard-gated to `NODE_ENV=development`; delivery = log-only | Real SMS delivery (extends open #51); enumeration-safe by design (any mobile gets OTP; no exists-leak messages observed) | Launch blocker for real customers | provider choice (Kavenegar/SMS.ir/…) |
| **C2 profile/partner** | Profile = name/address; partner portal full (docs upload, status, tier) | National ID exists **only** as `Partner.nationalId` = business legal ID (شناسه ملی) — a *different* concept from personal Code Melli | — | none |
| **C3 National ID @ checkout** | No personal کد ملی anywhere (User/UserProfile/checkout greps: zero) | Field + checksum + backend gate + privacy rules all missing | Legal-driver dependent | **yes — BLOCKED-5** |
| **D1/D2 order states** | Full lifecycle exists: PENDING→PROCESSING→SHIPPED→DELIVERED/CANCELLED with server-guarded transitions, COD auto-PAID on delivery, Shipment+TrackingEvent timeline, returns flow | Client's 6 states map cleanly: pending-verification≈PENDING, in-progress≈PROCESSING, completed/shipped≈SHIPPED/DELIVERED, returned≈ReturnStatus, failed≈PaymentStatus.FAILED | **None — do not build a new state machine** (kill-list §C.2) | none |
| **D3 Tipax + SMS** | Tipax exists as shipping method (env-flag), operator enters tracking number manually, tracking card renders on order detail (plain text, no carrier link); notifications emitted on shipment transitions; SMS = log-only stub | Carrier API (no credentials); real SMS (no credentials); no tracking deep-link | Medium | credentials, or v1 = manual number + tracking URL template |
| **E1/E2 share payload** | `ProductShare` = Telegram/WhatsApp/X/FB/Pinterest/LinkedIn + copy; **payload is a bare URL** — no title/price/specs; no Bale channel (Bale exists only as contact link) | Payload + channel; plus the dead-link bug A.6 #1 blocks the whole feature in this deployment | B2B sharing currently delivers **zero** value until origin fix | confirm: public retail prices only in payload (never tier prices) |
| **E3 pre-auth cart link** | Does not exist (correctly) | Kill as specified — credential-in-URL is the anti-pattern the client's own spec rejects | — | confirm kill; public link + partner login instead |

### B.2 Work-as-performed vs work-as-imagined — BLOCKED

I could not observe a single real operator session, sales conversation, or
the boss's rate-update ritual (BLOCKED-1/2). Everything above §B.1 is
work-as-imagined (what the code says should happen). The reconciliation —
where the shop's actual behavior diverges — is the highest-value missing
evidence in this audit and gates the labor estimates in §C.

---

## C. Risk ledger (priced) + kill/defer list

### C.1 Ledger, ordered by expected loss

| # | Risk | Priced exposure (evidence-based) | Cheapest mitigation |
|---|---|---|---|
| R1 | Dead share links | 100% of B2B share actions in this deployment produce dead URLs → req-E value = 0 until fixed | SS-248 (hours) |
| R2 | Toman/Rial mislabel in admin price form | One 10× misquote on a 589M-Rial top-of-range product = 530M-Rial error class; UI actively invites it (A.6 #2) | SS-250 (hours) |
| R3 | Sale-invariant breakage under recalc | 6/13 rows break at +5% (probe); invariant not server-enforced today (DB has no check; service-level only, and no batch path exists yet) | SS-251 (small) |
| R4 | Manual re-pricing labor | 264 priced SKUs × ~30 s/form ≈ 2.2 h per rate move; USD rate in Iran moves materially ≥ 2×/week → **~18 operator-hours/month** (estimate; refine with BLOCKED-1 timing) | SS-257 grid + (blocked) SS-253 |
| R5 | Search precision noise | 25% of catalog matches «ورتی»; customers in a quote-first funnel search to *find* then call — noise buries the target | SS-264 (small) |
| R6 | Dual-brand split (Green Lion/گرین لاین, Porodo/پرودو, Powerology/پاورولوژی…) | Brand facets and brand-scoped pricing rules silently miss products; live in admin select | SS-258 (merge + guard) |
| R7 | minPrice NULL on 23 products | Invisible in price sort/filters; contract says denormalized column is truth | SS-259 (hours) |
| R8 | Product-creation ritual | 2 screens + 1 dialog, ~20 fields, slug+SKU manual, brand/category must pre-exist; velocity unknown (BLOCKED-1) | SS-254/255/256 |

### C.2 Kill / defer list (challenge to the client's own list)

1. **Defer B4 batch-conversion infrastructure (queue/worker).** Probe: the
   whole priced catalog recalculates instantly inside one transaction at
   1,100 rows. A transactional endpoint with a reconciliation report +
   rehearsed rollback (pattern proven in §A.7) is sufficient; revisit a queue
   only past ~10× current priced volume.
2. **Kill E3 pre-authenticated cart deep-link as specified.** Tokens-in-URL
   cannot be made safe; replace with public product links + normal partner
   login. If partners later need shareable quotes, that is a scoped,
   expiring, authorized resource — a separate decision.
3. **Defer D3 carrier-API integration** until credentials exist. v1: manual
   tracking number (already built) + a carrier tracking-URL template
   (SS-262). SMS likewise stays on the log stub until #51 gets a provider —
   external integration is BLOCKED, never PASS, without live tests.
4. **Defer B reverse-calculation** (edit local price → recompute foreign
   base). If the foreign value is acquisition cost, reverse-calc produces
   financial nonsense; if it's a selling baseline, it's meaningful. BLOCKED-4
   decides; building it before that answer is how accounting bugs ship.
5. **Do not build a new order state machine.** The existing lifecycle covers
   the client's six states (§B.1 D1/D2); only customer-language polish and
   the tracking link are real work.

---

## D. Pricing decision record (red-teamed; accountant items BLOCKED)

**Established semantics (verified, not assumed):** DB stores Rial verbatim on
`Variant.price` (SS-207); Toman is a storefront display concern only, one
conversion point (`lib/currency.ts`, floor ÷10); admin surfaces are Rial;
all 264 priced values are ÷10-clean; the discount chain is
Base→CategoryRule→Override→Tier→Bulk→Promo with percent/fixed-off only; no
cost, currency, or rate field exists anywhere.

**Alternatives for the foreign-currency model (decision BLOCKED-4):**

| Option | Meaning of USD/AED value | Consequences |
|---|---|---|
| F1 acquisition cost + markup rule | Supplier cost; retail = cost×rate×markup | Most likely matches the shop's books; reverse-calc legitimate (edit retail → back out cost); needs markup policy per category |
| F2 selling baseline in FX | Retail derived directly as `fx×rate` | Simpler math; but then a manual Rial edit *contradicts* the base — reverse-calc silently rewrites the pricing baseline; audit trail mandatory |
| F3 dual-write reference only | FX stored as bookkeeping, retail independent | Zero derivation risk; zero automation benefit — honest answer if the accountant says the rate is informational |

**Rounding policy (proposed, needs sign-off):** to the nearest 1,000 Rial
(100 Toman), half-up; direction table fixed in tests at the 500-Rial boundary.
Probe evidence: nearest-1,000 rounding applied cleanly across all 264 rows.

**Invariant policy under recalculation (proposed):** scale `compareAtPrice`
by the same factor when present, and emit per-row warnings where headroom
< 10% (probe: 12/13 rows are within 10% — near-universal breakage without
this rule). Server enforces `compareAtPrice > price` on every mutation path
once SS-251 lands.

**Stale-rate arbitrage (verified safe today):** checkout resolves prices
server-side at `placeOrder` and snapshots `unitPrice/lineTotal` onto
`OrderItem`; a rate change after order placement cannot mutate a placed
order. Mid-checkout rate moves re-resolve at place time — acceptable; state
it in the customer price note.

**Property list to implement with the pricing issue (fast-check/pgTAP):**
USD conversion; AED conversion; missing/zero rate rejected; fractional
results at 499/500/501-Rial boundaries; both rounding directions; Rial→Toman
display; reverse-calc (post-decision); sale = regular rejected; sale >
regular rejected; null/price-on-request passthrough; partner-tier
interaction (tier % applies to recalculated base, order documented);
recalc idempotence (apply twice → same result); recalc + concurrent variant
edit (lock-timeout outcome per §A.7); compareAt scaling rule; 1,000-row batch
reconciliation zero-drift.

---

## E. Security-sensitive flow designs

- **National ID (کد ملی):** checksum validates *structure*, never identity —
  no external-verification claim anywhere in UI or docs. Storage: dedicated
  nullable column on User (not Partner's business شناسه ملی — different
  concept, must not be conflated); never in URLs, never logged (audit-log
  redaction rule), masked display (****1234). Backend gate on `placeOrder`
  when mandatory-mode is on (BLOCKED-5 decides mandatory vs optional).
  Retention/deletion: client decision recorded in the issue.
- **OTP:** enumeration-safe by construction (single flow for login/register;
  no mobile-exists signal observed); rate limits per mobile+IP with Persian
  service messages; dev code hard-gated to `NODE_ENV=development` — verified
  in code, and #51 tracks the only real gap (delivery).
- **Share links/payload:** public retail truth only — partner tier prices
  never appear in any share payload or public API response (cards publish
  anonymous BASE `priceFrom`; tier personalization lives behind auth —
  standing decision §5.5 of the handoff, re-verified in recon).
- **Order/payment boundary:** server-side resolution + snapshot (above);
  ONLINE payment stays disabled until #295's gateway with server-side
  verify; COD PAID-flip is operator-transition-guarded.
- **Bulk editing authorization:** future bulk endpoints inherit
  OPERATOR/ADMIN guards + per-row validation server-side; the grid is never
  trusted (client-side hiding is not access control).

---

## F. Issue breakdown (created 2026-10-24 — user-approved)

Issues live in milestone **UX Redesign (SS-248+)**. Mapping: SS-248→#299,
SS-250→#300, SS-251→#301, SS-259→#302, SS-249→#303, SS-254→#304,
SS-255→#305, SS-256→#306, SS-264→#307, SS-257→#308, SS-258→#309,
SS-260→#310, SS-262→#311, SS-252→#312, SS-253→#313, SS-261→#314,
SS-263→#315.
Every issue names: **oracle** (what proves it done), **frozen number** it
moves/protects, and for money mutations the reconciliation/rollback duty.
Labels follow the existing scheme (type:feature/fix, area:*, priority:*).

| ID | Title (branch) | Scope | Oracle | Frozen baseline |
|---|---|---|---|---|
| SS-248 | fix(storefront): share/canonical URLs use deployed origin + add Bale channel | derive site URL from request origin when env absent; add Bale to ProductShare | browser probe: share href origin == actual origin on PDP; unit test URL builder | dead-link rate 100% → 0 |
| SS-250 | fix(admin): variant price fields say ریال + input guards | relabel 2 fields; digit/limit validation | UI text assertion in vitest; grep gate | R2 mislabel live |
| SS-251 | feat(api): server-enforced `compareAt > price` on all mutation paths | create/update variant + future batch; Persian 422 | unit + e2e 422 tests incl. P2002 race | 0 violations today → unenforceable → enforced |
| SS-249 | feat(storefront): share payload v1 (title/brand/price-or-CFP/link) | Persian composer, public prices only, copy fallback | vitest on composer; browser assert t.me text param; e2e pin: no tier price in any public response | payload = bare URL → informative |
| SS-259 | fix(api): backfill minPrice for 23 NULL rows + guard on price writes | recompute + service hook | SQL drift check = 0 rows (query committed) | 23 rows NULL |
| SS-254 | feat(admin): live slug suggestion in product/brand/category forms | mirror server slugger client-side; lock after manual edit; collision hint | jsdom vitest: type Persian title → slug appears; manual edit locks | slug = invisible until save |
| SS-255 | feat(admin): inline brand/category creation from product form | Catalyst dialog on the Selects; min fields; appears in parent select on save | admin e2e: create brand in dialog → selectable; dialog a11y contract (known anomaly re-check) | context-switch required today |
| SS-256 | feat(api+admin): SKU suggestion for new variants | editable suggestion; WOO- rows untouched; server uniqueness (409 race-safe) | unit generator tests; e2e duplicate 409 | 46% synthetic SKUs exposed |
| SS-264 | fix(api): search precision gating | min-token-length gate on fuzzy branches; threshold tuning; commit both frozen fixtures (32-query battery + 10-query labeled top-5) as regression tests | battery: 0 zero-result regressions; labeled top-5 ≥ 4.5/5 avg (v0: ورتی 3/5, Anker 2/5) | frozen §A.3 |
| SS-257 | feat(api+admin): catalog grid v1 — inline price/stock editing | server-paginated table (thumb/name/SKU/brand/stock/prices/status); SKU+brand+category filters; inline edit ≤50 rows/tx; per-row 409 on lock conflict; unsaved-changes guard | e2e inline round-trip; concurrency test (§A.7 pattern → 409 + refetch); cancel = zero-drift checksum | manual form round-trip (R4 labor) |
| SS-258 | fix(data): brand dedup merge + normalized-name guard | merge گرین لاین→Green Lion etc.; redirect slug; unique index on normalized name | post-merge SQL: 0 duplicate brands by normalized name; facet totals preserved | 44 brands incl. live duplicates |
| SS-260 | feat(api+storefront): personal National ID — profile field + checksum | User column, fa-IR checksum validation, masked display; optional until BLOCKED-5 | unit tests on checksum vectors (valid/invalid/transposed); privacy greps (no URL/log) | field absent |
| SS-262 | feat(storefront): carrier tracking link on order detail | Tipax/Post URL templates when trackingNumber set | browser assert href; unit on template | plain-text number today |
| SS-252 | **BLOCKED-4** feat: multi-currency pricing model | per decision D (F1/F2/F3): currency, base, rate, rounding columns + engine wiring + full property list §D | fast-check/pgTAP property suite green; migration + zero-drift backfill report | no FX model |
| SS-253 | **BLOCKED-4** feat: rate-change recalculation workflow | preview → confirm → transactional recalc + reconciliation report + rehearsed rollback; compareAt policy per §D | reconciliation zero-drift checksum on real run + rollback rehearsal artifact; invariant suite | §A.7 probe numbers |
| SS-261 | **BLOCKED-5** feat: mandatory National ID checkout gate | placeOrder backend gate + checkout UX + privacy rules | e2e: order blocked without valid ID; Persian errors | gate absent |
| SS-263 | **BLOCKED (provider)** feat: shipment-dispatch SMS | wire SMS provider into existing notification emitters; dedupe on repeated shipment events | live send test with real credentials — never PASS on logs | log-only stub |

Extend instead of create: **#51** (OTP real delivery — add provider
constraints/research notes), **#290** (cookie collision — deploy-gate
checklist), **#295** (gateway — unchanged, blocked). No new issues duplicate
these.

---

## G. Recommended order (expected-loss reduction)

1. **SS-248, SS-250, SS-251** — hours each, kill R1/R2/R3 outright.
2. **SS-249, SS-259** — small; complete requirement E's payload and fix the
   sort-contract leak.
3. **SS-254 → SS-255 → SS-256 → SS-264** — admin ritual + search precision
   (R5/R8), independent, parallelizable.
4. **SS-257** (needs SS-251 shipped first — batch path must inherit the
   invariant), then **SS-258, SS-260, SS-262**.
5. **BLOCKED chain:** deliver BLOCKED-4/5 answers → SS-252 → SS-253 →
   SS-261; #51/SS-263 on credentials.

---

## H. Verification plan (how "done" gets proven, not asserted)

- **Per issue:** its named oracle (§F) executed and pasted into the PR —
  browser probe output, test suite run, SQL drift check, or reconciliation
  report. CI stays necessary-and-insufficient.
- **Money mutations (SS-253, SS-257, SS-252 backfill):** zero-drift
  checksum before/after + rollback rehearsal artifact committed with the PR.
- **Instruments re-run at milestone close:** §A.3 battery + labeled set
  (recall must not regress, precision must rise); §A.4 perf probes; overflow
  sweep; funnel queries (§A.2) become live numbers at launch.
- **Human oracles:** timed operator UAT (old way vs new way, real products —
  blocked until BLOCKED-1 for the "before" timing); accountant sign-off on
  §D before SS-252/253 start.
- **BLOCKED items never marked PASS**; the BLOCKED register below is the
  checklist for unblocking.

## BLOCKED register (client-side evidence required)

| # | Missing evidence | Smallest probe that obtains it | Unblocks |
|---|---|---|---|
| B-1 | Operator screen-share: product creation + price-update ritual, timed (30–60 min) | one recorded session | labor pricing (R4/R8 refinement), work-as-performed reconciliation |
| B-2 | Woo order notes + ~20 recent sales conversations (phone/Telegram/Bale), PII redacted | one export | service blueprint back-stage truth, share payload content choice |
| B-3 | Live-site access logs / analytics (typed queries, zero-results, device mix) | one month of logs | search tuning against real query mix (my battery is a proxy) |
| B-4 | Accountant: USD/AED = cost or baseline?; which books; authoritative rate source + update cadence | written answer, 3 questions | SS-252, SS-253, reverse-calc decision |
| B-5 | Legal driver for mandatory National ID (invoice/tax practice? B2B paperwork?); does the PSP already bind buyer identity? | one paragraph from client/accountant | SS-261 mandatory-vs-optional |
| — | Real-device/VPN network testing | one in-region throttled Playwright/Lighthouse run | §A.4 caveat |

*Method note: all DB numbers from live SELECTs against the dev catalog
(1,100 real Woo products); probes executed 2026-10-24; browser journeys
executed at 1440×900 and 390×844 plus the 24-combination overflow sweep;
rollback dry-run checksum-verified. Console-error capture is a stated
instrument limitation of the automation surface (no console listener API);
the 11.4 s overlay anomaly needs a production-build measurement before
being filed as a defect.*
