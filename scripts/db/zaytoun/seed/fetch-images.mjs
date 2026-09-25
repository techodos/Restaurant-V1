/**
 * Downloads (and crops) every image in images.json into ../images. Idempotent: skips files that already exist.
 *   node db/zaytoun/seed/fetch-images.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(here, "images.json"), "utf8"));
const imagesDir = path.join(here, "..", "images");

const groups = [
  ["site", ".", manifest.sizes.site],
  ["gallery", "gallery", manifest.sizes.gallery],
  ["menu", "menu", manifest.sizes.menu],
];
for (const [group, folder, [w, h]] of groups) {
  mkdirSync(path.join(imagesDir, folder), { recursive: true });
  for (const [file, id] of Object.entries(manifest[group])) {
    const target = path.join(imagesDir, folder, file);
    if (existsSync(target)) continue;
    const response = await fetch(`https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&crop=entropy&q=80&fm=jpg`);
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    console.log("✔", path.join(folder, file));
  }
}
