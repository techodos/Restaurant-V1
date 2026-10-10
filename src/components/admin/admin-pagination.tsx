import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The pager shared by every paginated admin list: "Showing 21–40 of 63" (when `total`/`pageSize` are given, else
 * "Page 2 of 4") on the left, Previous / Next on the right. Renders nothing for a single page.
 */
export function AdminPagination({
  page,
  totalPages,
  linkFor,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  linkFor: (page: number) => string;
  total?: number;
  pageSize?: number;
}) {
  if (totalPages <= 1) return null;
  const range =
    total !== undefined && pageSize ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : `Page ${page} of ${totalPages}`;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      <span className="tabular text-[13px] text-[var(--color-muted-ink)]">{range}</span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-40" : ""}>
          <Link href={linkFor(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined}>
            Previous
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className={page >= totalPages ? "pointer-events-none opacity-40" : ""}>
          <Link href={linkFor(page + 1)} aria-disabled={page >= totalPages} tabIndex={page >= totalPages ? -1 : undefined}>
            Next
          </Link>
        </Button>
      </div>
    </nav>
  );
}
