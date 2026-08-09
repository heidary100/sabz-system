# Sabz System Platform - AI Development Instructions

## Project Overview

Sabz System Platform is an enterprise e-commerce platform for electronics retail and wholesale.

The platform supports:

- B2C storefront
- B2B wholesale portal
- Admin platform
- Tier-based partner pricing
- Product catalog management
- Inventory system
- Pricing engine

The current development phase is:

Milestone 1 - Platform Foundation

Focus only on:

- Project architecture
- Authentication
- Users
- Partners
- Admin panel foundation
- Product management foundation
- Inventory foundation


## Technology Stack

Backend:

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- Redis

Frontend:

Storefront:
- Next.js
- TypeScript
- Tailwind CSS

Admin:
- React
- TypeScript
- Tailwind CSS
- Catalyst UI Kit


## Architecture Rules

Use a modular monolith architecture.

Do NOT create microservices.

Backend structure:

apps/api/src/modules/

Example:

modules/
├── auth
├── users
├── partners
├── products
├── inventory
├── roles
└── media


Each module should contain:

- controller
- service
- module
- dto
- entities/models
- tests


## Development Rules

Before implementing any feature:

1. Read related documentation in /docs
2. Understand the GitHub issue requirements
3. Make the smallest required change
4. Do not refactor unrelated code


## Documentation Index

| Working on... | Read this doc |
|--------------|----------------|
| Any feature | `docs/03-architecture/software-architecture-document.md` |
| Architecture decisions | `docs/03-architecture/architecture-decisions/` |
| Authentication | `docs/02-requirements/feature-specifications/authentication.md` |
| Partner Management | `docs/02-requirements/feature-specifications/partner-management.md` |
| Products | `docs/02-requirements/feature-specifications/product-catalog.md` |
| Pricing | `docs/02-requirements/feature-specifications/pricing-engine.md` |
| Inventory | `docs/02-requirements/feature-specifications/inventory-management.md` |
| Cart/Checkout | `docs/02-requirements/feature-specifications/shopping-cart.md` |
| Orders | `docs/02-requirements/feature-specifications/order-management.md` |
| Payments | `docs/02-requirements/feature-specifications/payment-management.md` |
| Database | `docs/04-database/database-design-specification.md` |
| API | `docs/05-api/api-specification.md` |
| AI Workflow | `docs/07-development/ai-development-workflow.md` |
| Coding Standards | `docs/07-development/coding-standards.md` |


## Coding Standards

General:

- TypeScript strict mode
- Prefer clean readable code
- Avoid unnecessary abstractions
- Use meaningful names
- Add validation for external inputs


Backend:

- Follow NestJS conventions
- Use DTO validation
- Use dependency injection
- Keep controllers thin
- Keep business logic in services


Database:

- Database changes require migrations
- Never modify production data directly
- Avoid premature optimization


Frontend:

- Components should be reusable
- Avoid large component files
- Keep business logic separated from UI


## Git Workflow

Every implementation must be related to a GitHub issue.

Commit messages:

feat:
fix:
refactor:
docs:
chore:


Example:

feat(auth): add OTP verification


## Testing Requirements

Before completing an issue:

Run:

- lint
- typecheck
- tests
- build


## Current Restrictions

Do NOT implement:

- payments
- checkout
- order management
- marketplace
- mobile applications
- Holo integration
- Torob integration

unless explicitly requested in a future milestone.


## AI Agent Behavior

When working on an issue:

First explain:

1. What files will change
2. Why they need to change
3. Any architectural decisions

Then implement.

Avoid:

- creating unnecessary files
- adding unnecessary dependencies
- changing architecture without discussion