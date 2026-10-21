import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `repositories/menu.ts`: an update can CLEAR the photo, description, short description and compare-at price (it used
 * `coalesce`, so emptying them in the admin form was silently ignored), returns the photo it replaced in the same
 * statement, and deletes return the photo addresses that went with the rows. Also: a stored file's extension follows
 * its MIME type, never the uploaded file name. The database is faked: it records statements and answers by SQL shape.
 */
const { db } = vi.hoisted(() => ({
  db: {
    statements: [] as { sql: string; params: readonly unknown[] }[],
    answer: (() => []) as (sql: string) => Record<string, unknown>[],
  },
}));

vi.mock("@/server/db/registry", () => {
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return db.answer(sql);
    },
    queryOne: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return db.answer(sql)[0] ?? null;
    },
  };
  const transaction = async (_ctx: unknown, handler: (tx: typeof client) => Promise<unknown>) => handler(client);
  return { getDb: () => ({ read: transaction, write: transaction }) };
});

const fs = vi.hoisted(() => ({ written: [] as string[] }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (file: string) => void fs.written.push(file)),
  unlink: vi.fn(async () => undefined),
}));
vi.mock("@/server/config", () => ({ config: { storage: { bucket: "restaurant-media", supabase: null } } }));

import { deleteCategory, deleteMenuItem, updateMenuItem } from "@/server/repositories/menu";
import { uploadMedia } from "@/server/integrations/storage";

const ctx = { restaurantId: "11111111-1111-4111-8111-111111111111", userId: "u1" };
const row = { id: "item-1", restaurant_id: ctx.restaurantId, category_id: "c", name: "Dish", slug: "dish", base_price: "450", image_url: null, previous_image_url: "https://old.jpg" };

beforeEach(() => {
  db.statements = [];
  db.answer = () => [row];
  fs.written = [];
});

describe("updateMenuItem", () => {
  it("clears the fields the patch names with null, and returns the previous photo from the same statement", async () => {
    const result = await updateMenuItem("item-1", { imageUrl: null, description: null, shortDescription: null, compareAtPrice: null }, ctx);
    expect(db.statements).toHaveLength(1);
    const { sql, params } = db.statements[0]!;
    expect(sql).toMatch(/with previous as \(select image_url from menu_items where id = \$1\)/);
    expect(sql).toMatch(/image_url = case when 'imageUrl' = any\(\$21::text\[\]\) then \$7 else image_url end/);
    expect(sql).not.toMatch(/image_url = coalesce/);
    expect(params[20]).toEqual(["description", "shortDescription", "imageUrl", "compareAtPrice"]);
    expect(result.previousImageUrl).toBe("https://old.jpg");
    expect(result.item.imageUrl).toBeNull();
  });

  it("keeps fields the patch does not name", async () => {
    await updateMenuItem("item-1", { name: "Renamed" }, ctx);
    expect(db.statements[0]!.params[20]).toEqual([]);
  });
});

describe("deletes return the photos that went with the rows", () => {
  it("deleteMenuItem returns the item's photo", async () => {
    db.answer = () => [{ image_url: "https://dish.jpg" }];
    expect(await deleteMenuItem("item-1", ctx)).toBe("https://dish.jpg");
    expect(db.statements[0]!.sql).toMatch(/returning image_url/);
    db.answer = () => [];
    expect(await deleteMenuItem("gone", ctx)).toBeNull();
  });

  it("deleteCategory returns its items' photos and its own, read before the cascade in one statement", async () => {
    db.answer = () => [{ image_url: "https://a.jpg" }, { image_url: "https://cat.jpg" }];
    expect(await deleteCategory("cat-1", ctx)).toEqual(["https://a.jpg", "https://cat.jpg"]);
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]!.sql).toMatch(/with item_images as[\s\S]*removed as \(delete from menu_categories/);
  });
});

describe("stored file names", () => {
  it("take the extension from the MIME type, not the client's file name", async () => {
    const upload = (name: string, type: string) => uploadMedia(ctx.restaurantId, { name, type, size: 10, arrayBuffer: async () => new ArrayBuffer(10) });
    expect((await upload("photo.html", "image/png")).path).toMatch(/^[\w-]+\/[0-9a-f-]{36}\.png$/);
    expect((await upload("IMG_0001.JPEG", "image/jpeg")).url).toMatch(/^\/api\/media\/.+\.jpg$/);
    expect(fs.written.every((file) => !file.endsWith(".html"))).toBe(true);
  });
});
