# Sabz System Platform
# Coding Standards

Version: 1.0

---

# General Standards

- **TypeScript strict mode** is enabled for all packages.
- Prefer clean, readable code over clever abstractions.
- Use meaningful, descriptive names for variables, functions, and classes.
- Avoid unnecessary abstractions; add complexity only when needed.
- Validate all external inputs at the boundary (controllers, DTOs).
- Keep functions focused and under 50 lines when possible.
- Use consistent formatting enforced by ESLint and Prettier.

---

# Backend Standards (NestJS)

## Module Structure

Each module follows this structure:

```
modules/
└── example/
    ├── example.controller.ts
    ├── example.service.ts
    ├── example.module.ts
    ├── dto/
    │   ├── create-example.dto.ts
    │   └── update-example.dto.ts
    ├── entities/
    │   └── example.entity.ts
    └── tests/
        ├── example.service.spec.ts
        └── example.controller.spec.ts
```

## Rules

- Follow NestJS conventions for modules, controllers, and services.
- Use DTOs with class-validator decorators for all input validation.
- Keep controllers thin — delegate business logic to services.
- Use dependency injection for all service dependencies.
- Return standardized response formats from controllers.
- Use custom decorators for common patterns (e.g., `@CurrentUser()`).
- Throw `HttpException` or custom exceptions for error handling.

## Database Access

- Use Prisma for all database operations.
- Do not write raw SQL unless absolutely necessary.
- Keep queries in service methods, not in controllers.
- Use transactions for multi-step database operations.

---

# Frontend Standards

## React/Next.js Rules

- Components should be reusable and composable.
- Keep component files under 300 lines.
- Separate business logic from UI components (custom hooks).
- Use Server Components by default in Next.js; Client Components only when needed.
- Use `next/image` for all image rendering.
- Use `next/link` for internal navigation.

## Styling

- Use Tailwind CSS for all styling.
- Follow the existing design tokens and spacing scale.
- Use CSS variables for theme values (colors, typography).
- Avoid inline styles.
- Responsive design: mobile-first approach.

---

# Testing Standards

- Write unit tests for all service methods.
- Write integration tests for API endpoints.
- Use Jest for backend tests.
- Use React Testing Library for frontend tests.
- Test files should be co-located with source files.
- Aim for meaningful coverage, not 100% line coverage.
- Test edge cases and error scenarios, not just happy paths.
