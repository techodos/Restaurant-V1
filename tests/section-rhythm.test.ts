import { describe, expect, it } from "vitest";
import { parseSections } from "@/shared/contract/sections";
import { sectionTones } from "@/components/storefront/section-rhythm";

const tones = (types: object[]) => sectionTones(parseSections(types.map((s) => ({ enabled: true, ...s }))));

describe("section rhythm", () => {
  it("lets any section pin its own background", () => {
    expect(
      tones([
        { type: "featured_items", background: "night" },
        { type: "menu_categories", background: "paper" },
        { type: "reviews", background: "muted" },
        { type: "why_choose_us", items: [{ title: "a" }], background: "night" },
        { type: "about", background: "auto" },
      ]),
    ).toEqual(["night", "paper", "muted", "night", "night"]);
  });

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

  it("gives the order-type switch its layout's ground unless a tone is forced; bad values fall back", () => {
    expect(
      tones([
        { type: "order_type_switch" },
        { type: "order_type_switch", layout: "cards" },
        { type: "order_type_switch", layout: "capsule" },
        { type: "order_type_switch", layout: "photo", tone: "paper" },
        { type: "order_type_switch", layout: "float" },
        { type: "order_type_switch", layout: "nope", tone: "nope" },
      ]),
    ).toEqual(["night", "paper", "muted", "paper", "muted", "night"]);
    const [section] = parseSections([{ type: "order_type_switch", deliveryImage: { url: "" }, showEta: "x" }]);
    expect(section).toMatchObject({ layout: "band", tone: "auto", showEta: true, showHeading: true, deliveryImage: undefined });
  });

  it("keeps configured cta grounds", () => {
    expect(tones([{ type: "rich_text", body: "x" }, { type: "cta", tone: "primary", title: "Go" }])).toEqual(["paper", "brand"]);
  });
});
