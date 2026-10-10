import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves images stored locally by `integrations/storage.ts` when Supabase Storage is not configured (development,
 * self-hosting): `/api/media/<restaurantId>/<file>` -> `.uploads/<restaurantId>/<file>`. With Supabase configured,
 * uploads get a public Supabase URL instead and this route is never linked.
 */

const ROOT = path.join(process.cwd(), ".uploads");
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const segments = (await params).path ?? [];
  const file = path.resolve(ROOT, ...segments);
  const type = TYPES[path.extname(file).toLowerCase()];
  // only image files, and never outside .uploads (no "../" escapes)
  if (!type || !file.startsWith(ROOT + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(file);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        // file names are random UUIDs, so a stored file never changes
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        // an uploaded SVG must not run script when opened directly
        ...(type === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
