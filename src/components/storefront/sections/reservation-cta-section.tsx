import Image from "next/image";
import type { StorefrontContext } from "@/shared/contract/models";
import type { ReservationCtaSection as ReservationConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { CtaLink } from "@/components/storefront/cta-link";

export function ReservationCtaSection({
  section,
  context,
}: {
  section: ReservationConfig;
  context: StorefrontContext;
}) {
  const image = resolveImage(section.image?.url);
  const phone = section.phoneLabel ? context.restaurant.phone : null;

  return (
    <section className="container-page py-8 md:py-10">
      <div className="relative isolate overflow-hidden rounded-[var(--radius-panel)] bg-[var(--color-brand-secondary)] text-white">
        {image ? (
          <>
            <Image src={image} alt="" fill sizes="100vw" className="-z-20 object-cover" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/55 to-black/10" />
          </>
        ) : null}
        <div className="relative flex min-h-[20rem] flex-col justify-end gap-6 p-7 sm:p-10 md:min-h-[24rem] md:flex-row md:items-end md:justify-between md:p-14">
          <div className="max-w-xl">
            <h2 className="text-balance text-[2rem] font-semibold leading-[1.08] md:text-[2.75rem]">{section.title}</h2>
            {section.subtitle ? <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-white/85">{section.subtitle}</p> : null}
            {phone ? (
              <p className="mt-4 text-sm text-white/80">
                {section.phoneLabel}{" "}
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="font-semibold underline underline-offset-4">
                  {phone}
                </a>
              </p>
            ) : null}
          </div>
          {section.cta ? (
            <div className="shrink-0">
              <CtaLink cta={section.cta} size="lg" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
