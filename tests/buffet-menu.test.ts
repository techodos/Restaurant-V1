import { describe, expect, it } from "vitest";
import { parseBuffetMenu } from "@/shared/buffet-menu";

describe("parseBuffetMenu", () => {
  it("groups dishes under colon headings, one per line", () => {
    const menu = parseBuffetMenu("Soup / Appetizer:\nHot & Sour Soup\n- Gol Gappa\n\nB.B.Q.:\nChicken Boti\n");
    expect(menu).toEqual({
      sections: [
        { title: "Soup / Appetizer", items: ["Hot & Sour Soup", "Gol Gappa"] },
        { title: "B.B.Q.", items: ["Chicken Boti"] },
      ],
      notes: [],
    });
  });

  it("splits 'Heading: a, b' lines and markdown headings, and collects notes", () => {
    const menu = parseBuffetMenu("## Live Tandoor\nNaan\nCarving Experience: roast beef, roast chicken.\nNote: Subject to change");
    expect(menu?.sections).toEqual([
      { title: "Live Tandoor", items: ["Naan"] },
      { title: "Carving Experience", items: ["roast beef", "roast chicken"] },
    ]);
    expect(menu?.notes).toEqual(["Subject to change"]);
  });

  it("drops empty sections", () => {
    expect(parseBuffetMenu("Empty:\nPizza:\nChicken Pizza")?.sections).toEqual([{ title: "Pizza", items: ["Chicken Pizza"] }]);
  });

  it("leaves prose and short blurbs as a paragraph", () => {
    expect(parseBuffetMenu(null)).toBeNull();
    expect(parseBuffetMenu("Our evening buffet with live stations.")).toBeNull();
    expect(
      parseBuffetMenu(
        "An evening of grills from every corner of the world, served at the table.\nTwo seatings each night.\nBook ahead to avoid disappointment.",
      ),
    ).toBeNull();
  });

  it("treats a plain list of short lines as one untitled section", () => {
    expect(parseBuffetMenu("Tea\nSandwiches\nScones")?.sections).toEqual([{ title: null, items: ["Tea", "Sandwiches", "Scones"] }]);
  });
});
