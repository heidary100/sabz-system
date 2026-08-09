# ADR-003: Backend Stack

## Status

Accepted

## Context

The platform needs a robust, type-safe backend that supports modular architecture, RESTful APIs, real-time features, background jobs, and database ORM integration. The team values developer productivity and long-term maintainability.

## Decision

We will use **NestJS** as the backend framework, **PostgreSQL** as the primary database, **Prisma ORM** for database access, and **Redis** for caching and session management.

## Rationale

### NestJS
- **Modular architecture**: First-class module system aligns with our modular monolith strategy (ADR-001).
- **TypeScript native**: End-to-end type safety from database to API responses.
- **Dependency injection**: Built-in DI container enables clean, testable code.
- **Decorator-based routing**: Clean controller definitions with automatic validation.
- **Enterprise patterns**: Guards, interceptors, pipes, and filters provide cross-cutting concern handling.
- **Ecosystem**: Large plugin ecosystem for authentication, scheduling, and caching.
- **BullMQ integration**: Native support for background job processing.

### PostgreSQL
- **Relational model**: Complex e-commerce data (orders, products, partners) maps naturally to relational tables.
- **ACID compliance**: Ensures data integrity for financial transactions and inventory operations.
- **JSON support**: Flexible JSONB columns for product specifications and metadata.
- **Full-text search**: Built-in search capabilities for product search.
- **Maturity and reliability**: Battle-tested in production e-commerce systems.

### Prisma ORM
- **Type-safe queries**: Auto-generated TypeScript types from the schema.
- **Schema-first design**: Declarative schema definition that serves as documentation.
- **Migration system**: Built-in migration tool for database schema evolution.
- **IntelliSense support**: Excellent IDE support through generated types.

### Redis
- **Session storage**: Fast OTP verification and authentication token management.
- **Caching layer**: Product catalog, category trees, and pricing data caching.
- **Rate limiting**: API rate limiting for public endpoints.
- **BullMQ backend**: Message broker for background job queues.

## Consequences

### Positive
- Strong type safety from database to API layer.
- Modular backend structure that maps to business domains.
- Efficient caching strategy for high-traffic product pages.
- Reliable data persistence with ACID-compliant database.
- Clean migration workflow for schema evolution.

### Negative
- Prisma adds a build-time code generation step.
- PostgreSQL requires connection pooling configuration for production.
- Redis adds an infrastructure dependency.

### Mitigation
- Include Prisma generation in the CI/CD pipeline.
- Use PgBouncer for PostgreSQL connection pooling.
- Use Docker Compose for local Redis setup; managed Redis in production.

## Related Decisions

- ADR-001: Modular Monolith Architecture
- ADR-002: Frontend Stack
