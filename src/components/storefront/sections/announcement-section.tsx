import Link from "next/link";
import type { AnnouncementSection as AnnouncementConfig } from "@/shared/contract/sections";
import { cn } from "@/shared/utils";

const TONES = {
  primary: "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
  neutral: "bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] text-[var(--color-ink)]",
  accent: "bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-foreground)]",
} as const;

export function AnnouncementSection({ section }: { section: AnnouncementConfig }) {
  if (!section.text) return null;
  return (
    <div className={cn("px-4 py-2.5 text-center text-sm", TONES[section.tone])}>
      {section.text}
      {section.linkHref && section.linkLabel ? (
        <Link href={section.linkHref} className="ml-2 font-medium underline underline-offset-2">
          {section.linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
