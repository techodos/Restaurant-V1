import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapMedia, num, str, type Row } from "@/server/db/mappers";
import type { MediaAsset } from "@/shared/contract/models";
import type { MediaPurpose } from "@/shared/contract/enums";

export interface MediaListFilters {
  purpose?: MediaPurpose;
  search?: string;
  limit?: number;
}

export async function listMedia(
  restaurantId: string,
  filters: MediaListFilters = {},
  ctx: RequestContext = {},
): Promise<MediaAsset[]> {
  const params: unknown[] = [restaurantId];
  const conditions = ["restaurant_id = $1"];
  if (filters.purpose) {
    params.push(filters.purpose);
    conditions.push(`purpose = $${params.length}::media_purpose`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conditions.push(`(file_name ilike $${params.length} or alt_text ilike $${params.length})`);
  }
  params.push(Math.min(filters.limit ?? 120, 300));
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select * from media where ${conditions.join(" and ")} order by created_at desc limit $${params.length}`,
    params,
  );
  return rows.map(mapMedia);
}

export interface MediaInput {
  bucket: string;
  path: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  purpose?: MediaPurpose;
  altText?: string | null;
  tags?: string[];
}

export async function createMedia(
  restaurantId: string,
  input: MediaInput,
  ctx: RequestContext,
): Promise<MediaAsset> {
  const db = getDb({ restaurantId });
  return db.write({ ...ctx, restaurantId }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into media
         (restaurant_id, uploaded_by, bucket, path, url, file_name, mime_type, size_bytes, width, height, purpose, alt_text, tags)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11,'other')::media_purpose, $12, coalesce($13::text[], '{}'::text[]))
       on conflict (bucket, path) do update set
         url = excluded.url, alt_text = excluded.alt_text, purpose = excluded.purpose, tags = excluded.tags
       returning *`,
      [
        restaurantId, ctx.userId ?? null, input.bucket, input.path, input.url, input.fileName, input.mimeType,
        Math.max(0, Math.round(input.sizeBytes)), input.width ?? null, input.height ?? null,
        input.purpose ?? null, input.altText ?? null, input.tags ?? null,
      ],
    );
    if (!row) throw new Error("Unable to save the media record");
    return mapMedia(row);
  });
}

export async function updateMedia(
  mediaId: string,
  patch: { altText?: string | null; purpose?: MediaPurpose; tags?: string[] },
  ctx: RequestContext,
): Promise<MediaAsset> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update media set
         alt_text = coalesce($2, alt_text),
         purpose = coalesce($3::media_purpose, purpose),
         tags = coalesce($4, tags)
       where id = $1 returning *`,
      [mediaId, patch.altText ?? null, patch.purpose ?? null, patch.tags ?? null],
    );
    if (!row) throw new Error("Media not found");
    return mapMedia(row);
  });
}

export async function deleteMedia(mediaId: string, ctx: RequestContext): Promise<{ path: string; bucket: string }> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(`delete from media where id = $1 returning bucket, path`, [mediaId]);
    if (!row) throw new Error("Media not found");
    return { bucket: str(row.bucket), path: str(row.path) };
  });
}

export async function getMedia(restaurantId: string, mediaId: string, ctx: RequestContext = {}): Promise<MediaAsset | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(ctx, `select * from media where id = $1 and restaurant_id = $2`, [mediaId, restaurantId]);
  return row ? mapMedia(row) : null;
}

export async function findMediaByUrl(restaurantId: string, url: string, ctx: RequestContext = {}): Promise<MediaAsset | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    ctx,
    `select * from media where restaurant_id = $1 and url = $2 order by created_at desc limit 1`,
    [restaurantId, url],
  );
  return row ? mapMedia(row) : null;
}

/**
 * Where an image address is still referenced: website pages (sections, config, seo), the website itself (config,
 * theme, seo), the restaurant's logo / cover, and menu items and categories. Names only, for the refusal message.
 */
export async function findMediaUsage(restaurantId: string, url: string, ctx: RequestContext = {}): Promise<string[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select 'Page: ' || title as label from website_pages
       where restaurant_id = $1 and (position($2 in sections::text) > 0 or position($2 in config::text) > 0 or position($2 in seo::text) > 0)
     union all
     select 'Website settings' from websites
       where restaurant_id = $1 and (position($2 in config::text) > 0 or position($2 in theme::text) > 0 or position($2 in seo::text) > 0)
     union all
     select 'Restaurant logo / cover photo' from restaurants where id = $1 and (logo_url = $2 or cover_url = $2)
     union all
     select 'Dish: ' || name from menu_items where restaurant_id = $1 and image_url = $2
     union all
     select 'Category: ' || name from menu_categories where restaurant_id = $1 and image_url = $2`,
    [restaurantId, url],
  );
  return rows.map((row) => str(row.label));
}

export async function mediaUsageCounts(restaurantId: string, ctx: RequestContext = {}): Promise<Record<string, number>> {
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select purpose, count(*) as count from media where restaurant_id = $1 group by purpose`,
    [restaurantId],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[str(row.purpose)] = num(row.count);
  return counts;
}
