"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { posSignInAction } from "@/app/pos/login/actions";

const EMAIL_SHAPE = /^\S+@\S+\.\S+$/;

const field =
  "min-h-12 w-full rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)] bg-white px-3.5 text-[16px] text-[var(--pos-ink)] placeholder:text-[var(--pos-muted)] focus:border-[var(--pos-green)] focus:outline-none";

/** The till's sign-in: the staff login (cashier, manager, owner); the session cookie is scoped to /pos. */
export function PosLoginForm({ denied }: { denied: boolean }) {
  const [error, setError] = useState<string | null>(denied ? "That account cannot use the POS. Ask a manager for a cashier login." : null);
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);
  const submitting = useRef(false);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const payload = { email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") };
    if (!EMAIL_SHAPE.test(payload.email)) return setError("Enter your work email.");
    if (!payload.password) return setError("Enter your password.");
    setError(null);
    submitting.current = true;
    startTransition(() => {
      posSignInAction(payload).then((result) => {
        submitting.current = false;
        if (!result.success) {
          setError(result.error.message);
          return;
        }
        setNavigating(true);
        router.replace("/pos");
        router.refresh();
      });
    });
  }

  const busy = pending || navigating;
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[14px] font-medium">
        Work email
        <input name="email" type="email" autoComplete="username" inputMode="email" className={field} placeholder="name@restaurant.com" />
      </label>
      <label className="flex flex-col gap-1.5 text-[14px] font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" className={field} />
      </label>
      {error ? (
        <p role="alert" className="rounded-[var(--pos-radius)] bg-[var(--pos-red-tint)] px-3 py-2 text-[14px] text-[var(--pos-red)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--pos-green-strong)] disabled:opacity-70"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {navigating ? "Opening the till…" : pending ? "Signing in…" : "Sign in to the till"}
      </button>
    </form>
  );
}
