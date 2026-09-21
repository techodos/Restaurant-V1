import { z } from "zod";

export const submitReviewSchema = z.object({
  orderNumber: z.string().trim().max(40).optional().or(z.literal("")),
  // signed order-access link token (from the completion email); proves ownership from any device
  accessToken: z.string().trim().max(2000).optional().or(z.literal("")),
  menuItemId: z.string().uuid().optional().or(z.literal("")),
  authorName: z.string().trim().min(2, "Please enter your name.").max(80),
  rating: z.coerce.number().int().min(1, "Please pick a rating.").max(5),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  comment: z.string().trim().min(10, "Please add a few words (10 characters minimum).").max(1200),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
