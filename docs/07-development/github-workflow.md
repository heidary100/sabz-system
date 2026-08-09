# Sabz System Platform
# GitHub Workflow

Version: 1.0

---

# Branch Strategy

The project uses a simplified GitHub Flow:

```
master (production-ready)
  ^
  +-- feature/SS-XXX-description (pull request)
```

- `master` is always deployable.
- All work happens in feature branches.
- Pull requests merge into `master` using squash merge.

---

# Issue Workflow

## Issue Lifecycle

```
Backlog -> Sprint Planning -> In Progress -> Review -> Done
```

## Issue Labels

| Label | Purpose |
|-------|--------|
| `sprint-X` | Sprint assignment |
| `module-name` | Feature module (auth, products, orders, etc.) |
| `priority-high` | Must complete in current sprint |
| `priority-medium` | Should complete in current sprint |
| `priority-low` | Can defer to future sprint |
| `bug` | Bug fix |
| `enhancement` | Feature enhancement |

## Issue Types

- **Epic**: Large feature spanning multiple sprints.
- **Issue**: Individual task linked to an epic.
- **Sub-issue**: Granular tasks within an issue.

---

# Pull Request Process

## Creating a PR

1. Create a feature branch from `master`.
2. Implement the changes linked to a GitHub issue.
3. Ensure all checks pass (lint, typecheck, test, build).
4. Create a PR with:
   - Clear title following commit convention.
   - Description referencing the issue (`Refs: #SS-XXX`).
   - Checklist of what was done.

## PR Template

```markdown
## Summary
Brief description of changes.

## Issue
Refs: #SS-XXX

## Changes
- [ ] Change 1
- [ ] Change 2

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing performed
```

## Review Checklist

- [ ] Code follows project coding standards.
- [ ] No unnecessary files or dependencies added.
- [ ] Architecture boundaries are respected.
- [ ] Tests pass and cover new functionality.
- [ ] No hardcoded values or secrets.

---

# CI/CD Pipeline

## On Pull Request

1. Lint all packages.
2. Type check all packages.
3. Run all tests.
4. Build all packages.

## On Merge to Master

1. All PR checks run again.
2. Preview deployment (if staging is configured).
3. Tag release if applicable.
