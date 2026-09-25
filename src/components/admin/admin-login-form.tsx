"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { signInAction } from "@/app/admin/login/actions";

export function AdminLoginForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    setErrors({});
    submitting.current = true;
    startTransition(() => {
      signInAction(payload).then((result) => {
        submitting.current = false;
        if (!result.success) {
          if (result.error.details) {
            setErrors(Object.fromEntries(Object.entries(result.error.details).map(([key, value]) => [key, String(value)])));
          }
          toast.error(result.error.message);
          return;
        }
        toast.success(`Welcome back, ${result.data.name}.`);
        router.push("/admin");
        router.refresh();
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-card space-y-5 p-6 sm:p-8"
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
        <FieldError>{errors.email}</FieldError>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
        <FieldError>{errors.password}</FieldError>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Sign in
      </Button>
    </form>
  );
}
