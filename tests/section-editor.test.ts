import { describe, expect, it } from "vitest";
import { FIELDS } from "@/components/super-admin/section-editor";
import { SECTION_TYPES, sectionSchema } from "@/shared/contract/sections";

describe("super-admin section editor", () => {
  it("has a form for every section type, and only for fields the schema knows", () => {
    for (const type of SECTION_TYPES) {
      const schema = sectionSchema.options.find((option) => option.shape.type.value === type);
      expect(schema, type).toBeDefined();
      const known = Object.keys(schema!.shape);
      expect(FIELDS[type], type).toBeDefined();
      for (const field of FIELDS[type]) expect(known, `${type}.${field.k}`).toContain(field.k);
    }
  });
});

describe("super-admin features screen", () => {
  it("shows every entitlement exactly once", async () => {
    const { ENTITLEMENT_GROUPS } = await import("@/components/super-admin/entitlements-form");
    const { ENTITLEMENT_KEYS } = await import("@/shared/feature-access");
    const shown = ENTITLEMENT_GROUPS.flatMap((group) => group.keys);
    expect([...shown].sort()).toEqual([...ENTITLEMENT_KEYS].sort());
  });
});

describe("media library", () => {
  it("finds every image object inside page sections, nested lists included", async () => {
    const { sectionImages } = await import("@/server/services/platform");
    const found = sectionImages([
      [{ type: "hero", image: { url: "/a.jpg", alt: "A" }, primaryCta: { label: "Go", href: "/menu" } }],
      [{ type: "gallery", images: [{ url: "/b.jpg", alt: "" }, { url: "  " }] }],
    ]);
    expect(found).toEqual([{ url: "/a.jpg", alt: "A" }, { url: "/b.jpg", alt: null }]);
  });
});
