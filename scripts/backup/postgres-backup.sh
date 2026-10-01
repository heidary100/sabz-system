#!/usr/bin/env bash
#
# PostgreSQL backup for Sabz System (SS-244A).
#
# Host-cron usage (daily, 03:00):
#   0 3 * * * /path/to/sabz-system/scripts/backup/postgres-backup.sh >> /var/log/sabz-backup.log 2>&1
#
# Reads POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB from the environment
# (or the repo .env file), dumps via the compose `postgres` service so no
# host pg_dump install is required, and prunes files older than
# BACKUP_RETENTION_DAYS. Redis holds only OTP/attempt counters (recreatable)
# and is intentionally not dumped; product media / documents live in the
# `api_product_media` / `api_documents` Docker volumes — snapshot those at
# the host level alongside the database dump.
#
# Exit codes: 0 ok, 1 misconfiguration, 2 dump failed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set (see .env.example)}"
: "${POSTGRES_DB:?POSTGRES_DB is not set (see .env.example)}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/sabz-$STAMP.dump"

if ! docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
  echo "postgres service is not ready; aborting backup" >&2
  exit 1
fi

if ! docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$OUT"; then
  rm -f "$OUT"
  echo "pg_dump failed; partial file removed" >&2
  exit 2
fi

# Prune dumps older than the retention window (mtime-based, UTC-safe).
find "$BACKUP_DIR" -maxdepth 1 -name 'sabz-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete

echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
echo "restore:  docker compose exec -T postgres pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists < $OUT"
