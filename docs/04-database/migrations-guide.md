# Sabz System Platform
# Database Migrations Guide

Version: 1.0

---

# Overview

This document describes the database migration strategy for the Sabz System Platform. All database schema changes must go through Prisma migrations to ensure traceability, reproducibility, and safe deployment.

---

# Migration Tool

The platform uses **Prisma Migrate** as the primary migration tool.

---

# Migration Workflow

## Creating a Migration

1. Modify the `schema.prisma` file to reflect the desired changes.
2. Run the migration generation command:

```bash
npx prisma migrate dev --name descriptive-migration-name
```

3. Review the generated SQL in the `migrations/` directory.
4. Test the migration against a fresh database.

## Migration Rules

- Never modify an existing migration file that has been applied to any environment.
- Always create a new migration for schema changes.
- Use descriptive migration names (e.g., `add-partner-tier-discount-column`).
- Include both `up` and `down` migrations for reversibility.

## Deployment Migrations

For production deployments:

```bash
npx prisma migrate deploy
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
