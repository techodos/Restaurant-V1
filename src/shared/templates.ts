/**
 * Storefront templates: one per deployment, chosen by the TEMPLATE_ID environment variable
 * (server/config#template, the only reader). Every template renders the same routes, sections and
 * content from the same data; a template only changes presentation (components/storefront/templates).
 * One server instance serves one restaurant (section 15 of the project skill), so in practice this is
 * the restaurant's template: a café deployment keeps 1, a burger brand runs 2.
 */

export const TEMPLATE_IDS = [1, 2, 3] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const DEFAULT_TEMPLATE_ID: TemplateId = 1;

export interface TemplateInfo {
  id: TemplateId;
  /** stable name used in CSS (`data-template`) and logs */
  key: "classic" | "depth" | "slot-3";
  name: string;
  description: string;
  /** a slot that exists end to end but has no design of its own yet */
  placeholder: boolean;
}

export const TEMPLATES: Record<TemplateId, TemplateInfo> = {
  1: {
    id: 1,
    key: "classic",
    name: "Classic 2D",
    description: "Editorial photography and serif type. The default; suits cafés and dining rooms.",
    placeholder: false,
  },
  2: {
    id: 2,
    key: "depth",
    name: "3D",
    description: "A live 3D hero (a rotating burger, or the restaurant's own .glb model) and depth across every page. Built for Gen Z brands.",
    placeholder: false,
  },
  3: {
    id: 3,
    key: "slot-3",
    name: "Template 3 (placeholder)",
    description: "Reserved slot. Renders the Classic 2D presentation until its design is specified.",
    placeholder: true,
  },
};

/**
 * TEMPLATE_ID → template. Unset, empty or anything other than 1, 2 or 3 falls back to the default with a
 * warning (never a startup failure: a typo must not take a storefront down).
 */
export function resolveTemplateId(raw: string | undefined): { id: TemplateId; warning: string | null } {
  const value = raw?.trim() ?? "";
  if (!value) {
    return { id: DEFAULT_TEMPLATE_ID, warning: `TEMPLATE_ID is not set; using template ${DEFAULT_TEMPLATE_ID} (${TEMPLATES[DEFAULT_TEMPLATE_ID].name}).` };
  }
  const id = TEMPLATE_IDS.find((candidate) => String(candidate) === value);
  if (id === undefined) {
    return {
      id: DEFAULT_TEMPLATE_ID,
      warning: `TEMPLATE_ID="${value.slice(0, 20)}" is not one of ${TEMPLATE_IDS.join(", ")}; using template ${DEFAULT_TEMPLATE_ID} (${TEMPLATES[DEFAULT_TEMPLATE_ID].name}).`,
    };
  }
  return { id, warning: null };
}
