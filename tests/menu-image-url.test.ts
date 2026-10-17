import { describe, expect, it } from "vitest";
import { categorySchema, menuItemSchema } from "@/server/validation/menu";

const item = (imageUrl: string) =>
  menuItemSchema.safeParse({ categoryId: "11111111-1111-4111-8111-111111111111", name: "Dish", slug: "dish", basePrice: "450", imageUrl });

describe("menu image address", () => {
  it("accepts remote URLs, locally stored uploads (/api/media/…), seeded site paths and an empty value", () => {
    for (const url of [
      "https://abc.supabase.co/storage/v1/object/public/restaurant-media/r/x.webp",
      "http://cdn.example.com/a.jpg",
      "/api/media/7a170001-aaaa-4aaa-8aaa-000000000001/5f2c.webp",
      "/images/zaytoun/menu/ashta.jpg",
      "",
    ]) {
      expect(item(url).success, url).toBe(true);
      expect(categorySchema.safeParse({ name: "Cat", slug: "cat", imageUrl: url }).success, url).toBe(true);
    }
  });

  it("rejects anything that could point off-site or is not an address", () => {
    for (const url of ["//evil.example/a.jpg", "/\\evil.example", "javascript:alert(1)", "data:image/png;base64,AAA", "images/a.jpg", "/a b.jpg", "ftp://x/y.jpg"]) {
      expect(item(url).success, url).toBe(false);
    }
  });
});
