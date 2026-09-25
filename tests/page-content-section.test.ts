import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseSections } from "@/shared/contract/sections";
import { websiteConfigSchema } from "@/shared/contract/settings";
import { SectionRenderer } from "@/components/storefront/section-renderer";

// vitest compiles .tsx with the classic JSX runtime, which looks up a global `React`
(globalThis as { React?: typeof React }).React = React;

const context = {} as never;
const body = createElement("main", null, "BODY");
const render = (sections: unknown) => renderToStaticMarkup(createElement(SectionRenderer, { context, sections, body }));

describe("page_content section (menu / reservation / reviews / locations pages)", () => {
  it("parses with optional heading overrides and defaults to enabled", () => {
    expect(parseSections([{ type: "page_content", title: "Our menu", subtitle: "Fresh daily" }])).toEqual([
      { type: "page_content", enabled: true, title: "Our menu", subtitle: "Fresh daily" },
    ]);
  });

  it("renders the built-in body exactly where the marker sits", () => {
    const html = render([{ type: "rich_text", body: "BEFORE" }, { type: "page_content" }, { type: "rich_text", body: "AFTER" }]);
    expect(html.indexOf("BEFORE")).toBeLessThan(html.indexOf("BODY"));
    expect(html.indexOf("BODY")).toBeLessThan(html.indexOf("AFTER"));
    expect(html.match(/BODY/g)).toHaveLength(1);
  });

  it("still renders the body once when the marker is missing, disabled or the page has no sections", () => {
    for (const sections of [[], null, [{ type: "page_content", enabled: false }], [{ type: "rich_text", body: "ONLY" }]]) {
      const html = render(sections);
      expect(html.match(/BODY/g)).toHaveLength(1);
    }
  });
});

describe("navigation item `enabled` flag", () => {
  it("defaults to enabled when the stored config predates the flag, and keeps an explicit false", () => {
    const config = websiteConfigSchema.parse({
      navigation: { items: [{ label: "Menu", href: "/m" }, { label: "Reviews", href: "/r", enabled: false }] },
    });
    expect(config.navigation.items.map((item) => item.enabled)).toEqual([true, false]);
  });
});
