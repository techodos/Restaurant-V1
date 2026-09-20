import Image from "next/image";
import type { GallerySection as GalleryConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";

const COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function GallerySection({ section }: { section: GalleryConfig }) {
  const images = section.images.flatMap((image) => {
    const resolved = resolveImage(image.url);
    return resolved ? [{ resolved, alt: image.alt ?? "" }] : [];
  });

  if (!images.length) return null;

  return (
    <SectionShell tone="surface">
      <SectionHeading title={section.title} subtitle={section.subtitle} align="center" />
      <ul className={`mt-10 grid gap-3 sm:gap-4 ${COLUMNS[section.columns] ?? COLUMNS[3]}`}>
        {images.map((image, index) => (
          <li
            key={`${image.resolved}-${index}`}
            className="group relative aspect-square overflow-hidden rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
          >
            <Image
              src={image.resolved}
              alt={image.alt ?? ""}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
