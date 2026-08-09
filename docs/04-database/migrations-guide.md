# Sabz System Platform
# Database Migrations Guide

Version: 1.0

---

# Overview

This document describes the database migration strategy for the Sabz System Platform. All database schema changes must go through Prisma migrations to ensure traceability, reproducibility, and safe deployment.

---

# Migration Tool

The platform uses **Prisma Migrate** as the primary migration tool.

The Prisma CLI is scoped to the `@sabz/api` workspace package. Run it through the package scripts:

```bash
# Generate the Prisma Client from schema.prisma
pnpm --filter @sabz/api prisma:generate

# Create and apply a new migration (development workflow)
pnpm --filter @sabz/api prisma:migrate -- --name descriptive-migration-name

# Open Prisma Studio to inspect the database
pnpm --filter @sabz/api prisma:studio
```

---

# Local Database Setup

1. Start PostgreSQL with Docker:

```bash
docker compose up -d postgres
```

2. Copy the environment template and edit if needed:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Apply migrations:

```bash
pnpm --filter @sabz/api prisma:migrate
```

---

# Migration Workflow

## Creating a Migration

1. Modify the `schema.prisma` file to reflect the desired changes.
2. Run the migration generation command:

```bash
pnpm --filter @sabz/api prisma:migrate -- --name descriptive-migration-name
```

3. Review the generated SQL in the `migrations/` directory.
4. Test the migration against a fresh database.

## Initial Migration

The repository contains an initial, empty migration (`20260810000000_init`) that establishes the migration baseline. Business models are intentionally absent and will be added through dedicated migrations in future issues.

## Migration Rules

- Never modify an existing migration file that has been applied to any environment.
- Always create a new migration for schema changes.
- Use descriptive migration names (e.g., `add-partner-tier-discount-column`).
- Include both `up` and `down` migrations for reversibility.

## Deployment Migrations

For production deployments:

```bash
pnpm --filter @sabz/api exec prisma migrate deploy
```

This applies all pending migrations without prompting for changes.

---

# Naming Convention

Migrations should follow the pattern:

```
<timestamp>_descriptive_name
```

Examples:

- `20260809000000_create_users_table`
- `20260809000001_add_partner_tier_enum`
- `20260809000002_add_product_media_watermark_flag`

---

# Data Migrations

For migrations that involve data transformation (not just schema changes):

1. Create the schema migration first.
2. Create a separate data migration script.
3. Data migration scripts should be placed in `scripts/migrations/`.
4. Data migrations must be idempotent (safe to run multiple times).

---

# Rollback Strategy

```bash
npx prisma migrate rollback
```

For production rollbacks:

1. Do NOT rollback directly on production.
2. Create a new forward migration that reverses the change.
3. Test the reversal migration in staging first.

---

# Holo Data Migration

Initial data migration from the Holo system is a one-time operation:

- Products and categories will be imported via a dedicated migration script.
- The script is located in `scripts/holo-migration/`.
- Run only once during initial setup.
- Verify data integrity after import.
