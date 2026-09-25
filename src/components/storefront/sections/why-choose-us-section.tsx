import type { WhyChooseUsSection as WhyConfig } from "@/shared/contract/sections";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionIcon } from "@/components/storefront/icon";
import { SectionShell } from "@/components/storefront/section-shell";

/** Editorial split: heading on the left, the reasons as an open two-column list on the right (no boxed cards). */
export function WhyChooseUsSection({ section }: { section: WhyConfig }) {
  if (!section.items.length) return null;
  return (
    <SectionShell>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <SectionHeading title={section.title} subtitle={section.subtitle} className="lg:sticky lg:top-28 lg:self-start" />
        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {section.items.map((item) => (
            <li key={item.title} className="border-t border-[var(--color-hairline)] pt-6">
              <span className="grid size-12 place-items-center rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]">
                <SectionIcon name={item.icon} className="size-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold leading-snug">{item.title}</h3>
              <p className="mt-2 max-w-[42ch] text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  );
}
