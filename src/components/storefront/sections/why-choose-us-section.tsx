import type { WhyChooseUsSection as WhyConfig } from "@/shared/contract/sections";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionIcon } from "@/components/storefront/icon";
import { SectionShell } from "@/components/storefront/section-shell";

export function WhyChooseUsSection({ section }: { section: WhyConfig }) {
  if (!section.items.length) return null;
  return (
    <SectionShell>
      <SectionHeading title={section.title} subtitle={section.subtitle} align="center" />
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {section.items.map((item) => (
          <li key={item.title} className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]">
              <SectionIcon name={item.icon} className="size-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
            <p className="mt-1.5 text-sm text-[var(--color-muted-ink)]">{item.description}</p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
