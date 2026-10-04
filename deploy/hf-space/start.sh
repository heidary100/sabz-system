#!/bin/sh
# Sabz demo Space startup (SS-247).
# 1. Ephemeral in-container Redis (no auth, localhost only).
# 2. prisma migrate deploy — idempotent, forward-only (runbook rule: never
#    `migrate dev` outside development).
# 3. The compiled API. Process cwd must be apps/api: relative env paths
#    (watermark logo/font under assets/) resolve against the API package
#    directory, same as the compose dev stack. Media/document storage paths
#    are absolute and baked into the image.
set -e

redis-server --daemonize yes

pnpm --filter @sabz/api exec prisma migrate deploy

cd /app/apps/api
exec node dist/main.js
