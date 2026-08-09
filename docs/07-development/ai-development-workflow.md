# Sabz System Platform
# AI-Assisted Development Workflow

Version: 1.0

---

# Overview

This document describes the AI-assisted development workflow used in the Sabz System Platform project. The project leverages AI coding tools (such as OpenCode, DeepSeek, and other AI assistants) to accelerate development while maintaining code quality and architectural integrity.

---

# Core Principles

1. **AI assists, humans approve**: AI generates code, humans review and approve before merging.
2. **Documentation-first**: AI agents must read relevant docs in `/docs` before implementing any feature.
3. **Issue-driven**: All code changes must be linked to a GitHub issue.
4. **Smallest change**: Make the minimum required change to address the issue.
5. **No speculative refactoring**: Do not refactor unrelated code.

---

# Workflow Steps

## Step 1: Issue Creation

- Product owner creates a GitHub issue with clear description and acceptance criteria.
- Issue is assigned to a sprint and linked to the product backlog.
- Issue labels: `sprint-X`, `module-name`, `priority-high/medium/low`.

## Step 2: AI Agent Preparation

Before starting implementation, the AI agent must:

1. Read the `AGENTS.md` file at the repository root.
2. Read relevant feature specifications in `docs/02-requirements/feature-specifications/`.
3. Read the software architecture document in `docs/03-architecture/`.
4. Read any relevant ADRs in `docs/03-architecture/architecture-decisions/`.
5. Understand the existing code structure.

## Step 3: Implementation

The AI agent should:

1. Explain what files will change and why.
2. Describe any architectural decisions.
3. Implement the smallest required change.
4. Follow all coding standards defined in `AGENTS.md`.

## Step 4: Verification

Before marking an issue as complete:

```bash
# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Verify build
pnpm build
```

## Step 5: Review & Merge

1. Create a pull request linked to the GitHub issue.
2. Human reviewer checks the code for correctness and architectural compliance.
3. If changes are needed, the AI agent addresses review feedback.
4. After approval, merge using squash merge.

---

# Branch Naming Convention

```
feature/SS-XXX-short-description
fix/SS-XXX-short-description
refactor/SS-XXX-short-description
```

Examples:

- `feature/SS-001-user-registration`
- `fix/SS-015-login-validation-error`
- `refactor/SS-022-extract-pricing-service`

---

# Commit Message Convention

```
<type>(<scope>): <description>

# Optional footer:
Refs: #SS-XXX
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring without behavior change
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

Examples:

```
feat(auth): add OTP verification endpoint
fix(cart): resolve quantity calculation error
refactor(products): extract specification service
docs(api): update authentication endpoints
```

---

# AI Agent Guidelines

## What AI Agents Should Do

- Read documentation before writing code.
- Follow the modular monolith structure.
- Create tests for new functionality.
- Use TypeScript strict mode.
- Validate external inputs.
- Keep controllers thin, business logic in services.

## What AI Agents Should NOT Do

- Create unnecessary files or abstractions.
- Add dependencies without justification.
- Change architecture without discussion.
- Implement features outside the current milestone scope.
- Modify unrelated code.
- Skip tests or build verification.

---

# File References for AI Agents

When working on a feature, always check these docs first:

| Working on... | Read this doc |
|--------------|----------------|
| Any feature | `AGENTS.md`, `docs/03-architecture/software-architecture-document.md` |
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
