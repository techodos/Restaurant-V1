/**
 * A buffet package's contents live in its plain-text `description` (no extra schema): the owner types
 * the printed buffet card, one line per dish, grouped under section headings. This turns that text into
 * sections for the storefront's buffet card (components/storefront/buffet-menu-card.tsx).
 *
 * Accepted lines (blank lines are ignored, leading "-", "•", "*" bullets are stripped):
 *   "Soup / Appetizer:"            a heading ending in a colon starts a section
 *   "## Soup / Appetizer"          the same, markdown-style
 *   "BBQ: Chicken Tikka, Seekh Kebab"  heading + comma-separated dishes on one line
 *   "Hot & Sour Soup"              any other line is a dish in the current section
 *   "Note: Items subject to change"  a note, shown under the card
 *
 * Returns null when the text has no headings and is not a list of at least three short lines — a
 * prose blurb reads better as a paragraph than as a one-column "card".
 */
export interface BuffetMenuSection {
  title: string | null;
  items: string[];
}

export interface BuffetMenu {
  sections: BuffetMenuSection[];
  notes: string[];
}

const HEADING_MAX = 48;
const NOTE = /^(note|notes|nb|n\.b\.)\s*[:\-]\s*/i;

export function parseBuffetMenu(text: string | null | undefined): BuffetMenu | null {
  if (!text) return null;
  const sections: BuffetMenuSection[] = [];
  const notes: string[] = [];
  let headed = false;

  const open = (title: string | null): BuffetMenuSection => {
    const section: BuffetMenuSection = { title, items: [] };
    sections.push(section);
    return section;
  };
  const last = (): BuffetMenuSection => sections[sections.length - 1] ?? open(null);

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-•*·]\s+/, "").trim();
    if (!line) continue;

    if (NOTE.test(line)) {
      notes.push(line.replace(NOTE, "").trim());
      continue;
    }

    const markdown = /^#{1,6}\s+(.+)$/.exec(line);
    if (markdown?.[1]) {
      open(markdown[1].replace(/:$/, "").trim());
      headed = true;
      continue;
    }

    const colon = line.indexOf(":");
    if (colon > 0 && colon <= HEADING_MAX) {
      const title = line.slice(0, colon).trim();
      const rest = line.slice(colon + 1).trim();
      const section = open(title);
      headed = true;
      if (rest) section.items.push(...splitDishes(rest));
      continue;
    }

    last().items.push(line);
  }

  const filled = sections.filter((section) => section.items.length > 0);
  const dishCount = filled.reduce((sum, section) => sum + section.items.length, 0);
  // without headings, only a list of short lines is a menu; sentences are a description
  if (!headed && (dishCount < 3 || filled.some((section) => section.items.some((item) => item.length > 60)))) return null;
  if (filled.length === 0) return null;
  return { sections: filled, notes };
}

/** "Chicken Tikka, Seekh Kebab and Wings." → ["Chicken Tikka", "Seekh Kebab and Wings"] */
function splitDishes(text: string): string[] {
  return text
    .split(/\s*[,;]\s*/)
    .map((part) => part.replace(/\.$/, "").trim())
    .filter(Boolean);
}
