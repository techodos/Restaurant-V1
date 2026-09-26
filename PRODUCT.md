# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Diners** (primary audience of the storefront): guests of one specific restaurant, mostly on a phone, deciding what to eat and then ordering delivery, pickup or dine-in, booking a table, following a live order, or reading reviews. Guests can order without an account; signed-in customers get order history and faster checkout.
- **Restaurant staff** (admin): owners, admins, managers and kitchen staff working through live service (orders, kitchen tickets, reservations, review moderation) and configuring the restaurant (menu, coupons, delivery zones, locations, settings). Role-gated permissions.
- **Restaurant owners evaluating the platform**: the storefront and admin are what they buy.

## Product Purpose

A multi-tenant restaurant platform: every restaurant gets its own branded ordering and booking website plus an admin panel. Success is a diner going from "hungry" to a placed order or booked table with no friction, and staff running service without fighting the tool.

## Positioning

Each restaurant's site is driven entirely by its own data and brand (theme, pages, sections, menu, photography, reviews), so the same product must look premium for any restaurant, not one showcase. Live order tracking (server-sent events), web push and email notifications are built in.

## Operating Context

- One Next.js instance serves one restaurant (in-memory storefront snapshot); routes live under `/r/<slug>/...`, admin under `/admin`.
- Diners are mostly on phones, often in a hurry; staff use desktops at the counter and tablets or phones in the kitchen.
- Demo tenants: Bella Napoli (Italian, Lahore), Zaytoun (Levantine, Islamabad), Sakura (isolation fixture). Currency PKR.

## Capabilities and Constraints

- Menu with categories, variants, add-on groups, dietary tags, spice level, availability; cart; guest or customer checkout; coupons; delivery zones; order types delivery / pickup / dine-in; reservations with slot availability; reviews with moderation and replies; order tracking with a status timeline; customer accounts (password, Google, email verification); configurable website pages built from typed sections.
- All restaurant content, theme and feature switches come from the database; the UI must never hardcode or mock them.
- Schema, seed data, backend, API contracts, auth logic, RLS and business rules are out of scope for UI work.

## Brand Commitments

- Per-restaurant brand lives in the database: colours and corner radius are binding. Font names in the theme are binding as names, but the platform may improve how those names render (better curated, self-hosted faces).
- Motion library `motion` is approved for the motion system.

## Evidence on Hand

- Real restaurant content in the database: menus with photography, categories, reviews with replies, locations with hours, gallery and page sections. Zaytoun imagery in `public/images/zaytoun/`; Bella's menu and category images are partly missing on disk.
- No press, awards, customer logos or platform testimonials exist; do not invent them.

## Product Principles

1. The restaurant is the brand; the platform stays quiet and makes any restaurant's data look its best.
2. Food and the next action lead: the dish, the price, and ordering are never more than a glance away.
3. Phone first for diners, speed first for staff.
4. Every state is designed: empty, loading, closed, sold out, error.
5. Real data only; presentation may transform it, never replace it.

## Accessibility & Inclusion

WCAG AA contrast on any restaurant theme, keyboard and screen-reader support, reduced-motion respected.
