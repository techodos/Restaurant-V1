import type { WhyChooseUsSection as WhyConfig } from "@/shared/contract/sections";
import { cn } from "@/shared/utils";
import { SectionIcon } from "@/components/storefront/icon";
import { SectionShell, type SectionTone } from "@/components/storefront/section-shell";

/**
 * The restaurant's reasons as an editorial split: the heading holds the left column (sticky on wide
 * screens), the reasons run down the right as a numbered, ruled ledger. The ground comes from the page
 * rhythm (section-rhythm.ts), so it reads as a dark band between two light ones.
 */
export function WhyChooseUsSection({ section, tone = "muted" }: { section: WhyConfig; tone?: SectionTone }) {
  if (!section.items.length) return null;
  const twoUp = section.items.length > 3;
  return (
    <SectionShell tone={tone}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+3rem)] lg:self-start">
          <p className="eyebrow mb-3">Our promise</p>
          <h2 className="display-1">{section.title}</h2>
          {section.subtitle ? <p className="lede mt-3">{section.subtitle}</p> : null}
        </div>

        <ol className={cn("grid grid-cols-[minmax(0,1fr)] border-t border-[var(--rule)]", twoUp && "sm:grid-cols-2 sm:gap-x-10")}>
          {section.items.map((item, index) => (
            <li
              key={item.title}
              className="reveal grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 border-b border-[var(--rule)] py-6 md:gap-x-8 md:py-7"
            >
              <span className="tabular font-[family-name:var(--font-display)] text-[2rem] leading-none text-[var(--color-brand-accent)] md:text-[2.6rem]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="display-3 flex items-center gap-3">
                  {item.title}
                  <SectionIcon name={item.icon} className="size-4 shrink-0 text-[var(--color-brand-accent)] opacity-80" />
                </h3>
                {item.description ? (
                  <p className="mt-2.5 max-w-[46ch] text-[14.5px] leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}
