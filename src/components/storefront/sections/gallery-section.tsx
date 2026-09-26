import Image from "next/image";
import type { GallerySection as GalleryConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell, type SectionTone } from "@/components/storefront/section-shell";

interface Photo {
  resolved: string;
  alt: string;
  caption: string;
}

/** Split the photographs into spreads of three; one or two left over form a closing spread of their own. */
function spreads(photos: Photo[]): Photo[][] {
  const out: Photo[][] = [];
  for (let index = 0; index < photos.length; index += 3) out.push(photos.slice(index, index + 3));
  return out;
}

function Plate({ photo, className, sizes }: { photo: Photo; className?: string; sizes: string }) {
  return (
    <figure className={cn("group relative overflow-hidden rounded-[var(--radius-card)] bg-[var(--steel-2)]", className)}>
      <Image src={photo.resolved} alt={photo.alt} fill sizes={sizes} className="zoom-on-hover reveal-plate object-cover" />
      {photo.caption ? (
        <figcaption className="scrim-bottom absolute inset-x-0 bottom-0 p-4 pt-14 text-[13px] text-white md:translate-y-2 md:opacity-0 md:transition-[opacity,transform] md:duration-500 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          {photo.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * The restaurant's photographs as magazine spreads: each group of three is one large plate beside two
 * stacked ones, the large side alternating from spread to spread; a spread of two sits side by side and a
 * single photograph runs as a wide panorama. Any count, never a hole.
 */
export function GallerySection({ section, tone = "paper" }: { section: GalleryConfig; tone?: SectionTone }) {
  const photos = section.images.flatMap((image) => {
    const resolved = resolveImage(image.url);
    return resolved ? [{ resolved, alt: image.alt ?? "", caption: image.caption ?? image.alt ?? "" }] : [];
  });
  if (!photos.length) return null;

  return (
    <SectionShell tone={tone}>
      <SectionHeading eyebrow="Gallery" title={section.title} subtitle={section.subtitle} />
      <div className="section-body space-y-3 md:space-y-4">
        {spreads(photos).map((spread, index) => {
          const flip = index % 2 === 1;
          if (spread.length === 1) {
            return <Plate key={index} photo={spread[0]!} className="aspect-[16/9] md:aspect-[21/9]" sizes="100vw" />;
          }
          if (spread.length === 2) {
            return (
              <div key={index} className="grid grid-cols-2 gap-3 md:gap-4">
                {spread.map((photo) => (
                  <Plate key={photo.resolved} photo={photo} className="aspect-[4/5] md:aspect-[4/3]" sizes="50vw" />
                ))}
              </div>
            );
          }
          const [lead, ...pair] = spread;
          return (
            <div
              key={index}
              className={cn(
                "grid grid-cols-2 gap-3 md:h-[36rem] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] md:grid-rows-2 md:gap-4",
                flip && "md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]",
              )}
            >
              <Plate
                photo={lead!}
                className={cn("col-span-2 aspect-[4/3] md:col-span-1 md:row-span-2 md:aspect-auto", flip && "md:col-start-2 md:row-start-1")}
                sizes="(min-width: 768px) 60vw, 100vw"
              />
              {pair.map((photo) => (
                <Plate
                  key={photo.resolved}
                  photo={photo}
                  className={cn("aspect-square md:aspect-auto", flip && "md:col-start-1")}
                  sizes="(min-width: 768px) 40vw, 50vw"
                />
              ))}
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
