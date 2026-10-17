import type { Metadata } from "next";
import Link from "next/link";
import type { StorefrontContext } from "@/shared/contract/models";
import type { LegalKind } from "@/shared/legal";
import { formatDateKey } from "@/shared/hours";
import { getLegalDocument } from "@/server/services/legal";
import { getStorefrontContext } from "@/web/storefront";
import { breadcrumbJsonLd } from "@/web/seo";
import { ConfiguredPage, configuredPageMetadata, type PageHeading } from "@/components/storefront/configured-page";
import { JsonLd } from "@/components/storefront/json-ld";
import { PageHero } from "@/components/storefront/page-hero";

/**
 * /privacy and /terms. Everything comes from the ONE restaurant this deployment serves
 * (requireStorefront → that restaurant's snapshot; any other slug is a 404), so a storefront only ever shows
 * its own documents. The body is the default template from shared/legal.ts, filled with this restaurant's
 * details and the features it really offers; a restaurant that publishes its own `privacy` / `terms` website
 * page gets its own text instead (ConfiguredPage `ownContentReplacesBody`).
 */

const PAGE_LABEL: Record<LegalKind, string> = { privacy: "Privacy Policy", terms: "Terms of Service" };

export async function legalPageMetadata(restaurantSlug: string, kind: LegalKind): Promise<Metadata> {
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    return {
      ...(await configuredPageMetadata(restaurant.id, kind, {
        // the storefront layout's title template appends the restaurant name
        title: PAGE_LABEL[kind],
        description:
          kind === "privacy"
            ? `How ${restaurant.name} collects, uses and protects your personal information.`
            : `The terms for ordering from and booking with ${restaurant.name}.`,
      })),
      alternates: { canonical: `/${kind}` },
    };
  } catch {
    return { title: PAGE_LABEL[kind] };
  }
}

export function LegalPage({ restaurantSlug, kind }: { restaurantSlug: string; kind: LegalKind }) {
  return (
    <ConfiguredPage
      restaurantSlug={restaurantSlug}
      pageSlug={kind}
      render={(context, heading) => renderLegalDocument(kind, context, heading)}
      ownContent={(context, page, sections) => (
        <>
          <PageHero
            overlay
            size="sm"
            image={null}
            eyebrow={context.restaurant.name}
            title={page.title || PAGE_LABEL[kind]}
            subtitle={page.description ?? undefined}
          />
          {sections}
        </>
      )}
    />
  );
}

async function renderLegalDocument(kind: LegalKind, context: StorefrontContext, heading: PageHeading) {
  const { restaurant } = context;
  const document = getLegalDocument(kind, {
    restaurant,
    primaryLocation: context.primaryLocation,
    contactEmail: context.config.contact.email,
  });
  const base = "/";
  const other: LegalKind = kind === "privacy" ? "terms" : "privacy";

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: base },
          { name: document.title, path: `/${kind}` },
        ])}
      />

      <PageHero
        overlay={heading.leading}
        size="sm"
        image={heading.image ?? null}
        eyebrow={restaurant.name}
        title={heading.title ?? document.title}
        subtitle={heading.subtitle ?? document.summary}
      />

      <div className="tone-paper">
        <div className="container-page page-y grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-14">
          <aside className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
            <p className="text-[13px] text-[var(--color-muted-ink)]">
              Last updated <time dateTime={document.updated}>{formatDateKey(document.updated, restaurant.locale, { day: "numeric", month: "long", year: "numeric" })}</time>
            </p>
            <nav aria-label="On this page" className="mt-5 hidden lg:block">
              <p className="eyebrow">On this page</p>
              <ol className="mt-3 space-y-2 text-[14px]">
                {document.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]">
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <article className="max-w-[46rem] text-[15.5px] leading-[1.7]">
            {document.sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-heading`}
                className="scroll-mt-[calc(var(--header-h,4.5rem)+1.5rem)] border-t border-[var(--rule)] py-7 first:border-t-0 first:pt-0"
              >
                <h2 id={`${section.id}-heading`} className="flex items-baseline gap-3 font-[family-name:var(--font-display)] text-[1.35rem] leading-tight">
                  <span className="tabular text-[0.95rem] text-[var(--color-muted-ink)]">{String(index + 1).padStart(2, "0")}</span>
                  {section.heading}
                </h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-3 break-words text-[var(--color-ink)]">
                    {paragraph}
                  </p>
                ))}
                {section.bullets?.length ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-[var(--color-brand-accent)]">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="break-words">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <p className="mt-4 border-t border-[var(--rule)] pt-6 text-[14px] text-[var(--color-muted-ink)]">
              See also our{" "}
              <Link href={`/${other}`} className="font-medium text-[var(--color-ink)] underline underline-offset-4">
                {PAGE_LABEL[other]}
              </Link>
              .
            </p>
          </article>
        </div>
      </div>
    </>
  );
}
