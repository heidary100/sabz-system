# Sabz System Platform - AI Development Instructions

## 1. Project Overview

Sabz System is an enterprise electronics commerce platform supporting:

- B2C customer storefront
- B2B partner wholesale portal
- Admin CMS
- Tier-based pricing
- Product catalog
- Inventory management
- Future order/payment ecosystem

**Current development phase: Milestone 1 - Platform Foundation**

Focus:

- Repository architecture
- Backend foundation
- Authentication foundation
- User management
- Partner management foundation
- Admin CMS foundation
- Product management foundation
- Inventory foundation

Do not implement future milestone features unless explicitly requested.

---

## 2. Repository Architecture

This is a pnpm monorepo.

Structure:

```
apps/
├── api
│   NestJS backend
│
├── admin
│   React CMS application
│
└── storefront
    Next.js customer application

docs/
Project documentation

.github/
GitHub automation
```

Application ownership:

| Application | Responsibility |
| --- | --- |
| api | Business logic, database, authentication, APIs |
| admin | Internal CMS and operations |
| storefront | Customer shopping experience |

Never mix responsibilities between applications.

---

## 3. Technology Stack

### Backend

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis

### Admin

- React
- TypeScript
- Tailwind CSS
- Catalyst UI Kit
- Headless UI

### Storefront

- Next.js App Router
- TypeScript
- Tailwind CSS
- Tailwind Plus Ecommerce UI

---

## 4. Architecture Principles

### Backend Architecture

Use **Modular Monolith**.

Do NOT create:

- microservices
- distributed services
- separate backend applications

Backend modules:

```
apps/api/src/modules/
auth
users
partners
products
inventory
roles
media
```

Each module should contain:

```
module.ts
controller.ts
service.ts
dto/
entities/
tests/
```

Rules:

- Controllers handle HTTP only
- Services contain business logic
- DTOs validate input
- Database access belongs in services/repositories
- Avoid business logic inside controllers

---

## 5. Development Workflow

Before implementing any issue:

1. Read the GitHub issue completely
2. Read related documentation:
   ```
   docs/
   ```
3. Understand existing architecture
4. Explain:
   - files to change
   - architectural decisions
   - dependencies added
5. Implement the smallest possible change

Never:

- refactor unrelated code
- redesign architecture
- rename large sections without approval

---

## 6. GitHub Issue Rules

Every code change must belong to a GitHub issue.

Branch format:

```
feat/ss-xxx-description
fix/ss-xxx-description
docs/ss-xxx-description
```

Commit format:

```
feat(scope): description
fix(scope): description
docs(scope): description
chore(scope): description
```

Example:

```
feat(auth): add OTP verification service
```

---

## 7. Monorepo Rules

Package manager:

Use `pnpm`.

Never use:

```
npm install
yarn
```

Install dependencies:

```
pnpm add package-name
```

Run applications through workspace commands.

Before changing dependencies:

- Explain why the dependency is required.
- Avoid adding packages unless necessary.

---

## 8. Database Rules

Database: PostgreSQL

ORM: Prisma

Rules:

- Every schema change requires migration
- Never edit generated Prisma files
- Never manually modify production data
- Keep migrations committed

Workflow:

```
schema.prisma
↓
prisma migrate
↓
generated client
```

---

## 9. Frontend Rules

### General

- Prefer reusable components
- Keep components small
- Avoid huge page components
- Keep business logic separated from UI

### Admin

Use Catalyst UI Kit components.

Do not introduce another UI framework.

Avoid:

- Material UI
- Ant Design
- Chakra UI

### Storefront

Use Tailwind Plus Ecommerce components.

Avoid:

- unnecessary component libraries
- custom UI when existing components exist

---

## 10. API Rules

REST API is the default.

Rules:

- Validate all external input
- Use DTOs
- Return predictable responses
- Document API changes

Do not create GraphQL unless specifically requested.

---

## 11. Environment Variables

Never hardcode:

- passwords
- tokens
- secrets
- URLs containing credentials

Use:

```
.env
.env.example
```

When adding environment variables, update:

```
.env.example
```

---

## 12. Testing Requirements

Before completing an issue, run:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

A completed issue must:

- compile successfully
- pass tests
- follow architecture rules

---

## 13. Current Restrictions

Do NOT implement:

- payment gateway
- checkout flow
- order management
- mobile applications
- marketplace sellers
- Holo accounting integration
- Torob integration
- SnappPay

...unless explicitly requested.

---

## 14. AI Agent Rules

AI agents must:

**Before coding**, explain:

1. Files changed
2. Reason for changes
3. Dependencies added
4. Architectural decisions

**During coding**, prefer:

- simple solutions
- existing patterns
- minimal changes

Avoid:

- unnecessary abstractions
- unnecessary dependencies
- speculative features
- changing unrelated files

If requirements are unclear, ask before implementing.

---

## 15. Definition of Done

An issue is complete when:

**Code:**

- implementation finished
- no TypeScript errors
- lint passes

**Documentation:**

- updated if needed

**Git:**

- commit follows convention
- pull request description explains changes

**Validation:**

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

---

## 16. Important Documents

Architecture:

```
docs/03-architecture/
```

Database:

```
docs/04-database/
```

API:

```
docs/05-api/
```

Development:

```
docs/07-development/
```

Feature specifications:

```
docs/02-requirements/feature-specifications/
```
