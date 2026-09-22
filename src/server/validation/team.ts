import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(160),
  password: z.string().min(1, "Enter your password."),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
