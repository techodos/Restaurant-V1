import { describe, expect, it } from "vitest";
import { websiteConfigSchema } from "@/shared/contract/settings";

const dock = (value: unknown) => websiteConfigSchema.parse({ navigation: { dock: value } }).navigation.dock;

describe("phone bottom bar config (navigation.dock)", () => {
  it("defaults to shown, with no custom tabs (the original four)", () => {
    expect(websiteConfigSchema.parse({}).navigation.dock).toEqual({ enabled: true });
    expect(dock(undefined)).toEqual({ enabled: true });
  });

  it("keeps a hidden bar and the chosen tabs in order", () => {
    expect(dock({ enabled: false })).toEqual({ enabled: false });
    expect(dock({ tabs: ["menu", "about", "account"] })).toEqual({ enabled: true, tabs: ["menu", "about", "account"] });
  });

  it("never throws on bad input: unknown tab, more than five tabs, junk", () => {
    expect(dock({ tabs: ["menu", "bogus"] }).tabs).toBeUndefined();
    expect(dock({ tabs: ["home", "menu", "about", "contact", "book", "reviews"] }).tabs).toBeUndefined();
    expect(dock("nonsense")).toEqual({ enabled: true });
  });
});
