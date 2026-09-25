import Image from "next/image";
import type { GallerySection as GalleryConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";

const COLUMNS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

/** md column span for the last photo: 1 + the number of empty cells it absorbs */
const MD_SPAN: Record<number, string> = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4" };

/**
 * Bento gallery: with five or more photos the first becomes a large feature tile, so the grid reads as a
 * composed spread rather than a contact sheet. Phones get a two-column grid.
 */
export function GallerySection({ section }: { section: GalleryConfig }) {
  const images = section.images.flatMap((image) => {
    const resolved = resolveImage(image.url);
    return resolved ? [{ resolved, alt: image.alt ?? "" }] : [];
  });

  if (!images.length) return null;
  const columns = COLUMNS[section.columns] ?? COLUMNS[3];
  const feature = images.length >= 5 && section.columns >= 3;
  // The last photo stretches to close any gap in its row (phones: 2 columns, md+: the configured count).
  const cells = feature ? images.length + 3 : images.length;
  const mdColumns = COLUMNS[section.columns] ? section.columns : 3;
  const lastSpan = [cells % 2 === 1 ? "col-span-2" : "", MD_SPAN[((mdColumns - (cells % mdColumns)) % mdColumns) + 1] ?? ""];

  return (
    <SectionShell tone="surface">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <ul className={cn("mt-10 grid auto-rows-[10rem] grid-cols-2 gap-3 sm:auto-rows-[13rem] md:gap-4", columns)}>
        {images.map((image, index) => (
          <li
            key={`${image.resolved}-${index}`}
            className={cn(
              "group relative overflow-hidden rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]",
              feature && index === 0 && "col-span-2 row-span-2",
              index === images.length - 1 && lastSpan,
            )}
          >
            <Image
              src={image.resolved}
              alt={image.alt}
              fill
              sizes={feature && index === 0 ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 768px) 33vw, 50vw"}
              className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
            />
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
