$repo="heidary100/sabz-system"


$issues=@(

@{
title="SS-001 Initialize monorepo"
body="
## Goal

Create the Sabz System workspace.

## Requirements

- pnpm workspace
- Turborepo
- apps/api
- apps/admin
- apps/storefront

## Acceptance Criteria

Repository builds successfully.
"
labels="type:feature,area:devops,sprint:0,priority:critical"
},

@{
title="SS-002 Initialize NestJS API"
body="
## Goal

Create backend foundation.

## Requirements

- NestJS
- TypeScript
- Swagger
- Config module
- Health endpoint

## Acceptance Criteria

GET /health returns 200.
"
labels="type:feature,area:backend,sprint:0,priority:critical"
},

@{
title="SS-003 Setup PostgreSQL and Prisma"
body="
## Goal

Prepare database layer.

## Requirements

- PostgreSQL
- Prisma
- Environment configuration

"
labels="type:feature,area:database,sprint:0,priority:critical"
},

@{
title="SS-004 Setup Redis infrastructure"
body="
Setup Redis development environment.
"
labels="type:feature,area:backend,sprint:0,priority:high"
},

@{
title="SS-005 Initialize Admin application"
body="
Create React admin application.

Requirements:

- React
- TypeScript
- Tailwind
- Catalyst UI
"
labels="type:feature,area:admin,sprint:0,priority:critical"
},

@{
title="SS-006 Initialize Storefront"
body="
Create Next.js storefront foundation.

Requirements:

- Next.js
- Tailwind
- Ecommerce UI blocks
"
labels="type:feature,area:storefront,sprint:0,priority:high"
},

@{
title="SS-007 Docker development environment"
body="
Create local Docker services.

Services:

- PostgreSQL
- Redis
"
labels="type:feature,area:devops,sprint:0,priority:high"
},

@{
title="SS-008 GitHub Actions CI"
body="
Create CI pipeline.

Steps:

- Install
- Lint
- Test
- Build
"
labels="type:feature,area:devops,sprint:0,priority:high"
},

@{
title="SS-009 Create AGENTS.md for AI development"
body="
Create AI coding rules for OpenCode and DeepSeek.

"
labels="type:documentation,sprint:0,priority:high"
},

@{
title="SS-010 Organize documentation structure"
body="
Create docs folder structure.

"
labels="type:documentation,sprint:0,priority:medium"
}

)


foreach($issue in $issues){

gh issue create `
--repo $repo `
--title $issue.title `
--body $issue.body `
--label $issue.labels

}