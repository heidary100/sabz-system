# Sabz System Platform

# Feature Specification – Merchandising Admin UI

Version: 1.0

Module ID: MERCH-ADMIN-001

Status: Ready for Implementation (business timezone decision pending)

Milestone: UX Redesign (SS-248+)

Priority: High

Related backend tasks: Merchandising Tasks 05.1–05.6

---

# 1. Purpose

Define the administration experience for the merchandising backend:

- reusable campaign management
- merchandising media library
- typed singleton homepage draft editor
- immediate and scheduled homepage publication
- publication history, cancellation, and rollback
- activation diagnostics
- audit visibility

The admin UI must make the immutable-publication model understandable to operators:

- campaign and draft edits do not silently change published content;
- only a publication creates public storefront content;
- scheduled media remains private until activation;
- `CANCELLED` may mean operator cancellation or system block, distinguishable only through audit evidence.

This is a design specification. It does not implement application functionality.

---

# 2. Scope

## 2.1 In scope

A new merchandising administration area in `apps/admin` covering:

1. merchandising overview
2. homepage draft editor
3. publication history and detail
4. campaign list and editor
5. merchandising media library
6. publication readiness and immediate publishing
7. scheduling and cancellation
8. rollback and activation diagnostics
9. audit integration for merchandising entities
10. responsive, accessibility, RTL, and light/dark polish

## 2.2 Out of scope

- exact unpublished storefront preview
- public homepage resolver changes
- scheduler backend changes
- campaign/publication schema changes
- soft-deleted media restore
- physical media deletion
- arbitrary HTML or generic page-builder sections
- merchandising analytics
- new campaign association restrictions
- storefront redesign
- admin UI implementation in this task

---

# 3. Evidence and source-of-truth review

The design was based on direct inspection of:

- `apps/admin/src/app/App.tsx`
- admin auth guards, layout, sidebar, header, API client, hooks, forms, tables, dialogs, media flows, audit page, and design tokens
- merchandising controllers, services, DTOs, validators, shared contracts, migrations, and tests
- public homepage resolver and ETag/cache behavior
- existing GitHub milestones, labels, and admin issue history

Skill usage:

- `ui-ux-pro-max` was successfully invoked.
- Its interaction/accessibility guidance was applied.
- The existing Sabz admin design system is authoritative; no replacement palette, font, or component library is proposed.

---

# 4. Existing admin architecture

## 4.1 Framework and routing

- React 19 + Vite + TypeScript.
- `react-router-dom` v7.
- Central route tree in `apps/admin/src/app/App.tsx`.
- Authenticated routes render inside `AdminLayout`.
- `RequireAuth` and `RequireRole` protect routes.
- `ADMIN_ROLES = ['OPERATOR', 'ADMIN']`.
- `/roles` and `/warehouses` are ADMIN-only.
- Sidebar is collapsible and persisted in localStorage.
- Mobile sidebar uses a Headless UI dialog.

## 4.2 Authentication

- OTP login.
- Access token in memory; refresh cookie.
- Central API client handles bearer injection, refresh, retry, and session clearing.
- UI role gating is not an authorization substitute; server 403 remains authoritative.

## 4.3 API, hooks, and error handling

- `apps/admin/src/services/api.ts` provides:
  - `request<T>`
  - `requestMultipart`
  - `requestMultipartWithProgress`
  - `requestBlob`
- No React Query/SWR/global cache.
- Existing hooks use `useState`/`useEffect` with request-sequence guards.
- Errors use `ApiError` and `translateApiError`.
- `ApiErrorPayload` currently types only `statusCode`, `message`, `error`.
- Merchandising errors may additionally contain:
  - `errors`
  - `warnings`
  - `usage`
  - `currentRevision`
  - `currentSchemaVersion`
  - `currentUpdatedAt`
- A frontend parser/typed helper is required to preserve these details.

## 4.4 Forms and validation

- Hand-rolled controlled React state.
- Catalyst `Field`, `Label`, `Input`, `Select`, `Textarea`, `ErrorMessage`.
- Inline errors through `InlineError` / `ErrorMessage`.
- Dialogs use Catalyst `Alert`.
- No shared toast system.
- Success is communicated by dialog closure, inline status, and refetch.

## 4.5 Tables and states

- `PageHeader`, `TableCard`, Catalyst `Table`, `TablePagination`.
- Shared `EmptyState`, `Loading`, `ErrorState`, `StatusBadge`, `InlineError`.
- URL-driven filters on the catalog grid.
- No general sortable-table abstraction.
- Full-width data pages are allowed; form pages use capped widths.

## 4.6 Dialog and media patterns

- Catalyst `Alert` modal.
- Product media upload:
  - client validation
  - upload progress
  - processing state
  - authenticated blob preview
  - delete confirmation with conflict refresh
- `dnd-kit/core` is installed and already used for ordering interactions.
- `react-easy-crop` exists, but campaign media only requires focal-point selection.

## 4.7 Design system

Existing “Orchard Ledger” direction:

- warm paper background and hunter/fern/pine greens
- semantic status tokens
- Vazirmatn
- Persian manuscript double-rule identity
- light/dark themes
- Catalyst component conventions
- lucide icon family
- RTL-first layout

No new design system is allowed.

---

# 5. Backend contract map

## 5.1 Campaigns

Base: `/admin/merchandising/campaigns`  
Roles: `OPERATOR`, `ADMIN`.

| Operation | Endpoint | Contract |
|---|---|---|
| List | `GET /` | `page`, `limit` 1–100, `q`, `type`, `isEnabled`, `isArchived`; fixed recent-order |
| Create | `POST /` | strict raw body; unknown fields rejected |
| Detail | `GET /:id` | campaign + ordered selections + media + usage |
| Update | `PATCH /:id` | strict raw body; archived → 409 |
| Enable | `POST /:id/enable` | does not publish |
| Disable | `POST /:id/disable` | does not unpublish |
| Archive | `POST /:id/archive` | current/scheduled publication reference → 409 |

Editable fields:

- `internalName`, `type`, `titleFa`
- `eyebrowFa`, `subtitleFa`, `descriptionFa`, `ctaLabelFa`
- `cta`
- `isEnabled`, `startsAt`, `endsAt`, `priority`
- `productIds`, `categoryIds`, `brandIds`, `media`

Limits:

- products: 12
- categories: 6
- brands: 5
- media: 4
- media slots: `HERO_DESKTOP`, `HERO_MOBILE`, `BANNER`, `EDITORIAL`
- focal coordinates: 0–100
- media assignment alt: max 160

Campaign status and schedule:

- stored: `isEnabled`, `archivedAt`, `startsAt`, `endsAt`
- derived: `status`, `scheduleStatus`
- `status` is administrative presentation, never proof of public publication
- `usage` lists current/scheduled publications
- `hasUnpublishedChanges` is best-effort and may be `null`

Important:

- campaign type is not backend-enforced against association mix
- UI must not invent hard type-based restrictions
- no campaign delete endpoint exists
- archive is visible as the lifecycle end-state

## 5.2 Merchandising media

Base: `/admin/merchandising/media`  
Roles: `OPERATOR`, `ADMIN`.

| Operation | Endpoint | Contract |
|---|---|---|
| Upload | `POST /` | multipart `file`, optional `altFa`; JPEG/PNG/WEBP |
| List | `GET /` | `page`, `limit` max 50, `q`, `isPublished` |
| Detail | `GET /:id` | metadata + `deletedAt` + usage |
| Update | `PATCH /:id` | **only `altFa`** |
| Delete | `DELETE /:id` | soft-delete; 409 when referenced |
| Admin file | `GET /:id/file` | authenticated binary |
| Admin thumbnail | `GET /:id/thumbnail` | authenticated WebP |
| Public file | `GET /catalog/merch-media/:id` | only when `publishedAt != null` |

Important:

- `status` is `DRAFT` or `PUBLISHED`
- `PUBLISHED` is derived from current homepage publication eligibility, not manual publication
- focal point is not a media-library field
- focal point and assignment alt belong to `MerchCampaignMedia`
- soft-deleted media are excluded from list/detail and cannot be restored with current API

## 5.3 Homepage draft

Base: `/admin/merchandising/homepage`  
Roles: `OPERATOR`, `ADMIN`.

| Operation | Endpoint | Contract |
|---|---|---|
| Read/init | `GET /draft` | singleton; safe first-access initialization |
| Replace | `PUT /draft` | `revision` + full `sections`; stale → 409 |
| Validate | `POST /draft/validate` | current or submitted sections; errors + warnings |

Draft rules:

- max 12 sections
- `order` must equal array index
- unique section keys
- strict nine-section union
- no arbitrary HTML
- `isVisible` may hide a section from public output

Validation result:

- `revision`, `schemaVersion`, `valid`
- `errors[]`, `warnings[]`
- each issue: `path`, `code`, `message`, `severity`, `category`

## 5.4 Publications

Base: `/admin/merchandising/homepage/publications`

Roles:

- history/detail: `OPERATOR`, `ADMIN`
- publish/schedule/cancel/rollback: `ADMIN`

| Operation | Endpoint | Contract |
|---|---|---|
| List | `GET /?page&limit&status` | newest version first |
| Detail | `GET /:id` | immutable snapshot |
| Publish/schedule | `POST /` | `{ publishAt?, note? }` |
| Cancel | `POST /:id/cancel` | only SCHEDULED |
| Rollback | `POST /:id/rollback` | only SUPERSEDED; creates new PUBLISHED version |

Statuses:

- `SCHEDULED`
- `PUBLISHED`
- `SUPERSEDED`
- `CANCELLED`

Activation failure policy:

- permanent dependency/structure failure → `CANCELLED`
- system-blocked and operator-cancelled share status
- audit distinguishes:
  - `HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED` + system actor
  - `HOMEPAGE_PUBLICATION_CANCELLED` + operator actor
  - `HOMEPAGE_SCHEDULED_ACTIVATION_FAILED` for transient failure; row remains `SCHEDULED`

## 5.5 Audit

Base: `/admin/audit`  
Roles: `OPERATOR`, `ADMIN`.

Filters:

- `page`, `limit` max 100
- `actorId` UUID only
- `action`
- `entity`
- `entityId` UUID
- `from`, `to` ISO timestamps

Diagnostics strategy:

- load detail audit on publication detail by `entityId`
- do not issue one audit request per publication row
- list pages must not fetch audit for every row
- system actor may be identified from raw `userId` prefix `system:`
- audit `actor` may be `null` for system worker

## 5.6 Selection lookups

| Selection | Endpoint | Notes |
|---|---|---|
| Products | `/admin/products?page&limit&search&status&categoryId&brandId` | search + PUBLISHED filter |
| Categories | `/admin/categories/tree` | full tree, `isVisible`, admin product count |
| Brands | `/admin/brands?page&limit` | no search/filter |
| Blog posts | `/admin/blog/posts?status&page&limit` | PUBLISHED filter available; no search |
| Campaigns | `/admin/merchandising/campaigns?q&type&isEnabled&isArchived` | suitable |
| Media | `/admin/merchandising/media?q&isPublished&page&limit` | suitable |

## 5.7 Public preview

- `GET /catalog/homepage` is public and current-publication-only.
- public media is publication-gated.
- no draft preview endpoint or preview token exists.
- admin media preview uses authenticated admin file/thumbnail endpoints.

---

# 6. Information architecture

## 6.1 Global navigation

Add one sidebar entry:

```text
بازاریابی
```

Root:

```text
/merchandising
```

Inside the area use a secondary tab bar:

| Tab | Route | Purpose |
|---|---|---|
| نمای کلی | `/merchandising` | operational summary |
| صفحه اصلی | `/merchandising/homepage` | homepage draft editor |
| انتشارها | `/merchandising/publications` | history/scheduling/rollback |
| کمپین‌ها | `/merchandising/campaigns` | campaign management |
| کتابخانه رسانه | `/merchandising/media` | media library |

Detail routes:

```text
/merchandising/campaigns/new
/merchandising/campaigns/:id
/merchandising/publications/:id
```

Rationale for one sidebar item:

- the existing sidebar already has many entries;
- merchandising is one coherent domain;
- a secondary tab bar keeps global navigation manageable.

All routes use `RequireRole roles={ADMIN_ROLES}`.

## 6.2 Area-level states

- loading: `Loading compact`
- empty: actionable `EmptyState`
- error: `ErrorState` with retry
- forbidden: role guard sends to `/access-denied`; server 403 shows inline permission state
- no fabricated dashboard metrics

---

# 7. Permissions and safety

| Capability | OPERATOR | ADMIN |
|---|---:|---:|
| Merchandising area | ✓ | ✓ |
| Campaign list/detail/create/update | ✓ | ✓ |
| Enable/disable/archive campaign | ✓ | ✓ |
| Media list/upload/detail/edit/delete/preview | ✓ | ✓ |
| Draft read/edit/validate | ✓ | ✓ |
| Publication history/detail | ✓ | ✓ |
| Publish immediately | ✗ | ✓ |
| Schedule publication | ✗ | ✓ |
| Cancel scheduled publication | ✗ | ✓ |
| Rollback publication | ✗ | ✓ |
| Audit read | ✓ | ✓ |

UI rules:

- unauthorized actions are hidden or disabled with an explicit permission explanation;
- server 403 remains handled;
- no role is inferred solely from token payload;
- existing `useAuth` roles drive presentation only.

Confirmation requirements:

- publish immediately
- schedule
- cancel scheduled
- rollback
- archive campaign
- delete media
- discard draft
- leave dirty editor

Enable/disable campaign does not require a modal but must show an inline result and audit consequence.

---

# 8. Main workflows

## 8.1 Create and activate a campaign

1. List → create campaign.
2. Basic settings: name, type, copy, CTA, schedule, priority, enabled state.
3. Save and open editor.
4. Add ordered products/categories/brands.
5. Assign media slots, focal points, assignment alt.
6. Enable/disable.
7. Archive if unused.
8. Usage panel shows current/scheduled publication references.
9. 409 conflict refreshes authoritative detail.

Failure recovery:

- 400 field errors remain editable;
- stale/archived/usage 409 refreshes detail;
- network failure preserves form state.

## 8.2 Manage media

1. Upload JPEG/PNG/WEBP.
2. Show DRAFT and “not public”.
3. Preview via authenticated thumbnail/file.
4. Edit alt only.
5. Inspect usage.
6. Delete only when unused; 409 refreshes usage.
7. Do not expose restore or physical delete.

## 8.3 Compose homepage

1. Load draft revision.
2. Add/remove/reorder sections.
3. Configure section.
4. Toggle visibility.
5. Validate.
6. Resolve errors.
7. Save with revision.
8. Handle stale revision conflict.
9. Guard unsaved navigation.

## 8.4 Publish immediately

1. Save draft.
2. Validate with no errors.
3. ADMIN confirms publication.
4. `POST /publications` with no `publishAt`.
5. Navigate to new publication detail.
6. Refresh draft/history state.

## 8.5 Schedule publication

1. Save and validate.
2. Choose future date/time with explicit timezone.
3. Confirm.
4. `POST /publications` with UTC ISO `publishAt`.
5. History shows SCHEDULED.
6. Cancel before activation.
7. After activation show PUBLISHED or system-blocked CANCELLED.

## 8.6 Roll back

1. Open eligible SUPERSEDED publication.
2. Confirm new-version semantics.
3. Optionally add note.
4. `POST /:id/rollback`.
5. Show new publication and `rollbackFromPublicationId`.

---

# 9. Homepage editor

## 9.1 Approach

Recommended: structured section editor.

Rejected: canvas/generic page builder.

Reasons:

- no draft preview backend;
- typed strict sections;
- simpler solo-developer implementation;
- accessible and responsive;
- validation paths map cleanly to section forms;
- no arbitrary HTML.

## 9.2 Layout

Desktop:

- readiness bar
- section outline (left)
- section configuration panel (right)
- validation/problems panel
- unsaved changes bar

Tablet/mobile:

- section accordion
- full-width configuration
- move-up/down buttons
- sticky save/validate bar

## 9.3 Section outline

Each row:

- drag handle
- label/type
- visibility toggle
- error/warning count
- move up/down
- remove

Add menu lists only the nine supported section types.

On add:

- generate unique key;
- set order from array index;
- focus configuration.

On reorder:

- reorder array;
- rewrite all `order` values to indexes.

Max 12 sections.

## 9.4 Section registry

| Section type | Editable settings | Constraint |
|---|---|---|
| `HERO_CAROUSEL` | ordered campaigns 1–3 | campaign enabled/non-archived; desktop media required; mobile warning |
| `TRUST_STRIP` | ordered items up to 4 | icon/title/body constraints |
| `CATEGORY_DISCOVERY` | campaign | campaign must have 1–6 categories |
| `OFFER_STRIP` | campaign + fallback | fallback `featured`/`hide` |
| `CATEGORY_SPOTLIGHT` | campaign + primary/secondary category | primary in campaign categories; secondary distinct/visible |
| `READY_TO_SHIP` | limit/title/subtitle | limit 1–8; title/subtitle limits |
| `PRODUCT_RAIL` | title/subtitle/actionHref/source | campaign or query; limit 1–12; safe internal href |
| `BRAND_SHOWCASE` | campaign + productsPerBrand | campaign brands 1–5; productsPerBrand 1–6 |
| `BLOG_FEATURE` | latest or manual | latest limit 1–3; manual published posts 1–3 |

Common fields:

- `key`: generated; advanced editing only with valid pattern
- `type`: immutable after creation
- `order`: derived/read-only
- `isVisible`: switch

## 9.5 Entity pickers

Shared picker shell:

- search/filter where supported
- pagination
- selected state
- duplicate prevention
- limit display
- accessible modal/popover

Pickers:

- products: PUBLISHED only
- categories: tree
- brands: paginated; no search currently
- campaigns: enabled/non-archived
- blog: PUBLISHED only
- media: library

Ordering:

- dnd-kit drag on desktop
- move up/down buttons always
- keyboard accessible

Picker dependencies are incremental:

- campaign picker introduced for campaign-backed sections;
- product/category/brand/blog pickers introduced only for sections that need them;
- do not block the entire editor on every picker.

## 9.6 Validation

Validation panel:

- errors red/blocking
- warnings amber/non-blocking
- grouped by section
- click issue → activate section/field
- unknown virtual paths remain visible

Path mapping:

- `sections[i]...` → section index
- campaign-source virtual paths → campaign readiness block
- unmapped paths show structured diagnostics

## 9.7 Dirty state and optimistic revision

- load draft revision
- save full sections + revision
- success updates revision
- stale 409:
  - show current revision/time
  - offer reload server draft
  - local work preserved until reload choice
  - no backend merge
- beforeunload/in-app leave guard

## 9.8 Readiness

Readiness card:

- revision
- saved/dirty
- errors/warnings
- current PUBLISHED version
- draft revision vs current publication `sourceDraftRevision`
- save/validate actions
- ADMIN-only publish/schedule

Publishing requirements:

- saved draft
- zero validation errors
- ADMIN

Warnings require acknowledgement but do not block.

## 9.9 Preview

Safe initial preview:

- structural section cards
- campaign copy from admin detail
- selected entity names
- authenticated media thumbnails
- published storefront link if configured

Not available initially:

- exact unpublished storefront rendering
- public-style preview with unpublished media
- preview tokens

Label structural preview honestly.

---

# 10. Section editor details

## 10.1 Campaign-backed sections

- Hero: campaign picker, ordered slides, media-readiness warnings.
- Category discovery: campaign picker + category count guidance.
- Offer strip: campaign picker + fallback.
- Category spotlight: campaign picker + primary/secondary category pickers.
- Brand showcase: campaign picker + products-per-brand.

## 10.2 Content and product sections

- Trust strip: icon/title/body rows.
- Ready-to-ship: limit/title/subtitle.
- Product rail: title/subtitle/href/source mode.
- Blog feature: latest or manual PUBLISHED posts.

## 10.3 Picker dependency strategy

- Incremental features:
  - Issue 3 introduces campaign/media pickers needed by campaigns.
  - Issue 5 introduces campaign picker reuse for campaign-backed sections.
  - Issue 6 introduces product/category/brand/blog pickers only where required.
- Brand picker initially supports pagination without server search.
- Blog picker initially supports published-status pagination.
- Do not implement unbounded client-side “load all pages” search.
- Missing search is documented as a backend follow-up.

---

# 11. Publication management

## 11.1 History

Columns:

- version
- status
- publishAt
- publishedAt
- source draft revision
- rollback source
- note
- created/published by
- actions

Filter by status; current PUBLISHED pinned visually.

No per-row audit requests. Audit is loaded on detail only.

## 11.2 Detail

Shows:

- immutable snapshot section summary
- publication metadata
- current/scheduled/superseded/cancelled state
- rollback provenance
- audit timeline
- cancel/rollback actions for ADMIN

## 11.3 Status presentation

| Stored state | Display |
|---|---|
| SCHEDULED | زمان‌بندی‌شده |
| PUBLISHED | منتشرشده / نسخه جاری |
| SUPERSEDED | جایگزین‌شده |
| CANCELLED + operator audit | لغو توسط اپراتور |
| CANCELLED + blocked audit | لغو سیستمی + reason |
| CANCELLED without evidence | لغوشده — دلیل نامشخص |
| SCHEDULED + failure audit | زمان‌بندی‌شده — آخرین تلاش ناموفق |

Never infer a failure reason without audit evidence.

## 11.4 Immediate publishing

- save-before-publish gate
- ADMIN only
- confirmation with revision/warnings
- success navigates to publication detail and refreshes current state

## 11.5 Scheduling and timezone

Inspection found no authoritative application timezone configuration in the API, admin, storefront, environment examples, or docs.

Decision required before implementation:

- Preferred business timezone: `Asia/Tehran`.
- UI must display the chosen timezone explicitly.
- Browser-local time must not be silently assumed to be business time.
- Convert chosen local time to UTC ISO for `publishAt`.
- Store/display conversion must be tested around DST-free Iran offset assumptions and midnight boundaries.
- If product owner chooses another timezone, update this section before implementation.

This is an explicit unresolved product decision, not a silent browser-local implementation.

## 11.6 Cancellation

- only SCHEDULED
- confirmation explains current publication remains current
- 409 refreshes state
- operator cancellation visual state uses audit action

## 11.7 Activation diagnostics

Publication detail loads audit by `entityId` with bounded page size.

Show:

- activated events
- blocked reason
- transient failed attempts
- operator cancellation

No list-row audit fan-out.

## 11.8 Rollback

- only SUPERSEDED
- manager/admin only
- confirmation explains new version
- source relationship shown after success
- 409 displays validation/dependency reasons where available
- historical record remains unchanged

---

# 12. Media workflow

## 12.1 List

- card grid with authenticated thumbnails
- search by filename/alt
- filter DRAFT/PUBLISHED
- pagination max 50
- empty upload CTA

## 12.2 Upload

- JPEG/PNG/WEBP
- max backend image size
- optional alt
- progress/processing
- result DRAFT

## 12.3 Detail

- preview
- original name/mime/size/dimensions
- alt edit
- status
- usage campaigns/current/scheduled
- delete disabled when referenced

## 12.4 Deletion

- confirm red
- explain soft-delete and loss from library
- no restore UI
- 409 refresh usage

## 12.5 Focal/alt clarification

- media-library form edits only `altFa`
- campaign-media assignment owns focal point and assignment-level alt
- UI must not imply focal editing exists globally

---

# 13. Overview

A bounded operational hub composed from existing APIs:

- current PUBLISHED publication
- next SCHEDULED publication
- draft revision/readiness
- recent campaigns (bounded)
- recent media (bounded)
- quick links

No dedicated overview endpoint is implied. Each card loads independently and has its own error/empty state. No fabricated charts or analytics.

---

# 14. Visual, responsive, and accessibility direction

- use existing Orchard Ledger tokens
- no replacement design system
- semantic status badges
- color plus icon/text for status
- RTL logical properties
- LTR for UUIDs, slugs, filenames, ISO timestamps
- Vazirmatn
- dense tables, comfortable forms
- responsive two-pane editor only at desktop
- keyboard alternatives for drag
- visible focus and validation summary
- `aria-live` for save/validation
- 44px touch targets
- no excessive gradients/shadows/animation
- no toast dependency

---

# 15. API gap analysis

| Capability | Existing support | Gap | Priority |
|---|---|---|---|
| Exact draft storefront preview | none | no preview endpoint/token; public media gated | BLOCKER for preview feature; not editor |
| Published storefront link | public homepage exists | admin storefront URL config missing | OPTIONAL |
| Activation failure reason | audit only | no failure field in publication DTO | IMPORTANT |
| System actor filtering | raw userId | actorId filter is UUID-only; actor null for system | OPTIONAL |
| Structured error extras | backend returns extras | `ApiErrorPayload` type does not expose them | IMPORTANT |
| Brand search | paginated list only | no search/filter | IMPORTANT |
| Blog search/category filter | status pagination only | no search/category | IMPORTANT |
| Soft-deleted media management | excluded | no list/restore | IMPORTANT if required |
| Media usage filter | detail usage only | list cannot filter by usage | OPTIONAL |
| Campaign date/usage sorting | fixed recent order | no extra sort/filter | OPTIONAL |
| Homepage dirty-vs-published | sourceDraftRevision | no dedicated dirty endpoint | OPTIONAL |
| Publication list search/date | status filter only | no date/text search | OPTIONAL |

No new backend scheduler, analytics, campaign restriction, or generic page builder is required for the initial UI.

---

# 16. Page inventory

## 16.1 Merchandising overview `/merchandising`

- Purpose: operational entry point.
- Layout: header/tabs, current publication card, scheduled/draft cards, recent campaigns/media.
- Data: existing list/detail APIs only.
- Interactions: open editor, publication, campaigns, media.
- States: independent card loading/error/empty.
- Permissions: read both roles; mutations hidden/gated.

## 16.2 Homepage editor `/merchandising/homepage`

- Purpose: compose/validate/save draft.
- Layout: readiness bar, section outline, configuration, validation panel.
- Data: draft, campaigns, categories, brands, blog posts, media.
- Interactions: add/remove/reorder/configure/validate/save.
- States: loading/error/dirty/stale/errors/warnings.
- Permissions: edit both; publish actions ADMIN.

## 16.3 Campaign list `/merchandising/campaigns`

- TableCard, filters, pagination, status badges, create/open.

## 16.4 Campaign editor `/merchandising/campaigns/new`, `/:id`

- Tabs: settings, selections, media, usage/status, audit.
- Actions: save, enable/disable, archive, ordered pickers, media/focal.

## 16.5 Media library `/merchandising/media`

- Grid, upload, search/filter, pagination, preview, alt, usage, delete.

## 16.6 Publication history `/merchandising/publications`

- List/status filter, current marker, cancel/rollback entry points.

## 16.7 Publication detail `/merchandising/publications/:id`

- Immutable snapshot summary, status, audit timeline, cancel/rollback.

---

# 17. Component inventory

| Component | Responsibility | Reuse/New |
|---|---|---|
| `MerchTabs` | area subnavigation | New |
| `CampaignStatusBadge` | campaign status label/tone | New, `StatusBadge` |
| `MediaStatusBadge` | DRAFT/PUBLISHED | New, `StatusBadge` |
| `PublicationStatusBadge` | status + audit-derived cancellation | New |
| `CtaBuilder` | typed CTA kind/target | New |
| `OrderedEntityList` | ordered selections | New, dnd-kit |
| `EntityPickerDialog` | shared picker shell | New |
| Product/category/brand/campaign/blog pickers | selection | New |
| `MediaPicker` | media selection | New |
| `MediaThumbnail` | authenticated preview | New, requestBlob |
| `FocalPointEditor` | assignment focal point | New |
| `SectionOutline` | section navigation/order | New |
| `SectionConfigPanel` | typed section form dispatch | New |
| `ValidationPanel` | errors/warnings navigation | New |
| `PublicationReadinessCard` | publish gate | New |
| `UsagePanel` | campaign/media/publication usage | New |
| `AuditTimeline` | entity audit history | New, AuditDetailsDialog |
| `PublicationSnapshotSummary` | immutable snapshot read-only | New |
| `ConfirmActionDialog` | publication/archive/delete confirmations | New, Alert |
| `UnsavedChangesBar` | dirty guard | Reuse |
| `TableCard` | tables | Reuse |
| `TablePagination` | pagination | Reuse |
| `PageHeader` | page header/help | Reuse |
| `EmptyState` | empty states | Reuse |
| `ErrorState` | page errors | Reuse |
| `Loading` | loading | Reuse |
| `InlineError` | form errors | Reuse |
| `StatusBadge` | semantic badge | Reuse |
| `Tooltip` | labels | Reuse |
| Catalyst `Alert*` | modals | Reuse |
| `DeleteConfirmDialog` | destructive confirm | Reuse |

No shared toast component exists; do not add one for this feature.

---

# 18. Implementation roadmap

The roadmap is dependency-aware. Issues should be created in this sequence.

| # | Planned issue | Scope | Depends on | Backend first? |
|---|---|---|---|---|
| 1 | Merchandising admin foundation | nav/routes/tabs, services/hooks, errors, labels, audit labels | — | No |
| 2 | Media library | list/filter/upload/preview/alt/usage/delete | 1 | No |
| 3 | Campaign management | list/create/edit/associations/CTA/media/lifecycle/usage | 1,2 | No |
| 4 | Homepage editor foundation | draft load/save/validate, outline, order, dirty/revision | 1 | No |
| 5 | Campaign-backed section editors | HERO, CATEGORY_DISCOVERY, OFFER_STRIP, CATEGORY_SPOTLIGHT, BRAND_SHOWCASE | 3,4 | No |
| 6 | Content/product section editors | TRUST_STRIP, READY_TO_SHIP, PRODUCT_RAIL, BLOG_FEATURE | 3,4 | No; brand/blog search follow-up optional |
| 7 | Readiness + immediate publishing | readiness, save gate, ADMIN publish, confirmation | 4,5,6 | No |
| 8 | Scheduling + publication history | history/detail, schedule, cancel, timezone | 7 | No; timezone decision required |
| 9 | Rollback + activation diagnostics | rollback, provenance, audit, system/manual cancellation | 8 | No |
| 10 | Merchandising overview | bounded independent cards from existing APIs | 2,3,4,8 | No |
| 11 | Responsive/a11y/e2e polish | responsive, RTL, keyboard, focus, browser tests | 2–10 | No |

Each issue must include:

- goal/context
- in scope
- out of scope
- dependencies
- API endpoints/contracts
- role/permission requirements
- testable acceptance criteria
- test expectations
- definition of done

---

# 19. Testing expectations

## Unit/component

- status/error/label helpers
- error payload parsing
- ordered list behavior
- section form validation and limit enforcement
- dirty/revision conflict state
- picker selection/duplicate prevention
- media upload validation
- permission-gated actions
- audit state derivation

## Integration/e2e

- both roles can access allowed merchandising routes
- OPERATOR cannot publish/schedule/cancel/rollback
- campaign CRUD/associations/media/archive conflicts
- media upload/preview/delete conflicts
- draft save/validate/stale revision
- all nine section editors
- immediate publish
- schedule/cancel
- rollback
- audit diagnostics
- responsive/RTL/keyboard smoke
- no horizontal overflow at representative widths

---

# 20. Risks and unresolved decisions

## Risks

1. Exact draft preview requires backend support.
2. No application timezone is configured.
3. Brand picker lacks server search.
4. Blog picker lacks search/category filtering.
5. Soft-deleted media cannot be browsed/restored.
6. Structured error extras are not fully typed.
7. System audit actor is not resolved as a normal user.
8. Campaign type does not hard-limit association mix.
9. Homepage dirty-vs-published is only revision-based/best-effort.

## Decisions needed

1. Confirm `Asia/Tehran` as business timezone or provide another authoritative timezone.
2. Decide whether exact unpublished preview is required in the initial release.
3. Decide whether brand/blog search needs a backend prerequisite before editor implementation.
4. Decide whether soft-deleted media history/restore is required.
5. Decide whether to add an admin storefront URL for published preview links.

---

# 21. Deferred items

Deferred unless a separate backend decision authorizes them:

- exact unpublished homepage storefront preview
- generic visual page builder/canvas
- arbitrary HTML/custom sections
- soft-deleted media restore
- merchandising analytics backend
- new campaign association restrictions
- new scheduler architecture
- preview tokens

---

# 22. GitHub issue mapping

Created issues:

| SS | GitHub issue | Title | Depends on |
|---|---|---|---|
| SS-273 | [#350](https://github.com/heidary100/sabz-system/issues/350) | feat(admin): add merchandising navigation and foundations | — |
| SS-274 | [#351](https://github.com/heidary100/sabz-system/issues/351) | feat(admin): add merchandising media library | #350 |
| SS-275 | [#352](https://github.com/heidary100/sabz-system/issues/352) | feat(admin): add campaign management UI | #350, #351 |
| SS-276 | [#353](https://github.com/heidary100/sabz-system/issues/353) | feat(admin): add homepage draft editor foundation | #350 |
| SS-277 | [#354](https://github.com/heidary100/sabz-system/issues/354) | feat(admin): add campaign-backed homepage section editors | #352, #353 |
| SS-278 | [#355](https://github.com/heidary100/sabz-system/issues/355) | feat(admin): add content and product homepage section editors | #352, #353 |
| SS-279 | [#356](https://github.com/heidary100/sabz-system/issues/356) | feat(admin): add homepage publication readiness and immediate publishing | #353, #354, #355 |
| SS-280 | [#357](https://github.com/heidary100/sabz-system/issues/357) | feat(admin): add homepage scheduling and publication history | #356 |
| SS-281 | [#358](https://github.com/heidary100/sabz-system/issues/358) | feat(admin): add homepage rollback and activation diagnostics | #357 |
| SS-282 | [#359](https://github.com/heidary100/sabz-system/issues/359) | feat(admin): add merchandising overview | #351, #352, #353, #357 |
| SS-283 | [#360](https://github.com/heidary100/sabz-system/issues/360) | feat(admin): polish merchandising UI responsive and accessibility | #351–#359 |

Milestone for all issues: `UX Redesign (SS-248+)`.  
Labels: `type:feature`, `area:admin`, and `priority:high` for SS-273–SS-276/SS-279/SS-280, `priority:medium` for the remaining issues.

Deferred backend prerequisites/opportunities are listed in sections 15 and 21 and are not part of this initial issue sequence.
