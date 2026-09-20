# Architecture

One Next.js app today, laid out so the backend can be lifted out and so a
restaurant can later get its own database without touching business logic.

```
Browser
  │
  ▼
src/app, src/components      UI: pages, layouts, server actions (thin), React components
  │
  ▼
src/web                      Next.js adapters: cookies, request-scoped cache, notFound(), theme CSS
  │
  ▼
src/server/services          Use cases: cart, checkout, reservations, reviews, catalog, storefront …
  │        ▲ src/server/validation (zod input schemas)   src/server/domain (pricing engine)
  ▼
src/server/repositories      SQL, one file per aggregate; rows → domain models (db/mappers.ts)
  │
  ▼
src/server/db                getDb(scope) → registry → DatabaseManager → Database (pg pools, RLS context)
  │
  ▼
PostgreSQL / Supabase        db/migrations/*.sql is the schema (RLS, triggers, roles)

src/shared                   Isomorphic contract used by every layer: models, enums, settings schemas,
                             money, hours, ordering rules, order timeline
src/server/config            The only reader of process.env
```

## Folder map

```
src/
  app/                       routes only; actions.ts = parse → service → revalidate
  components/{ui,storefront}/
  web/                       cookies.ts session.ts storefront.ts theme.ts media.ts seo.ts
  server/                    framework-free (no next/react/@/web/@/components) — enforced by a test
    config/                  typed, lazily-parsed env sections: app, database, auth, storage, payments
    context.ts               RequestContext + forRestaurant()
    db/                      database.ts (pools, transactions), registry.ts (routing), mappers.ts
    repositories/            analytics carts coupons customers deliveries media menu orders
                             payments reservations restaurants reviews team websites
    services/                cart checkout catalog orders reservations restaurants reviews storefront
    domain/                  pricing.ts (pure, no I/O)
    auth/                    auth-service.ts tokens.ts password.ts permissions.ts
    validation/              cart checkout reservation review common
    integrations/            payments.ts storage.ts
    errors.ts logger.ts rate-limit.ts
  shared/                    contract/{models,enums,api,settings,sections} money hours ordering
                             order-timeline utils
db/migrations/               schema (checksummed, forward-only — do not edit applied files)
scripts/db/                  migrate, seed, verify (owner connection, outside the app)
tests/                       vitest: pricing, checkout, reservations, rbac, tenant isolation (need Postgres),
                             plus architecture, config, database-registry (no database needed)
```

## Where does new code go?

| I am adding… | Put it in |
| --- | --- |
| a page or layout | `src/app/...` — call `web/` helpers and `server/services` only |
| a server action | `src/app/.../actions.ts`: `schema.parse` → service → `revalidatePath`, wrapped in `action()` |
| a business rule | `server/services/<feature>.ts` (pure calculations go in `server/domain`) |
| input validation | `server/validation/<feature>.ts`; reuse from actions and future HTTP routes |
| a SQL query | `server/repositories/<aggregate>.ts`; never in services, pages or components |
| a type used by UI and server | `shared/contract/models.ts` (DB rows never leave `repositories/`) |
| an env variable | schema in `server/config/index.ts` + `.env.example`; read via `config.<section>` |
| a third-party API | `server/integrations/` |
| cookie / header / `next/*` code | `src/web/` |

Types: DB rows (`Row`, snake_case) exist only inside repositories and `db/mappers.ts`; domain models are
`shared/contract/models`; API envelopes are `ApiResult`/`ApiError`; UI props are declared by the component.

## Request context and tenant isolation

Every request builds a `RequestContext` (`server/context.ts`): `restaurantId`, `userId`, `customerId`,
`cartToken`, `actor`. `web/session.ts#getVisitorContext` derives it from cookies; services pin it to a
restaurant with `forRestaurant(id, ctx)`; repositories hand it to `Database.read/write`, which applies it
inside the transaction with `set_config(..., true)` so RLS policies see it and nothing leaks between pooled
connections. Isolation is enforced by RLS (unprivileged `app_runtime` role) and re-checked in services
(`resolveCustomer` rejects a session issued for another restaurant; `requireLine` rejects foreign cart items).

## Error handling

`AppError` (with `errors.notFound/unauthorized/forbidden/validation/conflict/...`) and `PricingError` are the
only errors shown to users. `toApiError` maps zod, Postgres and unknown errors to a safe `ApiError`;
`action()` (server actions) and `jsonError()` (route handlers) are the two edges that convert and log through
`server/logger.ts`. Database messages and stack traces never reach the client.

## Configuration

`config.app | database | auth | storage | payments`. Each section parses only its own variables the first
time it is used, so importing config has no side effects and a missing variable fails with its **name**
(never its value). Secrets stay in the environment. `.env.example` lists every variable.

## Moving the backend out later

`src/server` and `src/shared` import no framework code (`tests/architecture.test.ts` fails otherwise).
To run them as a standalone service:

1. Move `src/server` and `src/shared` into the backend package (keep the `@/server` / `@/shared` aliases).
2. Add an HTTP layer (Fastify/Hono/Express or Next route handlers). Each server action becomes a route:
   `schema.parse(body)` from `server/validation` → the same service function → `jsonError()` for failures.
3. Replace `web/session.ts#getVisitorContext` with middleware that builds the same `RequestContext` from the
   incoming cookie/Authorization header. `server/auth/tokens.ts` already signs/verifies the JWTs; share `AUTH_SECRET`.
4. In the frontend, replace `openStorefrontCart`, `getVisitorContext` and the service calls in pages with an
   API client. Components and `shared/` are untouched; `revalidatePath` stays in the frontend.

## Future: one database per restaurant (not implemented)

Today `SingleDatabaseDirectory` (`server/db/registry.ts`) answers every question with the one configured
database. The seam is complete: repositories call `getDb({ restaurantId })` (or `getDb(ctx)`), the registry asks a
`DatabaseDirectory` which `DatabaseConfig` holds that restaurant, and `DatabaseManager` keeps one `Database`
(runtime + service pool) per config `key`. To enable it:

1. **Store the mapping centrally**: a JSON file or a `restaurant_databases` table in a small platform database:
   `restaurantId, slug, key, runtimeUrlRef, serviceUrlRef`. Keep only *references* (env var / secret-manager
   names) in it; resolve them into URLs when building the `DatabaseConfig`.
2. **Implement `DatabaseDirectory`** (e.g. `RegistryDirectory`) and construct it in `manager()` in
   `registry.ts` instead of `SingleDatabaseDirectory`. `tests/database-registry.test.ts` shows the contract.
3. **Resolve slug → restaurant first.** `getRestaurantBySlug`, `listPublicRestaurants` and the sign-in flows call
   `getDb()` with no restaurant (platform-level). Give the directory a slug lookup that returns the restaurant id
   and database config, and use it in those functions. Everything after that already carries the id.
4. **Close the remaining gaps.** Services always pin `restaurantId`. A few repository functions that look rows up
   by id only (`getCartById`, `getLocationById`, `updateMenuItem`, …) use `getDb(ctx)` and rely on the caller
   having set `ctx.restaurantId`. Make the new directory throw on `null` for tenant repositories in dev/test so
   any call site that forgot shows up immediately (`grep -rn "getDb(ctx)" src/server/repositories`).
5. **Migrations and seeding** run per database: loop `scripts/db/migrate.mjs` over the directory entries.
6. **Auth** needs nothing: sessions already carry `restaurantId`, and sign-in resolves the restaurant (hence the
   database) before it reads `auth.users`.

## Known gaps (deliberately left)

* `createOrder`, `createReservation`, `resolveItemSelection` are transaction scripts that still combine SQL
  and business rules inside repositories. Splitting them needs the Postgres-backed suites, which need a local
  database; do it as its own change.
* `auth-service.ts` queries `auth.users` directly (Supabase-shaped table, not a tenant table) and
  `repositories/team.ts` hashes passwords.
* Comments in already-applied migrations mention the old `src/lib/...` paths. Migrations are checksummed, so they
  were not edited.
* No ESLint configuration exists; boundaries are enforced by `tests/architecture.test.ts` and `tsc`.
