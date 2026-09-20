---
name: restaurant-platform
description: Architecture map and working rules for the restaurant-platform codebase (Next.js 15 + Postgres/Supabase, multi-tenant storefront). Use before adding, changing or debugging any feature so the project does not need to be scanned; it says which layer owns what, which function to call, and what must not be done.
---

# restaurant-platform — project skill

Read this instead of exploring the tree. Deeper rationale: `docs/ARCHITECTURE.md` (layers, future multi-DB, backend extraction) and `DECISIONS.md` (why each choice was made). Verify a symbol with Grep before relying on it; this file can lag the code.

## What it is

Multi-tenant restaurant storefront: menu, cart, guest/customer checkout, table reservations, reviews, order tracking. Routes live under `/r/[restaurantSlug]/...`; `/` redirects to the default restaurant. Only the customer storefront exists — staff/admin UI is not built (auth service and permissions are ready for it). Stack: Next.js 15 (App Router, server actions), React 19, Tailwind 4, `pg` (no ORM), zod, jose, decimal.js, vitest, Playwright.

## Layers (imports only flow downward)

```
src/app, src/components      UI. Pages/layouts/server actions/React components
        ↓
src/web                      Next.js glue: cookies, session, request cache, notFound(), theme CSS, seo, media
        ↓
src/server/services          Use cases (business rules). Framework-free
   ├ src/server/validation   zod input schemas        ├ src/server/domain  pricing engine (pure)
        ↓
src/server/repositories      SQL, one file per aggregate; rows → domain models
        ↓
src/server/db                getDb(scope) → registry → DatabaseManager → Database (pg pools + RLS context)
src/shared                   Isomorphic: models, enums, settings schemas, money, hours, ordering, order-timeline, utils
src/server/config            The ONLY reader of process.env
```

Aliases: `@/*` → `src/*`. Boundaries are enforced by `tests/architecture.test.ts` (run it after structural changes):
- `server/` and `shared/` import no `next`, `react`, `@/web`, `@/components`, `@/app`; `shared/` imports no `@/server`.
- `app/` and `components/` never import `@/server/repositories`, `@/server/db`, `@/server/context`, `auth-service`, `tokens`.
- `server/services` and `server/domain` never import `@/server/db` or `pg`.
- `new Pool(` only in `server/db/database.ts`; `process.env` only in `server/config/`.

## Where new code goes

| Adding | Put it in |
| --- | --- |
| page / layout | `src/app/r/[restaurantSlug]/...`; get data via `web/storefront` (`requireStorefront`, `readCart`) and `server/services` |
| server action | `src/app/r/[restaurantSlug]/<feature>/actions.ts` (`'use server'`): `schema.parse(payload)` → service → `revalidatePath`, all inside `action(...)` from `@/server/errors`. Returns `ApiResult<T>`. No rules here. |
| business rule | `server/services/<feature>.ts`; pure math in `server/domain` |
| input schema | `server/validation/<feature>.ts` (shared by actions and any future HTTP route) |
| SQL | `server/repositories/<aggregate>.ts` only |
| type used by UI + server | `shared/contract/models.ts`; DB `Row` types never leave `repositories/` and `db/mappers.ts` |
| env variable | schema in `server/config/index.ts` + `.env.example`; read as `config.app\|database\|auth\|storage\|payments` |
| cookie / headers / `next/*` | `src/web/` |
| third-party API | `server/integrations/` |
| migration | new numbered file in `db/migrations/`. NEVER edit an applied migration (checksummed by `scripts/db/migrate.mjs`) |

## Symbol map (what to call)

**web/**  `storefront.ts`: `getStorefrontContext` (React-cached), `requireStorefront(slug)` (404 only for real NOT_FOUND; other errors → error boundary), `readCart(restaurant)` (never sets cookies), `openStorefrontCart(slug)` (server actions only; mints cart cookie). `session.ts`: `getVisitorContext(restaurantId)` → `RequestContext {restaurantId, cartToken, customerId, userId}`, `getStorefrontCustomer(restaurantId)`, `getCartToken/setCartToken`, `getCurrentStaff/requireStaff/requirePermission`. `cookies.ts` names/options. `theme.ts` `themeCssVariables`, `fontStack`. `seo.ts` JSON-LD. `media.ts` image fallbacks.

**server/services**
- `storefront`: `loadStorefrontContext(slug)`, `resolveTheme`, `getHomePageContent`
- `restaurants`: `requireRestaurant(slug)`, `getLocations(id,{activeOnly})`, `getDeliveryZones(id,{locationId,activeOnly})`
- `catalog`: `getMenuCategories`, `searchMenu(id, filters)`, `findMenuItemBySlug`
- `cart`: `generateCartToken`, `findCart`, `openCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `emptyCart`, `applyCoupon`, `changeOrderType`, `changeCartLocation`, `priceCart`, `validatePromoCode`, `serviceAvailability`
- `checkout`: `placeOrder(restaurant, input, visitor)`, `getCheckoutOptions(restaurant)`
- `orders`: `trackOrder(restaurantId, orderNumber, visitor)`
- `reservations`: `bookTable`, `getBookedSlots`; `reviews`: `submitReview`, `getPublicReviews`, `getReviewSummary`

**server/repositories** (exports): analytics (dashboard/sales/popular/hourly/delivery stats); carts; coupons; customers; deliveries (zones + deliveries, `matchDeliveryZone`); media; menu (categories, items, variants, addon groups CRUD); orders (`createOrder`, `getOrderByNumber`, `updateOrderStatus`, kitchen/customer lists…); payments; reservations; restaurants (+ locations); reviews; team; websites (+ pages). Most exist for the future admin UI and are unused by the storefront.

**server/auth**: `auth-service` (`signInStaff/Customer`, `createCustomerAccount`, `authenticateStaff`, `resolveCustomer`, `assertPermission`), `tokens` (HS256 JWTs, `SESSION_TTL`), `password` (scrypt), `permissions` (RBAC catalogue, `can`).
**server/errors**: `errors.notFound|unauthorized|forbidden|validation|conflict|rateLimited|internal|custom(code,msg)`, `AppError`, `toApiError`, `action(fn)` (server actions), `jsonError(e)` (route handlers). `PricingError extends AppError`. Log via `server/logger.ts`, never `console.*`.
**shared**: `ordering.isOrderTypeEnabled/enabledOrderTypes` (single source for order-type gating), `money` (decimal strings; `formatMoney`), `hours`, `order-timeline`.

## Request context and multi-tenancy

- `RequestContext` (`server/context.ts`) = `{userId, restaurantId, customerId, cartToken, actor}`. Services pin the tenant with `forRestaurant(id, ctx)`. `restaurantId` is both the RLS pin and the DB routing key.
- Repositories obtain a database only via `getDb({ restaurantId })` or `getDb(ctx)`; platform lookups (slug resolution, public restaurant list) use `getDb()`. Then `db.read(ctx, tx => …)` (runtime role, RLS enforced) or `db.write(ctx, tx => …)` (service role, for authorised writes). Each call is one transaction that sets `app.*` settings with `set_config(..., true)`; do not nest transactions.
- Today one database serves everyone (`SingleDatabaseDirectory` in `server/db/registry.ts`). Per-restaurant databases = implement `DatabaseDirectory`; nothing else changes (steps in `docs/ARCHITECTURE.md`). Do not implement it unless asked.

## Rules that are easy to break

1. Money is `string` (2 dp) everywhere; compute with `shared/money` / `server/domain/pricing`. Never `number`. Prices are recomputed server-side from the DB; the browser sends ids, quantities and notes only.
2. Guest access is proven with the cart token (httpOnly cookie `rp_cart`). Anything that reads an order or cart as a guest must pass `cartToken` in the context (`getVisitorContext` does).
3. Website `theme`, `settings`, `features`, `sections` are untrusted JSONB: parse with the zod schemas in `shared/contract/settings|sections`, never read raw.
4. Order status is a DB-enforced state machine with `order_status_history`; UI must not decide transitions.
5. Permissions exist in SQL (`app.role_permissions()`) and TS (`server/auth/permissions.ts`); change both plus a migration; `tests/rbac.test.ts` checks parity.
6. Do not expose DB/system messages to clients: throw `errors.*`/`AppError`; unknown errors become a generic INTERNAL_ERROR.
7. Never call a repository from a page, component or action; add or extend a service.
8. `revalidatePath` and `notFound()` belong to `app/`/`web/`, not services.

## DB and environment

- Roles: `app_owner` (migrations/seed, bypasses RLS), `app_runtime` (RLS enforced), `app_service` (BYPASSRLS, server-side writes). On Supabase's pooler a single login is used and `Database` does `set local role` per transaction.
- Dev `.env.local` points at a hosted Supabase pooler (slow: ~1 s/round trip; avoid loops of sequential queries). There is NO local Postgres on the dev machine, so DB-backed vitest suites cannot run there; `tests/setup.ts` redirects tests to `localhost` test DB and never touches hosted data. Do not run write flows against the hosted DB without asking.
- Env vars are listed in `.env.example`: `DATABASE_URL`, `DATABASE_URL_SERVICE`, `DATABASE_URL_MIGRATOR`, `AUTH_SECRET` (≥16 chars), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DEFAULT_RESTAURANT`, Supabase storage vars, Stripe vars.

## Commands

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (vitest; DB suites need Postgres) · `npx vitest run tests/architecture.test.ts tests/config.test.ts tests/database-registry.test.ts tests/pricing.test.ts` (no DB needed) · `npm run db:migrate|db:seed|db:reset|db:verify` · `npm run test:e2e` (Playwright).

Verification without a database: `npm run typecheck`, the four DB-free test files above, `npx next build`, then `next start` and curl the `/r/bella-napoli/*` GET routes.

## Known gaps (do not rediscover)

- `createOrder`, `createReservation`, `resolveItemSelection` are SQL + rules transaction scripts inside repositories (split needs the DB suites).
- `auth-service` queries `auth.users` directly; `repositories/team.ts` hashes passwords.
- ID-only repository lookups (`getCartById`, `getLocationById`, menu updates…) use `getDb(ctx)` and rely on `ctx.restaurantId` being set by the caller.
- Reservation page issues one sequential query per day per location (very slow on the hosted DB); needs a range query.
- Media URLs use `/api/media/...` but no route handler exists.
- No ESLint config; `tsc` + the architecture test are the guardrails.
- Two demo tenants are seeded (Bella Napoli `bella-napoli`, Sakura); test fixtures are in `tests/helpers/db.ts`.
