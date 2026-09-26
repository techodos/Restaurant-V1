import type { Section } from "@/shared/contract/sections";
import type { SectionTone } from "@/components/storefront/section-shell";

/**
 * The page's light/dark rhythm. Some sections own their ground (a hero is always night, featured dishes
 * always paper); the rest are "flexible" and take whatever keeps the page alternating, so a restaurant
 * that stacks three text sections never gets one long off-white page. Pure: tested by
 * tests/section-rhythm.test.ts.
 */
const FIXED: Partial<Record<Section["type"], SectionTone>> = {
  hero: "night",
  about: "night",
  reviews: "night",
  reservation_cta: "night",
  order_type_switch: "night",
  featured_items: "paper",
  menu_preview: "paper",
  menu_categories: "muted",
  locations: "paper",
  contact: "muted",
  page_content: "paper",
};

const FLEXIBLE = new Set<Section["type"]>(["why_choose_us", "gallery", "rich_text", "cta"]);

const dark = (tone: SectionTone | undefined) => tone === "night" || tone === "brand";

function fixedTone(section: Section): SectionTone | undefined {
  if (section.type === "cta") {
    if (section.tone === "image" && section.image?.url) return "night";
    if (section.tone === "primary") return "brand";
    return undefined; // neutral: flexible
  }
  return FIXED[section.type];
}

/** One tone per section (undefined for sections without a ground, e.g. the announcement bar). */
export function sectionTones(sections: Section[]): (SectionTone | undefined)[] {
  const tones: (SectionTone | undefined)[] = sections.map((section) => fixedTone(section));
  let previous: SectionTone | undefined;
  sections.forEach((section, index) => {
    if (tones[index] === undefined && FLEXIBLE.has(section.type)) {
      const next = tones.slice(index + 1).find((tone) => tone !== undefined);
      if (previous !== undefined && !dark(previous) && !dark(next)) tones[index] = "night";
      else if (previous === "paper") tones[index] = "muted";
      else tones[index] = "paper";
    }
    if (tones[index] !== undefined) previous = tones[index];
  });
  return tones;
}
