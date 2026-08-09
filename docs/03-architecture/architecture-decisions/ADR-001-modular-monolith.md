# ADR-001: Modular Monolith Architecture

## Status

Accepted

## Context

The Sabz System Platform needs a scalable architecture that supports B2C retail, B2B wholesale, admin management, inventory control, and a pricing engine. The team is small and needs to deliver quickly while keeping operational complexity low.

## Decision

We will use a **modular monolith** architecture instead of microservices.

## Rationale

- **Small team**: A microservices architecture requires significant DevOps investment in service discovery, inter-service communication, and distributed tracing that a small team cannot sustain.
- **Faster delivery**: A single deployment unit reduces CI/CD complexity and enables faster iteration cycles.
- **Lower operational cost**: No need for Kubernetes, service mesh, or complex orchestration from day one.
- **Simpler debugging**: All modules run in a single process, making local development and debugging straightforward.
- **Future scalability**: The modular structure with clear boundaries allows extracting individual modules into microservices later if scale demands it.
- **Transaction consistency**: A single database simplifies data consistency compared to distributed transactions.

## Consequences

### Positive
- Faster initial development and deployment.
- Simplified local development environment.
- Lower infrastructure costs in early stages.
- Clear module boundaries prepare for future decomposition.

### Negative
- Potential for tight coupling if module boundaries are not enforced.
- Single point of deployment — a bug in one module can affect the entire system.
- Scaling requires scaling the entire application, not individual modules.

### Mitigation
- Enforce strict module boundaries through NestJS module system.
- Use dependency injection and interface-based communication between modules.
- Each module owns its data access; cross-module queries go through services, not direct database access.
- Regular architecture reviews to prevent boundary erosion.

## Related Decisions

- ADR-002: Frontend Stack
- ADR-003: Backend Stack
