// Runs before `npm run build` (npm "prebuild"). Next's persistent webpack cache (.next/cache/webpack) gets
// corrupted on this setup when source files change between builds, and the next build then dies with
// "TypeError: Cannot read properties of undefined (reading 'length') at WasmHash._updateWithBuffer".
// Clearing only that folder makes every build start from a clean webpack cache; the rest of .next (image
// cache, the running build) is left alone. See docs/skills/restaurant-platform/SKILL.md, section 11.
import { rmSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.env.NEXT_DIST_DIR || ".next", "cache", "webpack");
rmSync(dir, { recursive: true, force: true });
console.log(`cleared ${dir}`);
