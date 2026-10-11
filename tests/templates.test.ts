import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATE_ID, TEMPLATE_IDS, TEMPLATES, resolveTemplateId } from "@/shared/templates";

describe("TEMPLATE_ID selection", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["3", 3],
    [" 2 ", 2],
  ] as const)("TEMPLATE_ID=%j selects template %i without a warning", (raw, id) => {
    expect(resolveTemplateId(raw)).toEqual({ id, warning: null });
  });

  it.each([undefined, "", "   "])("unset (%j) falls back to 1 with a warning", (raw) => {
    const resolved = resolveTemplateId(raw);
    expect(resolved.id).toBe(1);
    expect(resolved.warning).toMatch(/not set/);
  });

  it.each(["0", "4", "2.0", "02", "three", "1;DROP"])("invalid %j falls back to 1 with a warning that names the value", (raw) => {
    const resolved = resolveTemplateId(raw);
    expect(resolved.id).toBe(DEFAULT_TEMPLATE_ID);
    expect(resolved.warning).toContain(`"${raw}"`);
  });

  it("caps a long bad value in the warning", () => {
    expect(resolveTemplateId("x".repeat(500)).warning!.length).toBeLessThan(200);
  });
});

describe("template registry", () => {
  it("describes every id once, with a unique key; only 3 is a placeholder", () => {
    expect(Object.keys(TEMPLATES).map(Number)).toEqual([...TEMPLATE_IDS]);
    expect(new Set(TEMPLATE_IDS.map((id) => TEMPLATES[id].key)).size).toBe(TEMPLATE_IDS.length);
    expect(TEMPLATE_IDS.filter((id) => TEMPLATES[id].placeholder)).toEqual([3]);
    expect(DEFAULT_TEMPLATE_ID).toBe(1);
  });
});
