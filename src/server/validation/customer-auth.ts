import { z } from "zod";
import { e164Phone } from "./common";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("That email address looks incomplete.").max(160),
  phone: e164Phone,
  password: z.string().min(8, "Use at least 8 characters."),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email("That email address looks incomplete.").max(160),
  password: z.string().min(1, "Enter your password."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const verifyCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
