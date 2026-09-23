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

---

## 19. In-memory storefront cache: one instance → one restaurant → one snapshot

**Decision.** Each deployed instance serves exactly one restaurant (the slug in
`NEXT_PUBLIC_DEFAULT_RESTAURANT`) from one database. At startup, `src/instrumentation.ts`
loads the storefront's public, read-mostly data into an immutable in-memory snapshot
(`src/server/cache`); `services/storefront|catalog|restaurants|reviews` answer from it and
a background timer replaces it every `STOREFRONT_CACHE_REFRESH_INTERVAL_MS`.
`STOREFRONT_CACHE_ENABLED=false` restores the previous per-request database reads.

**Why.** On the hosted database every storefront page cost 5–12 sequential statements
(5–10 s). After startup those pages send none (measured: 0 statements, 30–200 ms).

**In the snapshot:** restaurant (features, settings), website (theme, config, published
pages), all locations, all delivery zones, active categories, active items with variants
and add-on groups, approved reviews (top 50 + rating summary).
**Never in the snapshot:** carts, orders, payments, customers, sessions, coupons,
reservations and booked slots, order tracking, cost prices.

**Consequences.**
* Refresh is atomic and single-flight: a complete, validated snapshot is built, then the
  reference is swapped; a failed or timed-out refresh keeps the old snapshot.
* A failed *first* load fails startup (production exits non-zero); there is no per-request
  database fallback for an empty cache.
* The cache is on `globalThis` (like the database manager): Next bundles the startup hook
  and the routes separately and dev reloads re-evaluate modules.
* Pricing stays authoritative: `createOrder` recomputes from the database, and cart pricing
  and the checkout page read delivery zones with `getLiveDeliveryZones`, never the snapshot.
  `requireRestaurant` (used by every write path) also reads the database.
  Display-only values (menu prices on cards, restaurant tax/service settings used to show a
  cart total) can lag the database by up to one refresh interval.
* With the cache on, any other `/r/<slug>` is 404: the instance has one restaurant. With it
  off, behaviour is unchanged (any tenant in the database).
* Future admin writes call `getStorefrontCache().invalidate()` after committing; there is no
  admin system yet, so nothing calls it today.
* The startup hook reads `process.env.NEXT_RUNTIME` directly: Next replaces that literal at
  compile time so the Edge bundle does not pull in `pg`. `tests/architecture.test.ts` allows
  exactly that token in exactly that file.
* Two other per-request database costs were removed from the storefront: the reservation page asks
  for booked slots once for the whole booking window and every location (`getBookedSlotCounts`) instead
  of once per day and location (62 transactions, ~105 s on the hosted database), and the layout no longer
  reads the cart to draw the header badge. The badge comes from the `rp_cart_n` cookie, a display hint that
  `openStorefrontCart` re-syncs to the real count and the cart actions and `placeOrderAction` update.
  `/cart` and `/checkout` still read the real cart.


## 20. Reservation emails share the notification outbox; "My Orders" is scoped by the visitor, not by the URL

**Reservation emails.** A submitted request emails the guest "received, awaiting confirmation"; when the restaurant confirms
(status becomes `confirmed`) they get a second email. Reservations reuse `notification_events` instead of a second outbox:
migration 0017 makes `order_id` nullable, adds `reservation_id` (exactly one of the two is set) and a trigger on
`reservations` that queues `requested` / `confirmed`. Same reasons as §17: the event exists iff the change committed, whoever
made it (there is no admin UI, staff change the status in SQL), and the dispatcher delivers afterwards so a mail outage can
never fail a booking (`bookTableAction` only calls `dispatchDueNotifications` in `after()`).
`unique (reservation_id, event_type)` is the "no duplicate confirmation" guarantee: `confirmed → pending → confirmed` queues
nothing new. A reservation inserted already confirmed (auto-confirm) queues only `confirmed`. Cancelled/seated queue nothing
(unchanged behaviour). Reservations are email only (`RESERVATION_EMAIL_EVENTS`), still gated by the restaurant's
`features.notifications` + `emailNotify`. The guest email is now **required** on the booking form/schema, because these
emails are the only way to reach the guest.

**My Orders (`/r/<slug>/orders`).** Ownership is derived from the request: the customer session (`customer_id`) or the guest
cart cookie (`carts.session_token`); the page takes no order id. RLS already isolated both (0006 `orders_customer`, 0008
`orders_guest_select`) and is verified again by the query's own predicates (defence in depth). No policy was added or relaxed.
One rule RLS cannot express is enforced in the repository: a guest token may own several past carts, and RLS would let the
tracking page open all of them, so `listVisitorOrders` gives a guest **only orders in progress** and never history. Active
means every non-terminal status (`ACTIVE_ORDER_STATUSES`). Live status reuses the order page's SSE stream per current order
instead of a new mechanism; without `DATABASE_URL_LISTEN` the cards still show the latest status on load/refresh.
"My orders" is added to the header navigation in code (not via each restaurant's `websites.config`) so every restaurant has it.

## 21. The service worker displays every push; page code never does

Web Push had a display gap that looked like several unrelated bugs: the notification appeared on the order page but
not while any other page of the site was open, and not for `completed` / `cancelled` even with the order page open.

The cause is in the Firebase SDK, not in the browser. `@firebase/messaging`'s own service-worker `push` handler calls
`clients.matchAll({includeUncontrolled: true})` and, **if any window of the origin is visible, shows nothing at all** —
it posts the payload to those windows and leaves display to page code. The app only had such page code in
`push-opt-in.tsx`, which renders on the order page and is hidden for finished orders, so every other case fell through
a hole. Two smaller faults hid it: the worker had no `skipWaiting`/`clients.claim`, so a changed worker never took over
while a tab was open, and `connect()` depended on the Firebase config *object*, which a server render rebuilds, so each
`router.refresh()` tore down the foreground subscription and re-issued a token.

The decision is to give display one owner. The generated worker (`app/firebase-messaging-sw.js/route.ts`) registers its
own `push` listener **before** `firebase.messaging()` and calls `event.stopImmediatePropagation()`; listeners run in
registration order, so the SDK's handler never runs and `self.registration.showNotification(...)` in our listener is the
only display path. That is one behaviour to reason about instead of two, it cannot double-display, and it cannot be
silenced by which page happens to be open — the customer gets the same notification with the order page in front of
them, on another page, in a background tab, or with the browser minimised, which is the whole point of the opt-in.

`firebase.messaging()` is still called, in a try/catch, for token issuance and `pushsubscriptionchange`; dropping the
SDK from the worker would mean re-implementing subscription rotation for no gain. The worker also posts
`{type: "order-push"}` to open windows, but purely as a refresh hint: no notification depends on a page listening.
The three mechanisms stay distinct and are never substituted for one another — Web Push (worker, works with the app
closed), SSE live status (§18, page open only), and toasts (page only, never used to imitate a push).

Two supporting choices: `integrations/fcm.ts` repeats title and body inside `webpush.notification` beside `tag`, so the
web payload carries them regardless of how FCM merges a webpush notification with the common one; and `push-opt-in.tsx`
waits for the worker to be *activated* before `getToken`, because `pushManager.subscribe()` throws on a still-installing
registration — the reason a first "Notify me" click could fail. `tests/push-service-worker.test.ts` pins the listener
order, `stopImmediatePropagation`, `skipWaiting`/`claim`, and that no server credential reaches the script.

## 22. Customer accounts build on `auth.users`; Google sign-up defers `customers` creation until a phone is on file

Phase 1 of customer sign-in/sign-up/Google/email-verified-checkout (2026-09-22). The "users table" the request referred
to already existed as `auth.users` (the Supabase-shaped shim from migration 0001) and was already read by
`auth-service.ts`; it just had no repository or model of its own, so a new `server/repositories/users.ts` +
`shared/contract/models.ts#User` were added instead of inventing a second users table alongside it.

Email verification reuses `auth.users.email_confirmed_at` rather than adding a new "verified" column: a customer's
login identity either has a confirmed email or it does not, and that was already the column every other consumer of
Supabase Auth would look at. A new server-only table, `email_verification_codes` (migration 0018), holds the 10-minute,
5-attempt, HMAC-hashed one-time codes; verifying one sets `email_confirmed_at`, same as a real email confirmation
would. The checkout gate is enforced in the server action, not just hidden in the form — `EMAIL_NOT_VERIFIED` is a new
`ErrorCode` the client uses only to decide which UI to show, never as the only check.

Google sign-in could not simply create a `customers` row on first login: `customers.phone` is `not null` and is the
natural key of `unique (restaurant_id, phone)`, and Google never supplies a phone number. Inventing a placeholder
value would collide with the next Google-only customer at the same restaurant. Instead `completeGoogleAuth` only signs
a session when a `customers` row already exists for that (restaurant, linked user); otherwise it hands back a
short-lived signed "pending" token (new purpose `google-pending` in `auth/tokens.ts`) and the browser is sent to
`/account/google-phone` to collect one phone number before `finishGoogleSignup` creates the row and the real session.
This also means a Google login that already ordered at restaurant A still does one extra step at restaurant B — correct,
since `customers` is deliberately per-restaurant.

No Google SDK dependency was added: `server/integrations/google.ts` does the OAuth2 authorization-code exchange by hand
and verifies the returned `id_token` with `jose` (already a dependency for our own JWTs) against Google's published
JWKS, following the same "hand-rolled over a heavy SDK" convention as `integrations/fcm.ts`. `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` are optional, like every other integration — unset, `config.googleAuth` is `null` and every
"Continue with Google" affordance is hidden rather than erroring.

**Addendum (2026-09-22, migration 0018 applied):** the migration as first written tried
`alter table auth.users add column google_sub ...` directly. On hosted Supabase the app's migrator role does not own
`auth.users` (`must be owner of table users`) — only Supabase's own admin role can alter that schema. Fixed by moving
the Google link into a new app-owned table, `customer_identities (user_id pk → auth.users, google_sub unique,
auth_provider)`, left-joined onto `auth.users` by every query in `repositories/users.ts` instead of living as columns
on it. `email_confirmed_at` and `raw_user_meta_data`, used elsewhere in the same migration's design, needed no such
change — they are native Supabase columns on `auth.users`, not ones this app added. Lesson for any future column this
app wants on `auth.users`: it cannot be added by `ALTER TABLE` on hosted Supabase; use a side table instead.

**Addendum 2 (2026-09-23, renamed to `user_auth`):** `customer_identities` renamed to `user_auth` for a clearer name.
Done by editing `0018_customer_auth.sql` in place (table/index names only) rather than a new migration, then by hand
on the hosted DB: `alter table ... rename to user_auth`, renamed its two indexes to match, and updated the stored
`schema_migrations` checksum for `0018` to the edited file's hash. Safe only because `0018` had not been applied
anywhere but this one hosted dev DB — editing an already-applied migration on a DB you don't control the checksum of
would desync it (section 6 of the skill has hit this before with `0017`). Any environment that already ran the old
`0018` would need this exact by-hand fix (rename + checksum update) repeated, not a plain `db:migrate`.

**Addendum 3 (2026-09-23, `auth.users` replaced with app-owned `users`):** the permission problem this whole
addendum trail was working around turned out to be worse than "can't add columns" — `app_service` (the bypassrls
role every write transaction runs as) was never granted INSERT/UPDATE/DELETE on `auth.users` either, and it never
can be: the migrator role holds a few privileges on `auth.users` directly (it's Supabase's `postgres` role) but
without GRANT OPTION, so `grant insert on auth.users to app_service` runs without error but silently grants nothing
(`NOTICE: no privileges were granted for "users"`, confirmed 2026-09-23). This meant every account-creating flow
that touched `auth.users` — Google sign-up, email/password customer sign-up, staff creation — was broken with
`permission denied for table users` the moment anyone actually completed one (reads against the seeded rows worked
fine, masking it). Migration `0019_replace_users_table.sql` created an app-owned `users` table (public schema,
`role`/`is_email_verified` as real columns instead of a jsonb dig / nullable timestamp), backfilled it from
`auth.users` keeping the same ids, and retargeted the 8 app FKs that pointed at `auth.users(id)` to `users(id)`.
`auth.users` is left in place (still owned by Supabase, still FK'd by Supabase's own internal tables) but the app
no longer touches it. `0020_merge_user_auth_into_users.sql` then folded `user_auth`'s two columns
(`google_sub`, `auth_provider`) onto `users` directly, since the only reason `user_auth` existed as a separate
table was the same `auth.users`-can't-be-altered constraint `0019` just removed, and it was a pure 1:1 relation
(`user_id` was both the primary key and the only foreign key). See SKILL.md §16 and §14 for the operational
detail and the resulting known gap (`app_runtime` can still read `schema_migrations`, unrelated to this change).

## 23. Current Orders is a separate route from My Orders, not a second section of it

Built on the same `getMyOrders(restaurantId, visitor)` as before (§20) — no new query, no duplicate SQL — but rendered
as two routes instead of one page with two sections: `/orders` (My Orders, `previous` only, signed-in customers only)
and `/current-orders` (`current` only, guest or signed-in). Reached from the header's "My orders" link and from a new
floating bottom-right widget (`current-orders-widget.tsx`, rendered by the restaurant layout on every page) that shows
the active-order count and links to `/current-orders`.

The split exists because "current" and "previous" have different ownership requirements that a shared gated page could
not express without one of them lying: a guest has no account to scope history to, so there is nothing sensible for
`/orders` to show them beyond a sign-in prompt — but a guest can and does have an active order right now, which needs
to keep being visible somewhere. Before the split, both lived on `/orders` gated together, which meant a guest with a
live order either saw it (by exempting "current" from the sign-in gate, at which point the page was no longer
"sign in to see your orders" but half-gated in a way nothing on the page explained) or didn't (wrong — they placed the
order). Separating "am I signed in" (My Orders) from "do I have anything active right now" (Current Orders, always
answerable from the request alone) removes the contradiction instead of special-casing it.

Reorder (`ReorderButton` → `reorderAction` → `reorderOrder`) reuses `buildReorderLines` (repository; written earlier,
unused until now) and the real `addToCart` service — never a parallel cart-building path — so a reordered item is
always priced and validated exactly like adding it by hand from the menu. `reorderOrder` catches only `AppError`
(`PricingError` from `resolveItemSelection` for a deleted/disabled/out-of-window item) per line and continues; any
other error still fails the whole reorder, since only "this specific item isn't orderable any more" is an expected,
skippable outcome.

Scope was deliberately split after discussion with the user: this phase is schema + auth + Google + email verification
+ mandatory phone/email at checkout with a country-code picker (`components/storefront/phone-input.tsx`, new dependency
`libphonenumber-js`). Header auth state, the floating current-orders indicator, and reorder are phase 2 — My Orders
already splits current/previous correctly (§20) so phase 2 is mostly a floating-widget + header change, not new data
plumbing.

## 24. `resolveCustomer` looks up by `customerId`, not `user_id` — RLS can't bootstrap identity from a bare user id

Found 2026-09-23 while testing Google sign-in end to end: every customer session, on every page load, was silently
signed back out. `customers`' only SELECT policy (`customers_self`, 0006) is `id = app.current_customer_id()`, and
`app.current_customer_id` is only ever populated from `ctx.customerId` (`database.ts#applyContext`). `resolveCustomer`
(called by `getStorefrontCustomer` on every `/account`, `/orders`, checkout page load) looked the customer up by
`user_id` via `getCustomerByUserId`, passing `userId`/`restaurantId` in ctx but never `customerId` — so under
`app_runtime` (RLS-enforced, the role every plain read uses) the policy blocked every row, no matter how valid the
session cookie was: `app.current_customer_id()` evaluates to null when the setting is unset, and `id = null` is never
true in SQL. The session's JWT already carries `customerId`, so the fix is to look up `getCustomerById(session.
customerId, { customerId: session.customerId, restaurantId })` instead — the same identifier RLS already gates on,
no privilege escalation needed. `getCustomerByUserId` still exists for the one case that legitimately doesn't know
the customer id yet (`completeGoogleAuth`'s "does this Google-linked user already have a customer row here" check)
and now runs privileged (`write`/`asService`) instead — the same fix shape as `users.ts` (§22 addendum 3): a lookup
whose whole job is to *discover* an id can't be gated by RLS on that same id, so it either needs a different key
that's already known and trusted (customer_id from the JWT, here) or it needs to run as `app_service`. See SKILL.md
§16 for the operational detail.

Same session: "Continue with Google" already opens as a modal over the current page (`AuthDialog`, wired into
`site-header.tsx`) rather than navigating away, but the OAuth round trip itself must leave the page for Google's
consent screen — that part can't be a modal. To still return the browser to wherever "Continue with Google" was
clicked (not a hardcoded `/account`), the trigger link carries `?returnTo=<usePathname()>`, which `account/google/
route.ts` stores in a short cookie (`rp_google_return_to`, same TTL/pattern as the existing CSRF `state` cookie) and
the callback consumes and redirects to on success — validated against `/r/<this-slug>/...` only (no open redirects)
and rejecting the sign-in/sign-up/google-phone pages themselves (landing back on "please sign in" while already
signed in is a confusing loop). The error path was deliberately left going to the standalone `/account/sign-in?
error=google` page rather than reopening the dialog inline — that needs a client affordance ("read `?error=google`
on mount, open `AuthDialog`") that doesn't exist yet, and the success path was what was actually asked for.

## 25. Two more spots hit the same "RLS context missing a field" bug as §24, once real sessions started reaching them

Found immediately after §24's fix, when a real signed-in session could finally exercise code paths that had never
actually run against a live customer before:

**`cart_items`:** adding to cart as a signed-in customer failed with `new row violates row-level security policy for
table "cart_items"`. `cart.ts#cartContext` never put `customerId` in the RLS context; `cart_is_owned` (0005) needs it
once a cart has `customer_id` set (any signed-in customer's cart). Fixed by threading the cart's own `customerId`
through every `cartContext(...)` call in `cart.ts`, and through `findCart`/`readCart` and `checkout.ts#placeOrder` too
— those were read-only lookups with the same gap, meaning a signed-in customer's cart could not even be *found*, let
alone written to, once real sign-ins started happening.

**`email_verification_codes`:** a code always read as "expired," even checked a second after being emailed. Three of
the four functions in `email-verification.ts` already ran privileged (`write`/`asService`); `getActiveVerificationCode`
was left on the default `app_runtime` read, and that table has no `app_runtime` policy at all (server-only by design,
0018) — so it always saw zero rows. One-line fix: switch it to `write` like its siblings.

Both are the same shape as §24: a table whose RLS depends on a `ctx` field the caller never populated, or a table
with no `app_runtime` policy at all, read/written through the default (`app_runtime`) path instead of `write`/
`asService`. The common thread across all three bugs this session: they were invisible before because the code path
that would have exercised them (a real, working signed-in session) never actually ran — §24's bug meant every
"successful" sign-in silently reverted to a guest-shaped request on the very next page load, so the customer-scoped
RLS branches in `cart_is_owned` etc. were never hit either. Fixing the top of the chain (session resolution) is what
made the rest visible. Worth remembering when the *next* layer of "signed-in customer" functionality gets built:
audit its RLS context requirements before shipping it, rather than waiting for it to surface the same way.

Same session, also added: `SignInForm` now checks the `emailVerified` flag `signInAction` already returned (it was
computed but unused) and shows the same `<VerifyEmailForm>` checkout already uses instead of finishing sign-in when
false — gating verification at sign-in, not only at checkout. Google accounts are exempt (`upsertGoogleUser` always
sets `is_email_verified = true`, since Google already verified the address).

## 26. Customer login moved onto `customers` itself — two branches independently tried to fix the same `auth.users` wall and collided on the shared hosted dev DB

§22's addendum 3 and §24/§25 describe replacing `auth.users` with an app-owned `users` table (`0019_replace_users_table.sql`,
`0020_merge_user_auth_into_users.sql`) because `app_service`/`app_runtime` can never get real INSERT/UPDATE on
`auth.users` — confirmed by testing a live `GRANT` and watching it silently grant nothing. That fix worked, and was
verified against the hosted DB. The next day, testing the full sign-up flow through the browser, it broke again:
`customers_user_id_fkey` (and five other FKs `0019` had retargeted) were found pointing back at `auth.users`, and
`users` itself was empty.

Investigation (`git log --all`) found the cause: a **second, independent branch** on this same shared hosted dev
database (`ce29138`, an admin-portal build, author `thetechodos@gmail.com`) had added its own fix for the identical
`auth.users`-can't-be-written problem — `0017_grant_app_service_auth_users.sql`, `0018_app_service_auth_schema_usage.sql`,
`0019_app_runtime_auth_schema_usage.sql` (note the filename collision: both branches independently picked
"0017"–"0019", since neither knew about the other's work). That branch's fix grants `service_role` membership to
`app_service`/`app_runtime` instead of replacing the table — and its own migration comments already admit this
doesn't enable INSERT/UPDATE either ("stay blocked for everyone except supabase_auth_admin"), confirmed again by a
live test here (`INSERT INTO auth.users ...` as `app_service`, with the grant already applied: still `permission
denied`). That branch's own staff-creation script, `scripts/db/create-staff.ts`, says as much directly and works
around it by running against `DATABASE_URL_MIGRATOR` (owner) — a real database connection with owner privileges,
acceptable for an offline CLI a developer runs, never something a live customer-facing request can do.

Whichever branch's migration/seed script ran most recently against the shared DB is what determined the FK targets
at any given moment — there is no real "merge" between two schema designs solving the same constraint differently,
just whichever wrote last. This is a structural risk of multiple branches sharing one hosted dev database without
coordinating schema changes, not a bug in either branch's logic.

**Resolution, at the requester's explicit direction** (`0021_customers_own_login.sql`): stop needing a shared
identity table for customers at all. `customers` gained `password_hash`, `is_email_verified`, `google_sub`,
`auth_provider`, `last_sign_in_at` directly — a customer's login was already restaurant-scoped in practice (a
`customers` row only ever exists at the restaurant they ordered from), so there was never a real need for a
cross-restaurant identity row to link it to; `customers.user_id` (and the whole `users` table) is gone.
`email_verification_codes.customer_id` FKs straight to `customers`. The five *staff*-side FKs `0019` had also
retargeted (`team_members.user_id`, `media.uploaded_by`, `order_status_history.changed_by`,
`deliveries.driver_user_id`, `reviews.responded_by`) go back to `auth.users` — those were never customer references,
they're "which staff member did this," and `auth.users` is exactly where the other branch's staff system already
lives. `auth-service.ts`'s `signInStaff`/`team.ts`'s `createTeamMember` are reverted byte-for-byte to how they read
before any of this session's `users`-table work — staff auth is that other branch's territory now, untouched.

The two systems (customer login, staff login) no longer share a table, a role-grant strategy, or a migration
numbering sequence they could collide on again. See SKILL.md §16 for the operational detail (repository functions,
the two partial-unique indexes, Google linking-by-email-or-sub).
