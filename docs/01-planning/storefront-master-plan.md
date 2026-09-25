# Storefront Master Plan — Visual Overhaul, Woo Parity, Mazand Mall Scope

> Version 1.0 — 2026-09-25. Approved plan. Supersedes AGENTS.md §13 restrictions:
> the Mazand Mall scope documents + client instruction explicitly request cart,
> checkout, orders, and payments, sequenced in stages below.
> Companion audit: `storefront-ux-audit.md`.

**Recon basis:** local audit (HEAD `43b6e15`, SS-211…219 merged, catalog profiled via live API) + live walkthrough of sabzsistem.com (home, product, category, contact, footer) + the Mazand Mall PDFs (Scope v1.0, Timeline v1.0).

## 1. Ground truth

- Catalog: 1,095 products; **78% call-for-price**, 28% in-stock, 55% unbranded; 2 category roots (1,086 under «کالای دیجیتال», stray «ابزار» 9); 44 brands with EN/FA duplicates; prices stored **Rial verbatim** (SS-207 O-1) while UI labels Toman → **10× display error** (decision: display-side ÷10); literal `\n` artifacts in descriptions; 107 missing thumbnails; `createdAt` = import time (breaks «جدیدترین»).
- UX gaps: mobile filters render 1,333px **above** the grid; nav/`/categories`/home tiles collapse to 2 roots; call-for-price is a dead end; no wishlist/compare/reviews/cart.
- Keep: URL-state listing, category landing, Persian search (SS-216), caching/skeletons (SS-217), a11y (SS-218), variant selector, mega-menu component.

**Real business facts (from sabzsistem.com/contact-us):** phones ۰۲۱-۹۱۳۰۱۹۰۰ / ۰۱۱-۳۳۳۴۱۶۸۴؛ WhatsApp ۰۹۳۶۱۶۶۲۶۴۶؛ address ساری، بلوار پاسداران، روبروی مرکز تخصصی پرتو مازند (کدپستی 4814938662)؛ hours شنبه–چهارشنبه ۹–۱۸:۳۰، پنجشنبه ۹–۱۳:۳۰؛ emails info@sabzsistem.com / sabzsistem@gmail.com; Enamad seal; Torob shop badge; socials (Instagram/Facebook/Twitter/YouTube); Telegram/Bale consultation links; Android app on کافه‌بازار + direct APK.

## 2. sabzsistem.com feature inventory → parity plan

| Live-site feature | Status | Stage |
|---|---|---|
| Mega menu, blog/about/contact/terms nav | exists (2-root issue) | 1 |
| Full-screen search overlay | search bar exists; overlay style | 1 |
| Wishlist counter + pages | missing (needs auth) | 2 |
| My-account, login/register | missing (OTP API exists) | 2 |
| Cart button with total + off-canvas mini-cart | missing | 2 |
| Hero slider (8 slides) | missing → config-driven | 1 |
| Sale banner + site-wide countdown | missing → countdown component | 1 UI / 2 engine |
| Discount % badges on cards | missing (compareAtPrice exists) | 1 |
| Per-product sale countdowns | missing | 1 UI / 2 engine |
| Add-to-cart on cards, «اتمام موجودی» badge | badge exists; cart slot reserved | 2 |
| Trust strip «5 دلیل» (ارسال سریع، جشنواره‌ها، تضمین کیفیت، پرداخت در محل، تضمین قیمت) | component empty → real claims | 1 |
| Brand showcase tabs | missing | 1 |
| Alphabetical product index | missing | 1 |
| Category image banners | missing → config banners | 1 |
| Mobile-app section (بازار + APK) | missing → static | 1 |
| Blog teaser + blog pages (author/date/share) | missing | 2 |
| Footer: about, socials, Enamad+Torob seals, phone/email/hours, quick links | thin → full | 1 |
| Product gallery zoom + prev/next product nav | gallery exists, no zoom/prev-next | 1 |
| Product: sale countdown, discount badge, wishlist, compare, share row | missing | 1 (badge/share/countdown) / 2 (wishlist/compare) |
| Quantity stepper + add-to-cart | missing | 2 |
| Consultation via Telegram/Bale | missing — real conversion path | 1 |
| User reviews + star ratings + form | missing (backend) | 2 |
| Popular-products rail | related rail exists | keep |
| Filters: stock status (تخفیف‌دار/موجود), brand counts, rating filter, price slider | partial | 1 (counts/slider) / 2 (rating) |
| Subcategory image tiles with counts | text tiles → visual | 1 |
| Contact page: phones, WhatsApp, address, hours, emails, map, socials | placeholder → real | 1 |
| Terms page content | placeholder | 1 |
| Cart/checkout/payment gateway | rebuilt natively | 2 |

## 3. Mazand Mall scope mapping

| PDF area | Repo state | Plan |
|---|---|---|
| M1 auth/users/partners/roles/catalog/inventory/admin | built | gaps: partner portal page + customer profile UI (Stage 2) |
| M2 storefront/search/filters | built | Stage 1 polish |
| M2 cart/checkout/wishlist/orders/payments | missing | Stage 2 core |
| M2 pricing engine (retail, Tier 1–3 B2B, bulk, category rules, RFQ) | data preserved only | Stage 2 backend epic |
| M2 blog + SEO pages | missing | Stage 2 |
| M2 Torob feed | missing | Stage 2 |
| M3 shipping (Tipax, post), tracking | missing | Stage 3 |
| M3 returns workflow | missing | Stage 3 |
| M3 notifications | missing | Stage 3 |
| M3 perf/security/audit/backup/QA/deploy | partial | Stage 3 |
| PDF "Future Phase" (mobile apps, marketplace, SnappPay, loyalty, gift cards, multi-language/currency, AI recs, advanced analytics, ticketing, push, marketing automation) | — | not planned |

## 4. STAGE 1 — «Astonishing» storefront visual overhaul

**Direction:** premium dark-accent electronics aesthetic on the brand palette (#3a5a40 family): deep-ink hero surfaces with product photography, glass header, elevated cards with layered shadows, strong Vazirmatn typography scale, purposeful micro-motion (hover lift, image crossfade, animated countdowns — `prefers-reduced-motion`-safe), accent CTAs (#588157) on dark hero, light content zone. Futuristic = depth + motion + typography, not gradients-everywhere. RTL-native, mobile-first.

**Design-system foundation:** tokens (color/space/radius/shadow/motion) in `globals.css` + Tailwind v4 theme; shared primitives: Button, Badge (discount/stock/call-for-price/condition), CountdownTimer, SectionHeader, Card, Rating (static until reviews), Skeleton v2. No new UI framework.

**Page-by-page:** home (hero slider, trust strip, brand tabs, category banners, rails with ProductCard v2, app section, Instagram row, blog teaser slot, full footer) · header (11-root mega-menu, full-screen search overlay, cart/wishlist slots hidden until Stage 2) · listing (mobile bottom-sheet filters, desktop sidebar v2 with brand counts/category-children/price slider, ProductCard v2) · detail (gallery zoom + prev/next product, sticky purchase panel, discount badge + countdown, share row, Telegram/Bale consultation card, tel: CTA, specs v2 with Persian labels, related rail v2) · category landing (visual subcategory tiles) · contact/about/terms (real content, embedded map, working tel:/mailto:/WhatsApp links).

**Stage-1 trust fixes included:** display-side ÷10 Toman layer (single conversion helper; price facet converts Toman→Rial at the API boundary; JSON-LD matches), contact data everywhere, mobile filter sheet, dominant-root nav fix, `\n` scrub + hide «بدون برند», createdAt backfill, thumbnail backfill (107).

**Constraints:** SS-217 caching untouched (motion CSS-only; slider = CSS scroll-snap + minimal JS); SS-218 a11y preserved; no client-side catalog fetching; images via next/image.

## 5. STAGE 2 — Commerce & content (Mazand M2 + Woo parity)

1. Customer auth in storefront (OTP login/register, profile) + partner-registration portal page (business info, document upload, approval status).
2. Wishlist (model + API + pages/counter/card hearts).
3. Cart + off-canvas mini-cart + header total (server-side cart, quantity management).
4. Checkout (address/shipping selection, summary, place order) + order confirmation.
5. Orders (history, details, status tracking, invoice generation).
6. Payments: online gateway integration (credentials per PDF assumptions; gateway = client decision) + پرداخت در محل (COD).
7. Pricing engine: retail + Tier 1–3 partner pricing, bulk pricing, category pricing rules, scheduled sales (powers countdowns/badges), RFQ flow incl. admin handling.
8. Reviews: model + admin moderation + storefront stars/form + rating facet + aggregate rating in JSON-LD.
9. Compare: client-side compare list + comparison table.
10. Blog/CMS: admin blog/article management + SEO metadata + storefront blog with share; home teaser activates.
11. Torob product feed endpoint.
12. Admin additions: order management, pricing management, blog management, returns views, reports, dashboard v2.

## 6. STAGE 3 — Logistics, ops & launch (Mazand M3)

Shipping management + Tipax integration + postal integration + tracking; returns workflow (request → approval/rejection → status); notifications (order, partner-approval, admin alerts); performance optimization + advanced caching + image/DB optimization; security hardening, permission validation, audit logging, backup configuration; QA (cross-browser, mobile responsiveness, UAT); production deployment, monitoring, admin training, documentation.

## 7. Issue breakdown (SS-2xx, dependency-ordered)

**Stage 1:** SS-220 audit doc · SS-221 design tokens + primitives + motion · SS-222 Toman ÷10 layer · SS-223 header v2 · SS-224 home v1 · SS-225 ProductCard v2 · SS-226 listing v2 (filter sheet, facet counts, price slider) · SS-227 detail v1 · SS-228 data scrubs · SS-229 contact/about/terms real pages.
**Stage 2:** SS-230 auth+profile+partner portal · SS-231 wishlist · SS-232 cart+mini-cart · SS-233 checkout+orders · SS-234 payments (gateway+COD) · SS-235 pricing engine · SS-236 reviews+rating facet · SS-237 compare · SS-238 blog CMS+storefront · SS-239 Torob feed · SS-240 admin commerce screens.
**Stage 3:** SS-241 shipping (Tipax/Post/tracking) · SS-242 returns · SS-243 notifications · SS-244 perf/security/audit/backup · SS-245 launch QA/UAT/deploy/training.

## 8. Backend/API additions (summary)

Cart/Order/Checkout domain; payment gateway; PricingEngine (tiers/category rules/bulk/RFQ/scheduled sales); Review+Rating models; Wishlist; Blog models; Torob feed endpoint; Notification service; Tipax/Post integrations; Returns workflow; brand counts on `/catalog/brands`; card DTO `subtitle`; audit/backup tooling. Stage 1 needs **no** API changes.

## 9. Acceptance criteria (Stage 1)

1. PMG55 shows «۱٬۶۰۰٬۰۰۰ تومان» on card, detail, and JSON-LD; price filter «تا ۲٬۰۰۰٬۰۰۰ تومان» matches Rial data correctly.
2. Mobile: first product card visible within one viewport scroll on all listings (filter sheet works, dialog-a11y complete).
3. Desktop nav shows 11 roots; `/categories` shows 11 visual tiles.
4. Home renders hero slider, trust strip (5 real claims), brand tabs, category banners, app section, full footer with Enamad/Torob/phone/hours — zero placeholder copy.
5. Detail: gallery zoom works; Telegram/Bale consultation card + tappable phone CTA on every product; no literal `\n` anywhere.
6. `pnpm lint/typecheck/test/build` green; SS-218 a11y checks pass; Lighthouse perf not regressed (SS-217 caches intact).
7. No fake commerce UI: cart/wishlist buttons appear only with their stage.

## 10. QA scenarios (real catalog)

Stock-laptops browsing on mobile (call-for-price + filter sheet); storage-devices (206) with price slider; PMG55 / «لپ تاپ» / «ADATA» search probes + gibberish empty state; price spot-checks vs sabzsistem.com (÷10); mega-menu/overlay keyboard pass; 360/390/430/1280/1440/1920 sweeps; reduced-motion pass.
