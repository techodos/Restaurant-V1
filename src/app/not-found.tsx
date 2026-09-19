import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-[var(--color-muted-ink)]">404</p>
      <h1 className="text-3xl font-semibold md:text-4xl">We could not find that page</h1>
      <p className="max-w-md text-[var(--color-muted-ink)]">
        The link may be out of date, or the restaurant you are looking for is no longer on the platform.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] px-5 text-sm font-medium text-[var(--color-brand-foreground)]"
      >
        Back to the restaurant
      </Link>
    </main>
  );
}
