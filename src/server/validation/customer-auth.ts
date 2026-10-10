import { z } from "zod";
import { e164Phone } from "./common";
import { fitsPasswordLimit } from "@/server/auth/password";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("That email address looks incomplete.").max(160),
  phone: e164Phone,
  // bcrypt reads at most 72 bytes (server/auth/password.ts); refuse longer instead of cutting it silently
  password: z.string().min(8, "Use at least 8 characters.").refine(fitsPasswordLimit, "Use at most 72 characters."),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email("That email address looks incomplete.").max(160),
  password: z.string().min(1, "Enter your password."),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** "Continue with Google" for a new account: the pending token from the callback + the phone `customers` requires. */
export const finishGoogleSignupSchema = z.object({
  pendingToken: z.string().min(1).max(4096),
  phone: e164Phone,
});

export const verifyCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

// ── Forgot password ──
export const passwordResetRequestSchema = z.object({
  email: signInSchema.shape.email,
});

export const passwordResetVerifySchema = z.object({
  email: signInSchema.shape.email,
  code: verifyCodeSchema.shape.code,
});

export const passwordResetSchema = z
  .object({
    resetToken: z.string().min(1, "This reset link has expired. Please start again."),
    password: signUpSchema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });
