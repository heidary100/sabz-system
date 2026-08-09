# ADR-002: Frontend Stack

## Status

Accepted

## Context

The platform requires two distinct frontend applications: a customer-facing storefront (B2C/B2B) and an administrative dashboard. The storefront needs SEO capabilities, fast page loads, and mobile-first design. The admin panel needs a component-rich, data-dense interface.

## Decision

We will use **Next.js for the storefront** and **React with Catalyst UI Kit for the admin dashboard**.

## Rationale

### Next.js Storefront
- **Server-Side Rendering (SSR)**: Enables SEO-friendly product pages and blog content, critical for organic search traffic.
- **Static Generation (SSG)**: Product listing and category pages can be statically generated for maximum performance.
- **API Routes**: Full-stack capabilities within a single framework for server-side logic.
- **Image Optimization**: Built-in image optimization for product media.
- **TypeScript Support**: Type safety across the entire frontend codebase.
- **Tailwind CSS**: Utility-first CSS enables rapid, consistent UI development.
- **shadcn/ui**: Accessible, composable UI components built on Radix UI primitives.

### React Admin Dashboard
- **Separation of concerns**: Admin panel has different performance and UX requirements than the storefront.
- **Catalyst UI Kit**: Pre-built enterprise components designed for data-dense admin interfaces.
- **Shared TypeScript types**: Both frontends share type definitions through a common package.
- **Tailwind CSS**: Same styling approach ensures visual consistency.

## Consequences

### Positive
- SEO-optimized storefront for organic traffic growth.
- Fast initial page loads through SSR and SSG.
- Rich admin experience with enterprise-grade components.
- Shared design language through Tailwind CSS.
- Strong TypeScript support across both applications.

### Negative
- Two separate frontend codebases to maintain.
- Team needs expertise in both Next.js and React SPA patterns.
- Component library duplication between shadcn/ui and Catalyst.

### Mitigation
- Share common utilities, types, and API clients through a shared package.
- Establish a monorepo structure (pnpm workspaces) to manage shared code.
- Document component patterns for both UI libraries.

## Related Decisions

- ADR-001: Modular Monolith Architecture
- ADR-003: Backend Stack
