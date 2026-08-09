# Sabz System Platform
# Sprint 00 — Foundation

Version: 1.0

---

# Sprint Goal

Establish the project foundation: monorepo structure, authentication system, user management, and partner registration.

---

# Duration

Weeks 1–2

---

# Scope

## Must Have

- [ ] Initialize monorepo with pnpm workspaces
- [ ] Setup NestJS API application
- [ ] Setup Next.js storefront application
- [ ] Setup React admin application
- [ ] Configure Prisma with PostgreSQL
- [ ] Implement user registration (phone + password)
- [ ] Implement OTP verification via SMS
- [ ] Implement JWT authentication (login, refresh, logout)
- [ ] Implement role-based access control (Customer, Partner, Operator, Admin)
- [ ] Implement partner registration with business info
- [ ] Setup Docker Compose for local development
- [ ] Configure ESLint, Prettier, and TypeScript strict mode
- [ ] Setup CI/CD pipeline (lint, typecheck, test, build)

## Should Have

- [ ] Admin dashboard layout and navigation
- [ ] User management views in admin
- [ ] Basic API documentation

## Won't Have (This Sprint)

- Product management
- Inventory management
- Payment processing
- Order management

---

# Acceptance Criteria

1. Users can register with phone number and password.
2. Users receive and verify OTP codes via SMS.
3. Users can log in and receive JWT tokens.
4. Token refresh works correctly.
5. Partners can register with business information.
6. Roles and permissions are enforced on API endpoints.
7. All three applications (API, storefront, admin) start locally.
8. CI pipeline passes on pull requests.

---

# Notes

- This sprint focuses on the **foundation** that all subsequent sprints will build upon.
- Holo data migration will be addressed in Sprint 1.
- Product and inventory management begin in Sprint 1.
