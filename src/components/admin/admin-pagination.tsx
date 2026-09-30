import Link from "next/link";
import { Button } from "@/components/ui/button";

/** The Previous/Next pager shared by every paginated admin list. Renders nothing for a single page. */
export function AdminPagination({
  page,
  totalPages,
  linkFor,
}: {
  page: number;
  totalPages: number;
  linkFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-40" : ""}>
        <Link href={linkFor(page - 1)} aria-disabled={page <= 1}>
          Previous
        </Link>
      </Button>
      <span className="tabular text-sm text-[var(--color-muted-ink)]">
        Page {page} of {totalPages}
      </span>
      <Button asChild variant="outline" size="sm" className={page >= totalPages ? "pointer-events-none opacity-40" : ""}>
        <Link href={linkFor(page + 1)} aria-disabled={page >= totalPages}>
          Next
        </Link>
      </Button>
    </div>
  );
}
