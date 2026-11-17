# SS-284B Isolated PostgreSQL and Storage Execution Plan

**Status:** Executed on 2026-11-17 under separate authorization. Results are
recorded in section 13 and in
[homepage-demo-seed.md](homepage-demo-seed.md). The controls below remain the
required safety baseline for any future run.

**Scope:** PostgreSQL 16 migration/Prisma behavior, the real demo-seed PostgreSQL
integration suite, the isolated local-storage suite, cleanup and repeatability.
This document records the safety plan used for the authorized isolated run. It
does not authorize future connections to a database, creation or dropping of a
database, migration application, storage deletion, or integration tests.

**Repository:** `/home/mohammad/repos/sabz-system-ss284b`

**Branch:** `feat/homepage-demo-seed`

**Expected HEAD:** `f09848a293ef134cac836d23fd893bd83010897a`

---

## 1. Isolated environment specification

### PostgreSQL

- PostgreSQL **16.x**.
- A dedicated, disposable PostgreSQL instance, or a dedicated database on a
  separately controlled disposable instance. Never the shared development,
  staging or production database.
- Run-scoped database name:

  ```text
  sabz_ss284b_<RUN_ID>_test
  ```

  `RUN_ID` must match:

  ```text
  ^[a-z0-9][a-z0-9_-]{0,31}$
  ```

- Dedicated login role. Do not reuse the shared application role.
- Dedicated password. Do not reuse development credentials.
- The role must be able to:
  - connect to the target database;
  - connect to the `postgres` maintenance database because
    `apps/api/test/test-database.setup.ts` checks/creates the target there;
  - apply the migration DDL (database owner or equivalent privileges);
  - execute `pg_control_system()`, or have that `EXECUTE` privilege granted;
  - create the `pg_trgm` extension, or use an administrator-provisioned
    extension and a migration path proven under the test role.
- Prefer an administrator-created database and pre-created `pg_trgm` extension
  over granting broad cluster privileges to the test role.
- The cleanup administrator must be able to terminate target sessions and drop
  the target database. `pg_terminate_backend` needs superuser,
  `pg_signal_backend`, or equivalent privilege. `DROP DATABASE` needs the
  database owner or superuser.

### Storage roots

Use a fixed, canonical base outside the repository and outside Compose/shared
volumes:

```text
/tmp/ss284b-isolated
```

Per-run roots:

```text
/tmp/ss284b-isolated/<RUN_ID>/assets
/tmp/ss284b-isolated/<RUN_ID>/media
/tmp/ss284b-isolated/<RUN_ID>/media-tmp
/tmp/ss284b-isolated/<RUN_ID>/backups
/tmp/ss284b-isolated/<RUN_ID>/evidence
/tmp/ss284b-isolated/<RUN_ID>/secrets
```

Requirements:

- Same UID as the test process.
- Directory mode `0700`.
- No shared Compose media volume.
- Filesystem must support hard links for
  `LocalDiskMediaStorage.putFileExclusive`; filesystems without hard links must
  fail closed, not silently overwrite.
- At least 2 GiB free space recommended.
- `sharp` native binary available.
- `ffmpeg` is optional for the current image-only demo manifest, but the gateway
  constructor resolves an FFmpeg binary path; image tests do not invoke it.

### Tooling

- Node.js **20+**; Node 22 LTS preferred.
- pnpm **11.3.0**.
- Prisma CLI and Client **6.19.3**.
- TypeScript/Jest/ts-jest from the workspace lockfile.
- `sharp` **0.35.4**.
- PostgreSQL 16 `psql` client for identity/schema verification.
- Generated Prisma Client before test execution:

  ```bash
  pnpm install --frozen-lockfile
  pnpm --filter @sabz/api prisma:generate
  ```

---

## 2. Required environment

Use placeholders only in retained documentation or shell history:

```bash
export RUN_ID=20261117_01

export NODE_ENV=test
export DEMO_SEED_INTEGRATION=1

export DEMO_SEED_TEST_HOST=pg-ss284b-disposable.example
export DEMO_SEED_TEST_PORT=5432
export DEMO_SEED_TEST_DATABASE="sabz_ss284b_${RUN_ID}_test"
export DEMO_SEED_TEST_USER=demo_seed_runner
export DEMO_SEED_TEST_PASSWORD=CHANGE_ME

export TEST_DATABASE_URL="postgresql://${DEMO_SEED_TEST_USER}:${DEMO_SEED_TEST_PASSWORD}@${DEMO_SEED_TEST_HOST}:${DEMO_SEED_TEST_PORT}/${DEMO_SEED_TEST_DATABASE}"
export DATABASE_URL="$TEST_DATABASE_URL"

export DEMO_SEED_EXPECTED_TEST_HOST="$DEMO_SEED_TEST_HOST"
export DEMO_SEED_EXPECTED_TEST_PORT="$DEMO_SEED_TEST_PORT"
export DEMO_SEED_EXPECTED_TEST_DATABASE="$DEMO_SEED_TEST_DATABASE"
export DEMO_SEED_EXPECTED_TEST_USER="$DEMO_SEED_TEST_USER"

export PRODUCT_MEDIA_STORAGE_DRIVER=local
export PRODUCT_MEDIA_STORAGE_DIR="/tmp/ss284b-isolated/${RUN_ID}/media"
export PRODUCT_MEDIA_TEMP_DIR="/tmp/ss284b-isolated/${RUN_ID}/media-tmp"
export HOMEPAGE_DEMO_ASSETS_DIR="/tmp/ss284b-isolated/${RUN_ID}/assets"
export HOMEPAGE_DEMO_BACKUP_DIR="/tmp/ss284b-isolated/${RUN_ID}/backups"

unset STOREFRONT_REVALIDATE_URL
unset STOREFRONT_REVALIDATE_TOKEN
```

Requirements:

- If the password contains URL-reserved characters, percent-encode it inside
  `TEST_DATABASE_URL`.
- Do not put credentials in command arguments or retained logs.
- `DATABASE_URL` must point at the same disposable target so no tool can fall
  back to a development URL.
- `NODE_ENV=test` is for Jest. The demo fixture explicitly sets its own
  `nodeEnv: development` options; the CLI is not involved in the suite.
- The integration tests create temporary asset/storage/backup roots internally;
  these environment roots are reserved for any separately authorized manual or
  CLI-adjacent checks.

---

## 3. PostgreSQL privilege assumptions and verification

Do not assume that `GRANT EXECUTE` solves every restricted operation.

| Requirement | Why it is needed | Verification | Elevated operation? |
|---|---|---|---|
| `pg_trgm` extension | Migration `20260924000000_ss_216_pg_trgm_search/migration.sql` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` | `SELECT installed_version FROM pg_available_extensions WHERE name='pg_trgm';` and `SELECT extname FROM pg_extension WHERE extname='pg_trgm';` | Yes. Extension creation requires superuser or equivalent; pre-create as administrator or use an extension-capable disposable role. A grant alone is not a general substitute. |
| `pg_control_system()` | `apps/api/src/modules/merchandising/demo-seed/identity.ts` reads `system_identifier` | `SELECT has_function_privilege(current_user, 'pg_control_system()', 'EXECUTE');` and a read-only identity query | Depends on deployment. PostgreSQL 16 documents control-data functions; verify rather than assuming PUBLIC execution. If unavailable, grant `EXECUTE` on the function or use an approved elevated disposable role. |
| Migration DDL | Tables, indexes, constraints, functions and columns | `has_database_privilege(current_user, current_database(), 'CREATE')`; verify schema ownership/privileges | Database owner or equivalent. `CREATE EXTENSION` remains separately elevated. |
| `CREATE DATABASE` | `test-database.setup.ts` creates a missing target database | `SELECT rolcreatedb FROM pg_roles WHERE rolname=current_user;` | Requires `CREATEDB`; alternatively pre-create the database. |
| Connect to `postgres` maintenance database | Setup checks/creates the target via a `postgres` connection | `SELECT has_database_privilege(current_user, 'postgres', 'CONNECT');` | Connection privilege; must be granted if using that setup path. |
| `pg_terminate_backend` | Destructive cleanup must terminate only target sessions | Verify `pg_signal_backend` membership or superuser | Elevated; use the disposable administrator. |
| `DROP DATABASE` | Final disposal | Database owner or superuser; verify exact target first | Elevated/destructive. |

Sources inspected:

- `apps/api/prisma/migrations/20260924000000_ss_216_pg_trgm_search/migration.sql`
  explicitly documents the `CREATE EXTENSION pg_trgm` privilege requirement.
- `docs/03-architecture/architecture-decisions/ADR-006-postgres-persian-search.md`
  records the same extension privilege policy.
- `apps/api/src/modules/merchandising/demo-seed/identity.ts` calls
  `pg_control_system()`.
- `apps/api/test/test-database.setup.ts` connects to `postgres`, optionally
  creates the database, and runs `prisma migrate deploy`.
- PostgreSQL 16 documentation for control-data functions and predefined roles
  (`pg_signal_backend`, `pg_read_all_settings`) is the basis for the privilege
  checks above. These checks are plan requirements, not claims that the current
  deployment role already has them.

If the test role must be elevated, document the exact role membership or
function/database grant and why. Prefer a dedicated disposable instance over
granting privileges to a shared account.

---

## 4. Migration procedure

### 4.1 Clean database initialization

Create the database using a dedicated administrator connection. Do not use a
shared database merely because its name ends in `_test`.

```bash
PGPASSFILE="$ISOLATED_PGPASS" createdb \
  -h "$DEMO_SEED_TEST_HOST" \
  -p "$DEMO_SEED_TEST_PORT" \
  -U "$DEMO_SEED_TEST_USER" \
  "$DEMO_SEED_TEST_DATABASE"
```

If the administrator role differs:

```bash
PGPASSFILE="$ADMIN_PGPASS" createdb \
  -h "$DEMO_SEED_TEST_HOST" \
  -p "$DEMO_SEED_TEST_PORT" \
  -U "$ISOLATED_ADMIN_USER" \
  -O "$DEMO_SEED_TEST_USER" \
  "$DEMO_SEED_TEST_DATABASE"
```

`createdb` uses the password file; do not put a password in the command line.
The database name must match the run-scoped pattern exactly.

### 4.2 Identity verification before migration

Plan-only SQL:

```sql
SELECT
  current_database(),
  current_user,
  (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
  (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid,
  current_setting('server_version');
```

Record the result with the approved disposable-instance record. Verify exact
host, port, database and username through the test guard. Do not proceed if the
target is not the recorded disposable instance.

### 4.3 Apply migrations

Use only `prisma migrate deploy`; never `prisma migrate dev` against the shared
environment.

```bash
DATABASE_URL="$TEST_DATABASE_URL" \
  pnpm --filter @sabz/api exec prisma migrate deploy
```

All migrations in `apps/api/prisma/migrations`, including the untracked guard
migration, are applied. `test-database.setup.ts` also invokes `migrate deploy`
when the guarded Jest suite starts; pre-applying and letting setup re-run is
idempotent, but record which process applied the schema.

### 4.4 Schema verification

```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';

SELECT to_regclass('public."HomepageDemoSeedLock"') AS lock_table,
       to_regclass('public."HomepageDemoSeedOperation"') AS journal_table;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN (
  'HomepageDemoSeedLock',
  'HomepageDemoSeedOperation',
  'MerchMedia',
  'HomepagePublication'
)
AND column_name IN (
  'ownerToken','fencingGeneration','leaseExpiresAt','operationId',
  'state','planHash','intentHash','baselineHash','result',
  'publicationId','publicationVersion','draftRevision',
  'sourceSha256','processedSha256','thumbnailSha256',
  'demoSeedOperationId'
)
ORDER BY table_name, ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN (
  'HomepageDemoSeedOperation',
  'HomepagePublication',
  'MerchCampaign',
  'MerchMedia'
)
ORDER BY tablename, indexname;

SELECT conname, contype
FROM pg_constraint
WHERE conrelid IN (
  'public."HomepageDemoSeedOperation"'::regclass,
  'public."HomepagePublication"'::regclass
)
ORDER BY conname;

SELECT count(*) AS unfinished_migrations
FROM "_prisma_migrations"
WHERE finished_at IS NULL;
```

Required assertions:

- `pg_trgm` is installed.
- Lock and journal tables exist.
- Journal fields, `baselineHash`, publication link, draft revision and media
  arrays exist.
- `MerchMedia.sourceSha256`, `processedSha256`, `thumbnailSha256` exist.
- Publication/journal unique indexes and restrictive FK exist.
- `HomepageDemoSeedOperation_state_startedAt_idx` exists.
- Partial unique indexes for demo campaign names and media names exist.
- No unfinished migrations remain after a successful clean deploy.

### 4.5 Two distinct rollback experiments

These experiments answer different questions. Do not substitute one for the
other.

#### Experiment A — Direct PostgreSQL transaction behavior

Purpose: prove that PostgreSQL rolls back the guard migration's DDL when the
migration SQL's explicit `BEGIN; ... COMMIT;` block fails.

Procedure:

1. Use a separate disposable database `sabz_ss284b_<RUN_ID>_direct_test`.
2. Apply all migrations **before** the guard migration. Use a temporary copy of
   the Prisma directory with the guard migration removed:

   ```bash
   TMP_PRISMA=$(mktemp -d /tmp/ss284b-prisma-direct-XXXXXX)
   cp -a apps/api/prisma/. "$TMP_PRISMA/"
   rm -rf "$TMP_PRISMA/migrations/20261115190000_homepage_demo_seed_guardrails"

   DATABASE_URL="$DIRECT_DATABASE_URL" \
     pnpm --filter @sabz/api exec prisma migrate deploy \
     --schema "$TMP_PRISMA/schema.prisma"
   ```

3. Copy the guard migration into the temporary directory and modify **only the
   copy** to insert a deterministic invalid statement after the successful
   lock-table creation:

   ```bash
   cp -a \
     apps/api/prisma/migrations/20261115190000_homepage_demo_seed_guardrails \
     "$TMP_PRISMA/migrations/"
   sed -i '/CREATE TABLE "HomepageDemoSeedOperation"/i THIS IS A FORCED DDL FAILURE;' \
     "$TMP_PRISMA/migrations/20261115190000_homepage_demo_seed_guardrails/migration.sql"
   ```

4. Execute the copied migration with `psql -v ON_ERROR_STOP=1 -f`. Do not use
   Prisma for this experiment.

5. Verify:
   - command exits nonzero;
   - `HomepageDemoSeedLock` is absent;
   - `HomepagePublication.demoSeedOperationId` is absent;
   - `MerchMedia.sourceSha256` and the other provenance columns are absent;
   - no partial guard indexes/FK remain.

Claim proved by A: **PostgreSQL's explicit transaction rolls back the guard DDL
when the script is executed directly with an error in the transaction.** It does
not prove Prisma migration-runner behavior.

#### Experiment B — Prisma 6.19.3 migration-runner behavior

Purpose: prove how `prisma migrate deploy` itself executes and records a guard
migration that fails after an earlier DDL statement succeeds.

Procedure:

1. Use a separate disposable database
   `sabz_ss284b_<RUN_ID>_runner_test`.
2. Copy the complete Prisma directory to a temporary location.
3. Remove the guard migration from the copy and apply all preceding migrations
   with `prisma migrate deploy` using the temporary schema.
4. Copy the original guard migration into the temporary migration directory and
   inject the same deterministic invalid statement into **only the copied
   guard migration**, after the lock table creation and before the operation
   table creation.
5. Run:

   ```bash
   DATABASE_URL="$RUNNER_DATABASE_URL" \
     pnpm --filter @sabz/api exec prisma migrate deploy \
     --schema "$TMP_PRISMA/schema.prisma"
   ```

6. Capture the exit status and stdout/stderr without credentials.
7. Query `_prisma_migrations`:

   ```sql
   SELECT migration_name,
          started_at,
          finished_at,
          rolled_back_at,
          applied_steps_count,
          logs
   FROM "_prisma_migrations"
   WHERE migration_name LIKE '%homepage_demo_seed_guardrails%'
      OR finished_at IS NULL
   ORDER BY started_at;
   ```

   Distinguish:
   - successfully applied: `finished_at IS NOT NULL`;
   - unfinished/failed: `finished_at IS NULL`;
   - explicitly rolled back: `rolled_back_at IS NOT NULL`.
8. Verify the preceding successful DDL was rolled back:
   - `to_regclass('public."HomepageDemoSeedLock"')` must be `NULL`;
   - `HomepagePublication.demoSeedOperationId` must not exist;
   - `MerchMedia` provenance columns must not exist.
9. Do not run `prisma migrate resolve`; discard the runner database and
   temporary directory after capturing evidence.

Claim proved by B: **The actual Prisma 6.19.3 migration runner's behavior for
this file, including its transaction framing and `_prisma_migrations` state.**
It is the decisive experiment for the production migration path.

If B leaves the lock table committed while reporting failure, the claim that
the guard migration is atomic under Prisma is **not verified**. Do not proceed to
Stage B on that database.

The actual repository migration must remain untouched. Record its SHA-256
before and after the experiment and verify it is unchanged.

### 4.6 Migration failure diagnosis

Retain:

- the exact command and redacted environment;
- `prisma migrate deploy` exit code and redacted stdout/stderr;
- `_prisma_migrations` rows for failed/unfinished/applied migrations;
- PostgreSQL server log excerpt;
- schema queries before/after;
- direct-SQL and Prisma-runner outcomes separately;
- the unchanged SHA-256 of the repository migration.

A failed or partially migrated disposable database is discarded, not repaired
in place.

---

## 5. Destructive database cleanup safeguards

No general-purpose cleanup script is required. Use a documented, fail-closed
manual procedure.

### 5.1 Required variables and validation

```bash
RUN_ID=<validated run id>
DEMO_SEED_TEST_HOST=<non-empty>
DEMO_SEED_TEST_PORT=<integer 1..65535>
DEMO_SEED_TEST_DATABASE="sabz_ss284b_${RUN_ID}_test"
DEMO_SEED_TEST_USER=<non-empty>
ISOLATED_ADMIN_USER=<non-empty>
ISOLATED_ADMIN_PASSWORD_FILE=<exact temp password-file path>
RECORDED_SYSTEM_IDENTIFIER=<recorded pg_control_system value>
RECORDED_DATABASE_OID=<recorded target database OID>
SS284B_DB_DROP_APPROVAL=<timestamped signed approval for this RUN_ID>
```

Refuse to continue unless:

- every variable is non-empty;
- `RUN_ID` matches `^[a-z0-9][a-z0-9_-]{0,31}$`;
- the database name equals `sabz_ss284b_<RUN_ID>_test` exactly;
- the port is an integer in `1..65535`;
- the target is not a known shared/development/staging/production name;
- the recorded disposable-instance identity exists.

Plan-only validation:

```bash
test -n "$RUN_ID"
test -n "$DEMO_SEED_TEST_HOST"
test -n "$DEMO_SEED_TEST_PORT"
test -n "$DEMO_SEED_TEST_DATABASE"
test -n "$DEMO_SEED_TEST_USER"
test -n "$ISOLATED_ADMIN_USER"
test -s "$ISOLATED_ADMIN_PASSWORD_FILE"
[[ "$RUN_ID" =~ ^[a-z0-9][a-z0-9_-]{0,31}$ ]]
case "$RUN_ID" in
  *[!a-z0-9_-]*) echo "Refusing: invalid RUN_ID"; exit 1 ;;
esac
[[ "$DEMO_SEED_TEST_PORT" =~ ^[0-9]+$ ]]
test "$DEMO_SEED_TEST_PORT" -ge 1
test "$DEMO_SEED_TEST_PORT" -le 65535
test "$DEMO_SEED_TEST_DATABASE" = "sabz_ss284b_${RUN_ID}_test"
```

### 5.2 Verify the administrative connection

Using the administrator password file, connect only to the designated
maintenance database (`postgres`) and run:

```sql
SELECT
  current_database(),
  current_user,
  (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
  current_setting('server_version');
```

Refuse to continue unless:

- `current_database()` is `postgres`;
- `current_user` is `ISOLATED_ADMIN_USER`;
- `system_identifier` equals `RECORDED_SYSTEM_IDENTIFIER`;
- the host and port match the approved disposable target.

A mismatch is a stop condition. Do not terminate sessions or drop anything.

### 5.3 Verify the target database

Connect to the exact target and run:

```sql
SELECT
  current_database(),
  current_user,
  (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
  (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid,
  current_setting('server_version');
```

Refuse to continue unless:

- `current_database()` is exactly `sabz_ss284b_<RUN_ID>_test`;
- the system identifier matches the recorded disposable instance;
- the database OID matches the recorded target OID;
- the target host/port/user match the approved values.

### 5.4 Terminate only target sessions

After the identity checks and immediately before deletion, require the separate
signed database-drop approval for this exact `RUN_ID`.

Use `psql` variable interpolation for the SQL literal:

```bash
PGPASSFILE="$ISOLATED_ADMIN_PASSWORD_FILE" psql \
  -h "$DEMO_SEED_TEST_HOST" \
  -p "$DEMO_SEED_TEST_PORT" \
  -U "$ISOLATED_ADMIN_USER" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -v db="$DEMO_SEED_TEST_DATABASE" \
  -c "SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = :'db'
        AND pid <> pg_backend_pid();"
```

`:'db'` is psql's SQL-literal quoting, not string interpolation by the caller.
Do not use a shell-built `WHERE datname = '$DB'` string.

### 5.5 Drop the database

Only after successful termination and approval:

```bash
PGPASSFILE="$ISOLATED_ADMIN_PASSWORD_FILE" psql \
  -h "$DEMO_SEED_TEST_HOST" \
  -p "$DEMO_SEED_TEST_PORT" \
  -U "$ISOLATED_ADMIN_USER" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -v db="$DEMO_SEED_TEST_DATABASE" \
  -c 'DROP DATABASE :"db";'
```

`:"db"` is psql's identifier quoting. The database name must already have passed
the strict run-scoped pattern and identity checks. Do not substitute a
wildcard, a generic name, or an unverified shell variable.

If termination or drop fails, stop and preserve evidence; do not retry against
an unverified target.

---

## 6. Destructive storage cleanup safeguards

Storage cleanup is separate from database cleanup and requires separate
approval for media, backups and evidence.

### 6.1 Validation

```bash
RUN_ID=<validated run id>
BASE=$(realpath -e -- /tmp/ss284b-isolated)
RAW_TARGET="$BASE/$RUN_ID"
test ! -L "$RAW_TARGET"
TARGET=$(realpath -e -- "$RAW_TARGET")
```

Requirements:

- `RUN_ID` matches `^[a-z0-9][a-z0-9_-]{0,31}$`.
- `BASE` resolves to the fixed canonical `/tmp/ss284b-isolated`.
- `RAW_TARGET` is not itself a symlink.
- `TARGET` is a strict child of `BASE`, never equal to `BASE`.
- `TARGET` is a real directory, not a symlink.
- `realpath "$TARGET"` equals `TARGET`.
- No symlinked subdirectory is followed during listing or deletion; reject the
  run if any unexpected symlink is found.
- List the exact target contents before any deletion:

  ```bash
  case "$TARGET" in
    "$BASE"/*) ;;
    *) echo "Refusing: target is not a child of the fixed base"; exit 1 ;;
  esac
  test "$TARGET" != "$BASE"
  test -d "$TARGET"
  test ! -L "$TARGET"
  test "$(realpath -e -- "$TARGET")" = "$TARGET"

  mkdir -p "$TARGET/evidence"
  if find "$TARGET" -type l -print -quit | grep -q .; then
    echo "Refusing: symlink found in isolated run root"; exit 1
  fi
  find "$TARGET" -mindepth 1 -maxdepth 4 \
    -printf '%y %p -> %l\n' | sort > "$TARGET/evidence/target-listing.txt"
  ```

  If the evidence directory is itself being considered for deletion, write the
  listing outside the target first.

### 6.2 Separate approvals

Require distinct approvals, each bound to the exact `RUN_ID`:

```text
SS284B_APPROVE_MEDIA_DELETE=YES:<RUN_ID>
SS284B_APPROVE_BACKUP_DELETE=YES:<RUN_ID>
SS284B_APPROVE_EVIDENCE_DELETE=YES:<RUN_ID>
```

Recommended default: retain evidence; delete media and backups only when
approved. Do not delete the complete run directory with one approval.

### 6.3 Deletion scope

Only after validation and the relevant approval:

```bash
# Media, only after media deletion approval.
test -d "$TARGET/media" && test ! -L "$TARGET/media"
rm -rf --one-file-system -- "$TARGET/media"

# Backups, only after backup deletion approval.
test -d "$TARGET/backups" && test ! -L "$TARGET/backups"
rm -rf --one-file-system -- "$TARGET/backups"

# Evidence, only after evidence deletion approval, after the final report has
# been copied outside the target.
test -d "$TARGET/evidence" && test ! -L "$TARGET/evidence"
rm -rf --one-file-system -- "$TARGET/evidence"
```

Never use `rm -rf "$BASE"`, `rm -rf "$BASE/*"`, or a wildcard without exact
validation. Do not delete the base directory. Record each deletion and its
approval in the evidence log.

---

## 7. Credential handling

### Password files for PostgreSQL clients

Prefer a temporary libpq password file for `psql`, `createdb` and `dropdb`:

```text
<host>:<port>:<database>:<user>:<password>
```

Store it outside the repository in the run’s restricted `secrets` directory:

```bash
umask 077
PGPASSFILE="/tmp/ss284b-isolated/${RUN_ID}/secrets/pgpass"
# Create with mode 0600; no password appears in argv or retained output.
```

Use:

```bash
PGPASSFILE="$PGPASSFILE" psql ...
PGPASSFILE="$PGPASSFILE" createdb ...
PGPASSFILE="$PGPASSFILE" dropdb ...
```

Do not use `PGPASSWORD` for new scripts when `PGPASSFILE` is supported. If a
tool only accepts `PGPASSWORD`, document why and keep it out of argv and logs.

### Prisma URL

Prisma requires `DATABASE_URL`; it cannot use a libpq password file. Obtain the
URL from a secret-injection mechanism or a non-echoed shell environment, never
from a command argument. Redact it before evidence capture:

```bash
redact_url() {
  printf '%s' "$1" | sed -E 's#(postgres(ql)?://)[^@]+@#\1***@#'
}
```

Do not use `set -x`. If a shell history is used, prefix credential-bearing
commands with a space under an `HISTCONTROL=ignorespace` environment, or execute
them from a non-interactive script that does not persist its environment.

### Temporary credential cleanup

Remove only the exact password file after all database clients have exited:

```bash
test -n "$PGPASSFILE"
test "$(dirname "$PGPASSFILE")" = "/tmp/ss284b-isolated/${RUN_ID}/secrets"
rm -f -- "$PGPASSFILE"
```

Do not run a wildcard cleanup on `secrets` or the run root. If credential
cleanup is approved separately from evidence retention, record that approval.

### Evidence redaction

Before retaining output:

- replace URL userinfo with `***`;
- remove `DATABASE_URL`, `PGPASSFILE`, password and token values;
- omit full `pg_stat_activity` query text where it might contain credentials;
- retain only host/port/database/user, migration names, exit statuses and
  schema/row evidence.

---

## 8. Ordered execution stages

All commands are plan-only. Execution requires separate authorization.

### Stage A — Migration and schema

1. Validate run ID, target variables and approved disposable instance.
2. Pre-create database/role, extension and grants as approved.
3. Record target identity.
4. Apply migrations with `prisma migrate deploy`.
5. Verify schema and `_prisma_migrations`.
6. Run direct PostgreSQL rollback experiment A.
7. Run Prisma migration-runner rollback experiment B.
8. Discard each experimental database and temporary directory.

Commands:

```bash
DATABASE_URL="$TEST_DATABASE_URL" \
  pnpm --filter @sabz/api exec prisma migrate deploy

DATABASE_URL="$TEST_DATABASE_URL" \
  pnpm --filter @sabz/api exec prisma migrate status
```

### Stage B — PostgreSQL real-gateway integration

```bash
pnpm --filter @sabz/api test:integration:demo-seed
```

Stage-focused subset:

```bash
pnpm --filter @sabz/api exec jest \
  --config ./test/jest-demo-seed-integration.json \
  --runInBand \
  --testNamePattern='runs a fresh apply through the real Prisma write gateway and replays it|commits publication and authoritative journal completion atomically|rejects nonexistent, unrelated or mismatched publications at completion|rolls back publication and journal completion together|serializes a normal publication against demo media reconciliation'
```

### Stage C — Concurrency/fencing

```bash
pnpm --filter @sabz/api exec jest \
  --config ./test/jest-demo-seed-integration.json \
  --runInBand \
  --testNamePattern='uses genuinely independent database sessions|rejects a stale owner after a newer fencing generation takes over|rejects a stale campaign write through the real service fence|does not allow takeover while an earlier protected transaction holds the fence row'
```

### Stage D — Storage/media

```bash
pnpm --filter @sabz/api test:integration:demo-seed-storage
```

```bash
pnpm --filter @sabz/api exec jest \
  --config ./test/jest-demo-seed-integration.json \
  --runInBand \
  --testNamePattern='creates a media row only after a fenced upload and reuses a verified orphan|reuses gateway media only when provenance and stored bytes verify|locks and validates blog rows and rolls activation back'
```

### Stage E — Cleanup/repeatability

```bash
pnpm --filter @sabz/api exec jest --config ./test/jest-demo-seed-harness.json
pnpm --filter @sabz/api test:integration:demo-seed
pnpm --filter @sabz/api test:integration:demo-seed
pnpm --filter @sabz/api test:integration:demo-seed-storage
```

Then inspect residue, drop/recreate the database, and perform storage cleanup
only under the safeguards in sections 5 and 6.

---

## 9. Test-by-test acceptance criteria

Status at plan preparation was **authored, not executed**. Final execution
results are recorded in section 13; the tables below remain the acceptance
criteria that were applied.

### Stage A

| Test | Proves | Assertions | Expected failure | Destructive | Evidence |
|---|---|---|---|---|---|
| A-1 clean migration | Fresh disposable DB accepts all migrations | migrate exit 0; no unfinished migrations; required tables/columns/indexes/FK/extension | Stop on nonzero or missing object | Yes | command output, schema rows, `_prisma_migrations` |
| A-2 duplicate preflight | Guard preflight rejects historical duplicates before DDL | specific exception; no guard tables/columns | Expected nonzero | Yes | stderr, schema absence |
| A-3 direct rollback | PostgreSQL explicit transaction rolls back guard DDL | failed script; lock table/provenance/publication column absent | Expected failure | Yes | schema before/after, PG log |
| A-4 Prisma runner rollback | Prisma 6.19.3 runner behavior and migration state | failed deploy; preceding DDL rolled back; `_prisma_migrations` distinguishes applied/failed/unfinished | Expected failure; if partial DDL remains, **FAIL this experiment** | Yes | exit status, migration rows, schema |
| A-5 identity | Target is the recorded disposable instance | system id/OID/version/user/database match | Stop on mismatch | No | redacted identity output |

### Stage B

| Test | Proves | Assertions | Expected failure | Destructive | Evidence |
|---|---|---|---|---|---|
| B-1 real gateway fresh apply | Fresh campaign/blog/media/draft/publication/journal flow | campaign attributes; exact slug/status; media provenance/publishedAt; publication; completed journal; no duplicate replay | No failure expected | Yes | Jest output, DB state, temp media |
| B-2 publication/journal atomicity | One commit boundary | journal completed publication id/version/result; publication exists; no partial state | Forced failures roll back both | Yes | transaction output, DB snapshots |
| B-3 completed replay | Stored result is idempotent | replay true; one publication; stored maps/results match | No failure expected | Yes | Jest output, counts |
| B-4 invalid completion binding | Invalid publication/result rejected | nonexistent/foreign/version/status/result mismatches reject; journal unchanged | Expected rejects | Yes | error output, rows |
| B-5 blog activation/rollback | Activation precedes snapshot; failure rolls back | blog published for snapshot; failure restores DRAFT/draft/publication/journal/audit | Expected forced failure | Yes | DB rows, Jest output |

**PASSED:** the real PostgreSQL gateway publication-failure test forces a
publication insert failure, verifies draft revision and blog activation
rollback plus a `FAILED` journal, then resumes the same journaled operation.

### Stage C

| Test | Proves | Assertions | Expected failure | Destructive | Evidence |
|---|---|---|---|---|---|
| C-1 stale owner/expiry | Lease takeover and stale rejection | old lock/journal/completion reject; generation advances | Expected rejects | Yes | lock/journal rows, timing |
| C-2 stale campaign | Fenced normal service write | no stale campaign; current lock creates | Expected reject | Yes | campaign counts |
| C-3 takeover while protected | Contender cannot overtake live transaction | contender waits; then fails or acquires correctly | Wait/reject | Yes | timings, lock rows |
| C-4 publication/media serialization | Lifecycle locks serialize | second transaction blocks until first resolves; final rows consistent | Block | Yes | timing, final rows |
| C-5 concurrent full apply/deadlock | Two applies cannot both succeed | one wins; loser gets lease/fence rejection; no deadlock partial state | One rejection | Yes | PG logs, outputs, DB state |

**PASSED:** two concurrent full applies were exercised against real PostgreSQL
sessions; exactly one completed, the other received
`DemoSeedLockUnavailableError`, and no duplicate rows remained.

### Stage D

| Test | Proves | Assertions | Expected failure | Destructive | Evidence |
|---|---|---|---|---|---|
| D-1 fenced media/orphan | Uploaded row only after fence; orphan reuse | row/storage keys/provenance; no overwrite | Conflicts reject | Yes/temp | Jest output, file hashes |
| D-2 gateway provenance | Reuse requires exact hashes and bytes | tampered/missing bytes reject; original retained | Expected reject | Yes/temp | Jest output |
| D-3 blog lock/rollback | Final blog lock and rollback | changed row rejects; rollback state | Expected failure | Yes | DB rows |
| D-4 storage suite | Deterministic storage behavior | 8 normal tests + 1 opt-in vfat test pass; no overwrite; traversal rejected | Expected rejects | Temp/mount | Jest output, temp listing |
| D-5 public retrieval | Published media/thumbnail accessible; others hidden | published stream succeeds; unpublished/deleted/missing 404 | Expected 404 | Read-only DB/temp | service/HTTP output, DB rows |
| D-6 hard-link unavailable | Fail closed without hard links | no overwrite; explicit failure; original intact | Expected failure | Temp/mount | output, file list |
| D-7 eligibility | Published/unpublished/deleted gating | only `publishedAt != null && deletedAt == null` public | Expected 404/empty | Yes | DB + retrieval output |

**PASSED:** public service and controller retrieval, thumbnail streaming and
404 behavior were executed against a real local-disk storage root. The
hard-link-unavailable case was executed on a disposable 16 MiB FAT/vfat loopback
mount (`fs_type=msdos`, mount type `vfat`); direct `ln` failed with
`Operation not permitted` and the storage adapter failed closed.

### Stage E

| Test | Proves | Assertions | Expected failure | Destructive | Evidence |
|---|---|---|---|---|---|
| E-1 repeated suites | Repeatable fixture/test behavior | two consecutive full runs; unique stamps; no residue | Cleanup failure fails stage | Yes | both outputs, residue queries |
| E-2 cleanup unit harness | Best-effort cleanup/primary preservation | 28 harness tests | Assertion failure | No DB | Jest output |
| E-3 media metadata restore | Exact pre-existing media restoration | publishedAt/updatedBy/updatedAt match captured | Mismatch fails | Yes | verification action |
| E-4 partial-apply cleanup | Cleanup after interrupted apply | no unintended rows/files; primary error preserved | Expected failure | Yes | DB/filesystem snapshots |
| E-5 fresh reset | Drop/recreate clean state | fresh migration/schema checks pass | Any mismatch | Yes | new run evidence |

**PASSED:** a forced real-gateway partial apply was cleaned up with exact
operation IDs/names; an unrelated sentinel row and the exact pre-existing
draft/publication/media metadata restoration were verified.

---

## 10. Known gaps and status discipline

At plan preparation these were gaps. Final execution status:

1. Real PostgreSQL full-gateway publication-failure rollback — **PASSED**.
2. Public media and thumbnail retrieval — **PASSED**.
3. Unpublished and deleted media 404 behavior — **PASSED**.
4. Hard-link-unavailable storage behavior — **PASSED** on a disposable FAT/vfat
   loopback mount; direct hard-link creation failed with `EPERM` and the real
   local-disk adapter failed closed without creating the target.
5. Concurrent full apply/deadlock behavior — **PASSED**.
6. Real PostgreSQL partial-apply cleanup — **PASSED**.
7. Prisma migration-runner rollback — **PASSED** (`P3018` / `42601`, preceding
   DDL rolled back, unfinished history row).
8. Privileged-role behavior — **PASSED** for the verified non-superuser owner:
   trusted `pg_trgm`, `pg_control_system()` execution, DDL and database
   ownership.

Status terms:

- **Authored:** source test exists.
- **Executed:** process actually run.
- **Passed:** executed with successful assertions.
- **Failed:** executed with failed assertion/command.
- **Skipped:** intentionally not run.
- **Not verified:** no runtime evidence.

The transaction-double unit tests and mocked snapshot tests are not PostgreSQL
transaction evidence.

---

## 11. Preflight checklist

### Before connecting (read-only/local)

- [ ] Branch `feat/homepage-demo-seed`; HEAD
  `f09848a293ef134cac836d23fd893bd83010897a`.
- [ ] No unintended source changes, staging, commit or branch switch.
- [ ] `RUN_ID`, host, port, database, username and expected values are set.
- [ ] `RUN_ID` matches its strict pattern.
- [ ] Database name is exactly `sabz_ss284b_<RUN_ID>_test`.
- [ ] No database name is a shared/dev/staging/production name.
- [ ] `TEST_DATABASE_URL` and `DATABASE_URL` point to the same disposable target.
- [ ] Guard harness tests pass (28 database-free tests).
- [ ] PostgreSQL client, Node, pnpm and Prisma versions are correct.
- [ ] Generated Prisma Client exists.
- [ ] `pg_trgm` and `pg_control_system()` privilege requirements are understood.
- [ ] Storage roots are fresh, dedicated, mode `0700`, and not shared volumes.
- [ ] Hard-link support and free disk space are checked.
- [ ] No API, worker, Docker/Compose or other process is using the target.
- [ ] Evidence directory and redaction procedure are ready.
- [ ] No password is in shell history, argv or retained output.

### Requires explicit database authorization

- [ ] Target instance is reachable and is the approved disposable instance.
- [ ] Exact target identity verified: system identifier, OID, version, database,
  user, host and port.
- [ ] Role/extension/`pg_control_system()`/DDL privileges verified.
- [ ] `postgres` maintenance connection and `CREATEDB` or pre-created database
  verified.
- [ ] No concurrent sessions.
- [ ] Clean migration and schema verification.
- [ ] Direct PostgreSQL rollback experiment A.
- [ ] Prisma migration-runner experiment B.
- [ ] Stage B/C/D/E execution.
- [ ] Database/storage deletion safeguards and separate approvals.
- [ ] Database drop/recreate and storage cleanup.

### Actions requiring separate authorization

- [ ] Create/drop database or role.
- [ ] Connect to PostgreSQL.
- [ ] Create/pre-create extension or grant privileges.
- [ ] Run any Prisma migration command.
- [ ] Run integration or storage tests.
- [ ] Run destructive migration experiments.
- [ ] Start Docker/Compose/API.
- [ ] Delete media, backups or evidence.
- [ ] Terminate sessions or drop the database.

---

## 12. Verdict

**`PASS — ISOLATED EXECUTION PLAN READY FOR APPROVAL`**

The plan now includes two distinct migration-rollback experiments, fail-closed
database deletion checks, strict storage-root deletion controls, documented
privilege requirements and verification queries instead of blanket grants, and
explicit credential handling. It retains all known test gaps as **NOT
VERIFIED**.

No database, filesystem deletion, migration, Prisma command, integration test,
storage test, Docker/Compose operation, API startup, upload or publication was
performed while preparing this plan. Execution remains separately authorized.

---

## 13. Execution record (2026-11-17)

The plan was executed against a dedicated disposable PostgreSQL 16.15 container
and isolated temporary storage roots. No shared, staging or production database,
normal Compose startup, normal seed, or shared publication was used.

Environment identity:

```text
host/port:       127.0.0.1:55432
database:        sabz_ss284b_20261117a_test
owner/user:      ss284b_runner (NOSUPERUSER, NOCREATEDB, NOCREATEROLE)
system id:       7708886767470526508
database oid:    16389
server version:  16.15 (Debian 16.15-1.pgdg13+2)
```

Results:

- 39 migrations applied successfully with Prisma 6.19.3; schema verification
  passed and no unfinished migrations remained.
- `pg_trgm` 1.6 is marked trusted in `pg_available_extension_versions`; the
  non-superuser database owner successfully created it.
- `pg_control_system()` execution is available to the non-superuser owner.
- Direct PostgreSQL rollback experiment: exit `3`; lock/journal tables,
  publication column, provenance columns and partial indexes were absent.
- Prisma 6.19.3 migration-runner experiment: exit `1`, `P3018` / `42601`;
  preceding DDL rolled back; the migration row had `finished_at = NULL` and
  `applied_steps_count = 0`.
- Repository guard-migration SHA-256 remained
  `8c4fdb1db3678c9ba3504fbf81ed2309cc080a8630a21676070b8859c80bc3b9`, matching
  the applied `_prisma_migrations` checksum.
- PostgreSQL real-gateway suite: **20/20 passed** in the first environment and
  again twice consecutively in a second fresh environment (`20261117b`); each
  run left zero draft/journal/publication/
  campaign/media/blog/catalog rows.
- Storage suite: **8/8 passed** normally; **9/9 passed** in the dedicated
  FAT/vfat loopback run, including fail-closed hard-link-unavailable behavior.
  The mount reported `fs_type=msdos` and `type vfat`; direct `ln` failed with
  `Operation not permitted`.
- API unit tests: **152 suites, 1815 tests passed**; API typecheck, lint and build
  passed. Root typecheck/lint/test passed. Root build passed with the required
  storefront build environment.
- The public media/thumbnail 404 behavior, fresh draft backup/replacement,
  forced real-gateway publication failure with journal resume, real partial-apply
  cleanup, and concurrent full-apply fencing are covered by executed tests.

Cleanup record and retained resources are recorded in the final SS-284B report.

**Execution verdict:** `PASS — SS-284B ISOLATED EXECUTION COMPLETED` for the
verified disposable environment, including real FAT/vfat hard-link-unavailable
evidence.
