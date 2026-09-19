import { readFileSync } from "node:fs";
import path from "node:path";

/** Minimal .env loader for node scripts (no extra dependency). */
export function loadEnv(file = ".env.local"): void {
  try {
    const contents = readFileSync(path.resolve(process.cwd(), file), "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* defaults below are used */
  }
}
