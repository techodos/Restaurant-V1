import { getDb, type RequestContext } from "./pool";
import { mapWebsite, mapWebsitePage, type Row } from "./map";
import type { Website, WebsitePage } from "../contract/models";

export async function getWebsite(restaurantId: string, ctx: RequestContext = {}): Promise<Website | null> {
  const row = await getDb().queryOne<Row>(
    ctx,
    `select * from websites where restaurant_id = $1 order by is_primary desc, created_at limit 1`,
    [restaurantId],
  );
  return row ? mapWebsite(row) : null;
}

export async function listPages(
  websiteId: string,
  ctx: RequestContext = {},
  options: { publishedOnly?: boolean } = {},
): Promise<WebsitePage[]> {
  const rows = await getDb().query<Row>(
    ctx,
    `select * from website_pages
      where website_id = $1 ${options.publishedOnly ? "and is_published" : ""}
      order by is_home desc, sort_order, title`,
    [websiteId],
  );
  return rows.map(mapWebsitePage);
}

export async function getPageBySlug(
  restaurantId: string,
  slug: string,
  ctx: RequestContext = {},
  options: { publishedOnly?: boolean } = {},
): Promise<WebsitePage | null> {
  const row = await getDb().queryOne<Row>(
    ctx,
    `select * from website_pages
      where restaurant_id = $1 and slug = $2 ${options.publishedOnly ? "and is_published" : ""}
      limit 1`,
    [restaurantId, slug],
  );
  return row ? mapWebsitePage(row) : null;
}

export async function getHomePage(restaurantId: string, ctx: RequestContext = {}): Promise<WebsitePage | null> {
  const row = await getDb().queryOne<Row>(
    ctx,
    `select * from website_pages where restaurant_id = $1 and is_home and is_published limit 1`,
    [restaurantId],
  );
  return row ? mapWebsitePage(row) : null;
}

export async function updateWebsite(
  websiteId: string,
  patch: { name?: string; status?: Website["status"]; theme?: unknown; config?: unknown; seo?: unknown; domain?: string | null },
  ctx: RequestContext,
): Promise<Website> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update websites set
         name = coalesce($2, name),
         status = coalesce($3, status),
         theme = coalesce($4::jsonb, theme),
         config = coalesce($5::jsonb, config),
         seo = coalesce($6::jsonb, seo),
         domain = coalesce($7, domain),
         published_at = case when $3 = 'published' and published_at is null then now() else published_at end
       where id = $1
       returning *`,
      [
        websiteId,
        patch.name ?? null,
        patch.status ?? null,
        patch.theme === undefined ? null : JSON.stringify(patch.theme),
        patch.config === undefined ? null : JSON.stringify(patch.config),
        patch.seo === undefined ? null : JSON.stringify(patch.seo),
        patch.domain ?? null,
      ],
    );
    if (!row) throw new Error("Website not found");
    return mapWebsite(row);
  });
}

export async function updatePage(
  pageId: string,
  patch: {
    title?: string;
    description?: string | null;
    isHome?: boolean;
    isPublished?: boolean;
    sortOrder?: number;
    sections?: unknown;
    config?: unknown;
    seo?: unknown;
  },
  ctx: RequestContext,
): Promise<WebsitePage> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const current = await tx.queryOne<Row>(`select website_id from website_pages where id = $1`, [pageId]);
    if (!current) throw new Error("Page not found");
    if (patch.isHome) {
      await tx.query(`update website_pages set is_home = false where website_id = $1 and id <> $2`, [
        current.website_id,
        pageId,
      ]);
    }
    const row = await tx.queryOne<Row>(
      `update website_pages set
         title = coalesce($2, title),
         description = coalesce($3, description),
         is_home = coalesce($4, is_home),
         is_published = coalesce($5, is_published),
         sort_order = coalesce($6, sort_order),
         sections = coalesce($7::jsonb, sections),
         config = coalesce($8::jsonb, config),
         seo = coalesce($9::jsonb, seo)
       where id = $1
       returning *`,
      [
        pageId,
        patch.title ?? null,
        patch.description ?? null,
        patch.isHome ?? null,
        patch.isPublished ?? null,
        patch.sortOrder ?? null,
        patch.sections === undefined ? null : JSON.stringify(patch.sections),
        patch.config === undefined ? null : JSON.stringify(patch.config),
        patch.seo === undefined ? null : JSON.stringify(patch.seo),
      ],
    );
    if (!row) throw new Error("Page not found");
    return mapWebsitePage(row);
  });
}

export async function createPage(
  input: {
    websiteId: string;
    restaurantId: string;
    slug: string;
    title: string;
    description?: string | null;
    isHome?: boolean;
    isPublished?: boolean;
    sections?: unknown;
    sortOrder?: number;
  },
  ctx: RequestContext,
): Promise<WebsitePage> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    if (input.isHome) {
      await tx.query(`update website_pages set is_home = false where website_id = $1`, [input.websiteId]);
    }
    const row = await tx.queryOne<Row>(
      `insert into website_pages
         (website_id, restaurant_id, slug, title, description, is_home, is_published, sort_order, sections)
       values ($1, $2, $3, $4, $5, coalesce($6, false), coalesce($7, true), coalesce($8, 0), coalesce($9::jsonb, '[]'::jsonb))
       returning *`,
      [
        input.websiteId,
        input.restaurantId,
        input.slug,
        input.title,
        input.description ?? null,
        input.isHome ?? null,
        input.isPublished ?? null,
        input.sortOrder ?? null,
        input.sections === undefined ? null : JSON.stringify(input.sections),
      ],
    );
    if (!row) throw new Error("Page insert failed");
    return mapWebsitePage(row);
  });
}

export async function deletePage(pageId: string, ctx: RequestContext): Promise<void> {
  const db = getDb();
  await db.write(ctx, async (tx) => {
    await tx.query(`delete from website_pages where id = $1 and not is_home`, [pageId]);
  });
}
