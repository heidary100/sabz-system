# Sabz System Platform
# Development Guide

Version: 1.0

---

# Overview

This guide covers the local development environment setup and day-to-day development practices for the Sabz System Platform.

---

# Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+
- Git

---

# Getting Started

## 1. Clone the Repository

```bash
git clone <repository-url>
cd sabz-system
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Setup Environment

```bash
cp .env.example .env
# Edit .env with your local configuration
```

## 4. Start Infrastructure Services

```bash
docker compose up -d postgres redis
```

## 5. Run Database Migrations

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
```

## 6. Seed Development Data

```bash
npx prisma db seed
```

## 7. Start Development Servers

```bash
# Start API (NestJS)
cd apps/api
pnpm dev:start

# Start Storefront (Next.js)
cd apps/storefront
pnpm dev

# Start Admin (React)
cd apps/admin
pnpm dev
```

---

# Project Structure

```
sabz-system/
├── apps/
│   ├── api/              # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/  # Business modules
│   │   │   ├── common/   # Shared utilities
│   │   │   └── config/   # Configuration
│   │   └── prisma/       # Database schema & migrations
│   ├── storefront/        # Next.js B2C/B2B storefront
│   └── admin/             # React admin dashboard
├── packages/              # Shared packages
│   ├── types/             # Shared TypeScript types
│   └── ui/                # Shared UI components
├── docs/                  # Project documentation
├── scripts/               # Utility scripts
├── AGENTS.md              # AI development instructions
└── README.md
```

---

# Available Scripts

```bash
pnpm lint          # Lint all packages
pnpm typecheck     # Type check all packages
pnpm test          # Run all tests
pnpm build         # Build all packages
docker compose up  # Start infrastructure
```
