import { z } from "zod";

export const contactMessageSchema = z
  .object({
    name: z.string().trim().min(2, "Please tell us your name.").max(80),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    email: z.string().trim().email("That email address looks incomplete.").max(160).optional().or(z.literal("")),
    message: z.string().trim().min(10, "Please add a little more detail (10 characters minimum).").max(2000),
  })
  .refine((value) => value.phone || value.email, { message: "Add a phone number or an email so we can reply.", path: ["phone"] });
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
