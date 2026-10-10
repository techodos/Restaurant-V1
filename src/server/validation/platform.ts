import { z } from "zod";
import { WEBSITE_STATUSES } from "@/shared/contract/enums";
import { themeSchema, websiteConfigSchema } from "@/shared/contract/settings";
import { sectionSchema } from "@/shared/contract/sections";
import { ENTITLEMENT_KEYS } from "@/shared/feature-access";

/** Super-admin inputs (services/platform.ts). JSON fields arrive as text from the editors and are checked against the real schemas. */

export const entitlementsPatchSchema = z.object(
  Object.fromEntries(ENTITLEMENT_KEYS.map((key) => [key, z.boolean().optional()])) as Record<
    (typeof ENTITLEMENT_KEYS)[number],
    z.ZodOptional<z.ZodBoolean>
  >,
);

/**
 * Text -> JSON -> `schema` (validation only). What is stored is the parsed JSON itself, not the schema's output, so keys the
 * schema does not know are not stripped and defaults are not written into rows that never had them.
 */
function jsonText(label: string, schema: z.ZodTypeAny) {
  // the editors send either an object (the structured forms) or JSON text (the sections editor)
  return z.union([z.string(), z.record(z.string(), z.unknown())]).transform((input, ctx): unknown => {
    let value: unknown = input;
    if (typeof input === "string") {
      try {
        value = JSON.parse(input.trim() || "{}");
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} is not valid JSON.` });
        return z.NEVER;
      }
    }
    const checked = schema.safeParse(value);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      ctx.addIssue({ code: "custom", message: `${label}: ${issue?.path.join(".") || "value"} - ${issue?.message}` });
      return z.NEVER;
    }
    return value;
  });
}

export const websiteInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.enum(WEBSITE_STATUSES),
  domain: z.string().trim().max(253).nullish(),
  theme: jsonText("Theme", themeSchema.partial()),
  config: jsonText("Config", websiteConfigSchema.partial()),
  seo: jsonText("SEO", z.record(z.string(), z.unknown())),
});
export type WebsiteInput = z.infer<typeof websiteInputSchema>;

/** Routes under /r/<slug>/ that a page slug must never shadow (a new page would hide the real screen). */
export const RESERVED_PAGE_SLUGS = ["account", "admin", "api", "cart", "checkout", "current-orders", "order", "orders"] as const;

const pageSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
  .max(60)
  .refine((slug) => !(RESERVED_PAGE_SLUGS as readonly string[]).includes(slug), "That address is used by the app itself.");

export const newPageSchema = z.object({
  slug: pageSlug,
  title: z.string().trim().min(1).max(120),
});

export const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullish(),
  isHome: z.boolean(),
  isPublished: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
  sections: jsonText("Sections", z.array(sectionSchema)),
});
export type PageInput = z.infer<typeof pageInputSchema>;
