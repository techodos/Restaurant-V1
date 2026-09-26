import type { Metadata } from 'next';
import { getCartCountHint, getVisitorContext } from '@/web/session';
import { getStorefrontContext, requireStorefront } from '@/web/storefront';
import { themeCssVariables, fontStack } from '@/web/theme';
import { SiteHeader } from '@/components/storefront/site-header';
import { CurrentOrdersWidget } from '@/components/storefront/current-orders-widget';
import { MobileDock } from '@/components/storefront/mobile-dock';
import { resolveImage } from '@/web/media';
import { SiteFooter } from '@/components/storefront/site-footer';
import { getCustomerSessionSummary } from './account/actions';
import { getMyOrders } from '@/server/services/orders';
import { googleAuthAvailable } from '@/server/services/customer-auth';

interface StorefrontLayoutProps {
  children: React.ReactNode;
  /** intercepted routes (dish sheet, tray drawer) render here over the current page */
  modal: React.ReactNode;
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
      // Setting `icons.icon` explicitly (for the favicon) stops Next from auto-linking the
      // file-convention apple-icon.tsx, so `apple` is repeated here to keep it wired up.
      icons: {
        ...(restaurant.logoUrl ? { icon: restaurant.logoUrl } : {}),
        apple: `/r/${restaurantSlug}/apple-icon`,
      },
      // "Add to Home Screen" support: `manifest` + `appleWebApp` are what let iOS 16.4+ open the
      // storefront standalone instead of as a Safari bookmark — standalone is required before iOS
      // will deliver Web Push at all (see push-opt-in.tsx). `manifest` is generated per restaurant by
      // manifest.webmanifest/route.ts.
      manifest: `/r/${restaurantSlug}/manifest.webmanifest`,
      appleWebApp: { capable: true, title: restaurant.name, statusBarStyle: 'default' },
      other: {
        // This Next.js version's `appleWebApp.capable` only emits the generic
        // `mobile-web-app-capable` meta tag; iOS Safari itself still only honours the
        // `apple-` prefixed one to treat a Home Screen launch as standalone, so it is added here too.
        'apple-mobile-web-app-capable': 'yes',
        ...(config.contact.email ? { 'contact:email': config.contact.email } : {}),
      },
    };
  } catch {
    return {};
  }
}

export default async function StorefrontLayout({
  children,
  modal,
  params,
}: StorefrontLayoutProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant, theme, config, locations, primaryLocation } = context;
  // Cookie hint kept current by the cart actions: no database read on ordinary page views.
  const itemCount = await getCartCountHint();
  // One extra read per page view, unlike the cart badge above: an active order's status changes
  // from outside any action this browser takes (staff/SQL update the row directly), so there is no
  // action to keep a cookie hint current with, and the widget must reflect that promptly.
  const [customer, visitor] = await Promise.all([
    getCustomerSessionSummary(restaurantSlug).catch(() => ({ signedIn: false, name: null })),
    getVisitorContext(restaurant.id),
  ]);
  const { current: activeOrders } = await getMyOrders(restaurant.id, visitor).catch(() => ({
    signedIn: false,
    current: [],
    previous: [],
  }));

  return (
    <div
      data-restaurant={restaurant.slug}
      className='theme-root flex min-h-dvh flex-col bg-[var(--color-canvas)] text-[var(--color-ink)]'
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
        customer={customer}
        googleEnabled={googleAuthAvailable()}
      />

      <main id='main' className='flex-1'>
        {children}
      </main>

      {modal}

      <SiteFooter
        restaurant={restaurant}
        config={config}
        locations={locations}
        primaryLocation={primaryLocation}
      />

      <CurrentOrdersWidget restaurantSlug={restaurant.slug} count={activeOrders.length} />
      <MobileDock
        restaurantSlug={restaurant.slug}
        itemCount={itemCount}
        activeOrders={activeOrders.length}
        showCart={config.navigation.showCart}
        reservationsEnabled={restaurant.features.reservations && restaurant.settings.reservations.enabled}
        accountHref={customer?.signedIn ? `/r/${restaurant.slug}/account` : `/r/${restaurant.slug}/account/sign-in`}
      />
    </div>
  );
}
