import { describe, expect, it } from "vitest";
import { themeSchema } from "@/shared/contract/settings";
import { themeCssVariables } from "@/web/theme";

// headings take their weight from the face (web/theme.ts DISPLAY_WEIGHTS), never from a component class
const vars = (font: string) => themeCssVariables(themeSchema.parse({ font }));

describe("display weight per heading face", () => {
  it("keeps one-weight faces at their only weight, with faux bold off", () => {
    expect(vars("DM Serif Display")).toMatchObject({ "--display-weight": "400", "--display-synthesis": "none" });
    expect(vars("Anton")).toMatchObject({ "--display-weight": "400", "--display-synthesis": "none", "--display-tracking": "0.012em" });
  });

  it("weights delicate serifs up and sans heading faces to 600", () => {
    expect(vars("Cormorant Garamond")["--display-weight"]).toBe("600");
    expect(vars("Poppins")["--display-weight"]).toBe("600");
  });

  it("defaults to 500 and keeps the scale's negative tracking for a normal serif", () => {
    const playfair = vars("Playfair Display");
    expect(playfair["--display-weight"]).toBe("500");
    expect(playfair).not.toHaveProperty("--display-synthesis");
    expect(playfair).not.toHaveProperty("--display-tracking");
  });
});
