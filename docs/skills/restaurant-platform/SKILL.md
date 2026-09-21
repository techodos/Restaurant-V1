---
name: restaurant-platform
description: The single knowledge base for the restaurant-platform codebase (Next.js 15 + Postgres/Supabase, multi-tenant storefront). Covers architecture and layer rules, where new code goes, symbol map, database and environment, customer notifications (email + push, per-restaurant switches, load behaviour), live order tracking (SSE), running on localhost, deploying to Vercel or other hosts, troubleshooting and known gaps. Read it before adding, changing, running, deploying or debugging anything so the project does not need to be scanned.
---

# restaurant-platform — the one skill

**This file is the only project skill and the only project documentation under `docs/`.** Architecture, notifications, live order status, running and deploying all live here. `DECISIONS.md` (repo root) is the decision log (why each choice was made); everything else is here.

**Maintenance rule (always follow):** whenever you learn something new and useful about this project (a new feature, a gotcha, a command, a deployment step, a bug root cause, a schema change), add it to the matching section of THIS file in the same change. Do not create another skill or another `.md` under `docs/`. If no section fits, add a new `##` section here and list it in the contents below. Keep entries short and factual; correct or delete an entry that turns out to be wrong. Verify a symbol with Grep before relying on it; this file can lag the code.

Contents: 1 Overview · 2 Architecture · 3 Where new code goes · 4 Symbol map · 5 Rules easy to break · 6 Database and environment · 7 Notifications · 8 Live order tracking (SSE) · 9 Run on localhost · 10 Deploy (Vercel / other hosts) · 11 Troubleshooting · 12 Commands and tests · 13 Future: moving the backend out, one database per restaurant · 14 Known gaps · 15 Storefront cache (in-memory snapshot)

---

## 1. Overview

Multi-tenant restaurant storefront: menu, cart, guest/customer checkout, table reservations, reviews, order tracking, email and push notifications. Routes live under `/r/[restaurantSlug]/...`; `/` redirects to the default restaurant. Only the customer storefront exists; staff/admin UI is not built (auth service and permissions are ready for it). Stack: Next.js 15 (App Router, server actions), React 19, Tailwind 4, `pg` (no ORM), zod, jose, decimal.js, vitest, Playwright. Two demo tenants are seeded (Bella Napoli `bella-napoli`, Sakura); test fixtures are in `tests/helpers/db.ts`.

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
                             architecture, config, database-registry, notifications*, order-events, storefront-cache|snapshot|services, reservation-availability, cart-count (no database needed)
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
- `storefront`: ◆`loadStorefrontContext(slug)`, `resolveTheme`, ◆`getHomePageContent`
- `restaurants`: `requireRestaurant(slug)` (DB, gates writes), ◆`getLocations(id,{activeOnly})`, ◆`getDeliveryZones(id,{locationId,activeOnly})` (display), `getLiveDeliveryZones` (DB; pricing + checkout)
- `catalog`: ◆`getMenuCategories`, ◆`searchMenu(id, filters)`, ◆`findMenuItemBySlug`
- `cart`: `generateCartToken`, `findCart`, `openCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `emptyCart` (these four return `{itemCount}`, the cart's new size), `applyCoupon`, `changeOrderType`, `changeCartLocation`, `priceCart`, `validatePromoCode`, `serviceAvailability`
- `checkout`: `placeOrder(restaurant, input, visitor)`, `getCheckoutOptions(restaurant)`
- `orders`: `trackOrder(restaurantId, orderNumber, visitor)`, `findVisitorOrder` (RLS proof or signed order-access token)
- `reservations`: `bookTable`, `getBookedSlotCounts(restaurantId, locationIds, from, to)` (one query for the whole booking window; DB, never cached); `reviews`: `submitReview`, ◆`getPublicReviews`, ◆`getReviewSummary`
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
- Dev `.env.local` points at a hosted Supabase pooler (slow: ~1 s/round trip; avoid loops of sequential queries). There is NO local Postgres on the dev machine, so DB-backed vitest suites (checkout, rbac, reservations-reviews, tenant-isolation) cannot run there (they fail with `ECONNREFUSED :5432`; that is expected); `tests/setup.ts` redirects tests to a `localhost` test DB and never touches hosted data. Do not run write flows against the hosted DB without asking; a transaction that is rolled back (dry-run of a migration) is fine.
- Migrations: `0013_notifications.sql` (outbox + push tokens + trigger), `0014_order_realtime.sql` (superseded), `0015_order_change_notify.sql` (NOTIFY trigger, drops the 0014 anon policy), `0016_rename_locations_table.sql` (see below). Apply with `npm run db:migrate` (owner connection `DATABASE_URL_MIGRATOR`).
- **Branches table is `restaurant1s`** (renamed from `restaurant_locations` by 0016; FK columns are still `location_id`; TypeScript names `Location` / `getLocations` are unchanged). Applied migrations `0003`–`0006` still say `restaurant_locations`: that is correct history, not a leftover. Write all new SQL against `restaurant1s`. The rename keeps data, grants, policies, triggers and FKs; the 0016 file has its rollback script in comments. Deploy order: run the migration, then the code (code using the new name errors until the DB is renamed).
- **RLS check:** on 2026-09-21 the hosted dev database had `relrowsecurity = false` on `orders`, `customers`, `menu_items`, `restaurants` and the branches table although migration 0006 enables it (only `notification_events` had it on). Verify with `select relname, relrowsecurity from pg_class where relname in ('orders','customers')` before relying on tenant isolation or before production; with RLS off, order visibility for guests is not protected at the database level.
- Env vars are listed in `.env.example` (never commit real values): `STOREFRONT_CACHE_ENABLED|REFRESH_INTERVAL_MS|STARTUP_TIMEOUT_MS`, `DATABASE_URL`, `DATABASE_URL_SERVICE`, `DATABASE_URL_MIGRATOR`, `DB_POOL_MAX`, `AUTH_SECRET` (≥16 chars), `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DEFAULT_RESTAURANT`, Supabase storage vars, Stripe vars, notification vars (section 7), `DATABASE_URL_LISTEN` (section 8). `EMAIL_FROM_ADDRESS` must be a valid email or config throws.

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
4. **Delivery:** after checkout it is automatic (the checkout action dispatches with `after()`); in development run `npm run notifications:dispatch -- --loop` (every 5 s); in production a scheduler calls `POST /api/internal/notifications/dispatch` with `Authorization: Bearer <NOTIFICATIONS_DISPATCH_SECRET>` every minute (section 10). `NOTIFICATIONS_DISPATCH_SECRET` must be 16+ chars; until set the route answers 503.

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
npx vitest run tests/notifications.test.ts tests/notifications-concurrency.test.ts tests/notifications-dispatch-control.test.ts tests/architecture.test.ts   # no DB
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

**Delivering notifications locally:** nothing calls the dispatcher for you; checkout dispatches automatically, status changes made in SQL stay queued until it runs. Second terminal: `npm run notifications:dispatch -- --loop` (every 5 s) or `npm run notifications:dispatch` (one pass). Or call the route (PowerShell: use `curl.exe`, plain `curl` is an alias) with the token **without** angle brackets (`<secret>` in docs is a placeholder):

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
| App errors on branches/locations after pulling | DB still has `restaurant_locations`: run `npm run db:migrate` (0016). |
| Config error "Invalid email configuration" | `EMAIL_FROM_ADDRESS` is not a valid email. |
| Env change ignored | Restart the dev server / redeploy. |

## 12. Commands and tests

`npm run dev` · `npm run build` · `npm run typecheck` · `npm test` (vitest; DB suites need Postgres) · `npm run db:migrate|db:seed|db:reset|db:verify` · `npm run notifications:dispatch [-- --loop]` · `npm run test:e2e` (Playwright).

DB-free verification: `npm run typecheck`, then `npx vitest run tests/architecture.test.ts tests/config.test.ts tests/database-registry.test.ts tests/pricing.test.ts tests/notifications.test.ts tests/notifications-concurrency.test.ts tests/notifications-dispatch-control.test.ts tests/order-events.test.ts`, `npx next build`, then `next start` and curl the `/r/bella-napoli/*` GET routes. After structural changes always run `npm run typecheck` and `npx vitest run tests/architecture.test.ts`.

## 13. Future: moving the backend out, one database per restaurant

**Moving the backend out.** `src/server` and `src/shared` import no framework code (the architecture test fails otherwise). To run them as a standalone service: (1) move both into the backend package (keep the `@/server` / `@/shared` aliases); (2) add an HTTP layer (Fastify/Hono/Express or route handlers): each server action becomes a route `schema.parse(body)` → the same service function → `jsonError()`; (3) replace `web/session.ts#getVisitorContext` with middleware that builds the same `RequestContext` from the cookie/Authorization header (`server/auth/tokens.ts` already signs/verifies JWTs; share `AUTH_SECRET`); (4) in the frontend replace `openStorefrontCart`, `getVisitorContext` and the service calls in pages with an API client (components and `shared/` untouched; `revalidatePath` stays in the frontend). Expose the same SSE `/events` endpoint.

**One database per restaurant (not implemented).** `SingleDatabaseDirectory` answers every question with the one configured database. The seam is complete: repositories call `getDb({ restaurantId })`, the registry asks a `DatabaseDirectory` which `DatabaseConfig` holds that restaurant, and `DatabaseManager` keeps one `Database` per config `key`. To enable: (1) store the mapping centrally (JSON file or a `restaurant_databases` table: `restaurantId, slug, key, runtimeUrlRef, serviceUrlRef`; only *references* to env/secret names); (2) implement `DatabaseDirectory` (e.g. `RegistryDirectory`) and construct it in `manager()` in `registry.ts` (`tests/database-registry.test.ts` shows the contract); (3) resolve slug → restaurant first (`getRestaurantBySlug`, `listPublicRestaurants`, sign-in flows call `getDb()` with no restaurant); (4) close gaps: repository functions that look rows up by id only (`getCartById`, `getLocationById`, `updateMenuItem`, …) rely on `ctx.restaurantId` (`grep -rn "getDb(ctx)" src/server/repositories`), make the directory throw on `null` for tenant repositories in dev/test; (5) migrations and seeding run per database; (6) auth needs nothing (sessions carry `restaurantId`); (7) run one notification dispatch and one LISTEN per database.

## 14. Known gaps (do not rediscover)

- `createOrder`, `createReservation`, `resolveItemSelection` are SQL + rules transaction scripts inside repositories (splitting needs the DB suites and a local database; do it as its own change).
- `auth-service` queries `auth.users` directly (Supabase-shaped table); `repositories/team.ts` hashes passwords.
- Comments in applied migrations mention old `src/lib/...` paths and `restaurant_locations`; migrations are checksummed and were not edited.
- ID-only repository lookups use `getDb(ctx)` and rely on `ctx.restaurantId` being set by the caller.
- Media URLs use `/api/media/...` but no route handler exists.
- No admin UI: statuses change via SQL, so delivery needs the dispatcher script (dev) or a scheduler (prod).
- No `vercel.json` yet (cron not configured).
- FCM has no server-side idempotency (mitigated by the notification `tag`).
- No ESLint config; `tsc` + the architecture test are the guardrails.

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
- After an admin write call `getStorefrontCache().invalidate()` (no admin system yet, so nothing calls it today).
- With the cache on, other `/r/<slug>` values are 404 (one restaurant per instance).
- The startup hook is the one place outside `server/config` allowed to read `process.env.NEXT_RUNTIME` (Next replaces the literal at compile time so the Edge bundle does not pull in `pg`).

**Still database-bound on purpose:** `/reservation` (one range query, ~3 s on the hosted DB), `/cart` and `/checkout` when the visitor has a cart cookie (one real cart read), every cart mutation, checkout, order tracking.

**Speed facts (hosted Supabase pooler, ~0.3 s per round trip, so one DB transaction of 5 statements is ~1.5 s):** `next start` serves cached storefront pages in ~25–150 ms with 0 SQL; `next dev` compiles each route on its first visit (4–12 s) and renders unoptimised afterwards (0.3–1.8 s), so judge speed on a production build. The snapshot load takes ~7–17 s at start, before the server answers. The cache is per process: on serverless hosts every cold start repeats the load.

**Observing SQL without editing code:** run the server with `NODE_OPTIONS="--require <spy.cjs>"` where the spy patches `pg` `Client.prototype.query` through `Module._load` (match any module exposing `Pool` and `Client`, not only the request string `"pg"`) and logs each statement with its duration. Each Next dev recompile spawns a worker that prints its own "installed" line; exclude it when counting statements.

**If startup fails with `[cache] storefront cache initialization failed`:** the log line carries the database error. `relation "…" does not exist` (code 42P01) means the code and the database schema disagree (for example a migration applied without the matching code, or the reverse): compare `schema_migrations` with `db/migrations/` and check the table names.
