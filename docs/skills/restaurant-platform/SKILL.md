---
name: restaurant-platform
description: The single knowledge base for the restaurant-platform codebase (Next.js 15 + Postgres/Supabase, multi-tenant storefront). Covers architecture and layer rules, where new code goes, symbol map, database and environment, customer notifications (email + push, per-restaurant switches, load behaviour), live order tracking (SSE), running on localhost, deploying to Vercel or other hosts, troubleshooting and known gaps. Read it before adding, changing, running, deploying or debugging anything so the project does not need to be scanned.
---

# restaurant-platform — the one skill

**This file is the only project skill and the only project documentation under `docs/`.** Architecture, notifications, live order status, running and deploying all live here. `DECISIONS.md` (repo root) is the decision log (why each choice was made); everything else is here.

**Maintenance rule (always follow):** whenever you learn something new and useful about this project (a new feature, a gotcha, a command, a deployment step, a bug root cause, a schema change), add it to the matching section of THIS file in the same change. Do not create another skill or another `.md` under `docs/`. If no section fits, add a new `##` section here and list it in the contents below. Keep entries short and factual; correct or delete an entry that turns out to be wrong. Verify a symbol with Grep before relying on it; this file can lag the code.

Contents: 1 Overview · 2 Architecture · 3 Where new code goes · 4 Symbol map · 5 Rules easy to break · 6 Database and environment · 7 Notifications · 8 Live order tracking (SSE) · 9 Run on localhost · 10 Deploy (Vercel / other hosts) · 11 Troubleshooting · 12 Commands and tests · 13 Future: moving the backend out, one database per restaurant · 14 Known gaps · 15 Storefront cache (in-memory snapshot) · 16 Customer accounts (sign-in, Google, email verification) · 17 Admin panel (`/admin`) · 18 Extra demo restaurants (Zaytoun) and per-restaurant seeds · 19 UI design system (storefront + admin)

---

## 1. Overview

Multi-tenant restaurant storefront: menu, cart, guest/customer checkout, table reservations, reviews, order tracking, email and push notifications. Routes live under `/r/[restaurantSlug]/...`; `/` redirects to the default restaurant. Only the customer storefront exists; staff/admin UI is not built (auth service and permissions are ready for it). Stack: Next.js 15 (App Router, server actions), React 19, Tailwind 4, `pg` (no ORM), zod, jose, decimal.js, vitest, Playwright. Demo tenants: Bella Napoli `bella-napoli` (main seed), Sakura (isolation fixture) and Zaytoun `zaytoun` (own seed, section 18); test fixtures are in `tests/helpers/db.ts`.

## 2. Architecture

One Next.js app today, laid out so the backend can be lifted out and so a restaurant can later get its own database without touching business logic.

```
src/app, src/components      UI. Pages/layouts/server actions (thin)/React components
        ↓
src/web                      Next.js glue: cookies, session, request cache, notFound(), theme CSS, seo, media
        ↓
src/server/services          Use cases (business rules). Framework-free
   ├ src/server/validation   zod input schemas        ├ src/server/domain  pricing engine (pure)
        ↓
src/server/repositories      SQL, one file per aggregate; rows → domain models (db/mappers.ts)
        ↓
src/server/db                getDb(scope) → registry → DatabaseManager → Database (pg pools + RLS context)
        ↓
PostgreSQL / Supabase        db/migrations/*.sql is the schema (RLS, triggers, roles)

src/shared                   Isomorphic: models, enums, settings schemas, money, hours, ordering, order-timeline,
                             order-live, notification-channels, utils
src/server/config            The ONLY reader of process.env
```

Aliases: `@/*` → `src/*`. Boundaries are enforced by `tests/architecture.test.ts` (run it after structural changes):
- `server/` and `shared/` import no `next`, `react`, `@/web`, `@/components`, `@/app`; `shared/` imports no `@/server`.
- `app/` and `components/` never import `@/server/repositories`, `@/server/db`, `@/server/context`, `auth-service`, `tokens`.
- `server/services` and `server/domain` never import `@/server/db` or `pg`.
- `new Pool(` only in `server/db/database.ts`; `process.env` only in `server/config/`.
- Order code never imports Resend/FCM; live-order code imports none of the notification code (`tests/order-events.test.ts`).

### Folder map

```
src/
  app/                       routes only; actions.ts = parse → service → revalidate
    api/internal/notifications/dispatch/route.ts   scheduler endpoint (Bearer secret)
    firebase-messaging-sw.js/route.ts              generated FCM service worker
    r/[restaurantSlug]/order/[orderNumber]/events/route.ts   SSE stream
    r/[restaurantSlug]/orders/{page,loading,error}.tsx           My Orders (history, signed-in only)
    r/[restaurantSlug]/current-orders/{page,loading,error}.tsx   Current Orders (active, guest or signed-in)
    r/[restaurantSlug]/account/                                   sign-in/up, Google OAuth, email verification (section 16)
  components/{ui,storefront}/   (storefront: order-live-status, use-order-events, push-opt-in, ...)
  web/                       cookies.ts session.ts storefront.ts theme.ts media.ts seo.ts
  instrumentation.ts         Next.js startup hook: loads the storefront cache before the server answers
  server/                    framework-free — enforced by a test
    config/                  typed, lazily-parsed env sections: app, database, storefrontCache, auth, storage, payments, email, push, notifications, orderEvents
    cache/                   in-memory storefront snapshot: cache class, builder, pure read functions (no SQL); see section 15
    context.ts               RequestContext + forRestaurant()
    db/                      database.ts (pools, transactions), registry.ts (routing), mappers.ts, listener.ts (LISTEN/NOTIFY hub)
    repositories/            analytics carts coupons customers deliveries media menu orders order-events notifications
                             payments reservations restaurants reviews storefront team websites
    services/                cart checkout catalog orders order-events notifications reservations restaurants reviews storefront
    domain/                  pricing.ts, storefront-context.ts (pure, no I/O)
    auth/                    auth-service.ts tokens.ts password.ts permissions.ts
    validation/              cart checkout notifications reservation review common
    integrations/            payments.ts storage.ts resend.ts fcm.ts
    notifications/           rules.ts types.ts templates/
    errors.ts logger.ts rate-limit.ts
  shared/                    contract/{models,enums,api,settings,sections} money hours ordering order-timeline order-live
                             notification-channels utils
db/migrations/               schema (checksummed, forward-only — do not edit applied files)
scripts/db/                  migrate, seed, verify (owner connection, outside the app)
scripts/notifications/       dispatch.ts (manual / --loop dispatcher)
tests/                       vitest: pricing, checkout, reservations, rbac, tenant isolation (need Postgres), plus
                             architecture, config, database-registry, notifications*, push-service-worker, order-events,
                             storefront-cache|snapshot|services, reservation-availability, cart-count (no database needed)
```

Types: DB rows (`Row`, snake_case) exist only inside repositories and `db/mappers.ts`; domain models are `shared/contract/models`; API envelopes are `ApiResult`/`ApiError`; UI props are declared by the component.

### Request context and multi-tenancy

- `RequestContext` (`server/context.ts`) = `{userId, restaurantId, customerId, cartToken, actor}`. `web/session.ts#getVisitorContext` derives it from cookies; services pin the tenant with `forRestaurant(id, ctx)`. `restaurantId` is both the RLS pin and the DB routing key.
- Repositories obtain a database only via `getDb({ restaurantId })` or `getDb(ctx)`; platform lookups (slug resolution, public restaurant list) use `getDb()`. Then `db.read(ctx, tx => …)` (runtime role, RLS enforced) or `db.write(ctx, tx => …)` (service role, for authorised writes). Each call is one transaction that sets `app.*` settings with `set_config(..., true)` so RLS policies see it and nothing leaks between pooled connections; do not nest transactions.
- Isolation is enforced by RLS (unprivileged `app_runtime` role) and re-checked in services (`resolveCustomer` rejects a session issued for another restaurant; `requireLine` rejects foreign cart items).
- Today one database serves everyone (`SingleDatabaseDirectory` in `server/db/registry.ts`); see section 13 for per-restaurant databases. Do not implement it unless asked.

### Error handling

`AppError` (`errors.notFound|unauthorized|forbidden|validation|conflict|rateLimited|internal|custom(code,msg)`) and `PricingError extends AppError` are the only errors shown to users. `toApiError` maps zod, Postgres and unknown errors to a safe `ApiError`; `action(fn)` (server actions) and `jsonError(e)` (route handlers) are the two edges that convert and log through `server/logger.ts` (never `console.*`). Database messages and stack traces never reach the client.

### Configuration

`config.app | database | storefrontCache | auth | storage | payments | email | push | notifications | orderEvents`. Each section parses only its own variables the first time it is used, so importing config has no side effects and a missing variable fails with its **name** (never its value). `.env.example` lists every variable.

## 3. Where new code goes

| Adding | Put it in |
| --- | --- |
| page / layout | `src/app/r/[restaurantSlug]/...`; get data via `web/storefront` (`requireStorefront`, `readCart`) and `server/services` |
| server action | `src/app/r/[restaurantSlug]/<feature>/actions.ts` (`'use server'`): `schema.parse(payload)` → service → `revalidatePath`, all inside `action(...)` from `@/server/errors`. Returns `ApiResult<T>`. No rules here. |
| business rule | `server/services/<feature>.ts`; pure math in `server/domain` |
| input schema | `server/validation/<feature>.ts` (shared by actions and any future HTTP route) |
| SQL | `server/repositories/<aggregate>.ts` only |
| type used by UI + server | `shared/contract/models.ts`; DB `Row` types never leave `repositories/` and `db/mappers.ts` |
| env variable | schema in `server/config/index.ts` + `.env.example`; read as `config.<section>` |
| cookie / headers / `next/*` | `src/web/` |
| third-party API | `server/integrations/` |
| migration | new numbered file in `db/migrations/`. NEVER edit an applied migration (checksummed by `scripts/db/migrate.mjs`); the runner wraps each file in a transaction, so do not add `begin`/`commit` |

## 4. Symbol map (what to call)

**web/**  `storefront.ts`: `getStorefrontContext` (React-cached), `requireStorefront(slug)` (404 only for real NOT_FOUND; other errors → error boundary), `readCart(restaurant)` (never sets cookies), `openStorefrontCart(slug)` (server actions only; mints cart cookie). `session.ts`: `getVisitorContext(restaurantId)` → `RequestContext`, `getStorefrontCustomer(restaurantId)`, `getCartToken/setCartToken`, `getCartCountHint/setCartCountHint` (header badge cookie `rp_cart_n`), `getCurrentStaff/requireStaff/requirePermission`. `cookies.ts` names/options. `theme.ts` `themeCssVariables`, `fontStack`. `seo.ts` JSON-LD. `media.ts` image fallbacks.

**server/services** (storefront reads marked ◆ are served from the in-memory snapshot, see section 15)
- `storefront`: ◆`loadStorefrontContext(slug)`, `resolveTheme`, ◆`getHomePageContent`, ◆`getPageContent(id, slug)` (published non-home page)
- `restaurants`: `requireRestaurant(slug)` (DB, gates writes), ◆`getLocations(id,{activeOnly})`, ◆`getDeliveryZones(id,{locationId,activeOnly})` (display), `getLiveDeliveryZones` (DB; pricing + checkout)
- `catalog`: ◆`getMenuCategories`, ◆`searchMenu(id, filters)`, ◆`findMenuItemBySlug`
- `cart`: `generateCartToken`, `findCart`, `openCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `emptyCart` (these four return `{itemCount}`, the cart's new size), `applyCoupon`, `changeOrderType`, `changeCartLocation`, `priceCart`, `validatePromoCode`, `serviceAvailability`
- `checkout`: `placeOrder(restaurant, input, visitor)`, `getCheckoutOptions(restaurant)`
- `orders`: `trackOrder(restaurantId, orderNumber, visitor)`, `findVisitorOrder` (RLS proof or signed order-access token), `getMyOrders(restaurantId, visitor)` → `{signedIn, current, previous}` (`current` → `/r/<slug>/current-orders`, `previous` → `/r/<slug>/orders`; repo `listVisitorOrders`: customer = own orders incl. history, guest = own cart-token orders in progress only, never history; `ACTIVE_ORDER_STATUSES` in `shared/contract/enums`), `reorderOrder(restaurant, cart, order, ctx)` → `{addedCount, skippedItemNames, itemCount}` (repo `buildReorderLines` + service `addToCart`, section 8)
- `reservations`: `bookTable` (returns the reservation with `locationName`; its emails are queued by the DB trigger, see section 7), `getBookedSlotCounts(restaurantId, locationIds, from, to)` (one query for the whole booking window; DB, never cached); `reviews`: `submitReview`, ◆`getPublicReviews`, ◆`getReviewSummary`
- `notifications`: `NotificationService` (`dispatchDue`, `processEvent`), `dispatchDueNotifications` (coalesced per restaurant, never throws; call after an order change), `drainDueNotifications` (scheduler: loops until empty), `registerPushToken`, `getPushClientConfig` / `getPushClientConfigFor(restaurant)`
- `order-events`: `openOrderStream`, `orderEventsEnabled`

**server/cache** (`@/server/cache`): `getStorefrontCache()` → `StorefrontCache {get, isReady, start, refresh, invalidate, stop}`; `startStorefrontCache()`; `snapshotForRestaurant(id)` / `snapshotForSlug(slug)` (return `null` when disabled, throw NOT_FOUND for another restaurant, INTERNAL_ERROR before the first load); pure `read*` functions over a snapshot. `src/instrumentation.ts` starts it.

**server/repositories** (exports): analytics; carts; coupons; customers; deliveries (zones + deliveries, `matchDeliveryZone`); media; menu (categories, items, variants, addon groups CRUD); orders (`createOrder`, `getOrderByNumber`, `updateOrderStatus`, kitchen/customer lists…); order-events (`watchOrderChanges`); notifications; payments; reservations; restaurants (+ locations, on table `restaurant1s`); reviews; storefront (`loadStorefrontData`, the one-pass read behind the cache); team; websites (+ pages). Most exist for the future admin UI and are unused by the storefront.

**server/auth**: `auth-service` (`signInStaff/Customer`, `createCustomerAccount`, `authenticateStaff`, `resolveCustomer`, `assertPermission`), `tokens` (HS256 JWTs, `SESSION_TTL`, `signOrderAccessToken`), `password` (scrypt), `permissions` (RBAC catalogue, `can`).
**shared**: `ordering.isOrderTypeEnabled/enabledOrderTypes` (single source for order-type gating), `money` (decimal strings; `formatMoney`), `hours`, `order-timeline`, `order-live`, `notification-channels.notificationChannelsEnabled` (the only interpreter of the notification switches).

## 5. Rules easy to break

1. Money is `string` (2 dp) everywhere; compute with `shared/money` / `server/domain/pricing`. Never `number`. Prices are recomputed server-side from the DB; the browser sends ids, quantities and notes only.
2. Guest access is proven with the cart token (httpOnly cookie `rp_cart`). Anything that reads an order or cart as a guest must pass `cartToken` in the context (`getVisitorContext` does).
3. Website `theme`, `settings`, `features`, `sections` are untrusted JSONB: parse with the zod schemas in `shared/contract/settings|sections`, never read raw.
4. Order status is a DB-enforced state machine with `order_status_history`; UI must not decide transitions.
5. Permissions exist in SQL (`app.role_permissions()`) and TS (`server/auth/permissions.ts`); change both plus a migration; `tests/rbac.test.ts` checks parity.
6. Do not expose DB/system messages to clients: throw `errors.*`/`AppError`; unknown errors become a generic INTERNAL_ERROR.
7. Never call a repository from a page, component or action; add or extend a service.
8. `revalidatePath` and `notFound()` belong to `app/`/`web/`, not services.
9. Never send email/push from order or admin code; only commit the change and (after the response) call `dispatchDueNotifications`.
10. The layout never reads the cart from the DB (that is a transaction per page view). The header badge comes from the `rp_cart_n` cookie hint: `openStorefrontCart` re-syncs it to the real count, and the quantity-changing actions and `placeOrderAction` set the new value. Any new action that changes cart contents must call `setCartCountHint`. Pages that need the cart itself (`/cart`, `/checkout`) call `readCart`.

## 6. Database and environment

- Roles: `app_owner` (migrations/seed, bypasses RLS), `app_runtime` (RLS enforced), `app_service` (BYPASSRLS, server-side writes; the notification dispatcher uses it). On Supabase's pooler a single login is used and `Database` does `set local role` per transaction.
- `DATABASE_URL_SERVICE` is **optional; leave it empty** (the normal setup, including Supabase). Empty = the runtime connection is reused and each write transaction does `set local role app_service`. It only exists for a setup that has a separate login able to act as `app_service`; `app_service` itself is a `nologin` role (created in 0006), so you cannot copy a connection string for it from any dashboard. Setting it wrongly (e.g. to the runtime or owner URL) gains nothing; only set it if you deliberately created a dedicated login role granted `app_service`.
- `.env.example` is a template and must stay free of real values. If it (or any tracked file) ever contains real keys, remove them, keep the values only in `.env.local`, and rotate every exposed secret (DB password, Supabase service-role key, Resend, FCM, `AUTH_SECRET`).
- Windows gotcha: if `C:` is full, `npx` fails with `ENOSPC` (npm cache); run the local binaries directly (`./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run ...`, `./node_modules/.bin/next build`). Dev `.env.local` points at a hosted Supabase pooler (slow: ~1 s/round trip; avoid loops of sequential queries). There is NO local Postgres on the dev machine, so DB-backed vitest suites (checkout, rbac, reservations-reviews, tenant-isolation) cannot run there (they fail with `ECONNREFUSED :5432`; that is expected); `tests/setup.ts` redirects tests to a `localhost` test DB and never touches hosted data. Do not run write flows against the hosted DB without asking; a transaction that is rolled back (dry-run of a migration) is fine.
- Migrations: `0013_notifications.sql` (outbox + push tokens + trigger), `0014_order_realtime.sql` (superseded), `0015_order_change_notify.sql` (NOTIFY trigger, drops the 0014 anon policy), `0016_rename_locations_table.sql` (see below), `0017_grant_app_service_auth_users.sql`/`0018_app_service_auth_schema_usage.sql`/`0019_app_runtime_auth_schema_usage.sql` (staff-side `auth` schema access, admin-portal branch — see the incident note below), `0018_customer_auth.sql` (email verification codes, this branch — note the filename collision: two unrelated `0018`s), `0019_replace_users_table.sql`/`0020_merge_user_auth_into_users.sql` (an app-owned `users` table — **superseded by 0021**, see section 16), `0021_customers_own_login.sql` (current design: customer login lives on `customers` directly, `auth.users` back to staff-only — section 16), `0021_restore_team_members_auth_users_fk.sql`/`0022_restore_remaining_auth_users_fks.sql` (the admin-portal branch's own fix for the same incident, staff-side FKs back to `auth.users` — see below; **`0022` was edited post-merge to drop its `customers.user_id` lines**, since `0021_customers_own_login.sql` already dropped that column). Apply with `npm run db:migrate` (owner connection `DATABASE_URL_MIGRATOR`).
- **"`00xx.sql` was modified after being applied" with an unchanged file = line endings.** The runner hashes the raw bytes and the DB stores the LF hash; on Windows `core.autocrlf=true` can check files out as CRLF (seen 2026-09-22 on 0013–0016). Fix: convert to LF (`sed -i 's/\r$//' db/migrations/*.sql`). `.gitattributes` (`db/migrations/*.sql text eol=lf`) now keeps them LF. Compare hashes with `sha256` of the file vs `select version, checksum from schema_migrations`.
  - If the file is *already* LF (post-`.gitattributes`) but the stored checksum still predates the fix — the file was normalized after it was applied, so its bytes and the recorded hash disagree even though nothing about the schema changed — the DDL is not stale, only the recorded checksum is. Confirm with `information_schema.columns`/`pg_trigger` that the migration's actual effect (columns, trigger) is already live, then update that one row: `update schema_migrations set checksum = '<sha256(file).slice(0,16)>' where version = '00xx_....sql'`, via `DATABASE_URL_MIGRATOR`. Seen 2026-09-22 on `0017_reservation_notifications.sql` blocking `0018`, and again 2026-09-25 on `0022_restore_remaining_auth_users_fks.sql` after editing out its `customers.user_id` lines post-merge (see the migrations bullet above).
- Migration `0017_reservation_notifications.sql`: `notification_events.order_id` nullable + `reservation_id` (exactly one set, `unique (reservation_id, event_type)`) + trigger `enqueue_reservation_notification` on `reservations`. **Written and dry-run (rolled back) against the hosted DB on 2026-09-22 but not applied: run `npm run db:migrate` before deploying the code** (code that claims events works before it, but a booking then queues no email; the dispatcher never breaks).
- **Branches table is `restaurant1s`** (renamed from `restaurant_locations` by 0016; FK columns are still `location_id`; TypeScript names `Location` / `getLocations` are unchanged). Applied migrations `0003`–`0006` still say `restaurant_locations`: that is correct history, not a leftover. Write all new SQL against `restaurant1s`. The rename keeps data, grants, policies, triggers and FKs; the 0016 file has its rollback script in comments. Deploy order: run the migration, then the code (code using the new name errors until the DB is renamed).
- **RLS check:** on 2026-09-21 the hosted dev database had `relrowsecurity = false` on `orders`, `customers`, `menu_items`, `restaurants` and the branches table although migration 0006 enables it. On 2026-09-22 `orders`, `customers`, `reservations` and `notification_events` showed `true` and, as `app_runtime` with `app.cart_token` / `app.current_customer_id` set, another token or customer id saw 0 orders (rolled-back test). It has drifted before, so still verify with `select relname, relrowsecurity from pg_class where relname in ('orders','customers')` before production. Queries that must be owner-scoped (My Orders) also carry explicit `customer_id` / cart-token predicates, so they stay correct even if RLS were off.
- Env vars are listed in `.env.example` (never commit real values): `STOREFRONT_CACHE_ENABLED|REFRESH_INTERVAL_MS|STARTUP_TIMEOUT_MS`, `DATABASE_URL`, `DATABASE_URL_SERVICE`, `DATABASE_URL_MIGRATOR`, `DB_POOL_MAX`, `AUTH_SECRET` (≥16 chars), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DEFAULT_RESTAURANT`, Supabase storage vars, Stripe vars, notification vars (section 7), `DATABASE_URL_LISTEN` (section 8). `EMAIL_FROM_ADDRESS` must be a valid email or config throws.
- **`auth.users` writes are blocked on hosted Supabase** (found 2026-09-22 building the admin panel — first time staff sign-in was exercised against the hosted DB). Migration `0001`'s auth shim only creates its own `auth.users` table when no `auth` schema exists yet; on a real Supabase project the *real*, GoTrue-owned `auth` schema is already there, so the shim is skipped and this app's code reads/writes Supabase's protected table instead (DECISIONS.md §2 says "NEVER attempt to modify the Supabase auth schema" — for a reason: Supabase silently no-ops `GRANT`/`REVOKE` on `auth.*` for custom roles like `app_service`, even though the statement reports success). Empirically: `SELECT` on `auth.users` can be made to work for `app_service` (migration `0017` grants table-level `SELECT`; migration `0018` grants `app_service` membership in `service_role` for schema `USAGE`, which Supabase does honour — a direct `grant usage on schema auth to app_service` does not); `INSERT`/`UPDATE`/`DELETE` do not — only `supabase_auth_admin` (GoTrue's own role) can write there. The same schema-`USAGE` gap also breaks **`app_runtime`**, independently of `auth.users` writes: RLS policies call `app.current_user_id()`, which calls `auth.uid()`, so *any* RLS-checked read (`db.read()`, i.e. every non-`db.write()` query) fails the same way until `app_runtime` also gets `service_role` membership (migration `0019`). Role membership only inherits privilege *grants*, not role *attributes* — neither `app_service` nor `app_runtime` gains `BYPASSRLS` or superuser from this, so DECISIONS.md §3 still holds. `signInStaff` no longer writes `auth.users.last_sign_in_at` for this reason (it was non-essential bookkeeping nothing read). `createCustomerAccount` (customer sign-up) and `repositories/team.ts` (creating a staff login) still `insert`/`update` `auth.users` directly through `app_service` and **will fail the same way on hosted Supabase** — not fixed yet, needs a real decision (stop colliding with Supabase's schema name, or move user creation to Supabase's Auth Admin API) before those flows are exercised in production.
- **Incident, 2026-09-22 night — a concurrent, out-of-repo edit broke staff sign-in after it had already been fixed.** `schema_migrations` gained three entries never written to `db/migrations/` in this checkout: `0017_reservation_notifications.sql`, `0018_customer_auth.sql`, `0019_replace_users_table.sql`, `0020_merge_user_auth_into_users.sql` (applied 18:12–19:52, i.e. after the `auth` schema fix above). They added a new `public.users` table (`id, email, password_hash, name, role, is_email_verified, last_sign_in_at, created_at, google_sub, auth_provider` — built for a Google-sign-in customer flow) and repointed `team_members_user_id_fkey` at it, but never migrated the seeded staff rows into it — every `team_members.user_id` went `null`, so `signInStaff` failed "Invalid email or password" even though `auth.users` still had the right password hashes. Separately, `auth.users.id` lost its column default at some point in the same window, so a plain `insert into auth.users (email, ...)` (no `id`) now fails `null value in column "id"`. Fixed by `0021_restore_team_members_auth_users_fk.sql` (FK back to `auth.users`, relinks by email) and by making every `auth.users` insert pass `id: gen_random_uuid()` explicitly (`scripts/db/create-staff.ts`, `repositories/team.ts`, `auth-service.ts#createCustomerAccount`; `scripts/db/seed.ts` already did). `public.users` itself was left in place, untouched, with its one row — nothing here was reverted except the FK target and the orphaned links. **The same repointing hit five more FKs**, found one at a time as each feature was exercised (first symptom: admin "update order status" failing `A referenced record is missing or still in use.` / `order_status_history_changed_by_fkey`) — `customers.user_id`, `deliveries.driver_user_id`, `media.uploaded_by`, `order_status_history.changed_by`, `reviews.responded_by` were all repointed at `public.users` the same way; fixed together in `0022_restore_remaining_auth_users_fks.sql` (nulls out any now-orphaned value first, since Postgres validates existing rows when a FK is added, then restores each FK to `auth.users(id) on delete set null`, matching `0003_core_tables.sql`/`0005_commerce.sql`). `select tc.table_name, kcu.column_name, ccu.table_name as ref_table from information_schema.table_constraints tc join information_schema.key_column_usage kcu using (constraint_name) join information_schema.constraint_column_usage ccu using (constraint_name) where tc.constraint_type='FOREIGN KEY' and ccu.table_name='users'` is how both rounds were found — re-run it if anything referencing a user id starts throwing `23503` again; only `email_verification_codes.user_id` should still point at `public.users` (new table, no original definition to revert to, intentionally left alone). **Root cause was never confirmed**: `git log` shows a same-minute commit (`"added"`, author `thetechodos@gmail.com`) that swept up unrelated scratch files sitting in the working tree at the time, which means something on this machine auto-commits the working directory periodically — very likely the same mechanism (or a parallel session) applied those migrations directly against the shared hosted database without going through `db/migrations/`. If staff sign-in or any staff-attributed write breaks again with a correct password, check `team_members.user_id is null` and the FK-scan query above first (see section 11's table) before assuming it's the schema-`USAGE` issue again.

## 7. Notifications (email + push)

Order confirmation and completion **emails** (Resend) and order-status **push notifications** (Firebase Cloud Messaging). Everything is optional: with no provider configured, orders work exactly as before and each channel is skipped (logged), never failed.

| Event | Email | Push |
| --- | --- | --- |
| Order placed (right after the order is committed) | no: the customer only sees "order received" on screen | no |
| confirmed (staff accept the order) | yes: confirmation | no |
| preparing | no | yes |
| ready | no | yes |
| out for delivery | no | yes |
| completed | yes: thank-you + **Rate Your Order** button | yes |
| cancelled | no | yes |

**Reservation emails** (same outbox, table `notification_events` with `reservation_id`; email only; templates `templates/reservation-emails.ts`; `RESERVATION_EMAIL_EVENTS` in `rules.ts`):

| Event | Email |
| --- | --- |
| request submitted (`pending`) | yes: "Reservation request received", status **Pending confirmation**, not a confirmation |
| status becomes `confirmed` (staff, SQL, or auto-confirm at insert) | yes: "Reservation confirmed" |
| cancelled / seated / anything else | no (unchanged) |

Trigger `enqueue_reservation_notification` (0017) queues the event in the booking transaction; `bookTableAction` calls `dispatchDueNotifications` in `after()`, so the mail goes out right after the response and a mail failure can never fail the booking (the success screen is shown once the row is saved). `unique (reservation_id, event_type)` means repeating or bouncing the status (`confirmed → pending → confirmed`) never sends a second email of the same kind; Resend also gets `Idempotency-Key reservation-<id>-<event>-email`. Skipped (not failed) when the guest has no email, no provider is configured, or the restaurant has `notifications`/`emailNotify` off. The booking email field is **required**. There is no admin UI: after any code that confirms a reservation, call `dispatchDueNotifications` like for orders, otherwise the confirmation waits for the scheduler. Test by hand: `update reservations set status = 'confirmed' where confirmation_code = '...'` then `npm run notifications:dispatch`; inspect `select event_type, status, email_state, last_error from notification_events where reservation_id is not null`.

The matrix and the push wording live in one file: `server/notifications/rules.ts`; email templates in `server/notifications/templates/`. New status/event = edit `rules.ts` (+ trigger only for a new event source), the table above and `tests/notifications.test.ts`.

### How it works

```
order insert / status change ──(DB trigger, same transaction)──► notification_events   (outbox)
                                                                        │  unique (order_id, event_type)
        checkout action (after response) ─┐                             ▼
        POST/GET /api/internal/notifications/dispatch (cron) ─┬─► NotificationService.dispatchDue()
        npm run notifications:dispatch ───┘                      ├─ EmailProvider → Resend
                                                                 └─ PushProvider  → FCM
```

- The order code never calls Resend or FCM (architecture test). It only commits; the trigger writes the event in the same transaction, so an event exists **iff** the change was committed. A failed order creates no event, so no email.
- Because the trigger is in the database, it does not matter *who* changes a status: the storefront, a future admin screen, or a manual `update orders set status = ...` all queue the same event.
- Events are delivered afterwards, in batches, with per-channel state (`email_state`, `push_state`). A provider outage delays a message (retries after 1, 5, 15, 60 minutes, at most 5 attempts) but never fails or rolls back an order. A retry never resends a channel that already succeeded.
- Events older than `NOTIFICATION_MAX_AGE_HOURS` (default 24) are dropped (`dead`, "expired before delivery") instead of being sent late.
- Repository: `repositories/notifications.ts` (claim with `for update skip locked`, lock 5 min so a crashed worker's rows are re-claimed; load context; save outcome). Tables: `notification_events`, `customer_push_tokens` (server-only, RLS on with no runtime policy, `app_service` granted).

**Duplicate protection (three layers):** (1) `unique (order_id, event_type)`: an event can be queued once (`PREPARING → PREPARING` fires no trigger; a completed order cannot move again). (2) `for update skip locked` claiming plus per-channel state: two dispatchers never take the same event and a retry skips a channel marked `sent`. (3) Resend gets `Idempotency-Key` `order-<id>-<event>-email`. Push has no idempotency key, so each push carries the web notification `tag` `order-<id>-<status>`: if it is ever sent twice (crash between send and saving the result) the device replaces the first one instead of showing two.

### Per-restaurant switches (`restaurants.features`)

Server env vars say whether the **platform** can send; each restaurant additionally opts in via the JSONB column `restaurants.features` (no migration needed):

```json
{ "notifications": true, "notificationChannels": { "emailNotify": true, "pushNotify": true } }
```

| `notifications` | `emailNotify` | `pushNotify` | Result |
| --- | --- | --- | --- |
| true | true | true | email + push (as in the matrix) |
| true | true | false | email only; "Notify me" hidden, push registration refused |
| true | false | true | push only |
| false | any | any | nothing is sent |

- A channel is on only when `notifications` **and** its own flag are true. Missing keys count as **true**, so existing restaurants keep working.
- Checked at delivery time (`NotificationService.deliver`): the trigger still queues the event and a disabled channel is marked `skipped`. Turning a channel on later does not resend events already processed. Changes take effect immediately (no restart/redeploy).
- Schema: `restaurantFeaturesSchema` (`shared/contract/settings.ts`); logic: `notificationChannelsEnabled` (`shared/notification-channels.ts`), the only place that interprets the flags. The order page uses `getPushClientConfigFor(restaurant)`; `registerPushToken` refuses when push is off. An admin screen should write the same keys.

```sql
select slug, features->'notifications' as notifications, features->'notificationChannels' as channels from restaurants;

update restaurants
   set features = features || '{"notifications": true, "notificationChannels": {"emailNotify": true, "pushNotify": false}}'::jsonb
 where slug = 'bella-napoli';                                   -- email only
update restaurants set features = features || '{"notifications": false}'::jsonb where slug = 'bella-napoli';   -- everything off
```

`||` replaces the whole `notificationChannels` object, so always give both flags.

### Setup

1. Apply the migration once per database: `npm run db:migrate` (0013), then `npm run db:verify`. The dispatcher needs the `app_service` role.
2. **Email (Resend):** create an API key at <https://resend.com>; `.env.local`: `RESEND_API_KEY=re_...`, `EMAIL_FROM_ADDRESS=onboarding@resend.dev`, optional `EMAIL_MAX_PER_SECOND=2`. `onboarding@resend.dev` only delivers to **your own Resend account email** (enough for testing); for real customers verify a domain and use `orders@yourdomain.com`. The sender *name* is each restaurant's own name and Reply-To is `restaurants.email`.
3. **Push (FCM):** Firebase console → Project settings → Service accounts → Generate new private key; from the JSON set `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"` (one line, keep the `\n`; server-only). Then Project settings → General → add a Web app and set `NEXT_PUBLIC_FIREBASE_API_KEY`, `_PROJECT_ID`, `_MESSAGING_SENDER_ID`, `_APP_ID`; Cloud Messaging → Web Push certificates → Generate key pair → `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. The "Notify me" button only appears when all of these are set. Browsers require HTTPS for push (`localhost` allowed). The service worker is generated at `/firebase-messaging-sw.js`.
   - **Who displays a notification (2026-09-22, rewritten):** **the service worker displays every push, in every state** — order page in front, another page of the site open, tab in the background, browser minimised. Page code never displays one. This replaced an earlier design where the foreground case was handled by `onMessage` in `push-opt-in.tsx`; three root causes made that unreliable:
     1. **The Firebase SDK's own `push` handler shows nothing whenever ANY window of the origin is visible** (`hasVisibleClients` over `clients.matchAll({includeUncontrolled: true})` — verified in `@firebase/messaging` `dist/esm/index.sw.esm.js#onPush`). It posts the payload to those windows and expects page code to display it. So the notification was silently dropped whenever the visible page was *not* an order page with the opt-in card mounted: the menu, My Orders, the cart — or the order page itself once the card unmounted, which is exactly what `page.tsx` does for `completed`/`cancelled` (both of which are pushed). It was never "the browser suppressing notifications while the page is focused"; it was the SDK.
     2. **The worker had no `skipWaiting`/`clients.claim`,** so a changed worker sat in "waiting" until the last tab of the site closed and the *previous* worker kept handling every push — a fix shipped to the worker looked like it did nothing.
     3. `connect()` in `push-opt-in.tsx` depended on the `firebase` config **object**, which a server render rebuilds every time, so each `router.refresh()` tore down the `onMessage` subscription and re-registered the worker and re-issued a token (a server round trip); a push arriving in that window was lost, and the churn is visible as repeated `customer_push_tokens` rows for one device.
     Now: `app/firebase-messaging-sw.js/route.ts` registers `install`→`skipWaiting`, `activate`→`clients.claim`, and its own `push` listener **before** `firebase.messaging()`; that listener calls `event.stopImmediatePropagation()` (listeners run in registration order) so the SDK's handler never runs and there is exactly one display path — no duplicates, nothing suppressed. It also posts `{type: "order-push", data}` to open windows, which `push-opt-in.tsx` uses only as a hint to `router.refresh()`. `firebase.messaging()` is still called (token issuance, `pushsubscriptionchange`), wrapped in try/catch so display survives an SDK failure. `notificationclick` compares **pathname**, not the whole URL, because the link carries a one-order access token an already open tab does not have (an exact match always opened a second tab). `integrations/fcm.ts` repeats title and body inside `webpush.notification` (next to `tag`) so the web payload carries them whatever FCM does when a webpush notification is present. `push-opt-in.tsx` keeps the config in a ref (stable `connect`, no churn) and waits for the worker to be **activated** before `getToken` (`pushManager.subscribe()` throws on a still-installing registration — a first-click failure). Guarded by `tests/push-service-worker.test.ts` (listener order, `stopImmediatePropagation`, `skipWaiting`/`claim`, no server credential in the script, script parses as JS).
     - **Three separate mechanisms, do not confuse them:** Web Push (FCM → worker → `showNotification`, works with the app closed), SSE live status (section 8, page open only), and toasts (page only; never used to fake a push).
     - **Debugging a missing notification:** `chrome://serviceworker-internals` (or DevTools → Application → Service Workers) — check the worker is **activated**, not "waiting"; `select event_type, push_state, last_error from notification_events order by created_at desc` — `sent` means FCM accepted it, so the fault is on the device/worker side, `skipped` with no push token means nothing was registered; `select is_active, deactivated_reason from customer_push_tokens` — many rows for one device means token churn. A payload can be dry-run against the real FCM API with `validate_only: true` on `messages:send` (no delivery).
   - **Android (Chrome):** background/foreground both show real OS notifications, in a normal tab — no PWA install needed. Aggressive OEM battery optimisers (Xiaomi/Huawei/Samsung/Oppo) can still delay or drop delivery; nothing in this app can control that.
   - **iOS (Safari), fixed 2026-09-22:** iOS only delivers Web Push to a page running standalone (added to the Home Screen), never a plain Safari tab, even after the permission prompt is accepted. To make that possible: `app/r/[restaurantSlug]/manifest.webmanifest/route.ts` (same generated-route pattern as the FCM service worker; per-restaurant name/theme colour/icon, `display: "standalone"`) and `app/r/[restaurantSlug]/apple-icon.tsx` (a `next/og` `ImageResponse`, brand colour + initial letter — same fallback design as the header avatar, so every restaurant gets a usable Home Screen icon with no asset required). Wired into `layout.tsx`'s `generateMetadata` via `manifest`, `appleWebApp: {capable, title, statusBarStyle}`, and `icons: {..., apple: ...}` (setting `icons.icon` for the favicon otherwise suppresses the auto file-convention link, so `apple` has to be repeated explicitly). **Gotcha:** this Next.js version's `appleWebApp.capable` only emits the generic `mobile-web-app-capable` meta tag, not the `apple-` prefixed one iOS Safari actually reads for standalone mode — added by hand via `other: {'apple-mobile-web-app-capable': 'yes'}`. `push-opt-in.tsx` detects iOS-and-not-standalone (`isIos()` / `isStandalone()`, checked *before* the generic `supported()` feature check, since iOS can report `Notification`/`PushManager` present in a plain tab without push actually working there) and shows "Add to Home Screen" steps instead of the "Notify me" button; once installed and reopened from the icon, the normal flow works unchanged. Manual check: `curl .../r/<slug>/manifest.webmanifest` (valid JSON, `display: standalone`) and `curl -o /tmp/i.png .../r/<slug>/apple-icon` (`file /tmp/i.png` → PNG 180x180); on a real iPhone, Safari → Share → Add to Home Screen → open from the icon → "Notify me" → lock the phone → change the order status → a system notification should appear.
4. **Delivery:** after checkout it is automatic (the checkout action dispatches with `after()`); in development run `npm run notifications:dispatch -- --loop` (every `NOTIFICATIONS_DISPATCH_INTERVAL_MS`, default/current 5 s); in production a scheduler calls `POST /api/internal/notifications/dispatch` with `Authorization: Bearer <NOTIFICATIONS_DISPATCH_SECRET>` every minute (section 10). `NOTIFICATIONS_DISPATCH_SECRET` must be 16+ chars; until set the route answers 503.

### Behaviour under load

- **Scheduler route drains the queue:** one call keeps claiming batches of 20 until nothing is due or 30 s passed (`drainDueNotifications`, `maxDuration = 60`), so a backlog is not limited to one batch per minute.
- **One dispatcher per restaurant per process, at most 3 overall** (`dispatchDueNotifications`): a call that arrives while one runs flags a re-run and waits for it, so its own event is still picked up and dozens of checkouts do not fight page requests for pool connections (`DB_POOL_MAX`). Across instances, `skip locked` still guarantees one dispatcher per event. `drainDueNotifications` is not coalesced (it must see its own batch size).
- **Email is paced** to `EMAIL_MAX_PER_SECOND` per process (default 2 = Resend's default account limit; raise on a paid plan), so bursts are spread instead of rejected with 429 (2/s = 120/min per process). A 429 that still happens is retried (1, 5, 15, 60 min).
- Verified by `tests/notifications-concurrency.test.ts` (3 restaurants × 40 orders, 48 concurrent dispatchers: every email/push exactly once, right customer, no cross-restaurant leaks, a failed push does not resend the email) and `tests/notifications-dispatch-control.test.ts` (single-flight, cap, drain, email rate, push tag). These use an in-memory store and fake providers, not the real DB/Resend/FCM.

### Push tokens

`customer_push_tokens (restaurant_id, customer_id, token, platform, user_agent, is_active, last_seen_at, …)`, unique on `(restaurant_id, customer_id, token)`. A customer can have many rows; guests have a `customers` row too (created at checkout). The order page opt-in gets a token from FCM and calls `registerPushTokenAction`; the server links it to `order.customer_id` only if the caller proves they own the order (same-device cookie or the signed email link). When FCM answers `UNREGISTERED`/invalid, the row is set `is_active = false` with a reason and never used again.

### Links in emails (any device)

Guest orders are normally visible only to the browser that placed them (cart cookie). Emails carry a signed **order-access token** (`?t=…`, 60 days, names exactly one order, cannot be used as a staff/customer session; `signOrderAccessToken`). The order page, review page and push registration accept it as proof. The review button points at `/r/<slug>/reviews?order=<number>&t=<token>` (same table, moderation, one review per order).

### Admin portal: required when it is built

Changing an order's status only **queues** the notification (`status = 'pending'`); nothing is sent until the dispatcher runs. So every admin action that changes a status **must** trigger it, like `placeOrderAction`:

```ts
// src/app/admin/.../actions.ts  ('use server'; app/ may call services, never repositories)
import { after } from "next/server";
import { dispatchDueNotifications } from "@/server/services/notifications";

export async function updateOrderStatusAction(restaurantId: string, orderId: string, status: OrderStatus) {
  return action(async () => {
    await changeOrderStatus(restaurantId, orderId, status, actor);   // service → repositories/orders.updateOrderStatus
    revalidatePath(...);
    after(() => dispatchDueNotifications({ restaurantId }, { restaurantId }));   // never throws, never affects the change
  });
}
```

- **Confirm** must set `confirmed` (that sends the confirmation email). If the UI jumps `pending` → `preparing`, no confirmation email is sent; always go through `confirmed` or change `rules.ts`.
- Call the dispatcher after **every** status change, or pushes stay queued. Keep the scheduler as a safety net (retries, crashed requests).
- Do not send email/push from the admin action itself.

### Other notes

- **Per-restaurant databases:** repositories go through `getDb({ restaurantId })`, events and tokens live with their order, reads are pinned to the event's `restaurant_id`. With one DB per restaurant, the dispatch route/script must run `dispatchDueNotifications({}, { restaurantId })` once per restaurant (or per `DatabaseDirectory` entry).
- **Replacing a provider:** implement `EmailProvider`/`PushProvider` (`server/notifications/types.ts`) in `server/integrations/` and change the two lines in `getNotificationService()`.

### Testing notifications locally

```powershell
npm run typecheck
npx vitest run tests/notifications.test.ts tests/notifications-concurrency.test.ts tests/notifications-dispatch-control.test.ts tests/push-service-worker.test.ts tests/architecture.test.ts   # no DB
npm run dev                                   # terminal 1
npm run notifications:dispatch -- --loop      # terminal 2
```

1. Place an order at `/r/bella-napoli` with **your** email → "order received" on screen, no email yet. 2. Click **Notify me** on the order page. 3. Move the order in SQL and watch terminal 2 / the device:
```sql
update orders set status = 'confirmed' where order_number = 'ORD-...';   -- confirmation email
update orders set status = 'preparing' where order_number = 'ORD-...';   -- push
update orders set status = 'ready'     where order_number = 'ORD-...';   -- push
update orders set status = 'completed' where order_number = 'ORD-...';   -- push + completion email
select event_type, status, attempts, email_state, push_state, last_error
  from notification_events where order_id = (select id from orders where order_number = 'ORD-...') order by created_at;
```

## 8. Live order tracking (SSE)

The customer order page (`/r/<slug>/order/<number>`) shows status changes the moment the database row changes. Nothing is polled; no Redis, WebSocket server or extra service, and no key in the browser.

```
update orders set status = …  (staff / SQL editor / future admin UI)
   └─ trigger notify_order_change ─► pg_notify('order_changes', {id, restaurant_id, status, payment_status, estimated_ready_at, updated_at})   (on COMMIT)
        └─ ONE LISTEN connection per server process (server/db/listener.ts, fan-out per order id)
             └─ GET /r/<slug>/order/<number>/events  (SSE; services/order-events.ts openOrderStream; repositories/order-events.ts watchOrderChanges)
                  └─ browser EventSource (components/storefront/use-order-events.ts) → OrderLiveProvider / OrderLiveStatus / LiveOrderTimeline
```

Live page (SSE), push (FCM) and email (Resend) are three separate mechanisms. Pure rules (parse, dedupe, stale events, timeline patch) are in `shared/order-live.ts`.

**How a stream works:** (1) the page renders from the DB as always. (2) The browser opens `EventSource('/r/<slug>/order/<number>/events[?t=<email token>]')`. (3) The route proves access with the same check as the page (`findVisitorOrder`: cart cookie, signed-in customer or signed `?t=`); no proof → 404 and the browser does not retry. (4) The server **subscribes first, then reads the current order and sends it as the first event** (snapshot), so a change between render and subscription, or while offline, is never missed; every reconnect starts with a fresh snapshot. (5) Then each NOTIFY for this order id (and restaurant) is sent as `event: status`. (6) The browser runs each state through `nextLiveState`: stale or identical states are ignored; otherwise badge and timeline update at once and the page re-renders **once** (300 ms debounce) so ETA, history and review link catch up. (7) On `completed`/`cancelled` the server ends the stream and the browser closes it. A `: ping` comment every 25 s keeps proxies from closing an idle connection.

**Security:** the browser never touches the database. A stream follows exactly one order id and events are dropped unless `restaurant_id` matches. The NOTIFY payload has ids, statuses and timestamps only (no personal data). Guest order visibility relies on RLS: verify it is on (section 6).

**Failures:** `DATABASE_URL_LISTEN` unset → route 503, no "Live" marker, page works with its Refresh button. Browser drop → `EventSource` reconnects (`retry: 5000`) and the snapshot re-syncs; "Reconnecting…" after 4 s; after 5 failures in a row without any event the browser stops for that page view. Database connection drop → server reconnects with back-off (1 s … 30 s) and re-reads open orders. Closing the tab/finished order closes the stream; the LISTEN connection closes 30 s after the last stream ends.

**Setup:** apply migration 0015; set `DATABASE_URL_LISTEN=<session-mode or direct Postgres URL>` (LISTEN does not work through a **transaction** pooler; Supabase: pooler host with port **5432**, or `db.<ref>.supabase.co:5432`; it may use the same user as `DATABASE_URL`); restart `npm run dev`; the order page shows a green "Live" marker. The old Supabase Realtime vars (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`) are unused; delete them.

**Manual test** (order page open): run the status `update` statements from section 7; badge and timeline move within about a second; in DevTools → Network `events` is one long-lived `eventsource` request. Also try: refresh, two tabs, DevTools Offline then online (catches up), another browser without the cookie (404). `npx vitest run tests/order-events.test.ts tests/architecture.test.ts` runs the DB-free checks.

**Limitations:** needs a long-lived Node process (`next start`, Docker, VM); on serverless short limits the browser reconnects and the snapshot re-syncs, but each instance opens its own LISTEN connection. One shared LISTEN per process; with per-restaurant databases run one per database. When the backend is extracted, expose the same `/events` endpoint (`use-order-events.ts` only needs its URL).

### My Orders (`/r/<slug>/orders`) vs Current Orders (`/r/<slug>/current-orders`) (2026-09-22, split)

Two separate routes sharing one service call (`getMyOrders`, unchanged shape `{signedIn, current, previous}` — no duplicate SQL, no new repository query):

- **`/orders` (My Orders) = history only, signed-in customers only.** Renders `previous`. A guest (no `rp_customer_session`) gets a "Sign in to see your orders" card (Sign In / Sign Up buttons), never any order data — a guest's in-progress order lives at `/current-orders` instead, not here.
- **`/current-orders` (Current Orders) = active orders only, guest or signed-in.** Renders `current` (`ACTIVE_ORDER_STATUSES`) for whoever the request identifies (customer session or guest cart cookie, via `getVisitorContext` — same ownership proof as everywhere else, never the URL). Each card reuses `OrderLiveProvider` + `OrderLiveStatus` (SSE per order; `router.refresh()` re-renders the page when one finishes, which drops it out of `current` — nothing moves it to `/orders` live, the guest just stops seeing it since guests have no history view at all).

Why split instead of one page with two sections (the pre-2026-09-22 shape): "current" needs to work for a guest with zero setup (they just ordered), "previous" fundamentally needs an account (there is nothing to scope history to for a guest beyond the single cart cookie in play right now) — collapsing them into one gated page meant a guest either saw nothing (wrong, they have an active order) or the sign-in prompt hid their own live order. See DECISIONS.md §23.

**Floating current-orders widget** (`current-orders-widget.tsx`, rendered by `app/r/[restaurantSlug]/layout.tsx` on every page, bottom-right): a round badge with the active-order count, linking to `/current-orders`; renders nothing at zero. The count comes from `getMyOrders` in the layout itself — **one extra DB read per page view**, unlike the cart-count cookie hint (rule 10 above), because an order's status changes from *outside* any action this browser takes (staff/SQL update the row), so there is no action to keep a cookie hint current with. Accepted cost given the hosted-pooler latency (~0.3 s) noted in section 6; if this becomes a problem, the fix is a short-TTL hint refreshed by the order page's own SSE stream, not a synchronous read on every route.

`site-header.tsx` also takes a `customer: {signedIn, name}` prop (from `getCustomerSessionSummary`, `account/actions.ts`) and shows Sign In / Sign Up or an Account link next to the existing cart button, desktop and mobile. The phone number and the old "Order online" pill were dropped from the header (2026-09-22); the cart is now an icon-only round button (badge hidden at 0) and Sign In/Sign Up is a filled pill.

**Sign In / Sign Up dialog, tried then reverted (2026-09-22 → 2026-09-23):** for one day the header trigger opened `AuthDialog` (`components/storefront/auth-dialog.tsx`, Radix `Dialog`) as a small centered box over the current page instead of navigating to `/account/sign-in`. **Reverted on 2026-09-23 at the requester's explicit direction** ("Sign In and Sign Up should open on a separate/new page, matching the previous implementation/flow") — `site-header.tsx` now links straight to `/account/sign-in` again (both the desktop pill and the mobile menu item), same as before the dialog existed. `auth-dialog.tsx` is left in the tree unused (not deleted — reverting its one caller was the minimal, requested change; nothing imports it now, so it costs nothing at build time). `SignInForm`/`SignUpForm` still carry the optional `onAuthenticated`/`onSwitchToSignUp`/`onSwitchToSignIn` props from that day (harmless when omitted, which is now always — the standalone pages don't pass them) — if the dialog is ever revived, wiring it back in is a one-file change to `site-header.tsx`, not a forms rewrite. `site-header.tsx`'s `googleEnabled` prop is now unused inside the component (only the dialog read it) but was left on the interface/call site rather than touched, since removing it is unrelated to what was asked. "Continue with Google" itself — the OAuth redirect flow described below — was **not** touched by this revert; it was already a full-page navigation before the dialog existed and still is.

**Reorder** (order detail page, completed/cancelled orders only): `ReorderButton` → `reorderAction` (`order/actions.ts`) → `reorderOrder` (`services/orders.ts`). Ownership of the past order is re-proven with `findVisitorOrder` (not trusted from the click). `buildReorderLines` (repository, previously unused — see the old note this replaces) returns the order's lines at today's ids; each is re-added with the real `addToCart` (service, not a parallel cart mechanism), so pricing is always current, never copied from the old order. An item that is deleted, disabled, or outside its availability window makes `addToCart` throw a `PricingError` (`AppError`); `reorderOrder` catches that per line, skips it, and reports it by name from the order's own item list — one bad line never fails the whole reorder. Lands on `/cart` with a toast naming anything skipped.

## 9. Run on localhost

```powershell
npm install
copy .env.example .env.local        # then fill it in
npm run db:migrate                  # hosted Supabase DB; migrations are checksummed, never edit an applied one
npm run db:seed                     # optional: Bella Napoli demo data
npm run dev                         # http://localhost:3000  ->  /r/bella-napoli
```

Minimum `.env.local`: `DATABASE_URL`, `DATABASE_URL_MIGRATOR` (scripts only), `AUTH_SECRET` (16+ chars), `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Everything else is optional; an unconfigured channel is skipped and logged. `.env.local` is the only file that holds secrets (it is gitignored); `.env.example` must contain no real keys.

Generate any secret (`AUTH_SECRET`, `NOTIFICATIONS_DISPATCH_SECRET`):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Feature | Vars | Local notes |
| --- | --- | --- |
| Live order page | `DATABASE_URL_LISTEN` | session/direct URL (port **5432**). Empty = no "Live" marker. |
| Email | `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | `onboarding@resend.dev` only delivers to your own Resend account email. |
| Push | `FCM_*` + 5× `NEXT_PUBLIC_FIREBASE_*` | all five public vars needed for "Notify me". |
| Dispatch route | `NOTIFICATIONS_DISPATCH_SECRET` | empty = route answers 503. |

**Env files are read at startup:** restart `npm run dev` after every `.env.local` change; `NEXT_PUBLIC_*` are baked in at build/start.

**Delivering notifications locally:** nothing calls the dispatcher for you; checkout dispatches automatically, status changes made in SQL stay queued until it runs. Second terminal: `npm run notifications:dispatch -- --loop` (every `NOTIFICATIONS_DISPATCH_INTERVAL_MS`, default/current 5 s) or `npm run notifications:dispatch` (one pass). Or call the route (PowerShell: use `curl.exe`, plain `curl` is an alias) with the token **without** angle brackets (`<secret>` in docs is a placeholder):

```powershell
curl.exe -X POST http://localhost:3000/api/internal/notifications/dispatch -H "Authorization: Bearer YOUR_SECRET"
```

`200 {success:true,data:{claimed,done,retrying,dead}}` works, `503 DISABLED` = secret unset or dev server not restarted, `401` = token does not match (usual cause: the `<`/`>` placeholder brackets were typed, or a different value than in `.env.local`).

## 10. Deploy

### Vercel

1. Push the repo, import it in Vercel (Next.js; build `npm run build`, no output-dir override).
2. Settings → Environment Variables (Production, plus Preview if used): copy every variable from `.env.local` with these differences: `NEXT_PUBLIC_SITE_URL=https://<your-domain>` (used in email links; not localhost); `DATABASE_URL` = Supabase **pooled** string (port 6543; serverless needs the pooler); `DB_POOL_MAX` small (3-5); `FCM_PRIVATE_KEY` on one line with literal `\n`; `NOTIFICATIONS_DISPATCH_SECRET` = a **new** random value; `CRON_SECRET` = the **same value** (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the route only checks `NOTIFICATIONS_DISPATCH_SECRET`).
3. Run migrations against the production DB from your machine (`npm run db:migrate` with `DATABASE_URL_MIGRATOR` pointing at it), before deploying code that needs them.
4. Add a cron in `vercel.json` (the file does not exist yet): `{ "crons": [{ "path": "/api/internal/notifications/dispatch", "schedule": "* * * * *" }] }`. Vercel Cron issues **GET** (the route accepts GET and POST). Per-minute schedules need a paid plan (Hobby is limited to daily jobs; check current Vercel limits); on Hobby use an external scheduler.
5. Redeploy after any env change. Verify: `curl.exe -X POST https://<domain>/api/internal/notifications/dispatch -H "Authorization: Bearer <secret>"`, place a test order, check Vercel Logs.

**Live order SSE on Vercel is degraded:** `.../events` needs a long-lived Node process (`runtime = "nodejs"`); serverless functions time out, so the browser reconnects and re-syncs from the snapshot and each instance opens its own LISTEN connection. For real-time use a persistent Node host, or leave `DATABASE_URL_LISTEN` unset and rely on Refresh.

### Other hosting

**Persistent Node host** (Railway, Render, Fly.io, VPS, Docker) is the best fit: `npm ci && npm run build && npm run start` (`next start -p 3000`) behind an HTTPS reverse proxy; same env vars; `DATABASE_URL_LISTEN` can be the direct URL. Behind nginx/Caddy disable response buffering for `/r/*/order/*/events` (the app sends `X-Accel-Buffering: no` and a ping every 25 s).

**Scheduler for the dispatcher** (anything that can make an HTTP call every minute):

| Scheduler | How |
| --- | --- |
| Vercel Cron | above |
| GitHub Actions | `on: schedule: - cron: "*/5 * * * *"` running `curl -fsS -X POST $URL/api/internal/notifications/dispatch -H "Authorization: Bearer $SECRET"` (secrets in repo settings; minimum interval 5 min) |
| Supabase `pg_cron` + `pg_net` | `net.http_post(url, headers => jsonb_build_object('Authorization','Bearer <secret>'))` every minute |
| cron-job.org / uptime pinger | POST/GET with the Authorization header |
| Same server | `* * * * * curl -fsS -X POST http://localhost:3000/api/internal/notifications/dispatch -H "Authorization: Bearer $SECRET"` |

The scheduler is a safety net (retries, changes made in SQL, crashed requests), not the primary path for checkout. One call drains the whole queue, so a per-minute schedule is enough.

## 11. Troubleshooting

Order of checks for "something did not update / send": (1) did the DB row really change and commit? (2) is the restaurant's `features` switch on (section 7)? (3) is the env var set and the server restarted? (4) only then look at code. Live updates and notifications are both driven by the committed row change, so a missing change upstream looks like a bug downstream. Confirmed once already: "live status not updating" was an order that had not been updated in the DB.

| Symptom | Cause / fix |
| --- | --- |
| Dispatch route 503 | `NOTIFICATIONS_DISPATCH_SECRET` empty/missing in that environment; redeploy/restart. |
| Dispatch route 401 | Header must be `Authorization: Bearer <secret>` without placeholder brackets; on Vercel Cron `CRON_SECRET` must equal the secret. |
| Status changed but no email/push | Nothing ran the dispatcher (section 9/10). Check `notification_events` (`status`, `attempts`, `last_error`). |
| Emails/push never sent for one restaurant, states `skipped` | That restaurant has `notifications`, `emailNotify` or `pushNotify` = false in `restaurants.features`. |
| No confirmation email at order placement | By design: it goes out on `confirmed` (`rules.ts`). |
| Status changed "in the DB" but the page did not move | Check the row: `select order_number, status, updated_at from orders where order_number = '...'`. Usual cause: update never happened / not committed (wrong order number, wrong database, open SQL-editor transaction, a transition the trigger rejected). |
| No "Live" marker / `events` 503 | `DATABASE_URL_LISTEN` unset, or it points at the 6543 transaction pooler. |
| Emails not arriving | `onboarding@resend.dev` only sends to your Resend account email; verify a domain for real customers. Slow during a rush = the 2/s pacing, not a bug. |
| No "Notify me" button | One of the five `NEXT_PUBLIC_FIREBASE_*` is missing, push is off for the restaurant, or the deploy predates the vars. |
| "Notify me" succeeded, `push_state = sent`, but no notification on the device | FCM accepted it, so the fault is on the device. Check the worker is **activated**, not "waiting", in DevTools → Application → Service Workers (fixed by `skipWaiting`/`clients.claim`, but a browser that still runs a pre-fix worker needs one hard reload or "Unregister"); then OS-level notification settings for the browser (Windows Focus Assist, macOS Do Not Disturb, Android OEM battery optimisers). Notifications are never suppressed for being on the page any more — the worker shows them all (section 7). |
| Notification appears only on the order page | A worker from before the 2026-09-22 rewrite is still active: the Firebase SDK handler suppresses display whenever any window of the site is visible. Reload once (or unregister the worker) so the new one takes over. |
| Many `customer_push_tokens` rows for one device, most `is_active = false` | Token churn: something is re-registering the worker and re-issuing a token on every render. Fixed by keeping the Firebase config in a ref in `push-opt-in.tsx`; the dead rows are harmless history. |
| App errors on branches/locations after pulling | DB still has `restaurant_locations`: run `npm run db:migrate` (0016). |
| Config error "Invalid email configuration" | `EMAIL_FROM_ADDRESS` is not a valid email. |
| Reservation booked but no email | (1) migration 0017 applied? (`select column_name from information_schema.columns where table_name='notification_events'` has `reservation_id`); without it no event is queued. (2) `notification_events` row for the reservation and its `email_state` / `last_error`; `skipped` = no guest email, no `RESEND_API_KEY`, or the restaurant's email switch is off. (3) dispatcher running (section 9/10). |
| Guest opens My Orders and sees nothing after ordering | The order is not in progress any more (guests only see current orders), the browser lost the `rp_cart` cookie, or it is a different browser than the one that ordered. |
| Env change ignored | Restart the dev server / redeploy. |
| `permission denied for schema auth` (staff sign-in, or any admin page load right after signing in) | Hosted Supabase blocking `auth` schema access for `app_service` and/or `app_runtime`, see section 6. Both fixed (migrations `0017`–`0019`; `signInStaff` also no longer writes `auth.users`). Customer sign-up and staff creation still write `auth.users` and are not fixed. If this recurs after a fresh Supabase project, re-run `0018`/`0019` (their `grant service_role to app_service/app_runtime` — verify with `select has_schema_privilege('app_runtime','auth','USAGE')`). |
| Need a new `/admin` login, or to reset one, but there is no staff-management UI yet | `npm run db:create-staff -- --email <email> --name "<name>" --role <owner\|admin\|manager\|staff> --password <password> [--restaurant <slug, default bella-napoli>]` (`scripts/db/create-staff.ts`). Runs as `DATABASE_URL_MIGRATOR` (owner), which is required — the app's own `createTeamMember` path writes `auth.users` through `app_service` and is blocked on hosted Supabase (section 6/16), same reason this had to be a standalone script instead of an admin action. Upserts by `(restaurant_id, email)`, so re-running it for an existing email resets that person's password. |
| `npm run db:migrate` throws `0001_extensions_auth_context.sql was modified after being applied` | Found 2026-09-22, unrelated to any code change: the file's current checksum (CRLF line endings on disk) does not match what was recorded when it was applied (2026-09-19) — `git diff` shows no difference from HEAD, so this is a stored-checksum/line-ending drift, not an edited migration. Blocks the runner for *every* migration, not just new ones, until the stored checksum in `schema_migrations` is reconciled with the current file (or the file's original line endings are restored) — not fixed yet; new migrations in this session were applied by hand (see `0017`/`0018`) instead of through `npm run db:migrate`. |
| Staff sign-in fails "Invalid email or password" even though the password is right | Check `select tm.email, tm.user_id from team_members tm where tm.email = '...'` — if `user_id` is `null`, the row is orphaned from `auth.users` (see the incident below). Fix: `update team_members tm set user_id = u.id from auth.users u where lower(u.email) = lower(tm.email) and tm.user_id is distinct from u.id;` |
| Admin write fails `A referenced record is missing or still in use.` (Postgres `23503`) on `order_status_history`/`customers`/`deliveries`/`media`/`reviews` | Same incident as above, different table: the FK on `changed_by`/`user_id`/`driver_user_id`/`uploaded_by`/`responded_by` was repointed at `public.users` instead of `auth.users`. Re-run the FK-scan query in the incident note; `0022_restore_remaining_auth_users_fks.sql` fixed the five known at the time — a new one showing up means another column got repointed the same way. |
| `insert into auth.users` fails with `null value in column "id" ... violates not-null constraint` | `auth.users.id` has **no column default** on this database (found 2026-09-22, part of the same incident) — every insert must generate it explicitly: `insert into auth.users (id, email, ...) values (gen_random_uuid(), $1, ...)`. Already fixed in `scripts/db/create-staff.ts`, `repositories/team.ts#createTeamMember`, `auth-service.ts#createCustomerAccount`; `scripts/db/seed.ts` was already explicit. Check any *new* insert into `auth.users` does the same. |

## 12. Commands and tests

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (vitest; DB suites need Postgres) · `npm run db:migrate|db:seed|db:reset|db:verify|create-staff` (section 11) · `npm run notifications:dispatch [-- --loop]` · `npm run test:e2e` (Playwright).

DB-free verification: `npm run typecheck`, then `npx vitest run tests/architecture.test.ts tests/config.test.ts tests/database-registry.test.ts tests/pricing.test.ts tests/notifications.test.ts tests/notifications-concurrency.test.ts tests/notifications-dispatch-control.test.ts tests/order-events.test.ts tests/reservation-notifications.test.ts tests/my-orders.test.ts tests/push-service-worker.test.ts`, `npx next build`, then `next start` and curl the `/r/bella-napoli/*` GET routes. After structural changes always run `npm run typecheck` and `npx vitest run tests/architecture.test.ts`.

## 13. Future: moving the backend out, one database per restaurant

**Moving the backend out.** `src/server` and `src/shared` import no framework code (the architecture test fails otherwise). To run them as a standalone service: (1) move both into the backend package (keep the `@/server` / `@/shared` aliases); (2) add an HTTP layer (Fastify/Hono/Express or route handlers): each server action becomes a route `schema.parse(body)` → the same service function → `jsonError()`; (3) replace `web/session.ts#getVisitorContext` with middleware that builds the same `RequestContext` from the cookie/Authorization header (`server/auth/tokens.ts` already signs/verifies JWTs; share `AUTH_SECRET`); (4) in the frontend replace `openStorefrontCart`, `getVisitorContext` and the service calls in pages with an API client (components and `shared/` untouched; `revalidatePath` stays in the frontend). Expose the same SSE `/events` endpoint.

**One database per restaurant (not implemented).** `SingleDatabaseDirectory` answers every question with the one configured database. The seam is complete: repositories call `getDb({ restaurantId })`, the registry asks a `DatabaseDirectory` which `DatabaseConfig` holds that restaurant, and `DatabaseManager` keeps one `Database` per config `key`. To enable: (1) store the mapping centrally (JSON file or a `restaurant_databases` table: `restaurantId, slug, key, runtimeUrlRef, serviceUrlRef`; only *references* to env/secret names); (2) implement `DatabaseDirectory` (e.g. `RegistryDirectory`) and construct it in `manager()` in `registry.ts` (`tests/database-registry.test.ts` shows the contract); (3) resolve slug → restaurant first (`getRestaurantBySlug`, `listPublicRestaurants`, sign-in flows call `getDb()` with no restaurant); (4) close gaps: repository functions that look rows up by id only (`getCartById`, `getLocationById`, `updateMenuItem`, …) rely on `ctx.restaurantId` (`grep -rn "getDb(ctx)" src/server/repositories`), make the directory throw on `null` for tenant repositories in dev/test; (5) migrations and seeding run per database; (6) auth needs nothing (sessions carry `restaurantId`); (7) run one notification dispatch and one LISTEN per database.

## 14. Known gaps (do not rediscover)

- `createOrder`, `createReservation`, `resolveItemSelection` are SQL + rules transaction scripts inside repositories (splitting needs the DB suites and a local database; do it as its own change).
- `auth-service` queries `auth.users` directly for **staff** (`signInStaff`; writes there are impossible for any runtime role — confirmed independently on both branches, see the incident note in section 6 and DECISIONS.md §26 — so `repositories/team.ts`'s `createTeamMember`/password-set and staff creation only work via `scripts/db/create-staff.ts`, the migrator connection, never a live request) and `customers` directly for **customer** login (since 0021, see section 16 — this table is fully app-owned, so signup/Google/password-set all work normally through `app_service`, no such restriction).
- Comments in applied migrations mention old `src/lib/...` paths and `restaurant_locations`; migrations are checksummed and were not edited.
- ID-only repository lookups use `getDb(ctx)` and rely on `ctx.restaurantId` being set by the caller.
- Media URLs use `/api/media/...` but no route handler exists.
- Customer sign-in/registration UI (built 2026-09-22, see section 16): `/r/<slug>/account/{sign-in,sign-up,google-phone}`, Google OAuth, email verification, all working end to end on the current `customers`-owns-its-login design (0021).
- Admin UI (`/admin`, section 17) covers everything except staff management (deliberately excluded so far) and website/CMS — statuses/rows for those still change via SQL, so delivery for anything not yet in `/admin` needs the dispatcher script (dev) or a scheduler (prod).
- No `vercel.json` yet (cron not configured).
- FCM has no server-side idempotency (mitigated by the notification `tag`).
- No ESLint config; `tsc` + the architecture test are the guardrails.
- `npm run db:verify`'s "application roles cannot read the migration table" check fails (`app_runtime` currently has SELECT on `schema_migrations`) — predates the `users` rework, not caused by it; nothing in the codebase grants this explicitly so it likely comes from a Supabase default. Low priority (that table has no sensitive data, just migration filenames/checksums) but worth a `revoke select on schema_migrations from app_runtime` migration at some point.
- Google sign-in's **error** path (`account/google/callback/route.ts`, e.g. an expired/invalid `state`, or `completeGoogleAuth` throwing) always redirects to the standalone `/account/sign-in?error=google` page, not back to `returnTo` — unlike the success path (section 16's "Continue with Google returns to wherever it was clicked" note), which does. Low priority now that sign-in is a standalone page again rather than a dialog (section 16), but still an inconsistency worth fixing together with a real error affordance on that page if anyone revisits this.

## 15. Storefront cache (in-memory snapshot, one instance = one restaurant)

Decision record: `DECISIONS.md` §19.

```
instrumentation.ts ─ register() ─► startStorefrontCache() ─► loadStorefrontSnapshot()
                                                               └► repositories/storefront.loadStorefrontData()
storefront GET ─► web/storefront ─► services/{storefront,catalog,restaurants,reviews}
                                       └► snapshotForRestaurant()/snapshotForSlug() ─► memory (0 SQL)
carts, checkout, orders, payments, reservations, customers, write paths ─► services ─► repositories ─► db
```

- At startup `instrumentation.ts` loads a frozen snapshot of the public storefront (restaurant, website, pages, locations, delivery zones, active menu with variants/add-ons, top-50 reviews + summary) for `NEXT_PUBLIC_DEFAULT_RESTAURANT`. Storefront GETs then send **no SQL**. Refresh every `STOREFRONT_CACHE_REFRESH_INTERVAL_MS` (atomic swap, single-flight, chained timer; the old snapshot is kept when a refresh fails or times out). A failed first load fails startup: production exits non-zero, dev keeps the server up and requests error until the cause is fixed. `STOREFRONT_CACHE_ENABLED=false` restores per-request database reads.
- The cache lives on `globalThis` (Next bundles the startup hook and routes separately; dev reloads re-evaluate modules). No SQL in `server/cache` (architecture test).
- New public read-mostly data: add it to `repositories/storefront.ts` → `cache/types.ts` + `storefront-snapshot.ts` → a `read*` function in `storefront-queries.ts` → the service (cache branch + DB branch). Anything transactional or price-deciding stays off the snapshot.
- Never use the snapshot for cart, checkout, order or pricing decisions (`getLiveDeliveryZones`, `requireRestaurant`, `createOrder` read the DB); `server/cache` must not be imported by cart/checkout/pricing (architecture test).
- Snapshot objects are frozen and shared: never mutate what a service returns; copy first.
- After an admin write call `getStorefrontCache().invalidate()`; `server/services/menu-admin.ts` (section 16) does this on every category/item/variant/add-on write.
- With the cache on, other `/r/<slug>` values are 404 (one restaurant per instance).
- The startup hook is the one place outside `server/config` allowed to read `process.env.NEXT_RUNTIME` (Next replaces the literal at compile time so the Edge bundle does not pull in `pg`).

**Still database-bound on purpose:** `/reservation` (one range query, ~3 s on the hosted DB), `/cart` and `/checkout` when the visitor has a cart cookie (one real cart read), every cart mutation, checkout, order tracking.

**Speed facts (hosted Supabase pooler, ~0.3 s per round trip, so one DB transaction of 5 statements is ~1.5 s):** `next start` serves cached storefront pages in ~25–150 ms with 0 SQL; `next dev` compiles each route on its first visit (4–12 s) and renders unoptimised afterwards (0.3–1.8 s), so judge speed on a production build. The snapshot load takes ~7–17 s at start, before the server answers. The cache is per process: on serverless hosts every cold start repeats the load.

**Observing SQL without editing code:** run the server with `NODE_OPTIONS="--require <spy.cjs>"` where the spy patches `pg` `Client.prototype.query` through `Module._load` (match any module exposing `Pool` and `Client`, not only the request string `"pg"`) and logs each statement with its duration. Each Next dev recompile spawns a worker that prints its own "installed" line; exclude it when counting statements.

**If startup fails with `[cache] storefront cache initialization failed`:** the log line carries the database error. `relation "…" does not exist` (code 42P01) means the code and the database schema disagree (for example a migration applied without the matching code, or the reverse): compare `schema_migrations` with `db/migrations/` and check the table names.

## 16. Customer accounts (sign-in, Google, email verification)

**Status (2026-09-22): built and applied, wired into the header/UI.** Sign-in/sign-up/Google/email-verification work end to end from their own pages (`/r/<slug>/account/...`), the checkout gate is live, migration `0018` is applied, and phase 2 (header auth state, cart icon, floating current-orders widget, reorder) is also done — see section 8's "My Orders vs Current Orders" for that half.

**Customer login lives on `customers` itself — there is no separate customer identity table (as of `0021_customers_own_login.sql`, 2026-09-23).** `customers` gained `password_hash`, `is_email_verified boolean`, `google_sub`, `auth_provider default 'password'`, `last_sign_in_at`. A customer's login was always effectively restaurant-scoped (a `customers` row already only exists at the restaurant they ordered from), so putting the login fields on the row itself instead of a shared identity table needs no cross-restaurant lookup step. Two partial-unique indexes enforce one account per email/Google-sub per restaurant among non-guest rows: `customers_restaurant_email_key` (`restaurant_id, lower(email)) where not is_guest and email is not null`) and `customers_restaurant_google_sub_key` (`unique (restaurant_id, google_sub)` — NULLs don't collide, so guests/no-Google rows are unaffected). `repositories/customers.ts` has the auth-facing functions: `getCustomerByGoogleSubOrEmail` (privileged bootstrap, matches by either), `linkGoogleToCustomer`, `createGoogleCustomer`, `markCustomerEmailVerified` — plus the ordinary `getCustomerById`/`upsertCustomer`. `email_verification_codes.customer_id` (renamed from `user_id`) FKs straight to `customers(id)` now. There is no `User` type or `Customer.userId` field any more — `Customer` (`shared/contract/models.ts`) carries `emailVerified`/`authProvider` directly.

**Why this changed twice in two days, and why auth.users is staff-only again:** `auth.users` (Supabase's shim, 0001) can never be granted real INSERT/UPDATE for `app_service`/`app_runtime` — confirmed independently on **two different branches** sharing this hosted dev DB (`GRANT ...` on it runs without error but silently grants nothing; only `supabase_auth_admin` can actually write it). The first fix (2026-09-22 → 23, `0019_replace_users_table.sql`/`0020_merge_user_auth_into_users.sql`, now superseded) replaced `auth.users` entirely with an app-owned `users` table shared by staff and customers alike. That collided with a second, independent fix on a parallel admin-portal branch (`0017_grant_app_service_auth_users.sql`/`0018_app_service_auth_schema_usage.sql`/`0019_app_runtime_auth_schema_usage.sql` — different files, note the numbering collision since both branches picked "0017-0019" independently) which kept staff on `auth.users` and tried granting `service_role` membership instead — also confirmed not to actually enable INSERT/UPDATE (same "no privileges were granted" wall), but that branch's admin/staff code (`auth-service.ts`, `team.ts`, `scripts/db/create-staff.ts`) was built assuming `auth.users`, and running both branches' migrations against the one shared DB left it in a mixed state (the `users`-table FKs got silently reverted to `auth.users` and `users` emptied by whichever branch's script ran last — there is no real "merge" between two schema designs solving the same problem differently). **Resolution, at the requester's explicit direction:** stop needing a shared identity table for customers at all (this section) — `auth.users` goes back to being staff/admin-only, exactly as the other branch already has it, untouched by anything here; `scripts/db/create-staff.ts` (that branch) still creates staff via the migrator connection, never a live request. The two systems don't share a table any more, so they can't collide on one again. See DECISIONS.md §26 for the full incident writeup.

**Migration `0018_customer_auth.sql`:** the surviving piece is `email_verification_codes` (RLS on, no `app_runtime` policy, `app_service` only — same pattern as `notification_events`); verifying a code sets `customers.is_email_verified`.

**Config:** `googleAuth` section (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — same optional-until-configured pattern as `push`/`email`; `config.googleAuth` is `null` and "Continue with Google" is hidden on every page until both are set. No Google SDK dependency: `server/integrations/google.ts` does the OAuth2 authorization-code flow by hand and verifies the returned `id_token` with `jose` (already a dependency) against Google's published JWKS.

**Email verification (checkout gate):** `server/services/customer-auth.ts` (`sendVerificationCode`, `ensureVerificationCode` — only sends when no still-active code exists, `verifyEmailCode`, `isEmailVerified`). A 6-digit code, HMAC-SHA256-hashed with `AUTH_SECRET` (not scrypt — codes are short-lived, rate-limited, and don't need scrypt's cost), 10-minute expiry, 5 max attempts, sent through `getEmailProvider()` (new export in `services/notifications.ts` — the same Resend provider the outbox uses, but called synchronously since a customer is waiting on screen, not through `notification_events`). **Guests are never gated** — verification only applies to a signed-in customer's login email (`visitor.userId` set, which since `0021` is the customer's own id); there is no email-verification requirement for guest checkout, matching the existing guest architecture (a guest `customers` row has `is_email_verified = false` and no password/google_sub, but nothing ever checks it). The gate itself lives in `checkout/actions.ts#placeOrderAction` (throws `errors.custom("EMAIL_NOT_VERIFIED", ...)`, a new `ErrorCode`) and is enforced server-side — `checkout-form.tsx` only uses the `EMAIL_NOT_VERIFIED` code to swap in `<VerifyEmailForm>` instead of a generic error toast; hiding the form field client-side would not have been enough.

**Google sign-in and the mandatory-phone problem:** `customers.phone` is `not null` and part of `unique (restaurant_id, phone)`, but Google never provides a phone number. `completeGoogleAuth` therefore does **not** create a `customers` row itself: if one already exists for `(restaurant, google-linked user)` it signs in directly; otherwise it mints a short-lived (`signGooglePendingToken`/`verifyGooglePendingToken` in `auth/tokens.ts`, purpose `google-pending`, 15 min) token and the browser is sent to `/account/google-phone?token=...` to collect a phone before `finishGoogleSignup` creates the `customers` row and the real session. Do not "fix" this by inventing a placeholder phone — it would collide with the next Google-only customer at the same restaurant under the unique constraint.

**Flow:** `GET /r/<slug>/account/google` (redirects to Google, stores CSRF `state` in a short cookie `rp_google_state` via `web/session.ts#setGoogleState`) → Google → `GET /r/<slug>/account/google/callback` (`code`+`state`, verified against the cookie via `consumeGoogleState`) → either signed in or redirected to `/account/google-phone`.

**"Continue with Google" returns to wherever it was clicked, not a hardcoded `/account` (added 2026-09-23, still true after the dialog revert above):** the OAuth round trip has to leave the page (redirect to accounts.google.com and back) regardless of whether sign-in itself is a dialog or a standalone page — this piece isn't about the dialog, it's about the redirect target. The Google link in both `SignInForm`/`SignUpForm` appends `?returnTo=<usePathname()>`; `account/google/route.ts` reads it and `beginGoogleSignIn` stores it in a short cookie (`rp_google_return_to`, `web/session.ts#setGoogleReturnTo`/`consumeGoogleReturnTo`, same TTL/pattern as the state cookie); `account/google/callback/route.ts` consumes it and redirects there on success (falling back to `/account`), or forwards it as a `returnTo` query param to `/account/google-phone` when a phone number is still needed (`GooglePhoneForm` then `router.push`es there instead of `/account`). `sanitizeReturnTo` (in both `account/actions.ts` and `google-phone/page.tsx` — small enough it wasn't worth sharing) rejects anything not shaped like `/r/<this-slug>/...` (no open redirects) and rejects the sign-in/sign-up/google-phone pages themselves (landing back on a "please sign in" page while already signed in is a confusing loop). The Google **error** path still always falls back to the standalone `/account/sign-in?error=google` page rather than reopening the dialog on the original page — a known gap (section 14), left alone since the success path is what mattered.

**Session cookie:** `rp_customer_session` (`CUSTOMER_COOKIE`) was defined since the original build but never set anywhere — `getStorefrontCustomer`/`getVisitorContext` could only ever read it. `web/session.ts#setCustomerSession`/`clearCustomerSession` (new) are what `account/actions.ts` calls after `signInCustomer`/`createCustomerAccount`/Google/`finishGoogleSignup` succeed. A customer session is restaurant-scoped from signing in (the JWT carries `restaurantId`), consistent with `customers` being per-restaurant — the same Google login needs its own `customers` row (and so its own "needs phone" step) at every new restaurant.

**The same "RLS context missing `customerId`" bug hit two more places (fixed 2026-09-23, found right after the `resolveCustomer` fix below made real signed-in sessions reach these code paths for the first time):**
- **`cart_items`/`carts` writes** (`new row violates row-level security policy for table "cart_items"` when a signed-in customer added to cart): `cart.ts#cartContext(restaurantId, cartToken)` never included `customerId`, but `cart_is_owned`'s RLS check (0005) is `(customer_id is not null and customer_id = app.current_customer_id()) or (customer_id is null and session_token = app.cart_token())` — once a cart has `customer_id` set (any signed-in customer's cart, set by `openCart`), the token-based branch no longer applies and the customer-id branch needs `ctx.customerId`, which was never passed. Every `cartContext(...)` call site in `cart.ts` (`addToCart`, `updateCartItem`, `removeFromCart`, `emptyCart`, `applyCoupon`, `changeOrderType`, `changeCartLocation`) now takes the cart's `customerId` and passes it through; `findCart`/`readCart` (`web/storefront.ts`) and `checkout.ts#placeOrder` now also pass the signed-in visitor's `customerId` so the *read* doesn't get RLS-blocked either (a signed-in customer's cart could no longer even be found, not just written to). Guest carts (`customer_id is null`) are unaffected — this only bit carts already linked to a customer.
- **`email_verification_codes` reads** (a verification code always says "expired" even entered seconds after being sent): `getActiveVerificationCode` (`repositories/email-verification.ts`) was the one function in that file still on the default `app_runtime` read; that table is RLS-enabled with **no** `app_runtime` policy at all (server-only, same as `notification_events` — 0018), so it always returned zero rows regardless of timing. Fixed by switching it to `write`/`asService` like the other three functions in the file already were.

Both are the same lesson as the `users`/`resolveCustomer` fixes above: a table with no `app_runtime` RLS policy, or a policy keyed on something `ctx` doesn't carry, needs every read *and* write routed through `write`/`asService` — the default `getDb(ctx).queryOne`/`.query` convenience is `app_runtime`-scoped and silently returns nothing instead of erroring, which is what made all of these look like "sometimes it just doesn't work" rather than a clear failure. **When a repository function reads or writes a table and the result seems wrong/empty/blocked for no reason, check the table's RLS policy and what `ctx` fields it needs before assuming the query itself is wrong.**

**Sign-in now also gates on email verification, not just checkout (added 2026-09-23):** `signInAction` already returned `emailVerified` in its result but `SignInForm` ignored it. It now checks `result.data.emailVerified` after a successful sign-in: if false, it sends a code (`ensureVerificationCodeAction`, same "only send if none active" helper checkout uses) and renders the same `<VerifyEmailForm>` inline instead of finishing sign-in; verifying calls the same `finish()` (toast + close dialog/navigate) that a normal sign-in does. Works in both the modal (`AuthDialog`) and the standalone `/account/sign-in` page since `VerifyEmailForm` doesn't care which one it's in. Google sign-in is not gated this way — Google emails are marked verified at creation (`createGoogleCustomer`/`linkGoogleToCustomer` always set `is_email_verified = true`, since Google already verified it) so there is nothing to gate. (`upsertGoogleUser` named here originally no longer exists — see the `0021` note above; the behavior is unchanged, just on `customers` now.)

**`resolveCustomer` silently signed every customer back out (fixed 2026-09-23):** `customers`' only SELECT policy is `customers_self: id = app.current_customer_id()` (0006), and `app.current_customer_id` is only set from `ctx.customerId` (`database.ts#applyContext`). `resolveCustomer` (called by `getStorefrontCustomer` on every `/account`, `/orders`, checkout page load) looked the customer up by `user_id` via `getCustomerByUserId` — passing `userId`/`restaurantId` in ctx but never `customerId` — so under `app_runtime` (RLS-enforced) `app.current_customer_id()` was always null and the policy blocked every row, no matter how valid the session cookie was. Google sign-in (or any sign-in) would succeed, set the cookie, redirect to `/account` — which then immediately bounced back to `/account/sign-in` because it could never find the customer. Fixed by having `resolveCustomer` use `getCustomerById(session.customerId, { customerId: session.customerId, restaurantId })` instead — `session.customerId` is already in the JWT, so there's no need to rediscover it by `user_id`, and passing it as `ctx.customerId` satisfies the RLS policy the way every other owner-scoped query already does (section 6's RLS note). **This bug predated all the `users`-table churn above and affected every customer sign-in method, not just Google** — grep any future "signed in but immediately signed back out" report for `app.current_customer_id` first. (`getCustomerByUserId`, named here originally, no longer exists post-`0021`; its bootstrap-lookup role is now `getCustomerByGoogleSubOrEmail`, same privileged `write`/`asService` shape.)

**Phone numbers:** `server/validation/common.ts` gained `e164Phone` (validates + normalises to E.164 via `libphonenumber-js`, new lightweight dependency) alongside the older, looser `contactPhone` (kept for reservations, which this phase did not touch). Checkout (`placeOrderSchema`) and sign-up now use `e164Phone`; checkout `email` is now **required** (was optional). `components/storefront/phone-input.tsx` is a country-code-select + local-number field emitting E.164; it is the one place a phone gets typed with a country now — reuse it for any future phone field rather than a bare `<input>`.

**Phone country picker: Radix `Select`, not a native `<select>` (changed 2026-09-23).** Requirement: once a country is picked, the closed field shows only "🇵🇰 +92" (flag + calling code), while the open dropdown still lists "🇵🇰 +92 Pakistan" (flag + code + name) for every country. A native `<select>` can't do this — its closed box always renders the matched `<option>`'s own text, so closed and open can't differ. Rewritten on `@radix-ui/react-select` (already an installed dependency, unused anywhere else — no new dependency added): `Select.Value`'s children are set explicitly from component state (`{flagEmoji(country)} +{callingCode}`) rather than left to auto-render the selected `Select.Item`'s content, so the trigger and the list are independently controlled. `Select.Item` children are unchanged (flag + code + name). The emitted E.164 value and `splitValue`/`emit` logic are untouched — only the trigger/list markup changed.

**Verification code resend has a 60-second cooldown (added 2026-09-23).** `VerifyEmailForm` (shared by sign-up, the sign-in gate, and the checkout gate) now starts a `secondsLeft` countdown at 60 on mount (a code was just sent by the caller right before this form renders) via one `setInterval` for the component's lifetime, clamped at 0 — not recreated every tick, so there's no double-counting or drift from repeated effect setup. "Resend code" is disabled and reads "Resend code in Ns" while `secondsLeft > 0`; clicking it while disabled is also a no-op in `resend()` itself (defense in depth, not just relying on the disabled attribute). A successful resend resets `secondsLeft` back to 60; the same interval keeps counting it down. This is a client-side UX cooldown only — the server-side rate limit on `sendVerificationCode` (3/5min per user, 8/15min per IP, `server/services/customer-auth.ts`) is the real guard against abuse and was already there.

**Testing locally (no DB-free test file yet — a gap):**
```powershell
npm run typecheck && npx vitest run tests/architecture.test.ts && npx next build   # done as of 2026-09-22
# once 0018 is applied:
npm run dev
# /r/bella-napoli/account/sign-up  → create an account → 6-digit code arrives by email (RESEND_API_KEY) or check
#   `select code_hash, expires_at from email_verification_codes order by created_at desc` if email is unconfigured
# /r/bella-napoli/checkout with items in the cart, signed in and unverified → gate appears in place of the form
# /r/bella-napoli/account/google needs GOOGLE_CLIENT_ID/SECRET with an Authorized redirect URI of
#   <NEXT_PUBLIC_SITE_URL>/r/<slug>/account/google/callback registered in Google Cloud Console
```
Not built yet: `tests/customer-auth.test.ts` (signup/signin/verify/Google, all DB-free with a fake email provider — follow the `tests/notifications-dispatch-control.test.ts` pattern), header auth state, cart icon, the floating current-orders indicator, and reorder (see section 14).

**Header changes (2026-09-24):** `site-header.tsx` no longer auto-appends "My orders" to the nav (it used to inject it into every restaurant's configured nav items regardless of `websites.config.navigation`) — nav is now exactly `config.navigation.items`, nothing added. Orders are still reachable via the account page's "My orders" link and the floating current-orders widget, so removing it from the top nav loses no functionality, just the persistent link.

**Cart badge can drift stale — fixed by resyncing on cart-page view, not just cart actions.** `web/session.ts#getCartCountHint` is a cookie **hint** only (`rp_cart_n`), deliberately not a DB read on every page view; every cart mutation (`cart/actions.ts`) calls `setCartCountHint` with the real post-mutation count, so it self-heals on the next action — but *viewing* the cart page was never itself a resync point, so a hint that drifted (e.g. from an add-to-cart that optimistically implied a count but then failed — like the `cart_items` RLS bug this session, section 16) could show a stale badge indefinitely with no action ever "fixing" it. `cart/actions.ts#resyncCartCountAction` + `components/storefront/cart-count-sync.tsx` (an invisible client component, one-shot `useEffect` guarded by a ref) now resync the cookie to the cart page's real `cart?.itemCount ?? 0` on every view and `router.refresh()` once, so the header catches up immediately rather than waiting for the visitor's next mutation. Cart pages are the only place this was added — it doesn't apply the same live-read cost everywhere, consistent with the hint's original "no DB read on ordinary page views" intent (only the cart page, which already loaded the real cart anyway, pays for the resync).

**Current-orders widget (`current-orders-widget.tsx`) now animated with a "Track your order" bubble (2026-09-24):** icon changed from `ShoppingBag` to `MapPin` (reads as live tracking, not just "your cart/orders"), plus a `animate-ping` pulsing ring behind the button (the same visual language as a live-location dot). A dismissible bubble ("Track your order", closes with an X) appears next to the button whenever there's an active order; dismissal is remembered per-tab in `sessionStorage` (key `rp_track_bubble_dismissed`) so it doesn't reappear on every page nav within the same session, but does reappear in a fresh tab/session — deliberate, not a bug (there's no server-side dismissal state, and re-showing occasionally for a still-active order is the safer default over never re-surfacing it). This made the component client-side (`"use client"`; it was previously a plain server-safe component) since it now needs `useState`/`useEffect`/`sessionStorage` — its props (`restaurantSlug`, `count`) are unchanged, so the `layout.tsx` call site needed no changes.

## 17. Admin panel (`/admin`)

Staff-only UI. Phase 1: login, a protected shell, dashboard, orders, menu. Phase 2: reservations, reviews. Phase 3: kitchen view, customers, coupons, delivery zones, locations, settings, payments. Single-tenant-per-instance like the storefront cache (section 15): `/admin` carries no `[restaurantSlug]` segment — it resolves `config.app.defaultRestaurantSlug` via `web/admin.ts#getAdminRestaurant` (React-`cache()`d per request). Not built: staff management (deliberately excluded), website/CMS.

```
src/app/admin/
  login/                        page.tsx (client form) + actions.ts (signInAction → web/session.signInStaffSession)
  (dashboard)/                  route group: layout.tsx guards with requireStaffForAdmin(), applies the restaurant's brand
                                  theme (getAdminTheme, see below), renders AdminSidebar/AdminHeader
    page.tsx                    dashboard: status counts + recent orders (orders.view)
    orders/                     list (filters/pagination) + [orderNumber] detail; actions.ts: updateOrderStatusAction
    kitchen/                     active-order tickets (pending/confirmed/preparing/ready), reuses OrderStatusControl as-is;
                                  KitchenAutoRefresh polls router.refresh() every 20s (no SSE — that stream is one-order-scoped, see section 8)
    reservations/                list w/ status tabs (upcoming/pending/confirmed/seated/completed/cancelled/no_show/all), inline ReservationStatusControl
                                  (plain select — no rank rule, any status → any status); actions.ts: updateReservationStatusAction ('reservations.manage')
    reviews/                      moderation queue, status tabs (pending/approved/rejected/all); ReviewModerationControl (approve/reject + reply/feature,
                                  independent actions matching moderateReview's combined patch shape); actions.ts: moderateReviewAction ('reviews.manage').
                                  Moderating calls getStorefrontCache().invalidate() (approved reviews feed the storefront snapshot, same as menu writes)
    menu/                       categories + items; items/new, items/[itemId] (variants, add-on groups); actions in menu/actions.ts + menu/items/actions.ts
    customers/                   list (search/sort) + [customerId] detail (stats + order history); view only, no repo mutation exists beyond checkout's
                                  own upsertCustomer, and none was asked for
    coupons/                     full CRUD, inline edit (CouponManager); coupons are excluded from the storefront snapshot — no cache invalidation
    delivery-zones/               full CRUD, inline edit (DeliveryZoneManager); zones ARE in the snapshot — every write invalidates the cache
    locations/                    full CRUD, inline edit (LocationManager); hours/lat/long intentionally left out of the form (existing values are
                                  preserved via coalesce) — a follow-up if per-location hours editing is needed; invalidates the cache
    settings/                     restaurants.features + restaurants.settings, one Card+<form> per section (Features, Tax, Service fee, Ordering,
                                  Payments, Reservations, Delivery, Loyalty, Receipt); reservations.tables (per-table inventory) left out, same
                                  reasoning as locations' hours; invalidates the cache
    payments/                     view-only transaction list (listPayments already joins order_number/customer_name); no actions.ts
  error.tsx                     renders error.message directly (AppError messages are already user-safe)
```

- **Auth:** `web/session.ts#signInStaffSession` (sets `rp_staff_session`) / `signOutStaffSession` / `requireStaffForAdmin` (redirects to `/admin/login` on `UNAUTHORIZED` instead of throwing, mirroring `requireStorefront`'s `notFound()` pattern). Page-level gating uses `requirePermission(...)`; the sidebar filters links with `hasAnyPermission` (`server/auth/permissions.ts`) — hiding a link is UX only, `requirePermission` in the page/action is the real gate. Some screens have `.view` and `.manage` split across different roles (e.g. `manager` gets `locations.view` but not `locations.manage`) — those pages take a `canManage` flag and hide write controls, not just gate the action (`locations/page.tsx` → `LocationManager`, `settings/page.tsx`'s `readOnly` prop are the reference).
- **Seeded logins:** `owner@bellanapoli.pk` / `BellaNapoli#1` (owner), `admin@…` / `BellaNapoli#2`, `manager@…` / `BellaNapoli#3`, `chef@…` / `BellaNapoli#4` (staff role — no `menu.manage`/`staff.manage`, good for testing permission gating).
- **Brand theme:** the admin shell is themed like the storefront, not a fixed color scheme — `web/admin.ts#getAdminTheme` (cached per request) resolves `websites.theme` JSONB (via `server/services/restaurants.ts#getAdminTheme`, → `repositories/websites.ts#getWebsite` → `server/domain/storefront-context.ts#resolveTheme`), falling back to the `restaurants.primary_color` column when no website theme is set — the same resolution the storefront uses, minus the "is this restaurant publicly visible" gate (staff must see their branding even before the site goes live). `(dashboard)/layout.tsx` applies it with `web/theme.ts#themeCssVariables` on the shell's inline `style`, exactly like `src/app/r/[restaurantSlug]/layout.tsx` does.
- **Orders:** `server/services/orders.ts` adds thin staff-facing wrappers (`listOrdersForStaff`, `getOrderForStaff`, `changeOrderStatus`, `getOrderStatusCounts`, `getRecentOrdersForAdmin`, `getKitchenOrders`) over the already-complete `repositories/orders.ts`. `updateOrderStatusAction` calls `dispatchDueNotifications` inside `after()` after the status commits — every status change must go through this action (also reused by Kitchen), or pushes/emails stay queued.
- **Menu:** `server/services/menu-admin.ts` wraps the already-complete CRUD in `repositories/menu.ts` (categories, items, variants, add-on groups, add-ons) and calls `getStorefrontCache().invalidate()` on every write. Variant/add-on-group/add-on rows are each their own immediate add/delete action (no batch diff/save) — simpler and matches the thin-action convention. `createMenuItem`'s `dietary_tags`/`allergens` insert and `createDeliveryZone`'s `areas`/`postal_codes` insert both needed an explicit `::text[]` cast added to their `coalesce(...)` (found when each was exercised here for the first time) — Postgres otherwise resolves an untyped `coalesce($param, '{}')` as `text`, not the array column's real type; the fix is the same one-line pattern in both files.
- **Settings:** `server/validation/settings.ts` derives every admin edit schema from `shared/contract/settings.ts`'s `restaurantFeaturesSchema`/`restaurantSettingsSchema` (via `.partial()` / `.shape.<section>.removeDefault().partial()`) — never hand-duplicate that field list. `restaurants.features`/`restaurants.settings` are whole-column JSONB (`repositories/restaurants.ts#updateRestaurant` replaces the column, it does not merge per key), so `server/services/restaurants.ts#updateRestaurantFeatures`/`updateRestaurantSettingsSection` always read the current restaurant first and merge the patch into it before writing back — skipping that merge silently wipes every other section.
- **Forms:** native `<form>` + `useTransition` + `FormData`/plain-object payloads, matching `checkout-form.tsx` (no `react-hook-form`, despite it being an installed dependency). Forms with nested data (`MenuItemForm`, coupon/delivery-zone/settings forms) pass a plain object instead of `FormData`; validated server-side regardless.
- **`auth` schema gotcha (see section 6):** staff sign-in was the first code path in this app ever exercised against a real hosted Supabase database for a privileged write, and `authenticateStaff` (which every admin page load calls, via `requireStaff`) was the first RLS-checked read on `team_members` in production. Both failed with `permission denied for schema auth` — the first because `signInStaff` wrote `auth.users.last_sign_in_at` (removed, it was non-essential bookkeeping nothing read), the second because RLS policies call `app.current_user_id()` → `auth.uid()` and `app_runtime` had no real schema `USAGE` on `auth` (Supabase silently no-ops a direct `grant usage on schema auth to app_runtime`, even though 0006 already tried). Fixed with three migrations: `0017` (`app_service` gets table-level `select` on `auth.users`), `0018` and `0019` (`app_service` and `app_runtime` each get membership in Supabase's `service_role`, the one thing that does grant real schema `USAGE` on `auth`). **Updated 2026-09-25:** customer sign-up no longer touches `auth.users` at all (section 16, `0021_customers_own_login.sql`) — that was the "not fixed" gap this line used to describe. Staff creation still can't INSERT/UPDATE `auth.users` through the app (confirmed nothing can — see section 16's incident note) and goes through `scripts/db/create-staff.ts` (migrator connection) instead; that's accepted as the permanent design, not a pending fix.

## 18. Extra demo restaurants (Zaytoun) and per-restaurant seeds

**Zaytoun — Levantine Kitchen** (`zaytoun`, Islamabad, olive/saffron theme, 7 categories / 35 items, 2 locations, 5 delivery zones, 4 coupons, 10 orders, 9 reviews, 6 reservations). Everything restaurant-specific lives in one folder:

```
scripts/db/zaytoun/images/   logo.svg, hero/cover/about.jpg, gallery/*.jpg, menu/*.jpg   (source of truth for the pictures)
scripts/db/zaytoun/seed/     data.ts (all content, ids, prices)  seed.ts (entry point)  images.json + fetch-images.mjs (Unsplash ids -> files)
```

- **Run:** `npm run db:seed:zaytoun`. It replaces **only** the `zaytoun` tenant (delete by slug + its 4 `auth.users`; cascades), so it is re-runnable and never touches Bella/Sakura; `npm run db:seed` (Bella) is unchanged and does not create Zaytoun. Uses the owner connection like the Bella seed. Orders are priced with the real `calculatePricing`; the seed then deletes `notification_events` for this restaurant only (seeded orders are history, nothing may be emailed).
- **Images:** Next only serves `/public`, so the seed copies `scripts/db/zaytoun/images` to `public/images/zaytoun` (URLs in the DB are `/images/zaytoun/...`; the copy is committed so deploys work). Missing pictures: `node scripts/db/zaytoun/seed/fetch-images.mjs` (idempotent, Unsplash direct links; `images.json` maps file -> photo id; menu 1000x750, hero/cover 1920x1080, gallery 1600x1067). Changing a picture in place: delete the file and its `public/images/zaytoun` copy, re-fetch, and clear `.next/cache/images` (the optimizer caches by URL). Choose photos by *looking* at them (no alcohol/bottles in a halal restaurant; a first hero had a vodka bottle).
- **`media.path` is globally unique (`unique (bucket, path)`)**: the Zaytoun seed stores `zaytoun/<file>`; a bare `dining-room.jpg` collides with Bella's.
- **Viewing it:** the storefront cache serves one restaurant per instance (section 15), so run `NEXT_PUBLIC_DEFAULT_RESTAURANT=zaytoun npx next dev -p 3100` (a shell env var beats `.env.local`) and open `/r/zaytoun`; on a Bella instance `/r/zaytoun` is 404 by design. Admin: `owner@zaytoun.pk` / `Zaytoun#1` (`admin@` #2, `manager@` #3, `chef@` #4, same domain); customer logins `noor.ahmed@example.com` and `mehr.jamil@example.com` / `DinerPass#1`.
- **Adding another restaurant:** copy `scripts/db/zaytoun/` to `scripts/db/<slug>/`, rewrite `data.ts` (fresh uuid group prefix in `uid()` so ids never clash), point `seed.ts` and a new npm script at it. Only `Playfair Display` and `Inter` are actually loaded (`app/layout.tsx`); other font names fall back to Georgia/system. Icon names must exist in `components/storefront/icon.tsx`. Variant/add-on names used by seeded orders must match exactly (the seed throws on a typo).
- **Bug found and fixed while doing this: per-restaurant colours never applied.** `globals.css` declares `--color-brand: var(--brand-primary, #c8102e)` (and the other `--color-*`, `--radius-brand`) on `:root`; a `var()` in a custom property is resolved where it is declared, so the wrapper's `--brand-*` override never reached components using `bg-[var(--color-brand)]`. Every restaurant rendered the default red (invisible until now because Bella's own brand is that red; `@theme inline` does not help because components reference the variable directly). Fix: `web/theme.ts#themeCssVariables` also emits `--color-brand|-foreground|-secondary|-accent`, `--color-canvas|surface|ink|muted-ink|hairline` and `--radius-brand` on the wrapper (storefront layout and admin shell both use it). Any new token in `globals.css` that reads a `--brand-*` must be added there too.
- **Website pages other than home (`/r/<slug>/about`, `/contact`, ...)** are served by `app/r/[restaurantSlug]/[pageSlug]/page.tsx` (found 2026-09-26: the pages were seeded and `is_published` but no route existed, so every one was a 404 — for Bella too). It reads `website_pages` through `getPageContent` (snapshot `readPageBySlug`, DB fallback `getPageBySlug({publishedOnly})`) and renders `SectionRenderer`. Static routes (menu, cart, reviews, ...) win over the dynamic segment; unknown/unpublished slug or `home` -> 404 (home is the restaurant root). A page is not linked anywhere automatically: add it to `websites.config.navigation.items` / footer columns (Zaytoun's seed links Our Story + Contact). A running server keeps the old snapshot until its refresh interval or a restart.
- **Functional pages are website pages too (2026-09-26).** `menu`, `reservation`, `reviews` and `locations` each have a `website_pages` row (same table/`sections` JSONB as home/about/contact; no schema change) so their layout is configurable. The new section type `page_content` (`{type, enabled, title?, subtitle?}`, `shared/contract/sections.ts`) marks where the built-in body (menu list + filters, booking form, reviews list + form, location cards) sits among the other sections, and `title`/`subtitle` override the body's own heading (defaults stay dynamic, e.g. the menu's "35 dishes available today"). Wiring: each route's `page.tsx` renders `<ConfiguredPage pageSlug=... render={(context, heading) => body}/>` (`components/storefront/configured-page.tsx`), which loads the row with `getPageContent`, and `SectionRenderer` takes a `body` prop; `generateMetadata` uses `configuredPageMetadata` (row `seo.title`/`title`/`description`, else the old defaults). **Fallback:** no row, unpublished, empty `sections`, or no/disabled `page_content` marker -> the body renders alone / after the other sections, so an existing restaurant without these rows behaves exactly as before (Bella's live DB got its four rows on 2026-09-26 by a targeted `insert ... on conflict (website_id, slug) do nothing`, not a reseed, which would have replaced Bella's data; the section arrays are `MENU_SECTIONS` etc. in `scripts/db/seed-data.ts`, shared by that insert and `db:seed`). Add a new functional page: add its slug to `FunctionalPageSlug`, split its `page.tsx` into `ConfiguredPage` + a `render...(context, heading)` function, seed the row with a `page_content` section. Guarded by `tests/page-content-section.test.ts`. Seeds: `scripts/db/seed.ts` (Bella) and `scripts/db/zaytoun/seed/data.ts` (`MENU_SECTIONS` etc.).
- **Navigation items have an `enabled` flag (2026-09-26).** `websites.config.navigation.items[]` is `{label, href, enabled}` (`websiteConfigSchema`, `shared/contract/settings.ts`); `components/storefront/site-header.tsx` renders only `enabled` items (desktop and mobile share the list). A stored item without the key counts as enabled, so old configs keep every link and nothing needs migrating; to hide a link set `"enabled": false` in the DB, e.g. `update websites set config = jsonb_set(config, '{navigation,items}', (select jsonb_agg(case when i->>'label' = 'Reviews' then i || '{"enabled": false}' else i end) from jsonb_array_elements(config->'navigation'->'items') i)) where restaurant_id = (select id from restaurants where slug = 'zaytoun')` (the snapshot picks it up on the next refresh or restart). Seeds write `enabled: true` on every item (`BELLA.nav` in `scripts/db/seed-data.ts`, `NAV` in `scripts/db/zaytoun/seed/data.ts`); Bella's live row got `enabled: true` on all five items on 2026-09-26 via a targeted `jsonb_set` that only adds the key where it is missing. Footer columns are not flagged. Test: `tests/page-content-section.test.ts`.

## 19. UI design system (storefront + admin)

Presentation only; every colour, font and radius still comes from the restaurant's `websites.theme` (DB). Upgraded 2026-09-26 with the installed taste skills (`design-taste-frontend`, `redesign-existing-projects`, `high-end-visual-design`) as the checklist.

- **Theme root:** the storefront layout and the admin shell wrappers carry the class `theme-root` plus the inline `themeCssVariables(theme)`. Anything derived from brand variables must be declared on that element, never on `:root`: a `var()` inside a custom property resolves where it is declared (see section 18). `.theme-root` in `globals.css` defines `--radius-card` (1.5x brand radius, capped at 24px), `--radius-panel` (2x, capped at 32px), ink-tinted `--shadow-card`/`--shadow-raised`, `--shadow-brand` and the `font-family`.
- **Fonts bug fixed:** headings rendered in Georgia and body in system-ui for every restaurant, because `--font-display`/`--font-sans` resolved at `:root`. `themeCssVariables` now also emits them, and `FONT_STACKS` puts the next/font variables (`--font-display-fallback`, `--font-sans-fallback`) first for Playfair Display and Inter. Admin overrides `--font-display` with the body sans (no serif on a working tool).
- **Radius rule:** controls (buttons, inputs, chips inside forms) use `--radius-brand`; cards use `--radius-card`; large panels (CTA bands, hero-adjacent panels, auth shell) use `--radius-panel`.
- **Utilities (`globals.css`):** `surface-card` (border + surface + card radius + shadow), `surface-flat` (same, no shadow), `surface-tint`, `hover-lift`, `tabular` (tabular figures for all money), `eyebrow`, `scrollbar-none`, `reveal` (scroll-driven fade-up via `animation-timeline: view()`, gated by `@supports` and reduced motion, so other browsers just show content), `stagger-in` (set `--i`), `animate-sheet`, `animate-hero`. Element defaults (`h1-h4`, `p`, `:focus-visible`) live in `@layer base` so utilities can override them; an unlayered element rule beats every Tailwind utility.
- **Button variants:** `primary | secondary | outline | ghost | subtle | danger | link | inverse | glass`. `glass` is for buttons on photography (hero secondary CTA); `inverse` for buttons on a brand-coloured panel. `CtaSection` maps configured CTA styles to these automatically when the panel is coloured, because a primary button on a primary panel is invisible.
- **`--header-h`:** `site-header.tsx` publishes the sticky header's real height (announcement bar and paused notice included, open mobile sheet excluded) on `<html>`. The menu's sticky category rail, the item/cart sticky columns and category anchor offsets use `top-[var(--header-h,4.5rem)]`.
- **Section layouts:** hero (content anchored low, directional scrim, ken-burns), order-type switch (panel overlapping the hero edge only when it directly follows a hero: `SectionRenderer` sets `data-after=<previous section type>`), featured items (swipe rail on phones, grid above `sm`), menu categories and gallery (bento with a 2x2 feature tile; the last tile spans the remaining cells per breakpoint so rows never leave holes; no-image categories get a light brand-tint tile), why-choose-us (editorial split, no boxed cards), reviews (masonry via CSS columns, opened by the real rating summary). Spice level is `components/storefront/spice-level.tsx` (flame icons, no emoji). Auth pages use `components/storefront/auth-shell.tsx` (restaurant cover photo + form).
- **Grid overflow gotcha:** a `grid` with only `lg:grid-cols-[...]` has an auto track below `lg`, which grows to the widest nowrap child and pushes the page sideways on phones (seen on the item and cart pages). Always give a base `grid-cols-[minmax(0,1fr)]` and wrap `fr` tracks in `minmax(0,…)`.
- **Admin shell:** `admin-sidebar.tsx` exports `AdminSidebar` (desktop, lg+, grouped Service / Catalogue / Business, same permission gating) and `AdminMobileNav` (drawer). The drawer is portalled into `.theme-root` because the sticky header's `backdrop-filter` makes it the containing block for `position: fixed` children; any future overlay rendered inside a blurred header needs the same.
- **Verifying visually:** take full-page screenshots with `reducedMotion: "reduce"`, otherwise scroll-reveal sections below the fold are captured at opacity 0. Wait for hydration (a few seconds on `next dev`) before clicking client buttons, or the click does nothing. Long screenshot sessions can exhaust `next dev`'s heap; start it with `NODE_OPTIONS=--max-old-space-size=6144`. In Git Bash set `MSYS_NO_PATHCONV=1` or `/r/...` arguments are rewritten into Windows paths.
