$repo="heidary100/sabz-system"

$epics=@(
    @{
        title="EPIC-001 Platform Foundation"
        body=@"
## Objective

Establish the technical foundation of Sabz System.

## Scope

- Project architecture
- Development environment
- Infrastructure
- Core application structure

## Related Milestone

M1 - Platform Foundation
"@
        labels="type:feature,priority:critical"
    },

    @{
        title="EPIC-002 Authentication & User Management"
        body=@"
## Objective

Implement identity management.

## Scope

- Customer registration
- Login
- OTP verification
- Roles
- Permissions
- User profiles

"@
        labels="type:feature,area:backend"
    },

    @{
        title="EPIC-003 Partner Management"
        body=@"
## Objective

Implement B2B partner workflows.

## Scope

- Partner registration
- Business documents
- Approval workflow
- Partner tiers

"@
        labels="type:feature,area:backend"
    },

    @{
        title="EPIC-004 Administration"
        body=@"
## Objective

Create administration capabilities.

## Scope

- Admin dashboard
- Operator dashboard
- User management
- Permissions

"@
        labels="type:feature,area:admin"
    },

    @{
        title="EPIC-005 Product Catalog"
        body=@"
## Objective

Manage product information.

## Scope

- Categories
- Brands
- Products
- Specifications
- Media

"@
        labels="type:feature,area:backend"
    },

    @{
        title="EPIC-006 Inventory"
        body=@"
## Objective

Manage stock availability.

## Scope

- Stock tracking
- Availability
- Inventory status

"@
        labels="type:feature,area:backend"
    }
)


foreach($epic in $epics){

    gh issue create `
        --repo $repo `
        --title $epic.title `
        --body $epic.body `
        --label $epic.labels

}