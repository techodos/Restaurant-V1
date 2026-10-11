import { config } from "@/server/config";
import { TEMPLATES, type TemplateInfo } from "@/shared/templates";

/** The storefront template this deployment renders (TEMPLATE_ID, resolved once per process). Server-only. */
export function getActiveTemplate(): TemplateInfo {
  return TEMPLATES[config.template.id];
}
