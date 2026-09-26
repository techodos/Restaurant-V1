import type { RichTextSection as RichTextConfig } from "@/shared/contract/sections";
import { cn } from "@/shared/utils";
import { SectionShell, type SectionTone } from "@/components/storefront/section-shell";

/**
 * Long-form copy set as an editorial spread: the title holds a narrow left column under an accent rule,
 * the text runs on the right with the opening paragraph as a large serif lede (drop cap on wide screens)
 * and the rest in the body face. Without a title the text stands alone in a reading column.
 */
export function RichTextSection({ section, tone = "paper" }: { section: RichTextConfig; tone?: SectionTone }) {
  const [first, ...rest] = section.body.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  const text = (
    <div>
      {first ? (
        <p className="font-[family-name:var(--font-display)] text-[1.35rem] leading-[1.5] md:text-[1.7rem] md:first-letter:float-left md:first-letter:mr-2 md:first-letter:mt-1 md:first-letter:text-[4.6rem] md:first-letter:leading-[0.8] md:first-letter:text-[var(--color-brand-accent)]">
          {first}
        </p>
      ) : null}
      {rest.length ? (
        <div className={cn("mt-6 space-y-4 text-[16px] leading-[1.8] text-[var(--color-muted-ink)]", section.width === "wide" && "md:columns-2 md:gap-12 md:space-y-0 [&>p+p]:md:mt-5")}>
          {rest.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <SectionShell tone={tone}>
      {section.title ? (
        <article className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
          <header className="lg:pt-2">
            <span aria-hidden className="mb-5 block h-px w-12 bg-[var(--color-brand-accent)]" />
            <h2 className="display-1">{section.title}</h2>
          </header>
          <div className="max-w-[46rem]">{text}</div>
        </article>
      ) : (
        <article className="mx-auto max-w-[46rem]">{text}</article>
      )}
    </SectionShell>
  );
}
