import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { errors } from "../errors";

/**
 * Media storage abstraction.
 *  • Supabase Storage when SUPABASE_URL + service key are present (production).
 *  • Local .uploads/ directory otherwise (development / self-hosting), served
 *    back through /api/media/[...path].
 * Binary files never live in PostgreSQL — only metadata + URL.
 */

export interface UploadResult {
  bucket: string;
  path: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml",
]);
const MAX_BYTES = 5 * 1024 * 1024;

export function storageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "restaurant-media";
}

export function isSupabaseStorageEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function assertUploadable(file: { type: string; size: number }): void {
  if (!ALLOWED_MIME.has(file.type)) {
    throw errors.validation("Only JPG, PNG, WEBP, AVIF, GIF or SVG images can be uploaded.");
  }
  if (file.size > MAX_BYTES) {
    throw errors.validation("Images must be smaller than 5 MB.");
  }
}

function safeFileName(original: string): string {
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  return `${randomUUID()}${ext}`;
}

export async function uploadMedia(
  restaurantId: string,
  file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
): Promise<UploadResult> {
  assertUploadable(file);
  const fileName = safeFileName(file.name);
  const objectPath = `${restaurantId}/${fileName}`;
  const data = Buffer.from(await file.arrayBuffer());
  const bucket = storageBucket();

  if (isSupabaseStorageEnabled()) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
    const response = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": file.type,
        "x-upsert": "true",
      },
      body: new Uint8Array(data),
    });
    if (!response.ok) {
      console.error("[storage] supabase upload failed", response.status, await response.text());
      throw errors.internal("Unable to upload the image");
    }
    return {
      bucket,
      path: objectPath,
      url: `${base}/storage/v1/object/public/${bucket}/${objectPath}`,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  const directory = path.join(process.cwd(), ".uploads", restaurantId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, fileName), data);
  return {
    bucket,
    path: objectPath,
    url: `/api/media/${restaurantId}/${fileName}`,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function deleteStoredMedia(bucket: string, objectPath: string): Promise<void> {
  if (isSupabaseStorageEnabled()) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
    await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    return;
  }
  try {
    await unlink(path.join(process.cwd(), ".uploads", objectPath));
  } catch {
    /* already gone */
  }
}
