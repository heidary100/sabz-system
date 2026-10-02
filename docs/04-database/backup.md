# Database Backup & Restore Runbook

> SS-244A. Scope: PostgreSQL (system of record) + media/document volumes.
> Redis holds only OTP codes and attempt counters (recreatable) and is
> intentionally not dumped.

## What is backed up

| Data | How | Where |
|---|---|---|
| PostgreSQL (`sabz`) | `scripts/backup/postgres-backup.sh` → `pg_dump -Fc` via the compose `postgres` service | Host `$BACKUP_DIR` (default `./backups`, gitignored), pruned after `BACKUP_RETENTION_DAYS` (default 14) |
| Product media / documents | Host-level snapshot of the `api_product_media` + `api_documents` Docker volumes | Alongside the DB dump (same timestamp prefix) |

`backups/` is gitignored — dumps never enter the repo.

## Schedule (RPO / RTO)

- **Daily 03:00 UTC host cron** (off-peak for the IR customer base):
  `0 3 * * * /srv/sabz-system/scripts/backup/postgres-backup.sh >> /var/log/sabz-backup.log 2>&1`
- **RPO ≤ 24h** (daily dumps), **RTO ≤ 2h** (single-service restore, no code deploy).
- Pre-deploy safety: run the script manually before any migration-bearing
  release (`prisma migrate deploy`).

## Restore test (run quarterly, record the date below)

1. Create a scratch database (never restore over live on first pass):
   `docker compose exec -T postgres createdb -U sabz sabz_restore_test`
2. Restore the newest dump into it:
   `docker compose exec -T postgres pg_restore -U sabz -d sabz_restore_test --clean --if-exists < backups/sabz-<STAMP>.dump`
3. Verify: table counts (`product`, `"order"`, `user`) match live within the
   expected daily delta; spot-check one order + one product row.
4. Drop the scratch DB: `docker compose exec -T postgres dropdb -U sabz sabz_restore_test`

### Restore log

| Date | Dump | Result |
|---|---|---|
| _pending first quarterly test_ | — | — |

## Notes

- The dump uses the custom format (`-Fc`): compressed, restorable with
  `pg_restore --clean --if-exists`. Point-in-time recovery (WAL archiving)
  was decided in SS-245: **deferred** — the launch posture stays daily
  host-cron dumps (RPO ≤ 24h / RTO ≤ 2h); adopt WAL archiving only if the
  client requires RPO < 24h (trigger + full topology decisions recorded in
  `docs/07-development/deploy-runbook.md` §1).
- Media restores must land before the API serves traffic, otherwise product
  images 404 until the volumes are back (see the media storage layout in
  the database design specification).
