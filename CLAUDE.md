# restaurant-platform

Before changing, running, deploying or debugging anything, read `docs/skills/restaurant-platform/SKILL.md`. It is the ONE project skill and the only documentation under `docs/` (architecture map, layer rules, where new code goes, symbol map, database/env, notifications, live order tracking, localhost and Vercel/other-host deployment, troubleshooting, known gaps) — read it instead of scanning the project. Why each choice was made: `DECISIONS.md`.

**Always keep that skill current:** when you learn or build something new and useful (feature, gotcha, command, deployment step, schema change, root cause), add it to the matching section of that same file in the same change. Do NOT create another skill or another `.md` under `docs/`; if no section fits, add a new section to the skill.

After structural changes run `npm run typecheck` and `npx vitest run tests/architecture.test.ts`.

**Think broadly when adding or fixing anything.** Do not stop at the literal request or the happy path. For a new feature, work out its full lifecycle (created → delivered/updated → failed/retried → duplicate-safe) and every consumer of it (web, mobile browser, guest vs signed-in, foreground vs background, each channel it goes through) before calling it done — e.g. the notifications module needed both the background-push path (service worker auto-display) and the foreground path (tab open, no auto system notification) covered, not just one. When a fix addresses one symptom, check whether the same root cause shows up elsewhere in the codebase and fix it there too in the same change, rather than waiting to be asked again.

**Always run the relevant tests after any fix or new development**, not only after structural changes: at minimum `npm run typecheck` and the DB-free vitest suites touched by the change (see `docs/skills/restaurant-platform/SKILL.md` §12), plus `npx next build` when routes/components changed. Fix failures before considering the work done; report what was run and its result.
