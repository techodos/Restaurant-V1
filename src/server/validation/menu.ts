import { z } from "zod";

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 450 or 450.50");

const slug = z
  .string()
  .trim()
  .min(1, "Enter a slug.")
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only.");

const availabilityWindow = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter a category name.").max(120),
  slug,
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  icon: z.string().trim().max(60).optional().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  availability: availabilityWindow,
});
export type CategoryFormInput = z.infer<typeof categorySchema>;

export const menuItemSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid("Choose a category."),
  name: z.string().trim().min(1, "Enter an item name.").max(160),
  slug,
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(240).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  basePrice: money,
  compareAtPrice: money.optional().or(z.literal("")),
  prepTimeMinutes: z.coerce.number().int().min(0).max(600).optional(),
  spiceLevel: z.coerce.number().int().min(0).max(3).optional(),
  isActive: z.coerce.boolean().optional(),
  isAvailable: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  dietaryTags: z.array(z.string().trim().max(40)).optional(),
  allergens: z.array(z.string().trim().max(40)).optional(),
  sortOrder: z.coerce.number().int().optional(),
  availability: availabilityWindow,
  calories: z.coerce.number().int().min(0).optional(),
});
export type MenuItemFormInput = z.infer<typeof menuItemSchema>;

export const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter a variant name.").max(120),
  price: money,
  priceMode: z.enum(["absolute", "delta"]).optional(),
  isDefault: z.coerce.boolean().optional(),
  isAvailable: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type VariantFormInput = z.infer<typeof variantSchema>;

export const addonGroupSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter a group name.").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  isRequired: z.coerce.boolean().optional(),
  minSelect: z.coerce.number().int().min(0).optional(),
  maxSelect: z.coerce.number().int().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type AddonGroupFormInput = z.infer<typeof addonGroupSchema>;

export const addonSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter an add-on name.").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  price: money,
  isDefault: z.coerce.boolean().optional(),
  isAvailable: z.coerce.boolean().optional(),
  maxQuantity: z.coerce.number().int().min(1).optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type AddonFormInput = z.infer<typeof addonSchema>;
