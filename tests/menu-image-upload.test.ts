import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dish photos uploaded from the admin menu form (SKILL.md section 17 "Menu photo upload"): the shared rulebook, the
 * upload (storage + `media` row, no orphaned file), and the clean-up that deletes an uploaded photo once it is replaced,
 * removed or its dish is deleted — but never a photo that is still used, seeded, typed by hand or a library upload.
 * Storage and repositories are faked; no database.
 */
const { state } = vi.hoisted(() => ({
  state: {
    stored: [] as { bucket: string; path: string }[],
    deletedFiles: [] as string[],
    deletedRows: [] as string[],
    createMediaFails: false,
    media: new Map<string, { id: string; purpose: string; bucket: string; path: string; url: string }>(),
    usage: new Map<string, string[]>(),
    updateResult: { imageUrl: null as string | null, previous: null as string | null },
  },
}));

vi.mock("@/server/integrations/storage", () => ({
  uploadMedia: vi.fn(async (restaurantId: string, file: { name: string; type: string; size: number }) => {
    const stored = { bucket: "restaurant-media", path: `${restaurantId}/new.webp` };
    state.stored.push(stored);
    return { ...stored, url: `https://x.supabase.co/storage/v1/object/public/restaurant-media/${stored.path}`, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
  }),
  deleteStoredMedia: vi.fn(async (_bucket: string, objectPath: string) => void state.deletedFiles.push(objectPath)),
}));

vi.mock("@/server/repositories/media", () => ({
  createMedia: vi.fn(async (restaurantId: string, input: Record<string, unknown>) => {
    if (state.createMediaFails) throw new Error("insert failed");
    return { id: "m-new", restaurantId, ...input };
  }),
  findMediaByUrl: vi.fn(async (_restaurantId: string, url: string) => {
    if (url === "boom") throw new Error("db down");
    return state.media.get(url) ?? null;
  }),
  findMediaUsage: vi.fn(async (_restaurantId: string, url: string) => state.usage.get(url) ?? []),
  deleteMedia: vi.fn(async (id: string) => void state.deletedRows.push(id)),
}));

vi.mock("@/server/repositories/menu", () => ({
  createMenuItem: vi.fn(async () => ({ id: "item-1", imageUrl: "https://new" })),
  updateMenuItem: vi.fn(async () => ({ item: { id: "item-1", imageUrl: state.updateResult.imageUrl }, previousImageUrl: state.updateResult.previous })),
  deleteMenuItem: vi.fn(async () => "https://old"),
  deleteCategory: vi.fn(async () => ["https://a", "https://b"]),
}));

vi.mock("@/server/cache", () => ({ getStorefrontCache: () => ({ invalidate: () => undefined }) }));

import { MENU_IMAGE_MAX_BYTES, formatBytes, menuImageProblem } from "@/shared/media-upload";
import { releaseMenuImages, removeCategory, removeMenuItem, saveMenuItem, uploadMenuImage } from "@/server/services/menu-admin";
import type { CreateMenuItemInput } from "@/server/repositories/menu";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const ctx = { restaurantId: RESTAURANT, userId: "u1", actor: "Owner" };
const file = (type: string, size: number) => ({ name: "dish.jpg", type, size, arrayBuffer: async () => new ArrayBuffer(0) });
const uploaded = (url: string, purpose = "menu_item") => state.media.set(url, { id: `m-${url}`, purpose, bucket: "restaurant-media", path: `${RESTAURANT}/${url.length}.webp`, url });

beforeEach(() => {
  state.stored = [];
  state.deletedFiles = [];
  state.deletedRows = [];
  state.createMediaFails = false;
  state.media.clear();
  state.usage.clear();
});

describe("menu photo rules (shared by browser and server)", () => {
  it("accepts raster photos up to the limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) expect(menuImageProblem({ type, size: MENU_IMAGE_MAX_BYTES })).toBeNull();
  });

  it("refuses SVG, GIF, non-images, empty files and anything over 4 MB (and says how big it was)", () => {
    for (const type of ["image/svg+xml", "image/gif", "text/html", "application/pdf", ""]) expect(menuImageProblem({ type, size: 1000 })).not.toBeNull();
    expect(menuImageProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(menuImageProblem({ type: "image/jpeg", size: 6_300_000 })).toMatch(/4 MB.*6\.3 MB/);
  });

  it("stays under the Server Action body limit (4 MiB)", () => {
    expect(MENU_IMAGE_MAX_BYTES).toBeLessThan(4 * 1024 * 1024);
    expect(formatBytes(950)).toBe("950 B");
    expect(formatBytes(250_000)).toBe("250 KB");
  });
});

describe("uploadMenuImage", () => {
  it("stores the file and records a media row with purpose menu_item", async () => {
    const media = await uploadMenuImage(RESTAURANT, file("image/webp", 200_000), ctx);
    expect(state.stored).toHaveLength(1);
    expect(media).toMatchObject({ purpose: "menu_item", path: `${RESTAURANT}/new.webp` });
    expect(media.url).toMatch(/^https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\//);
  });

  it("refuses a wrong type or an oversize file BEFORE anything is stored", async () => {
    await expect(uploadMenuImage(RESTAURANT, file("image/svg+xml", 1000), ctx)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(uploadMenuImage(RESTAURANT, file("image/jpeg", MENU_IMAGE_MAX_BYTES + 1), ctx)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(state.stored).toHaveLength(0);
  });

  it("deletes the stored file again when the media row cannot be written", async () => {
    state.createMediaFails = true;
    await expect(uploadMenuImage(RESTAURANT, file("image/png", 1000), ctx)).rejects.toThrow("insert failed");
    expect(state.deletedFiles).toEqual([`${RESTAURANT}/new.webp`]);
  });
});

describe("releaseMenuImages", () => {
  it("deletes an unused photo uploaded from the menu form: row and file", async () => {
    uploaded("https://up/1");
    expect(await releaseMenuImages(RESTAURANT, ["https://up/1"], ctx)).toBe(1);
    expect(state.deletedRows).toEqual(["m-https://up/1"]);
    expect(state.deletedFiles).toHaveLength(1);
  });

  it("keeps a photo still used elsewhere, a library (website) upload, and addresses with no media row", async () => {
    uploaded("https://up/used");
    state.usage.set("https://up/used", ["Dish: Karahi"]);
    uploaded("https://up/library", "website");
    const released = await releaseMenuImages(RESTAURANT, ["https://up/used", "https://up/library", "/images/gruk/menu/a.jpg", "https://unsplash/x"], ctx);
    expect(released).toBe(0);
    expect(state.deletedRows).toEqual([]);
    expect(state.deletedFiles).toEqual([]);
  });

  it("skips nulls and duplicates, and never throws", async () => {
    uploaded("https://up/2");
    expect(await releaseMenuImages(RESTAURANT, [null, "https://up/2", "https://up/2", "boom"], ctx)).toBe(1);
    expect(state.deletedRows).toEqual(["m-https://up/2"]);
  });
});

describe("menu writes report the photo they freed", () => {
  const input = { categoryId: "c", name: "Dish", slug: "dish", basePrice: "450" } as CreateMenuItemInput;

  it("an update that changed or removed the photo returns the old address; one that kept it returns null", async () => {
    state.updateResult = { imageUrl: "https://new", previous: "https://old" };
    expect((await saveMenuItem(RESTAURANT, { ...input, id: "item-1" }, ctx)).replacedImageUrl).toBe("https://old");
    state.updateResult = { imageUrl: null, previous: "https://old" };
    expect((await saveMenuItem(RESTAURANT, { ...input, id: "item-1" }, ctx)).replacedImageUrl).toBe("https://old");
    state.updateResult = { imageUrl: "https://same", previous: "https://same" };
    expect((await saveMenuItem(RESTAURANT, { ...input, id: "item-1" }, ctx)).replacedImageUrl).toBeNull();
    state.updateResult = { imageUrl: "https://new", previous: null };
    expect((await saveMenuItem(RESTAURANT, { ...input, id: "item-1" }, ctx)).replacedImageUrl).toBeNull();
  });

  it("a new item frees nothing; deleting an item or a category returns their photos", async () => {
    expect((await saveMenuItem(RESTAURANT, input, ctx)).replacedImageUrl).toBeNull();
    expect(await removeMenuItem("item-1", ctx)).toBe("https://old");
    expect(await removeCategory("cat-1", ctx)).toEqual(["https://a", "https://b"]);
  });
});
