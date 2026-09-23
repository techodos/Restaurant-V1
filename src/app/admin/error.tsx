"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Admin error boundary. AppError messages (e.g. FORBIDDEN) are already safe to show as-is. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/15 text-amber-700">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-[var(--color-muted-ink)]">{error.message || "Please try again."}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/admin">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
