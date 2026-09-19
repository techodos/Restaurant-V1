"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface the failure in the browser console for the operator; the customer
    // only ever sees the friendly copy below.
    console.error(error.message);
  }, [error]);

  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold md:text-4xl">Something went wrong</h1>
      <p className="max-w-md text-[var(--color-muted-ink)]">
        We could not load this page. Please try again — if it keeps failing, call the restaurant directly.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-11 items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] px-5 text-sm font-medium text-[var(--color-brand-foreground)]"
      >
        Try again
      </button>
    </main>
  );
}
