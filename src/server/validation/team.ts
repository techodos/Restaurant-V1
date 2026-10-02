import { z } from "zod";
import { TEAM_ROLES } from "@/shared/contract/enums";

export const staffLoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(160),
  password: z.string().min(1, "Enter your password."),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const createTeamMemberSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(160),
  fullName: z.string().trim().min(1, "Enter a name.").max(120),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  role: z.enum(TEAM_ROLES),
  password: z.string().min(8, "At least 8 characters.").max(72),
});
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;

export const updateTeamMemberSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(1, "Enter a name.").max(120),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  role: z.enum(TEAM_ROLES),
});
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
