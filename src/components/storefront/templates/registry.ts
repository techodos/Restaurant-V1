import type { Section } from "@/shared/contract/sections";
import type { StorefrontContext } from "@/shared/contract/models";
import type { TemplateId } from "@/shared/templates";
import type { SectionTone } from "@/components/storefront/section-shell";
import { Hero3DSection } from "./depth/hero-3d-section";

type SectionComponent = (props: { section: never; context: StorefrontContext; tone?: SectionTone }) => React.ReactNode;

/**
 * What each template changes about presentation (shared/templates.ts lists them; TEMPLATE_ID picks one).
 * Templates own ONLY presentation: a section type listed here replaces the Classic component for that type,
 * every other type keeps the Classic one, and routes, data and copy are the same for all of them.
 *
 * Adding a template: an id in shared/templates.ts, an entry here, and (optionally) styles scoped to
 * `.theme-root[data-template="<key>"]` in globals.css.
 */
export const TEMPLATE_SECTIONS: Record<TemplateId, Partial<Record<Section["type"], SectionComponent>>> = {
  // Classic 2D: the components in section-renderer.tsx, unchanged
  1: {},
  // 3D: a live 3D hero; depth styles for every other section come from globals.css
  2: { hero: Hero3DSection as SectionComponent },
  // placeholder slot: Classic presentation until its design is specified
  3: {},
};
