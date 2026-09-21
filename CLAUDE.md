# restaurant-platform

Before changing, running, deploying or debugging anything, read `docs/skills/restaurant-platform/SKILL.md`. It is the ONE project skill and the only documentation under `docs/` (architecture map, layer rules, where new code goes, symbol map, database/env, notifications, live order tracking, localhost and Vercel/other-host deployment, troubleshooting, known gaps) — read it instead of scanning the project. Why each choice was made: `DECISIONS.md`.

**Always keep that skill current:** when you learn or build something new and useful (feature, gotcha, command, deployment step, schema change, root cause), add it to the matching section of that same file in the same change. Do NOT create another skill or another `.md` under `docs/`; if no section fits, add a new section to the skill.

After structural changes run `npm run typecheck` and `npx vitest run tests/architecture.test.ts`.
