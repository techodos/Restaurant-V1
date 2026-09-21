import type { Metadata } from 'next';
import { getCartCountHint } from '@/web/session';
import { getStorefrontContext, requireStorefront } from '@/web/storefront';
import { themeCssVariables, fontStack } from '@/web/theme';
import { SiteHeader } from '@/components/storefront/site-header';
import { resolveImage } from '@/web/media';
import { SiteFooter } from '@/components/storefront/site-footer';

interface StorefrontLayoutProps {
  children: React.ReactNode;
  params: Promise<{ restaurantSlug: string }>;
}

export async function generateMetadata({
  params,
}: StorefrontLayoutProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant, website, config } =
      await getStorefrontContext(restaurantSlug);
    const seo = (website.seo ?? {}) as Record<string, string | undefined>;
    const title = seo.title ?? restaurant.name;
    const description =
      seo.description ??
      restaurant.shortDescription ??
      restaurant.description ??
      undefined;
    return {
      title: { default: title, template: `%s · ${restaurant.name}` },
      description,
      openGraph: {
        title,
        description,
        siteName: restaurant.name,
        type: 'website',
        images: [seo.ogImage ?? seo.image ?? restaurant.coverUrl].filter(
          Boolean,
        ) as string[],
      },
      twitter: { card: 'summary_large_image', title, description },
      icons: restaurant.logoUrl ? { icon: restaurant.logoUrl } : undefined,
      other: config.contact.email
        ? { 'contact:email': config.contact.email }
        : undefined,
    };
  } catch {
    return {};
  }
}

export default async function StorefrontLayout({
  children,
  params,
}: StorefrontLayoutProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant, theme, config, locations, primaryLocation } = context;
  // Cookie hint kept current by the cart actions: no database read on ordinary page views.
  const itemCount = await getCartCountHint();

  return (
    <div
      data-restaurant={restaurant.slug}
      className='flex min-h-dvh flex-col'
      style={
        {
          ...themeCssVariables(theme),
          '--font-heading': fontStack(theme.font, 'serif'),
          '--font-body': fontStack(theme.bodyFont, 'sans'),
        } as React.CSSProperties
      }
    >
      <a
        href='#main'
        className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-brand)] focus:bg-[var(--color-brand)] focus:px-4 focus:py-2 focus:text-[var(--color-brand-foreground)]'
      >
        Skip to content
      </a>

      <SiteHeader
        restaurant={{
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: resolveImage(restaurant.logoUrl),
          phone: restaurant.phone,
        }}
        config={config}
        itemCount={itemCount}
        orderingOpen={
          restaurant.status === 'active' && restaurant.features.onlineOrdering
        }
      />

      <main id='main' className='flex-1'>
        {children}
      </main>

      <SiteFooter
        restaurant={restaurant}
        config={config}
        locations={locations}
        primaryLocation={primaryLocation}
      />
    </div>
  );
}
