"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { AuthField, AuthSubmit, PasswordField } from "@/components/storefront/auth-fields";
import { signInAction } from "@/app/admin/login/actions";
import { adminPath } from "@/shared/utils";

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

/** Staff sign-in. Same fields as the customer sign-in (shared `auth-fields`), its own action and rules. */
export function AdminLoginForm({ restaurantSlug }: { restaurantSlug: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const submitting = useRef(false);
  const router = useRouter();

  function clear(field: string) {
    setErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
    setFormError(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    const local: Record<string, string> = {};
    if (!payload.email) local.email = "Enter your work email.";
    else if (!EMAIL_SHAPE.test(payload.email)) local.email = "That email address looks incomplete.";
    if (!payload.password) local.password = "Enter your password.";
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;
    submitting.current = true;
    startTransition(() => {
      signInAction(restaurantSlug, payload).then((result) => {
        submitting.current = false;
        if (!result.success) {
          const details = result.error.details
            ? Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)]))
            : {};
          setErrors(details);
          // "Invalid email or password." / too many attempts: under the password, where the eye already is
          if (!details.email && !details.password) setFormError(result.error.message);
          return;
        }
        setNavigating(true);
        toast.success(`Welcome back, ${result.data.name}.`);
        // platform developers land on their own portal; they open a restaurant's admin from there
        router.push(result.data.superAdmin ? "/super-admin" : adminPath());
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <AuthField
        id="email"
        name="email"
        label="Work email"
        icon={Mail}
        type="email"
        autoComplete="username"
        inputMode="email"
        placeholder="name@restaurant.com"
        onChange={() => clear("email")}
        error={errors.email}
      />
      <PasswordField
        id="password"
        name="password"
        label="Password"
        icon={Lock}
        autoComplete="current-password"
        placeholder="Your password"
        onChange={() => clear("password")}
        error={errors.password || formError}
      />
      <div className="pt-1">
        <AuthSubmit tone="night" working={pending || navigating} workingLabel={navigating ? "Opening the portal…" : "Signing in…"}>
          Sign in securely
        </AuthSubmit>
      </div>
    </form>
  );
}
