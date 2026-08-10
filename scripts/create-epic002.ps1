$repo="heidary100/sabz-system"

$issues=@(

@{
title="SS-011 Design User Identity Database Model"
body=@'
# Objective

Design the database foundation for all user identities.

The system supports:

- Customers (B2C)
- Partners (B2B)
- Admins
- Operators

## Requirements

Create database design for:

- User entity
- User profile
- Phone number identity
- Account status
- User roles relationship

## Existing Documentation

This issue builds on existing documentation. Extend and align, do not duplicate:

- docs/02-requirements/feature-specifications/authentication.md (AUTH rules, validation, OTP and token policy)
- docs/04-database/database-design-specification.md (User, Role, Permission, User Session)
- docs/04-database/entity-relationship-model.md (User to Customer / Partner hierarchy)
- docs/06-uml/domain-model.md
- docs/08-sprints/sprint-01-authentication.md

## Deliverables

- ERD for the identity domain (User, UserProfile, Role, Permission, UserSession)
- Prisma model proposal for schema.prisma
- User lifecycle states (for example PENDING_OTP, ACTIVE, SUSPENDED, LOCKED)
- Database decisions documented (unique mobile, soft delete, audit fields per DDS)

## Acceptance Criteria

- Database model supports B2C users
- Database model supports B2B users
- Database model supports admin users
- Role assignment is possible (many-to-many, per AUTH-005)
- Future authentication methods can be added (per auth spec future support)

## Out of Scope

- OTP implementation
- Login endpoints
- Permissions logic
'@
labels="type:feature,area:database,priority:critical,sprint:1"
},

@{
title="SS-012 Implement User Database Schema"
body=@'
# Objective

Implement user identity database models using Prisma, following the SS-011 design.

## Requirements

Create:

- User model
- UserProfile model
- Role relation
- Status enums

## Technical Requirements

- Update apps/api/prisma/schema.prisma
- Create migration (pnpm --filter @sabz/api prisma:migrate)
- Generate Prisma client (pnpm --filter @sabz/api prisma:generate)
- Follow audit field and soft delete conventions from the Database Design Specification

## Acceptance Criteria

- Migration runs successfully
- Database supports customer users
- Database supports partner users
- Database supports admin users
- Unique constraint on mobile number (AUTH-001)
- Email unique if provided

## Testing

- Verify migration success
- Verify Prisma client generation
'@
labels="type:feature,area:backend,area:database,priority:critical,sprint:1"
},

@{
title="SS-013 Create Authentication Module Foundation"
body=@'
# Objective

Create the NestJS authentication module structure.

## Requirements

Create apps/api/src/modules/auth containing:

- auth.module.ts
- auth.controller.ts
- auth.service.ts
- dto/

## Initial capabilities

- Authentication service abstraction
- User lookup
- Authentication strategy preparation

## Out of Scope

- OTP sending
- JWT implementation
- Permissions
'@
labels="type:feature,area:backend,priority:critical,sprint:1"
},

@{
title="SS-014 Implement OTP Authentication"
body=@'
# Objective

Implement mobile OTP authentication.

## Requirements

Users authenticate using:

- mobile number
- OTP code

## Features

- Generate OTP
- Store temporary OTP (Redis)
- Validate OTP
- Expire OTP
- Prevent brute force attempts

## Policy

Follow docs/02-requirements/feature-specifications/authentication.md:

- 6-digit code
- Expires after 2 minutes
- Maximum 5 verification attempts
- Rate limiting on the OTP endpoint

## Acceptance Criteria

- Customer can request OTP
- Customer can verify OTP
- Customer can create an account after verification

## Out of Scope

- JWT issuance (SS-015)
'@
labels="type:feature,area:backend,priority:high,sprint:1"
},

@{
title="SS-015 Implement JWT Authentication"
body=@'
# Objective

Implement session authentication.

## Requirements

- JWT access token (15-minute lifetime per auth spec)
- Refresh token mechanism (30-day lifetime)
- Authentication guards

## Acceptance Criteria

- Protected routes require authentication
- User identity available through request context
- Refresh token rotation and revocation support

## Out of Scope

- Role-based authorization (SS-016)
'@
labels="type:feature,area:backend,priority:high,sprint:1"
},

@{
title="SS-016 Implement Role Based Access Control"
body=@'
# Objective

Implement the authorization foundation.

Roles:

- CUSTOMER
- PARTNER
- OPERATOR
- ADMIN

## Requirements

- Role entity
- Permission structure
- Guards
- Decorators

## Acceptance Criteria

- Routes can restrict access by role
- Supports multiple roles per user (AUTH-005)
- Admin role assignment restricted to super admins (AUTH-006)

## Out of Scope

- User and role management UI (admin application)
'@
labels="type:feature,area:backend,priority:critical,sprint:1"
},

@{
title="SS-017 Admin Authentication Integration"
body=@'
# Objective

Connect the admin application with the authentication backend.

## Requirements

- Login page (Catalyst UI)
- Authentication state
- Protected routes
- Token storage and refresh handling

## Acceptance Criteria

- Admin users can log in
- Unauthorized users cannot access the dashboard
- Session persists across token refresh

## Dependencies

- SS-015 JWT authentication
- SS-016 RBAC
'@
labels="type:feature,area:admin,priority:high,sprint:1"
},

@{
title="SS-018 User Profile Management"
body=@'
# Objective

Allow users to manage profile information.

## Requirements

Support:

- name (first and last)
- phone
- address
- profile information

## Acceptance Criteria

- Authenticated users can view their own profile (GET /auth/profile)
- Authenticated users can update their own profile (PATCH /auth/profile)
- Users can only edit their own profile (AUTH-US-004)
- Profile updates are validated and audit logged

## Out of Scope

- Admin user management views
'@
labels="type:feature,area:backend,priority:medium,sprint:1"
}

)

foreach($issue in $issues){

gh issue create `
--repo $repo `
--title $issue.title `
--body $issue.body `
--label $issue.labels

}
