import { describe, expect, it } from "vitest";
import { defaultSection, parseSection, sectionSchema } from "@/shared/contract/sections";

describe("hero split layout + stats_band section", () => {
  it("hero defaults to cinematic and accepts split with a cutout image", () => {
    expect(defaultSection("hero")).toMatchObject({ layout: "cinematic" });
    const parsed = sectionSchema.parse({
      type: "hero",
      layout: "split",
      cutoutImage: { url: "/images/croissant.png" },
    });
    expect(parsed).toMatchObject({ layout: "split" });
    if (parsed.type === "hero") expect(parsed.cutoutImage?.url).toBe("/images/croissant.png");
  });

  it("stats_band parses stats/caption/exploreCta and defaults to an empty stats row", () => {
    expect(defaultSection("stats_band")).toMatchObject({ type: "stats_band", stats: [] });
    const parsed = parseSection({
      type: "stats_band",
      caption: "Buttery and flaky.",
      exploreCta: { label: "Explore Dishes", href: "#menu" },
      stats: [{ value: "400+", label: "Food items" }],
    });
    expect(parsed).toMatchObject({
      type: "stats_band",
      caption: "Buttery and flaky.",
      stats: [{ value: "400+", label: "Food items" }],
    });
  });

  it("an unknown section type is dropped, not thrown", () => {
    expect(parseSection({ type: "not_a_real_section" })).toBeNull();
  });
});
