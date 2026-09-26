import { describe, expect, it } from "vitest";
import { parseSections } from "@/shared/contract/sections";
import { sectionTones } from "@/components/storefront/section-rhythm";

const tones = (types: object[]) => sectionTones(parseSections(types.map((s) => ({ enabled: true, ...s }))));

describe("section rhythm", () => {
  it("breaks a run of light text sections with a night band", () => {
    expect(
      tones([
        { type: "hero", title: "Hi" },
        { type: "rich_text", title: "Story", body: "x" },
        { type: "why_choose_us", items: [{ title: "a" }] },
        { type: "gallery", images: [{ url: "/a.jpg" }] },
        { type: "cta", tone: "neutral", title: "Come" },
      ]),
    ).toEqual(["night", "paper", "night", "paper", "night"]);
  });

  it("never puts a flexible night band next to a fixed dark section", () => {
    expect(
      tones([
        { type: "featured_items" },
        { type: "why_choose_us", items: [{ title: "a" }] },
        { type: "reviews" },
      ]),
    ).toEqual(["paper", "muted", "night"]);
  });

  it("keeps configured cta grounds", () => {
    expect(tones([{ type: "rich_text", body: "x" }, { type: "cta", tone: "primary", title: "Go" }])).toEqual(["paper", "brand"]);
  });
});
