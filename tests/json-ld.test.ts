import { describe, expect, it } from "vitest";
import { scriptSafeJson } from "@/shared/utils";
import { reviewsJsonLd } from "@/web/seo";
import type { Restaurant, Review } from "@/shared/contract/models";

describe("JSON-LD is safe inside <script>", () => {
  it("a review that tries to close the script block stays data", () => {
    const review = {
      id: "r1",
      authorName: "</script><script>alert(1)</script>",
      title: "<b>great</b>",
      comment: "nice</SCRIPT >",
      rating: 5,
      createdAt: "2026-10-01T00:00:00Z",
    } as unknown as Review;
    const data = reviewsJsonLd([review], { name: "Bella", slug: "bella-napoli" } as Restaurant);
    const body = scriptSafeJson(data);

    expect(body).not.toMatch(/<\/script/i);
    expect(body).not.toContain("<");
    // and it still parses back to exactly what was written
    expect(JSON.parse(body)).toEqual(JSON.parse(JSON.stringify(data)));
  });

  it("escapes the line separators old parsers choke on", () => {
    expect(scriptSafeJson({ text: "a b c" })).toBe('{"text":"a\\u2028b\\u2029c"}');
  });
});
