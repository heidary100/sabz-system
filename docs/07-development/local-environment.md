# Sabz System Platform
# Local Environment Setup

Version: 1.0

---

# Overview

This document provides detailed instructions for setting up the local development environment.

---

# System Requirements

| Tool | Version | Purpose |
|------|---------|--------|
| Node.js | 20+ | Runtime |
| pnpm | 8+ | Package manager |
| Docker | 24+ | Container runtime |
| Docker Compose | 2.20+ | Multi-container orchestration |
| Git | 2.40+ | Version control |
| VS Code | Latest | Recommended IDE |

---

# Docker Services

The project uses Docker Compose for local infrastructure:

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: sabz_system
      POSTGRES_USER: sabz
      POSTGRES_PASSWORD: sabz_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

# Environment Variables

Create a `.env` file in the project root:

```env
# Application
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://sabz:sabz_dev@localhost:5432/sabz_system

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=your-jwt-access-secret
JWT_REFRESH_SECRET=your-jwt-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# SMS Provider
SMS_PROVIDER_API_KEY=your-sms-api-key

# Storage
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=sabz-system
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# Payment Gateway
PAYMENT_GATEWAY_API_KEY=your-payment-api-key
PAYMENT_GATEWAY_MERCHANT_ID=your-merchant-id
```

---

# Common Issues

## Port Already in Use

```bash
# Find and kill process on port 3000
lsof -i :3000
kill -9 <PID>
```

## Database Connection Errors

```bash
# Check if PostgreSQL is running
docker compose ps

# Restart PostgreSQL
docker compose restart postgres

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up -d
cd apps/api && npx prisma migrate dev
```

## Prisma Client Issues

```bash
# Regenerate Prisma client
cd apps/api
npx prisma generate
```
