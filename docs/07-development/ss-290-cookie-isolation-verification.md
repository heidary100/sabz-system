# SS-290 — Refresh-Cookie Isolation Verification

> Deploy gate for [#290](https://github.com/heidary100/sabz-system/issues/290).
> Use this procedure on the **actual deployed topology**. A local reproduction
> is evidence of the defect, not proof that production is safe.

## 1. What must be true

The API sets one refresh cookie:

- name: `sabz_refresh_token`
- host-only: **no `Domain` attribute**
- path: `/api/v1/auth`
- `HttpOnly`
- `SameSite=Lax`
- `Secure` when `NODE_ENV=production`

Cookie scope is determined by the **host that sends `Set-Cookie`** and by the
`Domain` attribute — not by the frontend hostname that initiated the request.

The storefront and admin must **not** share a cookie-issuing origin. Supported
topologies:

| Topology | Storefront API URL | Admin API URL | Cookie issuer | Status |
|---|---|---|---|---|
| **C — same-origin proxies (preferred)** | `https://shop.<domain>/api/v1` | `https://admin.<domain>/api/v1` | `shop.<domain>` / `admin.<domain>` | Supported |
| **B — separate API hostnames** | `https://api-shop.<domain>/api/v1` | `https://api-admin.<domain>/api/v1` | `api-shop.<domain>` / `api-admin.<domain>` | Supported |
| A — shared API origin | `https://api.<domain>/api/v1` | `https://api.<domain>/api/v1` | `api.<domain>` | **Unsupported — reproduces #290** |
| D — shared parent `Domain` | any | any | shared parent domain | **Unsupported — never set `Domain` for isolation** |

For `SameSite=Lax` to work, the API origin must be same-origin with the
frontend (C) or same-site (B, e.g. both under the same registrable domain).
Do not use a cross-site API origin with `SameSite=Lax`; the cookie will not be
attached to the refresh request. Do not switch to `SameSite=None` as a
substitute for isolation.

## 2. Preconditions

- One browser, **one profile, one cookie jar**, two tabs. Do not use separate
  profiles or separate browser contexts.
- A customer account and an admin account with `ADMIN` or `OPERATOR`.
- DevTools → Application → Cookies and Network (Preserve log, disable cache).
- Production-like HTTPS when verifying `Secure`.
- Never capture or paste passwords, OTPs, access tokens, refresh tokens, or raw
  `Set-Cookie` values. Record attribute names only; redact values.

## 3. Procedure

1. Open the storefront in tab A and log in as the customer.
2. Verify an authenticated storefront page/API call succeeds.
3. Record the refresh cookie: name, host, path, `Domain`, `HttpOnly`, `Secure`,
   `SameSite`, expiry. Do not copy the value.
4. Open the admin panel in tab B, same profile.
5. Before logging in, observe whether the admin app calls `/auth/refresh` on
   mount and whether it changes the storefront cookie. Record the result.
6. Log in as the administrator.
7. Verify an admin-only page/API call succeeds.
8. Return to tab A and trigger the storefront’s normal refresh:
   - set `localStorage['sabz.accessToken']` to an invalid value and open
     `/account` (the client will 401 → refresh → retry), or
   - use a short `JWT_ACCESS_EXPIRES_IN` in the verification environment and
     wait for expiry.
9. Verify the refresh response identity is the customer (`/auth/me`: id,
   masked mobile, roles). Verify the customer can access customer functionality
   and still receives 403 from an admin-only endpoint.
10. Return to tab B and trigger the admin’s normal refresh: reload the tab
    (`AuthProvider.restore()` calls `/auth/refresh` on mount) or wait for a 401.
11. Verify the admin refresh returns the admin identity and admin permissions.
12. Repeat steps 8–11 at least twice in both applications.
13. Reload each application independently; confirm each restores its own
    session.
14. Log out of one application through its **actual UI logout**. Record the
    request status, whether the response clears a cookie, and whether the other
    application’s refresh still succeeds. (Known prerequisite: the storefront
    logout must send the Bearer token; see §6.)
15. Near-simultaneous refresh: trigger a refresh in both tabs as close together
    as practical. Record both statuses and identities. In an isolated topology
    both must succeed with their own identity. A `200`/`401` pair or crossover
    is a failure.
16. Inspect the cookie jar. In an isolated topology there must be two distinct
    refresh cookies (different hosts, or the approved per-app design). Each
    refresh request must carry only its own app’s cookie.

## 4. Evidence template

| Item | Storefront | Admin |
|---|---|---|
| Frontend URL | | |
| API request URL used by the browser | | |
| `Set-Cookie` response host | | |
| Cookie name | | |
| Cookie `Domain` | | |
| Cookie `Path` | | |
| `SameSite` | | |
| `Secure` | | |
| `HttpOnly` | | |
| Refresh request status | | |
| Identity after refresh (`/auth/me`: id, masked mobile, roles) | | |
| Customer-only endpoint result | | |
| Admin-only endpoint result | | |
| Logout request status / cookie cleared? | | |
| Other app still refreshable after logout? | | |
| Concurrent refresh statuses | | |

Attach screenshots of the DevTools Application → Cookies and Network panels
with values redacted. A successful page render is not proof.

## 5. Failure conditions

- Storefront refresh returns the admin identity/roles, or admin refresh returns
  the customer identity.
- Opening one app rotates or clears the other’s cookie.
- Logging out of one app clears the other’s cookie in an isolated topology.
- Concurrent refresh produces `401`/`TOKEN_REUSE` across apps.
- Both apps’ refresh requests go to the same API host and carry the same
  cookie.
- `Set-Cookie` contains a shared parent `Domain`.
- The cookie is not attached at all (cross-site `SameSite=Lax` / third-party
  cookie blocking) — a topology failure, not a pass.

## 6. Prerequisites and known gaps

- **Storefront logout** must send the access token to the Bearer-guarded
  `/auth/logout` endpoint. Without it the endpoint returns `401`, the session is
  not revoked, and the HttpOnly cookie is not cleared. This is fixed in
  `apps/storefront/src/lib/auth-client.ts`; verify it in the browser.
- **Refresh-token rotation** includes a unique `jti` claim so two rotations in
  the same second cannot mint an identical JWT. This is required for the
  near-simultaneous test.
- **Storefront refresh is not single-flight.** Multiple simultaneous 401s can
  each call `/auth/refresh`; that is a separate reliability item, not a
  cross-app isolation proof.
- **The cloud demo currently uses one API origin** for both frontends. It cannot
  pass this procedure as deployed. Use separate browser profiles, or add a
  same-origin `/api` rewrite/proxy to each frontend before relying on
  simultaneous sessions.

## 7. Baseline evidence (2026-11-08)

Local dev stack, one Chromium profile, two tabs, shared API origin
(`http://localhost:3000/api/v1`):

- Customer login set `sabz_refresh_token` with `Path=/api/v1/auth`,
  `HttpOnly`, `SameSite=Lax`, no `Domain` (dev: no `Secure`).
- Opening the admin tab issued `POST /auth/refresh` 200 using the customer
  cookie and `GET /auth/me` 200; the admin shell stayed on `/login`.
- Admin login overwrote the same cookie.
- Storefront refresh then returned the **admin** identity (`…001`,
  roles `["ADMIN"]`).
- Two concurrent refreshes returned one `200` and one `401`.
- This is a reproduction of #290, not a deployment pass.

The deployed cloud demo bundles both point at the same
`*.trycloudflare.com` API origin; the API tunnel was unreachable, so the live
demo procedure is **blocked**. Production has not been inspected.

## 8. References

- `apps/api/src/modules/auth/refresh-token-cookie.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `docs/05-api/authentication-api.md`
- `docs/07-development/deploy-runbook.md`
- `docs/07-development/cloud-demo-deploy.md`
