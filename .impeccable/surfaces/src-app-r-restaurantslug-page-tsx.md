---
version: 1
slug: "src-app-r-restaurantslug-page-tsx"
primary_target: "src/app/r/[restaurantSlug]/page.tsx"
related_targets: ["src/app/admin/(dashboard)/layout.tsx"]
---

# Storefront + admin: The Pass

Scope: every customer route under /r/[restaurantSlug] (home, configured pages, menu, item, cart, checkout, order tracking, current orders, orders, account, auth, reservation, reviews, locations) and the /admin shell. Visitor mode: Persuade on the storefront (order or book), Operate on admin.

Audience: diners on phones deciding and ordering; staff running service. Task: menu to order in the fewest steps; follow the order; book a table. Content: all DB-driven (theme colours and radius, font names, pages and sections, menu, reviews, locations, hours). Constraints: no schema, seed, backend, API or business-logic change; one restaurant per instance; cart is read from the DB only on cart/checkout (tray uses the count hint).

## Direction contract

THESIS: the site is the restaurant's pass: food moves from station to tray to ticket. Refuses the category default of a food hero over a grid of rounded product cards.

OWN-WORLD: flat steel-and-paper surfaces separated by 1px rules, not floating shadowed cards; dishes as photo plates at one fixed scale; the brand colour is reserved for the active or next action; tabular figures for every price and ticket number; DB fonts, rendered from curated self-hosted faces.

STORY: open now and how to order (first viewport), then signature plates, then stations to explore, then who cooks it, then proof (reviews), then visit.

FIRST VIEWPORT: full-bleed photograph with the name and one line; a live service strip computed from real hours (open now or opens at, closes at) and three order doors (delivery, pickup, dine-in).

SIGNATURE: add to tray. The plate thumbnail travels to the tray in one decisive motion; the tray count ticks; the tray persists (bottom bar on phones, top-right on desktop) and opens the cart as a drawer.

RISK: the kitchen metaphor must stay functional (stations, tray, ticket) and never become decoration or kitchen-themed copy.

Raises from declined challengers:
- botanical folio: every dish image at one exact scale and crop.
- orienteering map: brand colour only on the active leg (current station, selected option, next action).
- ebru: add to tray is a single, irreversible-feeling transfer motion.
- VU meter: order progress moves with weight and a small overshoot, never an instant jump.
- sewing pattern: chosen option solid, unchosen options quiet outlines.
- night cityscape: the storefront reflects the real hour: open, closing soon, closed.

Seed key: 65e548ed (assigned).
