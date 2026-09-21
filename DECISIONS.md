# Architecture & Product Decisions

Running log of the engineering decisions that shape this codebase, why they were
made, and what they constrain. Newest sections are appended; nothing is silently
reversed — superseded decisions say so explicitly.

---

## 1. Schema is reconstructed SQL-first, not via an ORM

**Decision.** `db/migrations/*.sql` is the single source of truth for the schema,
applied by `scripts/db/migrate.mjs` (checksummed, forward-only). The application
talks to Postgres with `pg` through `src/server/repositories/*`; there is no Prisma client and
no generated migration layer.

**Why.** The specification asked for PostgreSQL + Supabase + RLS + JSONB-heavy
configuration. Row level security, triggers, partial indexes, SQL functions and
role grants are the core of that design and cannot be expressed faithfully
through an ORM's DSL — half the guarantees would have to be hand-written SQL
anyway, leaving two sources of truth.

**Consequences.** Every access path goes through `src/server/repositories/*`, which maps
snake_case rows to the typed contract; `numeric` columns are always read as
strings and handled by `src/shared/money.ts` (never floats).

---

## 2. Supabase-compatible, but runnable without Supabase

**Decision.** Migration `0001` creates an `auth` schema shim (`auth.users`,
`auth.uid()`, `auth.jwt()`) and `0006` sets up roles/grants. Local development and
the test suite run against a plain PostgreSQL 17 cluster on the same code paths
Supabase would use.

**Why.** No Docker/Supabase CLI is available in the environment, and the schema
must stay portable: the same migrations can be replayed onto a hosted Supabase
project without edits.

**Consequences.** Auth is implemented in `src/server/auth` with the same session
semantics Supabase Auth would provide (JWT in an httpOnly cookie, `sub` = user
id). Swapping in `@supabase/ssr` later means replacing the session adapter, not
the authorisation model.

---

## 3. The runtime database role is deliberately unprivileged

**Decision.** Three roles: `app_owner` (migrations/seed, owns everything),
`app_runtime` (login, `noinherit`, **not** superuser, no `BYPASSRLS`) and
`app_service` (login, `BYPASSRLS`, used only server-side for privileged flows).

The Next.js runtime uses `DATABASE_URL` → `app_runtime`, so RLS is always
enforced. `DATABASE_URL_SERVICE` → `app_service` is used for guest checkout,
order creation and admin mutations *after* the server has done its own
authorisation checks.

**Why.** RLS that the application role can ignore is decoration. Keeping the
default connection unprivileged means a forgotten `where restaurant_id = …`
cannot leak another tenant's data.

**Consequences.**
* Seeding and verifying run as `app_owner` and therefore bypass RLS — this is
  intentional (see §9) and never used to serve a request.
* `db:verify` asserts `app_runtime.rolbypassrls = false` so the guarantee cannot
  silently regress.

---

## 4. Tenancy is carried per transaction, never per connection

**Decision.** `src/server/db/database.ts` opens a transaction per unit of work and calls
`set_config('app.current_user_id' | 'app.current_restaurant_id' |
'app.current_customer_id' | 'app.current_cart_token' | 'app.current_actor', …,
true)` inside it. RLS policies read those values through `app.current_user_id()`
& friends.

**Why.** Pools reuse connections across requests; session-level settings leak
between tenants. Transaction-scoped settings vanish with the transaction.

**Consequences.** Handlers that receive a `DbClient` (an open transaction) must
not start nested transactions; `createOrder` therefore takes its cart, coupon and
zone reads inside the same transaction it writes the order in.

---

## 5. One permission catalogue, two implementations, one test

**Decision.** Permissions are defined once per consumer: `app.role_permissions()`
in SQL (used by RLS policies) and `src/server/auth/permissions.ts` in TypeScript (used by server
routes and UI gating). `tests/rbac.test.ts` compares them role by role and fails
on drift.

**Why.** RLS must not depend on values passed from JavaScript, and the UI cannot
call SQL per render. Duplication is unavoidable; unchecked duplication is not.

**Consequences.** Adding a permission means touching three places: the SQL
function (new migration), `src/server/auth/permissions.ts`, and the RBAC test will confirm them.

---

## 6. Money is decimal-only, end to end

**Decision.** `numeric(12,2)` in Postgres, read as `string`, computed with
`decimal.js` at precision 24, exposed as 2-decimal strings on the wire and in the
contract types (`type Money = string`). No `number` ever holds a price.

**Why.** Floating-point money produces totals that cannot be reproduced, and the
specification forbids it.

**Consequences.** Tests assert exact strings (`"1622.50"`), and any new code path
that converts money to `number` for formatting must do it in a formatter only
(`formatMoney`).

---

## 7. One pricing engine, used by cart, checkout, seed and verify

**Decision.** `src/server/domain/pricing.ts` computes line totals, subtotal, coupon
discount, delivery fee, free-delivery waiver, minimum-order check, service fee,
tax (inclusive and exclusive) and tip. `createOrder` re-runs it from scratch
against the live menu; the seed script uses the same function so seeded orders
are arithmetically real; `db:verify` recomputes totals from stored rows.

**Why.** "Never trust the client" only means something if the server's number is
reproducible. A second implementation would eventually disagree with the first.

**Consequences.**
* Order-level and delivery-fee discounts are tracked separately
  (`orderDiscount` / `deliveryDiscount`) so a free-delivery promo cannot reduce
  the taxable value of the food.
* Errors are `PricingError` with an `ErrorCode`, converted to the API envelope by
  `toApiError` — never free-form strings.

---

## 8. Order status is a state machine with an audit trail

**Decision.** `pending → confirmed → preparing → ready → out_for_delivery →
completed`, plus `cancelled` from any non-terminal state. Enforced in SQL (trigger
rejects illegal transitions and locks terminal states) and mirrored by
`ORDER_STATUS_RANK` in TypeScript for UI affordances. Every accepted change
appends to `order_status_history`; the customer timeline is built from that table
only (`buildOrderTimeline`).

**Why.** Status logic scattered across screens is how orders end up completed
twice or revived after cancellation.

**Consequences.** UI keeps status labels/colours in `src/shared/contract/enums.ts`;
no screen decides transitions on its own.

---

## 9. Seeding and verification run as the owner, on purpose

**Decision.** `scripts/db/seed.ts` connects with `DATABASE_URL_MIGRATOR`
(owner ⇒ RLS bypassed) and is idempotent: it deletes its own rows by deterministic
UUID **or** by slug/email/e-mail, then re-inserts.

**Why.** Seeding is a provisioning operation across tenants, and RLS is designed
to stop exactly that. Idempotency matters because the same script seeds the dev
database, the test database (`DATABASE_URL_TEST_MIGRATOR`) and, later, a fresh
environment.

**Consequences.** The seed must never be imported by application code. Guest and
customer traffic always goes through the unprivileged role.

---

## 10. Guest access is proven with the cart token, not with elevation

**Decision.** Guest checkout and guest order tracking are privileged operations
handled server-side (`src/server/repositories/orders.ts` `createOrder`, plus the RLS policies
in `0008`/`0009` and the `app.order_belongs_to_cart()` helper). A guest reads
their order back only with the cart cookie that placed it. Reservation lookup
requires the confirmation code **and** the phone on the booking
(`app.reservation_by_code`, migration `0011`).

**Why.** Guests must be able to order without an account, but "whoever knows the
order number" is not an access-control policy.

**Consequences.** The cart cookie is a credential: it is httpOnly, opaque and
never rendered. Rotating or clearing it loses access to guest orders — accepted,
because the order number plus phone also resolves it in support flows.

---

## 11. Cart tokens outlive carts

**Decision.** `carts.session_token` is unique only among **active** carts
(partial unique index, migration `0010`). A converted or abandoned cart stays as
history, and the same browser gets a fresh active cart.

**Why.** A browser keeps one cart token for months; an absolute unique constraint
would break the second order from the same device.

---

## 12. Table inventory is real capacity

**Decision.** When `settings.reservations.tables` is configured, `createReservation`
assigns and persists a physical table for the slot; bookings within
±`slotMinutes` compete for that inventory. Without configured tables, capacity
falls back to the per-slot overlap check.

**Why.** The original implementation only *validated* against table numbers that
were never written, so a slot could be booked indefinitely.

**Consequences.** Optimistic assignment: the first party that fits blocks the
table for the slot window; the seed and tests exercise both paths.

---

## 13. Website content is untrusted JSONB rendered defensively

**Decision.** `websites.theme`, `restaurants.settings`/`features`,
`website_pages.sections` are parsed with Zod schemas that fill defaults and
never throw (`parseSections`, `resolveTheme`, `restaurantSettingsSchema`). The
storefront renders sections through one `SectionRenderer` that renders an unknown
or malformed section as nothing rather than crashing the page.

**Why.** Content is edited by restaurant staff through the admin UI; a bad theme
value or a section type added in a later release must not take the site down.

**Consequences.** Theme values map to CSS custom properties (`--brand-*`) with
fallbacks; no component reads raw JSONB directly.

---

## 14. Testing strategy

**Decision.** Vitest, against the real database (`restaurant_platform_test`,
migrated + seeded with the same migrations as production). Suites so far:

| File | Covers |
| --- | --- |
| `tests/pricing.test.ts` | line/subtotal math, coupons (percentage, fixed, capped, delivery-fee, expiry, usage limits, order types), tax inclusive/exclusive, service fee, minimum order, float-safety, money formatting |
| `tests/checkout.test.ts` | variant/add-on validation (required groups, defaults, max_select, inactive items), server-side repricing, guest delivery order end-to-end, coupon application and usage counting, rejection paths, status machine and audit trail |
| `tests/reservations-reviews.test.ts` | slot rules, capacity, guest lookup by code+phone, reservation lifecycle, review moderation and rating aggregation, one-review-per-order |
| `tests/rbac.test.ts` | SQL ↔ TypeScript permission parity, overrides, negation by default, `app.team_role`/`app.has_permission` |
| `tests/tenant-isolation.test.ts` | RLS across tenants and anonymous visitors, guest cart token scoping, write blocking |

**Why.** Business logic bugs live at the seams (pricing ↔ persistence ↔ RLS),
which unit tests with mocks would miss.

**Consequences.** Tests that create rows clean up after themselves because the
test database is long-lived. `npm run db:verify` (43 checks) complements the
suite by validating the *data*: schema coverage, RLS enablement, role
privileges, seed presence, arithmetic stored on real orders, and orphan checks.

---

## 15. Known gaps / deliberately deferred

* **Payments.** `PaymentProvider` has a working cash provider and a Stripe shell
  that throws `PAYMENT_UNAVAILABLE` when unconfigured. Online payment is hidden by
  DB flags (`features.onlinePayments`, `settings.payments`) — a fake success is
  never recorded.
* **Super Admin.** Multi-tenant platform administration is architecturally
  prepared (restaurants/plan/status, `features.customDomain`, `websites` per
  tenant) but intentionally not built yet.
* **Custom domains.** Routing is `/r/[restaurantSlug]/…` so a domain can be
  resolved to a slug later in middleware; no host mapping is implemented.
* **Media.** Uploads go to Supabase Storage when configured, otherwise to
  `.uploads/` served through `/api/media/[...path]`.
* **Realtime.** Order tracking uses Server-Sent Events (see §18); there is no polling.

---

## 16. Layered layout: `app → web → server/services → repositories → db`

**Decision.** Code lives in `src/server` (framework-free backend core: config, db,
repositories, services, domain, auth, validation, integrations), `src/shared`
(isomorphic contract and pure helpers), `src/web` (Next.js adapters: cookies,
request cache, `notFound()`, theme CSS) and `src/app` + `src/components` (UI).
Supersedes the flat `src/lib/*` layout referenced in §1–§10; those sections now point
at the new paths. Full map and rules: `docs/skills/restaurant-platform/SKILL.md` (section 2).

**Why.** The backend may be hosted separately and each restaurant may get its own
database later. Both require business logic that does not import Next.js and a single
place that decides which database serves a restaurant.

**Consequences.**
* `getDb(scope)` → `DatabaseDirectory` → `DatabaseManager` replaces the `getDb()`
  singleton. Today one directory entry serves everyone; per-restaurant databases are
  a new directory implementation (see docs), not a rewrite.
* `process.env` is read only in `src/server/config`; sections validate lazily.
* Pages, components and server actions call services, never repositories; enforced by
  `tests/architecture.test.ts`.
* `getRestaurantBySlug` no longer converts database errors into "not found"; a database
  outage renders the error boundary instead of a 404.
* Order tracking and review-by-order now pass the visitor's cart token / customer to the
  read (§10 requires it; the previous calls passed an empty context and could never
  match a guest's order under RLS).

---

## 17. Customer notifications: transactional outbox, providers behind interfaces

**Decision.** A database trigger (migration 0013) writes a row to `notification_events` in the same transaction as
every order insert / status change, unique on `(order_id, event_type)`. `NotificationService`
(`server/services/notifications.ts`) delivers those rows afterwards through `EmailProvider` (Resend) and `PushProvider`
(FCM), with per-channel state, retry/backoff and a max age. The order flow never imports a provider.

**Why.** Committing the event with the order guarantees "email only if the order exists" and catches status changes
made from anywhere (there is no admin UI yet; statuses are changed in SQL). Delivering afterwards means a provider
outage can delay a message but never fail or roll back an order. The unique key plus per-channel state plus Resend's
idempotency key prevent duplicates. Providers use `fetch` (+ `jose` for the FCM service-account JWT): no SDK on the server.

**Also.** Push tokens live in `customer_push_tokens` (many devices per customer, guests included because checkout always
creates a `customers` row). Email links carry a signed order-access token so tracking/review work from any device.
Setup and testing: `docs/skills/restaurant-platform/SKILL.md` (section 7).

---

## 18. Live order status: Server-Sent Events over Postgres LISTEN/NOTIFY

**Problem.** The order page refreshed every 30 s. Supabase Realtime was tried first and removed: it checks RLS with the
subscriber's JWT (never the `app.*` settings this project's policies use), so it needed a browser-side anon key, a JWT secret
and a special `anon` policy, and it silently stopped working when any of those was misconfigured.

**Decision.** A trigger (`notify_order_change`, migration 0015) calls `pg_notify` when status, payment status or ETA really
changes (NOTIFY is transactional and independent of who changed the row). One `LISTEN` connection per server process
(`DATABASE_URL_LISTEN`, session-mode) fans out to SSE streams. A stream opens only after the same ownership proof as the
order page (`findVisitorOrder`), subscribes first, then sends a snapshot, so no change falls into a gap. The browser uses a plain
`EventSource`; it holds no key and never talks to the database. Migration 0015 also drops the `orders_realtime_grant` policy of 0014.

**Consequences.** No new infrastructure, no dependency, no browser secret. Needs a long-lived Node server (`next start`,
Docker, VM); on serverless platforms with short function limits the browser reconnects and the snapshot re-syncs it.
LISTEN cannot use the transaction pooler. Per-restaurant databases need one listener per database. Live status, FCM push and
Resend email stay separate mechanisms.
