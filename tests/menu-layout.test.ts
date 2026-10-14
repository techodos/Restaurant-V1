import { describe, expect, it } from "vitest";
import { websiteConfigSchema } from "@/shared/contract/settings";
import { parseSection } from "@/shared/contract/sections";

describe("menu page layout (page_content.menuLayout)", () => {
  it("defaults to editorial, accepts grid, and falls back on unknown values", () => {
    expect(parseSection({ type: "page_content" })).toMatchObject({ menuLayout: "editorial" });
    expect(parseSection({ type: "page_content", menuLayout: "grid" })).toMatchObject({ menuLayout: "grid" });
    expect(parseSection({ type: "page_content", menuLayout: "bogus" })).toMatchObject({ menuLayout: "editorial" });
    for (const menuLayout of ["list", "sidebar", "rows"]) {
      expect(parseSection({ type: "page_content", menuLayout })).toMatchObject({ menuLayout });
    }
  });
});

describe("hero layouts", () => {
  it("accepts framed / collage / dishes, keeps their extras, and falls back to cinematic", () => {
    expect(parseSection({ type: "hero", layout: "framed" })).toMatchObject({ layout: "framed" });
    expect(
      parseSection({ type: "hero", layout: "collage", galleryImages: [{ url: "/a.jpg" }, { url: "/b.jpg" }] }),
    ).toMatchObject({ layout: "collage", galleryImages: [{ url: "/a.jpg" }, { url: "/b.jpg" }] });
    expect(parseSection({ type: "hero", layout: "dishes", dishSlugs: ["margherita"] })).toMatchObject({
      layout: "dishes",
      dishSlugs: ["margherita"],
    });
    expect(parseSection({ type: "hero", layout: "bogus" })).toMatchObject({ layout: "cinematic" });
    // the saved Zaytoun hero that broke the collage: three extras plus a blank row the editor added.
    // Bad rows are dropped one by one and extras past three are cut; the good photos all survive.
    const parsed = parseSection({
      type: "hero",
      layout: "collage",
      galleryImages: [{ url: "/a.jpg" }, { url: "", alt: "" }, { url: "/b.jpg" }, { url: "/c.jpg" }, { url: "/d.jpg" }],
      dishSlugs: ["a", "", "b", "c", "d"],
    });
    expect(parsed).toMatchObject({
      galleryImages: [{ url: "/a.jpg" }, { url: "/b.jpg" }, { url: "/c.jpg" }],
      dishSlugs: ["a", "b", "c"],
    });
    expect(parseSection({ type: "hero" })).toMatchObject({ galleryImages: [], dishSlugs: [] });
  });
});

describe("website config navigation.style", () => {
  it("defaults to classic, accepts floating, and falls back on unknown values", () => {
    expect(websiteConfigSchema.parse({}).navigation.style).toBe("classic");
    expect(websiteConfigSchema.parse({ navigation: { style: "floating" } }).navigation.style).toBe("floating");
    expect(websiteConfigSchema.parse({ navigation: { style: "bogus" } }).navigation.style).toBe("classic");
    expect(websiteConfigSchema.parse({ navigation: { style: "tiered" } }).navigation.style).toBe("classic"); // removed style
    for (const style of ["centered", "minimal"]) {
      expect(websiteConfigSchema.parse({ navigation: { style } }).navigation.style).toBe(style);
    }
  });
});
