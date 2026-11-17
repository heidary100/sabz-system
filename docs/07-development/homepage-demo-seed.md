# Homepage Demo Seed (SS-284B)

## Purpose and scope

The homepage demo seed is a dedicated, guarded operation for populating the
existing merchandising system with a demonstrative nine-section homepage. It is
not part of the normal API bootstrap and must not be executed as part of API
startup.

**Implementation and dry-run do not authorize an apply.** All content approvals
in `apps/api/src/modules/merchandising/demo-seed/manifest.ts` are intentionally
pending. The current manifest is not approved for publication.

The tool does **not**:

- run Prisma migrations;
- run `prisma:seed` or `seedCatalog`;
- start the API listener or scheduled workers;
- modify product stock, prices, timestamps or catalog rows;
- unpublish or edit the SS-245 test article;
- delete publication history;
- silently overwrite manually edited demo records.

## Architecture

The operation has three explicit stages:

1. **Identity** — read PostgreSQL identity and compute the fingerprint.
2. **Plan** — read state inside `SET TRANSACTION READ ONLY`, resolve candidates,
   validate the manifest and report blockers. Planning never constructs a
   write-capable storage or service layer.
3. **Apply** — acquire the fenced database lease, create or resume the
   immutable-intent journal, write a persistent draft backup, then
   create/reconcile demo-owned records and replace the draft. Every protected
   database transaction validates the lease owner and fencing generation in the
   same transaction. Publishing requires a separate confirmation and
   acknowledgement, and publication plus authoritative journal completion share
   one commit.

The CLI uses a manually constructed composition root. It does not bootstrap
`AppModule`.

Source layout:

```text
apps/api/src/modules/merchandising/demo-seed/
  cli.ts                 CLI: identity, dry-run, apply, verify-backup
  identity.ts            fingerprint, environment/public-URL guards
  planner.ts             pure plan construction and final section builder
  plan-loader.ts         read-only database planning transaction
  prisma-repository.ts   read-only Prisma projections and catalog candidates
  backup.ts              exclusive checksummed draft backup and verification
  asset.ts               root-contained, hashed asset inspection/copy
  guardrails.ts          fenced lease, heartbeat, operation journal, atomic completion
  demo-fence.ts          transaction-scoped fencing and generation validation
  operation-id.ts        strict operation-id format
  intent.ts              immutable operation intent and canonical hashes
  authorization.ts       canonical plan/section hashes and final-boundary bindings
  content-validation.ts  approval-independent content completeness
  write-gateway.ts       lazy sealed write composition root
  blog-finalization.ts   final blog row lock/validation/activation
  media-keys.ts          deterministic operation/asset storage identity
  media-provenance.ts    persisted source/processed/thumbnail verification
  guards.ts              draft/publication/blog/media-reconciliation guards
  manifest.ts            content and approval manifest
  ownership.ts           demo ownership classification
  types.ts               shared contracts
```

The guard migration is
`apps/api/prisma/migrations/20261115190000_homepage_demo_seed_guardrails/`.
It creates the singleton lease with a monotonic `fencingGeneration`, the durable
operation journal (`planHash`, `intentHash`, `baselineHash`, full
`intent`, terminal `result`, publication/draft completion fields), a unique
operation-to-publication link on `HomepagePublication.demoSeedOperationId`, a
restrictive journal-to-publication foreign key, and partial unique indexes for
`homepage-demo:` campaign names and `homepage-demo-` media display names. It
also adds demo media provenance hashes (`sourceSha256`, `processedSha256`,
`thumbnailSha256`) to `MerchMedia`. It must be deployed before an apply. It is intentionally unapplied by this
implementation task. Because the migration is unapplied in this worktree, the
fencing, intent, completion and publication-link changes were amended in place;
if an environment has already applied an earlier version of this migration, a
subsequent migration must be reviewed instead of editing history.

The migration is wrapped in explicit PostgreSQL `BEGIN`/`COMMIT` and runs the
duplicate campaign/media preflights before any DDL. Prisma CLI/Client are pinned
at `6.19.3`. Because migration-runner transaction behavior must not be assumed,
the isolated migration test must still prove clean installation, preflight
failure with no schema change, DDL failure rollback and the final schema. The
migration must not be run against the shared development database.

The `updatedAt` database defaults and the `state/startedAt` index are aligned
with `schema.prisma` and the repository's existing Prisma conventions. The
journal-to-publication FK is restrictive; publication history is append-only.

## Identity command and fingerprint

Run:

```bash
pnpm --filter @sabz/api homepage:demo-seed identity
```

The command requires `NODE_ENV=development` explicitly, opens a read-only
transaction and prints:

- PostgreSQL system identifier
- database name
- database OID
- PostgreSQL version
- SHA-256 fingerprint

Fingerprint algorithm:

```text
SHA256(system_identifier + "|" + database_name + "|" + database_oid)
```

Historical development identity observed during the audit:

```text
system_identifier = 7689483372718039078
database_name     = sabz
database_oid      = 16384
postgres_version  = 16.15
fingerprint       = dca02c03f09d18e68317136f85e643c0b80c8776c6c558fca24d67495103a7be
```

A physical PostgreSQL clone can retain the same system identifier. The
fingerprint is an accident-prevention guard, not cryptographic proof of database
provenance. Never use it as a security boundary.

`DATABASE_URL` is read from the process environment; it is never printed.

## Dry-run

```bash
NODE_ENV=development \
pnpm --filter @sabz/api homepage:demo-seed dry-run
```

The dry-run:

- opens one interactive database transaction and executes
  `SET TRANSACTION READ ONLY` before the first application query;
- uses only read projections and root-contained asset inspection (`realpath`,
  `lstat`, `O_NOFOLLOW`, size and SHA-256 hashing) for assets;
- does not create backup directories or files;
- does not initialize `LocalDiskMediaStorage`;
- does not upload or process media;
- does not acquire the apply lease, draft writes, start workers or construct the
  write gateway;
- does not mutate drafts, publications, campaigns, blog posts, media or
  catalog data.

It prints a complete plan:

- identity and fingerprint;
- draft revision/schema and publication versions/statuses;
- current campaign/media/blog counts;
- approval blockers;
- planned campaign, blog, media and draft actions;
- selected catalog candidates;
- all nine section previews;
- backup requirement and directory;
- publication replacement and acknowledgement requirements;
- whether apply would currently be permitted.

The default manifest will report pending approvals and missing asset files.
That is expected; the dry-run is still a successful read-only operation.

## Apply prerequisites

Apply is refused unless all of the following are true:

```bash
NODE_ENV=development
HOMEPAGE_DEMO_CONFIRM=1
HOMEPAGE_DEMO_EXPECTED_FINGERPRINT=<fingerprint from identity>
HOMEPAGE_DEMO_PUBLIC_API_BASE_URL=https://<public-api-origin>/api/v1
HOMEPAGE_DEMO_OPERATION_ID=<stable id for this apply/retry>
```

The operation ID must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$`. UUIDs are
accepted. Spaces, dots, slashes, backslashes, NUL/control characters, leading
separators and overlong values are rejected in both the CLI and the service.
Use a new operation ID after changing the manifest, assets, approval state,
publication mode or media acknowledgement; reusing an ID with different
immutable intent fails closed.

If the plan lists any affected media IDs (including soft-deleted or non-demo
rows), acknowledge the exact set:

```bash
HOMEPAGE_DEMO_MEDIA_ACK_IDS=<comma-separated IDs copied from the plan>
```

The guard migration must already be deployed. It is a schema prerequisite, not
part of the apply command.

If publishing over an existing publication:

```bash
HOMEPAGE_DEMO_PUBLISH_CONFIRM=1
--publish
--acknowledge-publication-replacement
```

If a draft already exists (the current development database does), apply also
requires:

```bash
--replace-draft
```

All content approvals in `manifest.ts` must be approved by a reviewed code
change after explicit operator/business sign-off. There is no environment
variable that bypasses the approval register.

Example apply shape:

```bash
NODE_ENV=development \
HOMEPAGE_DEMO_CONFIRM=1 \
HOMEPAGE_DEMO_EXPECTED_FINGERPRINT=dca02c03f09d18e68317136f85e643c0b80c8776c6c558fca24d67495103a7be \
HOMEPAGE_DEMO_OPERATION_ID=homepage-demo-2026-11-15 \
HOMEPAGE_DEMO_PUBLIC_API_BASE_URL=https://shop.example.com/api/v1 \
HOMEPAGE_DEMO_PUBLISH_CONFIRM=1 \
pnpm --filter @sabz/api homepage:demo-seed apply \
  --replace-draft \
  --publish \
  --acknowledge-publication-replacement
```

Do not run this until the approval register is satisfied.

## Draft backup

Default host directory (relative to `apps/api`):

```text
apps/api/.data/homepage-demo-backups/
```

Default container directory (the Compose bind mount
`./apps/api:/app/apps/api` makes this persistent):

```text
/app/apps/api/.data/homepage-demo-backups/
```

Override with `HOMEPAGE_DEMO_BACKUP_DIR`.

Before replacing an existing draft, the tool:

- validates the operation ID against the strict format before using it in any
  filename;
- resolves the configured backup root, rejects symlinked root/parent
  components, creates it with `0700` permissions and requires the canonical
  real path to equal the lexical path;
- computes the destination inside the canonical root, rejects containment
  escape and refuses any existing file/symlink/directory at that path;
- uses `umask 077`, writes a private temporary file with
  `O_CREAT | O_EXCL | O_NOFOLLOW` and mode `0600`, flushes and fsyncs it, then
  finalizes it with a hard link (`link` fails `EEXIST` rather than overwriting
  an existing backup);
- serializes the complete draft (`revision`, `schemaVersion`, sections and
  `updatedAt`) plus database identity, operation ID and timestamp;
- writes a versioned SHA-256 checksum envelope binding the identity, operation,
  timestamp and complete draft payload;
- fsyncs the containing directory where supported;
- reads the final file back through a no-follow file handle, verifies the exact
  supported backup format version, checksum encoding, identity/fingerprint
  structure, strict operation ID, exact draft schema version `1`, supported
  section types and settings, draft revision and ownership/permissions;
- aborts before database mutation on any failure. The temporary file is
  removed; an already-finalized invalid backup is left for inspection rather
  than overwritten.

Verification requires the same configured backup root as creation. It rejects:

- paths outside that root;
- symlinked backup files and symlinked parent components;
- non-regular files;
- unsupported format versions and malformed checksums;
- missing, malformed or inconsistent identity metadata;
- invalid draft revisions, timestamps or section shapes;
- unexpected ownership or overly permissive modes.

A checksum over malformed data is not treated as a valid recovery point. The
backup is not encrypted. Protect the directory and do not copy it to a public
location.

Residual risk: path validation and the final open are separate filesystem
operations. A local attacker able to replace a parent directory in that narrow
window could redirect the read/write. `O_NOFOLLOW` on the final component,
canonical-path checks and checksum verification mitigate substitution of
content; they do not make filesystem path traversal atomic. This is an
operator-local threat, not a remote path.

### Verify a backup

```bash
pnpm --filter @sabz/api homepage:demo-seed verify-backup \
  apps/api/.data/homepage-demo-backups/<file>.json
```

This is local file verification only; it does not connect to the database.
If the backup was created with `HOMEPAGE_DEMO_BACKUP_DIR`, set the same value
for verification: the path must resolve inside that exact root, and symlinked
files or parent components are rejected.

### Recovery

There is deliberately **no automatic restore** because it could overwrite newer
operator work.

1. Verify the backup with `verify-backup`.
2. Read `payload.draft.sections` and `payload.draft.revision` from the JSON.
3. Read the current draft revision.
4. If the current draft is newer than the backup, do not overwrite it. Take a
   new backup and escalate for a reviewed recovery decision.
5. Restore only through a separately reviewed admin or database procedure;
   preserve the current draft first.
6. Re-run a dry-run and verify the resulting homepage before publishing.

## Global apply lock, fencing and operation journal

The guard migration creates two tables:

- `HomepageDemoSeedLock` — a singleton database lease with an owner token,
  database-time expiry and a monotonic `fencingGeneration`;
- `HomepageDemoSeedOperation` — a durable per-operation journal with immutable
  intent, terminal result and publication/draft completion fields.

### Ordinary coordination

Apply acquires the lease before planning and before any backup, media, campaign,
blog, draft or publication side effect. Acquisition is a single conditional
`UPDATE` against the lock row; a successful acquisition increments
`fencingGeneration` and returns the new generation to the process. The lease is
a database row, not a session advisory lock, so it does not depend on a pooled
Prisma connection staying pinned. A heartbeat renews the lease every 30 seconds
only while the owner token and generation still match, using
`clock_timestamp()`. Release is conditional on the same owner token and
generation, so it cannot clear another process's lease. A crash leaves the
lease to expire after 120 seconds; a later process may then acquire a strictly
newer generation.

### Stale-owner fencing

A standalone `assertHeld()` call is only a pre-side-effect check; it is **not**
the safety mechanism. Every protected write transaction calls
`lockWithinTransaction(tx)` before its first mutation. That function:

1. executes `SELECT ... FOR UPDATE` on the singleton lock row in the same
   transaction as the protected writes;
2. validates the exact owner token and fencing generation after acquiring the
   row lock;
3. checks liveness with `clock_timestamp()` (statement time), not the
   transaction-start `now()` value;
4. renews the lease in that same transaction.

Because the row lock is held until the transaction commits, a competing
acquisition cannot install a newer generation while a protected transaction is
still in flight. The contender waits; when the protected transaction commits,
the contender re-evaluates the lease and normally fails with
`DemoSeedLockUnavailableError`. Conversely, a stale process that starts a new
transaction after a newer generation took over is rejected before any write.
This applies to:

- media upload database-record creation (`MerchMediaService.upload`);
- campaign create/update (`CampaignService.create/update`);
- blog create/update (`BlogService.createPost/updatePost`);
- every journal transition;
- the final draft/publication transaction.

The authoritative completion helper also requires a `DemoSeedFence` and calls
`lockWithinTransaction(tx)` itself before any journal or publication write. It
validates the publication row in the same transaction: existence, matching
`demoSeedOperationId`, matching version and `PUBLISHED` status for publish
operations, and no publication fields for draft-only operations. A direct
caller cannot complete a journal without fence validation, and the
journal-to-publication FK plus runtime checks bind the stored result.

The external storage upload is not transactional with PostgreSQL. Its safety
comes from deterministic operation/asset keys (see below), a fenced database
record creation, and non-destructive orphan handling.

### Write authorization boundary

`write-gateway.ts` no longer exports a capability issuer or a public writer
constructor. The only exported factory validates the approved manifest,
database identity, immutable intent, asset hashes, publication mode and exact
media acknowledgement before constructing the writer. The writer accepts only
manifest keys; sections, campaign/media/blog IDs, cover URLs and draft/publication
expectations are derived from the sealed plan and verified demo-owned database
rows. The final transaction revalidates the section hash, identity, current
draft revision, publication versions, exact visible media set and media
acknowledgement.

TypeScript cannot prevent arbitrary code in the same repository/process from
importing internals or replacing the composition root. The trust boundary is
therefore repository write access and process execution, not untrusted network
input. The runtime invariants above ensure an accidental alternate caller cannot
supply arbitrary sections, media IDs or unapproved content through the real
writer.

### Journal and immutable intent

The journal has an explicit state machine. `advance` transitions are conditional
on the current state and the immutable `intentHash` and are fenced. Recovery of
an incomplete operation resets it to `STARTED` only after content and baseline
hashes match; `MEDIA_CONFLICT` is not resumable, and a `COMPLETED` row is never
reset. Arbitrary success-state advancement, completed-operation reset and
changed-intent replay are rejected.

The immutable intent is persisted with the journal and binds:

- database identity/fingerprint;
- operation ID;
- manifest hash and the full approved manifest snapshot;
- asset identity, size and SHA-256 for every media slot;
- publication mode and publication/replacement flags;
- exact media-reconciliation acknowledgement IDs;
- public API base URL.

`planHash` covers immutable approved content, identity, assets, mode and media
acknowledgement. A separate `baselineHash` binds mutable planning state that
materially changes the operation: draft snapshot, publication snapshots,
resolved catalog candidate IDs/order, spotlight category, campaign payloads,
section previews, media-reconciliation affected set, publication plan and draft
plan. `planHash`/`intentHash` are never overwritten on retry.

An **incomplete** retry must match both the immutable content hashes and the
baseline hash; a changed draft/publication/catalog/reconciliation baseline
requires a new operation ID. A **completed** operation replay ignores the
baseline hash (the successful operation itself changed the draft/publication
baseline) and returns the stored result when the immutable content intent
matches. It takes a fresh backup of the current draft before any unfinished
replacement and rechecks the current draft revision and published versions
inside the final transaction. If an operator changed the draft between attempts,
review a fresh dry-run first; replacement still requires `--replace-draft` and
the fresh backup.

The journal records `PLANNED`, `BACKED_UP`, media/campaign/blog per-record start
and completion states, `MEDIA_READY`, `CAMPAIGNS_READY`, `BLOG_DRAFTS_READY`,
`MEDIA_ORPHAN_VERIFIED`, `MEDIA_CONFLICT`, `PUBLICATION_COMMITTED`,
`COMPLETED`, and `FAILED` with a reason. A completed operation returns its
stored publication/draft result when the same immutable intent is presented;
reusing the ID with different content, assets, identity, mode or acknowledgement
fails closed. A blocked apply is rejected before creating or mutating journal
state; after fixing approvals or content, a new operation ID is required when
the intent changes.

### Atomic publication completion

Publication creation and authoritative journal completion share one database
commit boundary. The final transaction locks the journal row, creates the
publication with `HomepagePublication.demoSeedOperationId = operationId`, writes
the terminal journal state/publication ID/version/draft revision/result, and
commits once. A crash after commit leaves the journal `COMPLETED`; a retry
returns the stored result. A transaction failure rolls back both the
publication and the journal completion. A unique index on
`demoSeedOperationId` makes a second publication for the same operation
impossible even if application logic regresses.

### Concurrency and publication history

- The draft's `revision` is recorded during planning and rechecked while holding
  the draft row lock.
- Apply aborts if the draft revision changed after planning.
- If no draft existed during planning, apply aborts if a non-empty draft
  appeared.
- The set of `PUBLISHED` publication versions is recorded during planning and
  rechecked inside the final transaction.
- Draft replacement, blog activation, optional publication, media eligibility
  reconciliation and journal completion share the final transaction using the
  existing homepage source validation and lifecycle locks.
- The final transaction locks and revalidates the exact blog rows, activates
  eligible approved articles, and only then builds the exact snapshot from the
  transaction's now-published blog state. It derives the visible media set from
  that snapshot and requires it to match the planned media set. The affected-media
  check uses that exact visible set.
- Publication history is append-only; an existing published version is marked
  `SUPERSEDED`, never deleted.
- Publishing requires both the publish confirmation environment and the
  explicit publication acknowledgement flag.
- Demo blog articles are created as drafts. The final transaction locks the
  exact blog rows `FOR UPDATE`, re-reads and revalidates title, slug, excerpt,
  body, cover, author, meta title/description, category and ownership, then
  activates only `publish:true` articles. Snapshot construction runs after this
  activation inside the same transaction, so `BLOG_FEATURE` sees the intended
  published state without an independent commit. A failure rolls their status
  back and leaves no newly public article. This closes the admin-edit race
  between the earlier ownership check and activation.
- `publish:false` articles are rejected by the planner while the current
  homepage BLOG_FEATURE contract requires published posts. This prevents the
  homepage from referencing a post that would remain unpublished.
- An already-published demo article is never mutated before the final
  transaction. If its title, excerpt, body, cover, author, meta fields,
  category or slug differs from the manifest, apply aborts with an explicit
  conflict and requires a separately reviewed unpublish/republish workflow.
  Unchanged published articles may be reused and re-affirmed in the final
  transaction.
- Media reconciliation is exact: the plan lists every currently published media
  ID that would lose `publishedAt`, including soft-deleted and non-demo rows.
  Apply holds the campaign-then-media lifecycle locks, re-reads the set, aborts
  if it differs, and requires `HOMEPAGE_DEMO_MEDIA_ACK_IDS` to match the exact
  acknowledged set. A plan-time zero is never authorization for a future
  destructive operation. Normal homepage publication, activation, rollback,
  media metadata update and media soft-delete take the same lifecycle locks;
  media uploads create rows with `publishedAt = null` and therefore cannot add a
  matching row.
- Partial unique indexes prevent duplicate demo campaign/internal names and
  demo media display names. The migration aborts with a clear diagnostic if
  historical duplicates already exist; it does not delete or rewrite them.

## Ownership and idempotency

Demo records are identified using existing schema fields:

| Record | Ownership marker |
|---|---|
| Campaign | `internalName` starts with `homepage-demo:` and `createdBy = homepage-demo-seed` |
| Blog post | slug starts with `homepage-demo-` and `createdBy = homepage-demo-seed` |
| Merch media | display name starts with `homepage-demo-` and `createdBy = homepage-demo-seed` |

If a record with the expected marker exists but has a different creator, is
duplicated, or has a non-demo `updatedBy`, the plan reports ambiguous/manual
ownership and blocks apply. Non-demo records are never deleted or silently
modified. An archived demo-owned campaign is also rejected rather than
unarchived or overwritten; resolve it through a separate reviewed workflow.

Re-running the operation reuses owned campaigns/media and updates owned records
instead of creating duplicates. The database lease and partial unique indexes
prevent two applies from both passing the check. A media row is reused only when:
the approved source asset exists and its SHA-256 matches the immutable intent;
the row's persisted `sourceSha256` matches; persisted `processedSha256` and
`thumbnailSha256` exist; and the actual stored main/thumbnail bytes match those
hashes and the recorded main size. Ownership, filename, storage key or object
existence alone is not content identity. A missing source, missing provenance,
missing binary or byte mismatch fails closed and requires inspection; nothing is
automatically deleted or replaced.

The operation journal records durable progress. A failed apply can leave
already-created demo media/campaign/blog records behind; they are demo-owned and
retry-safe. The draft and publication state changes are transactional.

A media binary written before its database row is handled with deterministic
operation/asset storage keys under
`merchandising/demo/<operation-hash>/<asset-key>.<ext>` and `.thumb.webp`. On
retry the tool:

1. reads the recorded deterministic key and the approved source/artifact
   provenance from the journal/intent and persisted row;
2. asks the real storage adapter for the main and thumbnail objects;
3. compares the stored main bytes with the recorded processed hash and size;
4. compares the stored thumbnail bytes with the recorded thumbnail hash;
5. reuses the actual main and thumbnail keys and continues the fenced database
   write when all checks match;
6. fails closed and records `MEDIA_CONFLICT` when source, provenance or bytes
   differ;
7. retains ambiguous binaries and requires manual inspection when they cannot
   be verified.

When a thumbnail already exists and is verified, the new database row stores the
actual `thumbnailKey`; it is not left null. Journal `MEDIA_WRITTEN` and
`MEDIA_ORPHAN_VERIFIED` steps record the actual keys used; reused rows record
their existing keys, not a newly calculated key that was never used.

Manifest asset keys are validated against a safe path-segment allow-list before
temporary filenames or storage keys are constructed. Operation IDs never appear
directly in storage paths; they are hashed into the operation segment.

`LocalDiskMediaStorage` now provides an atomic create-if-absent write using a
unique temporary sibling plus a hard link (`link` fails with `EEXIST` instead
of replacing an existing key). The implementation verifies content before and
after the write and never rewrites a key whose bytes differ. If the storage
filesystem cannot support hard-link semantics, the write fails closed. Processing
that is not byte-deterministic across retries can produce a conflict; that is
reported as manual recovery rather than destructive cleanup. No automatic
cleanup of an ambiguous binary occurs. A `MEDIA_CONFLICT` journal cannot be
resumed automatically; inspect the recorded key and use a new operation ID only
after the conflict is resolved. Reuse is not authorization to overwrite a
manual edit.

The SS-245 post
`azmvn-ss-245-rahnmay-khryd-mavs-gymyng` is never touched. Its continued
publication requires explicit approval in the register.

## Content manifest and approvals

The manifest is `manifest.ts`. It defines:

- all nine section types in order;
- six demo campaigns;
- seven media asset slots (four hero + three blog covers);
- three demo blog articles;
- the 13-item approval register.

`DEMO_APPROVALS` is the auditable approval register and stays pending until
business sign-off. The exported `DEMO_SEED_MANIFEST` carries the reviewed demo
decisions and approved content; regression tests assert both states. Any
unreviewed placeholder copy is clearly marked `PENDING APPROVAL`; the reviewed
manifest contains no delivery, authenticity, warranty or support claims. Do not
mark an approval approved without explicit business sign-off.

Content completeness is validated independently of the approval booleans.
`PENDING APPROVAL`, placeholder/TODO/TBD markers, unresolved template tokens,
empty required copy and unresolved section references block apply even when every
approval is true. Generic section labels are permitted presentation chrome;
campaign-specific copy, trust claims and editorial content are not treated as
approved until the actual content is supplied.

Required decisions:

1. hero assets versus existing product photography;
2. three demo articles and covers;
3. browser-accessible cover URL strategy;
4. replacing the current draft (with backup);
5. superseding the current published homepage while retaining history;
6. media reconciliation acknowledgement;
7. whether `CALL_FOR_PRICE` may appear in `READY_TO_SHIP`;
8. exact trust-strip claims;
9. campaign copy and schedule;
10. one-off Docker execution method;
11. final storefront demo;
12. public API base URL;
13. retention of the SS-245 test post.

## Product candidates

The planner reuses the current public catalog resolver contracts. It reports:

- up to eight newest eligible in-stock published products for READY_TO_SHIP;
- top-published categories for discovery/spotlight;
- top-published brands and their newest products for brand showcase;
- explicit manifest product slugs for deliberately curated campaigns.

No database IDs are hardcoded; curated selections reference public product slugs
and are re-resolved at plan time. A selected product that is missing,
unpublished or out of stock blocks apply. No catalog rows are modified. If a
candidate is `CALL_FOR_PRICE`, apply is blocked until the corresponding approval
is granted. If fewer than eight candidates exist, the plan warns; zero candidates
block.

## Media and public URLs

Place approved assets in the host directory (or override with
`HOMEPAGE_DEMO_ASSETS_DIR`):

```text
apps/api/.data/homepage-demo-assets/
```

The manifest expects the filenames listed in `manifest.media`. During planning
the tool resolves the approved root with `realpath`, rejects absolute/traversal
paths, symlinked files and symlinked parents, requires a regular file, applies a
10 MiB cap, opens the file with `O_NOFOLLOW`, and records its size and SHA-256.
Apply opens the same path with `O_NOFOLLOW`, rechecks size/hash against the plan,
and writes the verified bytes to a fresh exclusive temp file before upload. A
replaced file aborts. Parent-directory replacement between inspection and copy
remains a residual platform limitation; the final-component `O_NOFOLLOW` check
and plan hash are the practical mitigations.

`HOMEPAGE_DEMO_PUBLIC_API_BASE_URL` must be an absolute HTTP(S) origin reachable
by a customer browser. The tool rejects:

- `localhost`, `127.*`, `::1`;
- Compose service names such as `api`;
- `.local` names and private IPv4 ranges;
- URLs with embedded credentials, query strings or fragments.

For a local demo, a loopback hostname such as
`http://127.0.0.1.sslip.io:3000/api/v1` keeps stored media URLs browser-valid
without weakening the URL guard. It is a development convenience, not a
production origin.

Blog cover URLs use:

```text
<public-api-base>/catalog/merch-media/<media-id>
```

Merchandising media is only publicly served after publication sets
`publishedAt`. Upload or campaign attachment alone does not make it public.
Public product and merchandising media responses set
`Cross-Origin-Resource-Policy: cross-origin` so the separately hosted storefront
can embed them; the rest of the API keeps Helmet's same-origin default.

Media storage identity is deterministic per operation and manifest asset slot:

```text
merchandising/demo/<sha256(operationId)[0..20]>/<asset-key>.<ext>
merchandising/demo/<sha256(operationId)[0..20]>/<asset-key>.thumb.webp
```

The operation segment prevents one operation from overwriting another
operation's binary. The asset key is validated as a safe path segment. On retry
the adapter is asked to read the exact key; identical bytes are reused,
different bytes fail closed, and an unverifiable binary is retained for manual
recovery. The journal distinguishes `MEDIA_UPLOAD_STARTED`, `MEDIA_WRITTEN`,
`MEDIA_ORPHAN_VERIFIED`, `MEDIA_CONFLICT` and `FAILED`. There is no automatic
delete of an ambiguous binary.

The manifest attaches blog cover media to the spotlight campaign's `EDITORIAL`
media slots so the existing publication snapshot/media-eligibility gate makes
those covers public. The spotlight renderer does not display campaign media; the
attachment exists only to put the covers inside the publication gate. Demo blog
articles are created as drafts and activated near the start of the final
publication transaction, before snapshot construction; draft-only apply with the
demo blog feature is therefore blocked. If any later step fails, the blog
activation and all other changes roll back together.

Before publication, the plan lists every currently published media row that
would lose `publishedAt`, including soft-deleted and non-demo rows. Copy the exact
IDs into `HOMEPAGE_DEMO_MEDIA_ACK_IDS`. Duplicate, missing, extra or malformed
IDs fail closed. In the final transaction the tool holds
the campaign-then-media lifecycle locks, builds the exact snapshot, derives the
visible media set, and re-reads every currently published row. The affected set
must match both the plan and the acknowledgement exactly; otherwise the
transaction aborts before any publication mutation. A plan-time count of zero is
never authority for a later destructive reconciliation.

Normal homepage publication, activation, rollback, media metadata update and
media soft-delete participate in the same lifecycle locks. Media upload creates
rows with `publishedAt = null`, so it cannot inject an unacknowledged published
row. Raw SQL or future writers that bypass these services are outside the
application locking contract and must be reviewed separately.

Public retrieval and thumbnail delivery were verified by the isolated
PostgreSQL/storage suite: a published, non-deleted row streams the exact stored
bytes and its thumbnail, while an unpublished row, a soft-deleted row and a
published row whose binary is missing all return the service's 404 domain
error. The HTTP controller delegates directly to these service methods.

## Safe one-off Docker execution

The API Compose CMD normally runs Prisma generation, migrations, normal seeding
and the dev server. **Never start the normal API service for this operation.**

Run only the API image with an explicit command override. The image normally
generates Prisma in its CMD; because the CMD is bypassed, run only
`prisma:generate` first (schema-only, no database mutation), then the demo
command.

For identity:

```bash
docker compose run --rm --no-deps \
  -e NODE_ENV=development \
  api sh -lc 'pnpm --filter @sabz/api prisma:generate && pnpm --filter @sabz/api homepage:demo-seed identity'
```

For dry-run:

```bash
docker compose run --rm --no-deps \
  -e NODE_ENV=development \
  -e HOMEPAGE_DEMO_PUBLIC_API_BASE_URL=https://shop.example.com/api/v1 \
  api sh -lc 'pnpm --filter @sabz/api prisma:generate && pnpm --filter @sabz/api homepage:demo-seed dry-run'
```

For apply, add all required confirmations and flags from the section above,
including a stable `HOMEPAGE_DEMO_OPERATION_ID` and the exact
`HOMEPAGE_DEMO_MEDIA_ACK_IDS` when the plan lists affected media. The guard
migration must already be deployed by the normal deployment pipeline; this
one-off command must never run migrations.

The command override prevents the image CMD from running migrations or
`prisma:seed`. `--no-deps` assumes PostgreSQL and Redis are already running; it
does not start or recreate them.

Local host runs likewise require a generated Prisma client:

```bash
pnpm install
pnpm --filter @sabz/api prisma:generate
pnpm --filter @sabz/api homepage:demo-seed identity
```

Do not run these commands as part of automated tests.

## Tests

```bash
pnpm --filter @sabz/api test -- demo-seed
pnpm --filter @sabz/api typecheck
pnpm --filter @sabz/api lint
pnpm --filter @sabz/api build
```

The final repository validation on 2026-11-17 passed:

- API unit tests: **152 suites, 1815 tests**;
- API typecheck, lint and build;
- root workspace typecheck, lint and tests;
- root workspace build with the required storefront build environment
  (`NEXT_PUBLIC_API_BASE_URL` and `API_INTERNAL_BASE_URL`); without those
  variables `next.config.ts` refuses to build, which is an existing storefront
  configuration requirement unrelated to this change.

Unit tests cover fingerprint determinism, environment/confirmation guards,
public URL validation, backup exact schema/section validation, temporary-file
permissions/finalization, path traversal/symlink/root containment, asset
traversal/symlink/size/change detection, journal state transitions, changed
intent/baseline and completed replay handling with fakes, fence-bound completion
without a fence, media provenance hashes/bytes/thumbnails, draft/publication/
blog/media reconciliation guards, per-article publish blockers, ownership and
idempotency, placeholder-content blockers, canonical authorization bindings,
all nine section types, migration static atomicity/ordering and orchestration
order. The DB-free harness suite in `jest-demo-seed-harness.json` separately
covers exact integration target matching (host, port, database, username,
URL encoding and missing configuration) and best-effort cleanup orchestration,
including primary-failure preservation and exact media-metadata restoration.
A transaction-aware gateway test also drives the real
`PrismaDemoSeedWriteGateway` final transaction and verifies blog activation
precedes snapshot construction, publication/journal completion, and rollback of
blog/draft state when publication creation fails. These are **unit/static
tests**, not PostgreSQL integration tests.

The dedicated PostgreSQL entry point is
`apps/api/test/jest-demo-seed-integration.json` with
`demo-seed-integration.setup.ts`. Its isolation guard runs **before** the shared
test-database setup can connect, create or migrate anything. It requires
`DEMO_SEED_INTEGRATION=1`, an explicit `TEST_DATABASE_URL`, and explicit
expected host, port, database name and username values. The database name must
end in `_test`, and an omitted port is normalized to PostgreSQL's default
`5432` before comparison. The general `test:integration` config excludes the
demo-seed suites so it cannot run them through the unsafe setup ordering.

The PostgreSQL suite was executed on 2026-11-17 against a dedicated disposable
PostgreSQL 16.15 container with a non-superuser database owner:

```text
host/port:       127.0.0.1:55432
database:        sabz_ss284b_20261117a_test
user:            ss284b_runner (NOSUPERUSER, NOCREATEDB, NOCREATEROLE)
system id:       7708886767470526508
database oid:    16389
server version:  16.15
```

All **20 tests passed**. The suite covers competing acquisition, database-clock
expiry, stale-owner mutation/journal/completion rejection, current-owner
success, a protected transaction holding the fence row while a contender waits,
partial unique indexes, read-only transactions, publication/journal atomic
commit, invalid publication binding rejection, same-operation replay,
changed-intent rejection, forced rollback, normal-publication-versus-demo-
reconciliation serialization, actual media-service provenance/orphan behavior,
real write-gateway media path, final blog row lock/validation and blog
activation rollback, a real fresh-apply success path through
`createPrismaDemoSeedWriteGateway` with real campaign/blog/media creation and
completed replay, and `DemoSeedService.apply` replay orchestration.

The real-gateway coverage was extended and passed with:

- a pre-existing operator draft backed up to a `0600` file and replaced;
- a forced PostgreSQL publication-insert failure that rolled back the draft
  revision and blog activation, left the journal `FAILED`, then a retry using
  the same journaled operation completed successfully;
- public media and thumbnail retrieval using real local-disk bytes, plus
  404 behavior for unpublished, soft-deleted and missing binaries;
- cleanup after a real partial apply, with an unrelated sentinel row preserved;
- exact restoration of a pre-existing draft, publication status/timestamp and
  media metadata after simulated mutations;
- two concurrent full applies where exactly one acquired the database lease and
  completed, the other received `DemoSeedLockUnavailableError`, and no
  duplicate campaign/blog/media/publication rows remained.

`apps/api/test/demo-seed-storage.integration-spec.ts` uses the real
`LocalDiskMediaStorage` under a temporary directory and is run through
`jest-demo-seed-storage.json` with no database global setup. The eight
environment-independent tests passed normally. A ninth opt-in test was executed
against a disposable 16 MiB FAT/vfat image mounted through a loop device inside
a privileged disposable container; it also passed, giving **9/9** in that
dedicated run. It covers deterministic key reuse, same-key same-content
idempotency, same-key different-content conflict, crash-orphan reuse, missing
binaries, traversal rejection, non-destructive conflict handling, and fail-closed
behavior when atomic hard-link creation is unavailable. In the real-vfat run,
`stat -f` reported `fs_type=msdos` and the mount was `type vfat`; a direct
`ln` failed with `Operation not permitted`, and the storage adapter propagated
the failure without creating the target key or deleting the source bytes.

The PostgreSQL suite was executed twice consecutively on the final code in a
fresh disposable environment (`20261117b`, database
`sabz_ss284b_20261117b_test`, system id `7708893078228234284`, OID `16385`) and
previously twice more (`run12`, `run13`); every run passed 20/20 and left zero
`HomepageDraft`, `HomepageDemoSeedOperation`, `HomepagePublication`,
`MerchCampaign`, `MerchMedia`, `BlogPost`, `Category`, `Brand`, `Product`,
`ProductVariant`, `InventoryItem` and `Warehouse` rows. The storage suite was
also rerun. The pre-existing draft, publication and media metadata restoration
assertions executed and passed.

The [SS-284B Isolated PostgreSQL and Storage Execution Plan](homepage-demo-seed-isolated-integration-plan.md)
documents the safety controls used for this execution. It does not authorize
future runs against shared, staging or production systems.

Reproduction commands (placeholders only):

```bash
# PostgreSQL suite. Only with an isolated disposable test database; never the
# shared development database. The expected host/port/database/username values
# prevent an accidental target change and are checked before any DB setup.
DEMO_SEED_INTEGRATION=1 \
TEST_DATABASE_URL=postgresql://demo_seed_user:CHANGE_ME@postgres.internal.example:5432/sabz_disposable_test \
DEMO_SEED_EXPECTED_TEST_HOST=postgres.internal.example \
DEMO_SEED_EXPECTED_TEST_PORT=5432 \
DEMO_SEED_EXPECTED_TEST_DATABASE=sabz_disposable_test \
DEMO_SEED_EXPECTED_TEST_USER=demo_seed_user \
pnpm --filter @sabz/api test:integration:demo-seed

# Storage suite: temporary directories only; no database or shared volume.
pnpm --filter @sabz/api test:integration:demo-seed-storage

# Opt-in real linkless-filesystem test. Run inside an isolated privileged
# container with a disposable FAT/vfat image mounted at this path.
DEMO_SEED_LINKLESS_STORAGE_ROOT=/mnt/disposable-vfat \
  pnpm --filter @sabz/api test:integration:demo-seed-storage

# Guard/cleanup orchestration unit tests; no database or storage.
pnpm --filter @sabz/api exec jest --config ./test/jest-demo-seed-harness.json
```

Those commands reproduce the verified runs when pointed at a new, dedicated
disposable environment. They must not be pointed at shared, staging or
production systems.

## Residual risks and operator decisions

- **Asset parent-directory race:** `inspectAsset`/`copyVerifiedAsset` reject
  symlinked files and parents and verify size/SHA-256 before copying. Node has
  no portable `openat`-style directory-relative traversal here, so a local
  attacker who swaps a parent directory between validation and open could
  redirect the read. The hash prevents uploading different content unless the
  attacker can match the approved size/hash; the practical residual is an
  unauthorized local read into process memory, not publication of unapproved
  content.
- **Filesystem backup path race:** path checks and open are separate syscalls,
  as described above. Operator-local threat only.
- **Local storage conditional-create semantics:** the local adapter uses a
  copy-to-temporary plus hard-link create-if-absent. Filesystems that do not
  support hard links fail closed; this was exercised on a disposable FAT/vfat
  loopback mount where direct hard-link creation failed with `EPERM` and the
  storage adapter failed closed without creating the target. Normal retries are
  safe; non-deterministic processing is reported as `MEDIA_CONFLICT`, not
  auto-repaired.
- **Local storage root trust:** `LocalDiskMediaStorage` containment is lexical;
  a symlink planted inside the operator-controlled storage root is outside the
  application contract. The storage root and its permissions must be protected
  like any other server-side media volume.
- **Raw SQL / future writers:** media reconciliation depends on every
  `publishedAt` writer participating in the campaign-then-media advisory locks.
  All current application writers do. A future or ad-hoc raw SQL writer must be
  reviewed against this contract.
- **Integration execution:** the PostgreSQL and storage integration suites were
  executed successfully against the isolated disposable environment described
  above. This evidence covers live lock ordering, real gateway apply/rollback/
  replay, public retrieval and migration deployment. It does not replace
  rehearsal against the actual target deployment topology or its exact
  PostgreSQL/extension configuration.
- **Migration runner transaction evidence:** the guard migration was verified by
  two separate disposable-database experiments. Direct `psql` execution of a
  copied migration with an injected failure exited nonzero and left the lock/
  journal tables, publication column, provenance columns and partial indexes
  absent. Prisma 6.19.3 `migrate deploy` of a copied migration failed with
  `P3018`/`42601`, rolled back the preceding DDL, and recorded an unfinished
  `_prisma_migrations` row with `finished_at = NULL` and
  `applied_steps_count = 0`. The repository migration checksum
  (`8c4fdb1db3678c9ba3504fbf81ed2309cc080a8630a21676070b8859c80bc3b9`) was
  unchanged and matches the applied migration record.
- **Legacy media provenance:** existing demo media rows created before the
  provenance columns have null hashes and are intentionally not reusable. They
  require inspection/recreation; the migration does not backfill or delete
  them.
- **Completed replay:** a completed replay requires the same immutable content
  intent, including asset hashes/existence. Removing or changing approved source
  files after success can prevent replay even though the publication result is
  stored; use the stored result for audit and a new operation for new content.
- **Approvals:** all business/content approvals remain pending. Nothing in this
  implementation approves demo copy, images, claims or public URLs.

## Safety statement

Implementation and dry-run do not authorize apply. The current manifest is not
approved. A real demo population requires:

- explicit operator/business approval of the content decisions;
- approved asset files;
- a verified public API origin;
- a dry-run reviewed by the operator;
- the explicit apply confirmations and backup;
- separate authorization for publication and the storefront demonstration.
