import { z } from "zod";

export const registerPushTokenSchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  // FCM registration tokens are ~150-200 chars of url-safe text
  token: z.string().trim().min(20).max(4096).regex(/^[\w\-:.]+$/, "Invalid device token."),
  platform: z.enum(["web", "android", "ios"]).default("web"),
  accessToken: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
