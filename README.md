# Sabz System Platform

Enterprise e-commerce platform for electronics retail and wholesale.

---

## Documentation

| Section | Description |
|---------|-------------|
| [Product Vision](docs/00-overview/product-vision.md) | Vision, mission, and target audience |
| [Business Goals](docs/00-overview/business-goals.md) | Business objectives and success metrics |
| [Project Scope](docs/00-overview/project-scope.md) | Feature scope and requirements |
| [Roadmap](docs/00-overview/roadmap.md) | Product roadmap and phases |
| [Project Timeline](docs/01-planning/project-timeline.md) | Milestone-based delivery schedule |
| [Milestones](docs/01-planning/milestones.md) | Milestone objectives and deliverables |
| [Acceptance Criteria](docs/01-planning/acceptance-criteria.md) | Milestone acceptance criteria |
| [Product Backlog](docs/01-planning/product-backlog.md) | Prioritized feature backlog |
| [Software Requirements](docs/02-requirements/software-requirements-specification.md) | Full SRS document |
| [User Stories](docs/02-requirements/user-stories.md) | User stories by module |
| [Roles & Permissions](docs/02-requirements/roles-permissions.md) | Role-based access matrix |
| [Feature Specifications](docs/02-requirements/feature-specifications/) | Individual feature specs |
| [Architecture Document](docs/03-architecture/software-architecture-document.md) | Software architecture (SAD) |
| [Architecture Decisions](docs/03-architecture/architecture-decisions/) | ADRs |
| [System Context](docs/03-architecture/system-context.md) | System boundaries and actors |
| [Database Design](docs/04-database/database-design-specification.md) | Database schema (DDS) |
| [Entity Relationship Model](docs/04-database/entity-relationship-model.md) | Entity relationships |
| [Migrations Guide](docs/04-database/migrations-guide.md) | Database migration workflow |
| [API Specification](docs/05-api/api-specification.md) | REST API endpoints |
| [Authentication API](docs/05-api/authentication-api.md) | Auth API reference |
| [UML Diagrams](docs/06-uml/) | Use cases, domain model, flows |
| [Development Guide](docs/07-development/development-guide.md) | Local setup and project structure |
| [Docker Development Environment](docs/07-development/development-environment.md) | Containerized local development with hot reload |
| [Coding Standards](docs/07-development/coding-standards.md) | Code style and conventions |
| [AI Development Workflow](docs/07-development/ai-development-workflow.md) | AI-assisted development process |
| [GitHub Workflow](docs/07-development/github-workflow.md) | Branch strategy and PR process |
| [Sprint 00](docs/08-sprints/sprint-00-foundation.md) | Foundation sprint |
| [Sprint 01](docs/08-sprints/sprint-01-authentication.md) | Auth & core features sprint |

---

## Quick Start

The quickest way to run the full stack is the Docker development environment:

```bash
# Build images and start all services (PostgreSQL, Redis, API, Admin, Storefront)
docker compose up -d --build

# Check status
docker compose ps
```

This starts the API (http://localhost:3000), admin (http://localhost:5173), and storefront (http://localhost:3002) with hot reload, and applies database migrations automatically. See [Docker Development Environment](docs/07-development/development-environment.md) for details and troubleshooting.

To run without Docker:

```bash
# Install dependencies
pnpm install

# Copy environment template
cp apps/api/.env.example apps/api/.env

# Start infrastructure (PostgreSQL and Redis)
docker compose up -d postgres redis

# Run migrations
pnpm --filter @sabz/api prisma:migrate

# Start development servers
pnpm dev
```

See [Development Guide](docs/07-development/development-guide.md) for detailed setup instructions.

---

## Technology Stack

- **Backend**: NestJS, TypeScript, PostgreSQL, Prisma, Redis
- **Storefront**: Next.js, React, Tailwind CSS, shadcn/ui
- **Admin**: React, TypeScript, Tailwind CSS, Catalyst UI Kit

---

## AI Development

See [AGENTS.md](AGENTS.md) for AI-assisted development instructions.
