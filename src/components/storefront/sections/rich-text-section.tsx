import type { RichTextSection as RichTextConfig } from "@/shared/contract/sections";
import { SectionShell } from "@/components/storefront/section-shell";
import { SectionHeading } from "@/components/storefront/section-heading";

export function RichTextSection({ section }: { section: RichTextConfig }) {
  const paragraphs = section.body.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  return (
    <SectionShell>
      <div className={section.width === "narrow" ? "mx-auto max-w-3xl" : ""}>
        {section.title ? <SectionHeading title={section.title} /> : null}
        <div className="mt-4 space-y-4 text-pretty leading-relaxed text-[var(--color-muted-ink)]">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
