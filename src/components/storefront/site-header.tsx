'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ClipboardList,
  Phone,
  Search,
  ShoppingBag,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { WebsiteConfig } from '@/shared/contract/settings';
import { cn } from '@/shared/utils';
import { signInHref } from '@/shared/return-to';
import { Sheet } from '@/components/motion/sheet';
import { TrayCount } from './tray-count';
import { ProfileDrawer } from './profile-drawer';
import { useLocalCart } from './local-cart';
import { useBranching } from './branching';
import { HeaderBranchPill } from './header-branch-pill';
import { isSupportedCountry } from 'libphonenumber-js';
import type { OpeningHours } from '@/shared/contract/models';
import { serviceStatus, type ServiceStatus } from './service-status';

interface SiteHeaderProps {
  restaurant: {
    name: string;
    slug: string;
    logoUrl: string | null;
    /** shown instead of `logoUrl` while the header sits on a light / dark ground (null = `logoUrl`) */
    logoOnLight?: string | null;
    logoOnDark?: string | null;
    phone: string | null;
    country: string;
  };
  config: WebsiteConfig;
  orderingOpen: boolean;
  /** null while no customer sign-in system was reachable (never blocks rendering). */
  customer: { signedIn: boolean; name: string | null } | null;
  /** live pages beyond the configured nav (reservation, reviews, locations); listed in the menu sheet */
  extraLinks?: { label: string; href: string }[];
  googleEnabled: boolean;
  googleMapsApiKey: string | null;
  /** the primary location's real hours, for the tiered header's service strip (open now / closes at) */
  service?: { hours: OpeningHours; timeZone: string; place: string | null } | null;
}

const STRIP_DOT = {
  open: 'bg-[var(--color-success)]',
  closing: 'bg-[var(--color-warning)]',
  closed: 'bg-[var(--color-muted-ink)]',
} as const;

/** A nav link is active on its own page and on its sub-pages (menu -> menu/<item>), home only on itself. */
function isActive(pathname: string, href: string, home: string): boolean {
  if (href === home) return pathname === home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A header action that is an icon at rest and slides its label open on hover or keyboard focus (hover only
 * on real pointers; phones keep the icon). `badge` sits on the icon's corner (the cart count).
 */
// square icon at rest that slides open into a pill on hover / focus, at every width. Opened, it has
// more room on the right than the left, where the icon already carries its own visual padding.
const headerIconLinkClass =
  'group/action press flex h-10 items-center rounded-[var(--radius-control)] px-2.5 text-[var(--color-ink)] transition-[background-color,padding] duration-300 ease-[var(--ease-out)] hover:bg-[var(--tint-strong)] hover:pl-3 hover:pr-4 focus-visible:bg-[var(--tint-strong)] focus-visible:pl-3 focus-visible:pr-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-accent)]';
const headerIconLabelClass =
  'max-w-0 overflow-hidden whitespace-nowrap text-[13px] font-semibold opacity-0 transition-[max-width,opacity,margin] duration-300 ease-[var(--ease-out)] group-hover/action:max-w-28 group-hover/action:opacity-100 group-focus-visible/action:max-w-28 group-focus-visible/action:opacity-100';

/** The signed-in account mark: the name's capital first letter in a soft disc (an icon when there is no name). */
function AccountInitial({ name }: { name?: string | null }) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase();
  return (
    <span
      aria-hidden
      // the brand colour lifted a touch so it reads on a dark header too; the letter is its foreground tinted toward it
      className='grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_82%,white)] text-[12px] font-semibold leading-none text-[color-mix(in_srgb,var(--color-brand-foreground)_85%,var(--color-brand))]'
    >
      {initial || <UserRound className='size-4' />}
    </span>
  );
}

/** `flip`: the short bar sits on the left, for the button at the header's left edge. */
function MenuButton({ open, onClick, flip, className }: { open: boolean; onClick: () => void; flip?: boolean; className?: string }) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-expanded={open}
      aria-label='Open menu'
      // callers set the display per width (`grid lg:hidden` / `hidden lg:grid`)
      className={cn(
        'press size-10 place-items-center rounded-full text-[var(--color-ink)] transition-colors hover:bg-[var(--tint-strong)]',
        className,
      )}
    >
      <span aria-hidden className='relative block h-2.5 w-5'>
        <span className='absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-current' />
        <span className={cn('absolute bottom-0 h-[1.5px] w-3/5 rounded-full bg-current', flip ? 'left-0' : 'right-0')} />
      </span>
    </button>
  );
}

function HeaderIconLink({
  href,
  label,
  icon: Icon,
  badge,
  className,
  ...rest
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'children'>) {
  return (
    <Link href={href} className={cn(headerIconLinkClass, className)} {...rest}>
      <span className='relative grid size-5 shrink-0 place-items-center'>
        <Icon className='size-[19px]' aria-hidden />
        {badge}
      </span>
      <span
        aria-hidden
        className={cn(
          headerIconLabelClass,
          // a count badge overhangs the icon's right edge: give the label clear space past it
          badge
            ? 'group-hover/action:ml-3 group-focus-visible/action:ml-3'
            : 'group-hover/action:ml-2 group-focus-visible/action:ml-2',
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/** Pages whose first section is a full-bleed hero mark it with this attribute; the header then floats over it. */
const HERO_SELECTOR = 'main [data-hero-overlay]';
/** A hero on a light ground (the split hero) — the header over it keeps dark type and drops the photo scrim. */
const LIGHT_HERO_SELECTOR = 'main [data-hero-overlay] [data-hero-light]';

/** The floating header's round controls (search, orders, account): an icon in a 40px disc, tinted on hover. */
const floatingIconClass =
  'press grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-ink)] transition-colors duration-200 hover:bg-[var(--tint-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-accent)]';

/**
 * The header's ground comes from the database: websites.config.navigation.tone ("dark" = the theme's
 * night surface, the default; "light" = the theme's background). Over a page that opens with a full-bleed
 * hero it starts transparent with light type (the photograph shows through) and settles into its
 * configured ground once the page scrolls.
 * Navigation labels, order and links come from websites.config.navigation (only `enabled` items). The
 * action on the right is the account pill: "Sign In / Sign Up", or the customer's initial and name once
 * signed in (the menu itself is in the navigation, so there is no separate order button).
 */
export function SiteHeader({
  restaurant,
  config,
  orderingOpen,
  customer,
  extraLinks = [],
  googleMapsApiKey,
  service = null,
}: SiteHeaderProps) {
  const { itemCount } = useLocalCart();
  const branching = useBranching();
  // true once the pill itself would render (location + branch resolved, or an unserved destination)
  const locationSet =
    branching.enabled &&
    !['need-location', 'need-branch'].includes(branching.gate());
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const signedIn = Boolean(customer?.signedIn);
  const [overHero, setOverHero] = useState(false);
  const [heroLight, setHeroLight] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const navItems = config.navigation.items.filter((item) => item.enabled);
  // the menu sheet: the configured nav first, then any other live page it doesn't already link to
  const menuItems = [
    ...navItems,
    ...extraLinks.filter((link) => !navItems.some((item) => item.href === link.href)),
  ];
  // desktop opens the menu from the left (its button sits left of the logo), phones from the bottom
  const [menuSide, setMenuSide] = useState<'left' | 'right'>('right');
  const announcement = config.announcement;
  const home = `/r/${restaurant.slug}`;
  // only rendered while signed out (signed in opens the profile drawer); brings them back to this page
  const accountHref = signInHref(restaurant.slug, pathname);
  const accountLabel = customer?.signedIn
    ? (customer.name ?? 'Account')
    : 'Sign In / Sign Up';
  const headerRef = useRef<HTMLElement>(null);

  // a navigation (link click, back button) always closes the menu
  useEffect(() => setOpen(false), [pathname]);

  const headerStyle = config.navigation.style;
  // tiered header: the hour is read after mount (server and browser clocks may sit either side of a
  // minute, which would mismatch the hydrated text), then once a minute
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  useEffect(() => {
    if (headerStyle !== 'tiered' || !service) return;
    const update = () => setStatus(serviceStatus(service.hours, new Date(), service.timeZone));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [headerStyle, service]);

  // Is there a hero under us on this page? Re-checked on every navigation.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setOverHero(Boolean(document.querySelector(HERO_SELECTOR)));
      setHeroLight(Boolean(document.querySelector(LIGHT_HERO_SELECTOR)));
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  // Phones: the branch strip tucks away while reading down the page and returns on any scroll back up
  // (or near the top). A small dead zone keeps it from flickering on momentum and tiny thumb jitter.
  const [stripHidden, setStripHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        if (y < 96) {
          setStripHidden(false);
          last = y;
        } else if (Math.abs(delta) > 8) {
          setStripHidden(delta > 0);
          last = y;
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  // a new page starts at the top: show the strip again
  useEffect(() => setStripHidden(false), [pathname]);

  // Publish the header's height (it grows with the announcement bar / paused notice) so heroes can slide
  // under it and sticky sub-navigation and anchor offsets sit right below it.
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        '--header-h',
        `${Math.round(element.offsetHeight)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--header-h');
    };
  }, []);

  const transparent = overHero && !scrolled;
  const light = config.navigation.tone === 'light';
  const floating = config.navigation.style === 'floating';
  // over a photo the type must be light whatever the setting (over the light split hero, dark);
  // otherwise the configured ground
  const tone = transparent ? (heroLight ? 'paper' : 'night') : light ? 'paper' : 'night';
  const sticky = config.navigation.sticky ? 'sticky top-0' : 'relative';
  // the logo version drawn for the ground the header is on right now (it changes over a hero / on scroll)
  const logo =
    tone === 'paper' ? (restaurant.logoOnLight ?? restaurant.logoUrl) : (restaurant.logoOnDark ?? restaurant.logoUrl);

  // ---- centered / minimal / tiered: the same controls as the classic bar, composed differently ----
  const tailored = headerStyle === 'centered' || headerStyle === 'minimal' || headerStyle === 'tiered';
  const openSheet = (side: 'left' | 'right') => () => {
    setMenuSide(side);
    setOpen(true);
  };
  const brandMark = (size: 'md' | 'lg', monogram = false) => (
    <Link href={home} aria-label={`${restaurant.name} home`} className='flex min-w-0 items-center gap-3'>
      {logo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- DB-provided logo, dimensions unknown */}
          <img src={logo} alt='' className={size === 'lg' ? 'h-10 w-auto lg:h-12' : 'h-9 w-auto lg:h-10'} />
          <span className='sr-only'>{restaurant.name}</span>
        </>
      ) : (
        <>
          {monogram ? (
            <span
              aria-hidden
              className='grid size-10 shrink-0 place-items-center rounded-full border border-current font-[family-name:var(--font-display)] text-[1.15rem] italic leading-none'
            >
              {restaurant.name.trim().charAt(0)}
            </span>
          ) : null}
          <span
            className={cn(
              'truncate font-[family-name:var(--font-display)] leading-none tracking-[0.01em]',
              size === 'lg' ? 'text-[1.45rem] lg:text-[1.9rem]' : 'text-[1.35rem] lg:text-[1.6rem]',
            )}
          >
            {restaurant.name}
          </span>
        </>
      )}
    </Link>
  );
  // small caps links with one sliding accent hairline under the current page
  const trackedLink = (item: { href: string; label: string }) => {
    const active = isActive(pathname, item.href, home);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative whitespace-nowrap py-2 text-[11.5px] font-semibold uppercase tracking-[0.16em] transition-colors duration-200',
          active ? 'text-[var(--color-ink)]' : 'text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]',
        )}
      >
        {item.label}
        {active ? (
          <motion.span
            layoutId='nav-mark'
            className='absolute inset-x-0 -bottom-0.5 h-px bg-[var(--color-brand-accent)]'
            transition={{ type: 'spring', duration: 0.4, bounce: 0.12 }}
          />
        ) : null}
      </Link>
    );
  };
  const cartLabel = `My Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`;
  const countChip = (className: string) => (
    <span className={cn('grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[10.5px] font-bold tracking-normal tabular-nums', className)}>
      <TrayCount count={itemCount} />
    </span>
  );
  const accountControl = signedIn ? (
    <button
      type='button'
      onClick={() => setProfileOpen(true)}
      aria-haspopup='dialog'
      aria-expanded={profileOpen}
      aria-label={accountLabel}
      title={accountLabel}
      className={cn(floatingIconClass, 'hidden sm:grid')}
    >
      <AccountInitial name={customer?.name} />
    </button>
  ) : (
    <Link href={accountHref} aria-label={accountLabel} title={accountLabel} className={cn(floatingIconClass, 'hidden sm:grid')}>
      <UserRound className='size-[19px]' aria-hidden />
    </Link>
  );
  const ordersControl = customer?.signedIn ? (
    <Link
      href={`${home}/orders`}
      aria-label='My Orders'
      title='My Orders'
      aria-current={isActive(pathname, `${home}/orders`, home) ? 'page' : undefined}
      className={cn(floatingIconClass, 'hidden sm:grid')}
    >
      <ClipboardList className='size-[19px]' aria-hidden />
    </Link>
  ) : null;
  const cartFocus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-accent)]';
  let tailoredBar: React.ReactNode = null;
  if (headerStyle === 'centered') {
    const half = Math.ceil(navItems.length / 2);
    tailoredBar = (
      <div className='container-page grid h-[4.25rem] grid-cols-[1fr_auto_1fr] items-center gap-3 lg:h-[5.5rem] lg:gap-6'>
        <div className='flex min-w-0 items-center justify-self-start'>
          <MenuButton open={open} onClick={openSheet('left')} flip className='-ml-2 grid lg:hidden' />
          <nav aria-label='Main' className='hidden items-center gap-5 lg:flex xl:gap-7'>
            {navItems.slice(0, half).map(trackedLink)}
          </nav>
        </div>
        <div className='justify-self-center'>{brandMark('lg')}</div>
        <div className='flex items-center gap-1.5 justify-self-end lg:gap-5'>
          <nav aria-label='More' className='hidden items-center gap-5 lg:flex xl:gap-7'>
            {navItems.slice(half).map(trackedLink)}
          </nav>
          <HeaderBranchPill tone={tone} align='end' className='hidden lg:flex' />
          <span className='flex items-center gap-1.5'>
            {accountControl}
            {config.navigation.showCart ? (
              <Link
                href={`${home}/cart`}
                data-tray-target
                aria-label={cartLabel}
                title='My Cart'
                className={cn(
                  'press flex h-10 shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] border border-[var(--rule-strong)] pl-3.5 pr-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)] transition-colors duration-200 hover:border-[var(--color-ink)]',
                  cartFocus,
                )}
              >
                <ShoppingBag className='size-4' aria-hidden />
                <span className='hidden sm:inline'>Cart</span>
                {countChip('bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-foreground)]')}
              </Link>
            ) : null}
          </span>
        </div>
      </div>
    );
  } else if (headerStyle === 'minimal') {
    tailoredBar = (
      <div className='container-page flex h-[4.25rem] items-center justify-between gap-4 lg:h-[5.25rem]'>
        {brandMark('md', true)}
        <div className='flex items-center gap-2 sm:gap-2.5'>
          <HeaderBranchPill tone={tone} align='end' className='mr-0.5 hidden lg:flex' />
          {config.navigation.showCart ? (
            <Link
              href={`${home}/cart`}
              data-tray-target
              aria-label={cartLabel}
              title='My Cart'
              className={cn(
                'press relative grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)] transition-[background-color] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)]',
                cartFocus,
              )}
            >
              <ShoppingBag className='size-[18px]' aria-hidden />
              <span
                className={cn(
                  'absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-ink)] px-1 text-[10px] font-bold text-[var(--color-canvas)] ring-2 ring-[var(--color-canvas)] transition-[opacity,transform] duration-200',
                  itemCount > 0 ? undefined : 'scale-75 opacity-0',
                )}
              >
                <TrayCount count={itemCount} />
              </span>
            </Link>
          ) : null}
          {/* every link lives in the sheet: one deliberate Menu button at every width */}
          <button
            type='button'
            onClick={openSheet('right')}
            aria-expanded={open}
            aria-label='Open menu'
            className={cn(
              'press flex h-10 items-center gap-3 rounded-[var(--radius-control)] bg-[var(--color-ink)] px-3 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[var(--color-canvas)] transition-opacity duration-200 hover:opacity-90 sm:pl-4 sm:pr-3.5',
              cartFocus,
            )}
          >
            <span className='hidden sm:inline'>Menu</span>
            <span aria-hidden className='relative block h-2.5 w-[18px]'>
              <span className='absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-current' />
              <span className='absolute bottom-0 right-0 h-[1.5px] w-3/5 rounded-full bg-current' />
            </span>
          </button>
        </div>
      </div>
    );
  } else if (headerStyle === 'tiered') {
    const phone = restaurant.phone;
    tailoredBar = (
      <>
        {service || phone ? (
          // the service strip stays dark over any ground: it is a line of facts, not part of the page
          <div className='tone-night border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-night)_86%,black)]'>
            <div className='container-page flex h-9 items-center justify-between gap-4 text-[11.5px] text-[var(--color-muted-ink)]'>
              <div className='flex min-w-0 items-center gap-4'>
                {status ? (
                  <span className='flex shrink-0 items-center gap-2 font-semibold text-[var(--color-ink)]'>
                    <span aria-hidden className={cn('size-1.5 rounded-full', STRIP_DOT[status.state])} />
                    {status.headline}
                    {status.detail ? <span className='font-normal text-[var(--color-muted-ink)]'>· {status.detail}</span> : null}
                  </span>
                ) : null}
                {service?.place ? (
                  <>
                    {status ? <span aria-hidden className='hidden h-3 w-px bg-[var(--rule-strong)] sm:block' /> : null}
                    <span className='hidden truncate sm:inline'>{service.place}</span>
                  </>
                ) : null}
              </div>
              {phone ? (
                <a href={`tel:${phone.replace(/\s+/g, '')}`} className='tabular flex shrink-0 items-center gap-1.5 transition-colors hover:text-[var(--color-ink)]'>
                  <Phone className='size-3' aria-hidden />
                  {phone}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className='container-page grid h-[4.25rem] grid-cols-[1fr_auto] items-center gap-4 lg:h-[5rem] lg:grid-cols-[1fr_auto_1fr]'>
          <div className='min-w-0 justify-self-start'>{brandMark('md')}</div>
          <nav aria-label='Main' className='hidden items-center gap-7 lg:flex xl:gap-9'>
            {navItems.map(trackedLink)}
          </nav>
          <div className='flex items-center gap-1.5 justify-self-end sm:gap-2'>
            <HeaderBranchPill tone={tone} align='end' className='mr-1 hidden lg:flex' />
            {ordersControl}
            {accountControl}
            {config.navigation.showCart ? (
              <Link
                href={`${home}/cart`}
                data-tray-target
                aria-label={cartLabel}
                title='My Cart'
                className={cn(
                  'press flex h-10 shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] bg-[var(--color-brand)] pl-4 pr-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)] transition-[background-color] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)]',
                  cartFocus,
                )}
              >
                <ShoppingBag className='size-4' aria-hidden />
                <span className='hidden sm:inline'>Cart</span>
                {countChip('bg-[color-mix(in_srgb,var(--color-brand-foreground)_18%,transparent)]')}
              </Link>
            ) : null}
            <MenuButton open={open} onClick={openSheet('right')} className='grid lg:hidden' />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header
        ref={headerRef}
        data-transparent={transparent || undefined}
        className={
          floating
            ? // the floating bar is inset from the page edges; the gap around it lets clicks through to the page
              cn('pointer-events-none z-40 w-full', sticky)
            : cn(
                `tone-${tone}`,
                'z-40 w-full transition-[background-color,border-color,box-shadow] duration-500',
                sticky,
                transparent
                  ? heroLight
                    ? 'border-b border-transparent bg-transparent'
                    : 'border-b border-transparent bg-[linear-gradient(180deg,rgb(0_0_0/0.62)_0%,rgb(0_0_0/0.28)_65%,transparent_100%)]'
                  : light
                    ? 'border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-canvas)_90%,transparent)] backdrop-blur-xl'
                    : 'border-b border-[var(--rule)]',
              )
        }
      >
        {/* floating: its gutters add up with the bar's own padding to the page container's, so the logo
            lines up with the content below it */}
        <div className={floating ? 'mx-auto w-full max-w-[82rem] px-2.5 pt-2.5 md:px-6 md:pt-3 xl:px-9 xl:pt-4' : undefined}>
        <div
          className={
            floating
              ? cn(
                  `tone-${tone}`,
                  'pointer-events-auto overflow-hidden rounded-[var(--radius-panel)] border transition-[background-color,border-color,box-shadow] duration-500',
                  transparent
                    ? heroLight
                      ? 'border-transparent bg-transparent'
                      : 'border-white/15 bg-[rgb(0_0_0/0.28)] backdrop-blur-md'
                    : cn(
                        'border-[var(--rule)] shadow-[0_16px_36px_-24px_rgb(0_0_0/0.5)]',
                        light && 'bg-[color-mix(in_srgb,var(--color-canvas)_92%,transparent)] backdrop-blur-xl',
                      ),
                )
              : undefined
          }
        >
        {announcement.enabled && announcement.text ? (
          <div
            className={cn(
              'border-b border-[var(--rule)] px-4 py-2 text-center text-[12.5px] leading-snug text-[var(--color-muted-ink)]',
              tone === 'night'
                ? 'bg-[color-mix(in_srgb,var(--color-night)_80%,black)]'
                : 'bg-[var(--steel-1)]',
            )}
          >
            <span>{announcement.text}</span>
            {announcement.linkHref && announcement.linkLabel ? (
              <Link
                href={announcement.linkHref}
                className='group ml-2 inline-flex items-center gap-1 font-semibold text-[var(--color-ink)]'
              >
                {announcement.linkLabel}
                <ArrowRight
                  className='size-3.5 transition-transform duration-200 group-hover:translate-x-0.5'
                  aria-hidden
                />
              </Link>
            ) : null}
          </div>
        ) : null}

        {tailored ? tailoredBar : (
        <div
          className={
            floating
              ? 'grid h-16 grid-cols-[1fr_auto] items-center gap-3 px-3 md:px-4 lg:h-[4.5rem] lg:grid-cols-[auto_1fr_auto] lg:gap-6 xl:px-5'
              : 'container-page grid h-[4.25rem] grid-cols-[1fr_auto] items-center gap-4 lg:h-20 lg:grid-cols-[1fr_auto_1fr]'
          }
        >
          <div className='flex min-w-0 items-center gap-4 justify-self-start lg:max-xl:gap-2.5 xl:gap-5'>
            {locationSet ? (
              <MenuButton
                open={open}
                onClick={() => {
                  setMenuSide('left');
                  setOpen(true);
                }}
                flip
                className='-ml-2 hidden lg:grid'
              />
            ) : null}
            <Link
              href={home}
              className={cn(
                'flex min-w-0 items-center gap-3',
                logo && 'shrink-0',
              )}
              aria-label={`${restaurant.name} home`}
            >
              {logo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- DB-provided logo, dimensions unknown */}
                  <img
                    src={logo}
                    alt=''
                    className='h-9 w-auto lg:h-10'
                  />
                  <span className='sr-only'>{restaurant.name}</span>
                </>
              ) : (
                <span className='truncate font-[family-name:var(--font-display)] text-[1.35rem] leading-none tracking-[0.01em] lg:text-[1.55rem]'>
                  {restaurant.name}
                </span>
              )}
            </Link>
          </div>

          <nav aria-label='Main' className={cn('hidden items-center gap-1 lg:flex', floating && 'justify-self-start')}>
            {navItems.map((item) => {
              const active = isActive(pathname, item.href, home);
              if (floating) {
                // the active page in the brand colour (the accent on a dark bar, where the brand may not read)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-full px-3 py-2 text-[13.5px] font-medium tracking-[0.01em] transition-colors duration-200',
                      active
                        ? tone === 'paper'
                          ? 'text-[var(--color-brand)]'
                          : 'text-[var(--color-brand-accent)]'
                        : 'text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative px-3.5 py-2 text-[13.5px] font-medium tracking-[0.01em] transition-colors duration-200',
                    active
                      ? 'text-[var(--color-ink)]'
                      : 'text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]',
                  )}
                >
                  {item.label}
                  {active ? (
                    <motion.span
                      layoutId='nav-mark'
                      className='absolute inset-x-3.5 -bottom-0.5 h-px bg-[var(--color-brand-accent)]'
                      transition={{
                        type: 'spring',
                        duration: 0.4,
                        bounce: 0.12,
                      }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {floating ? (
            <div className='flex items-center gap-1 justify-self-end sm:gap-1.5'>
              {/* same controls as the classic bar — branch, orders, account, cart, menu — as round buttons,
                  plus search, which opens the menu page (its hero carries the search field) */}
              <HeaderBranchPill tone={tone} align='end' className='mr-1 hidden lg:flex' />
              <Link href={`${home}/menu`} aria-label='Search the menu' title='Search the menu' className={floatingIconClass}>
                <Search className='size-[19px]' aria-hidden />
              </Link>
              {customer?.signedIn ? (
                <Link
                  href={`${home}/orders`}
                  aria-label='My Orders'
                  title='My Orders'
                  aria-current={isActive(pathname, `${home}/orders`, home) ? 'page' : undefined}
                  className={cn(floatingIconClass, 'hidden sm:grid')}
                >
                  <ClipboardList className='size-[19px]' aria-hidden />
                </Link>
              ) : null}
              {signedIn ? (
                <button
                  type='button'
                  onClick={() => setProfileOpen(true)}
                  aria-haspopup='dialog'
                  aria-expanded={profileOpen}
                  aria-label={accountLabel}
                  title={accountLabel}
                  className={cn(floatingIconClass, 'hidden sm:grid')}
                >
                  <AccountInitial name={customer?.name} />
                </button>
              ) : (
                <Link href={accountHref} aria-label={accountLabel} title={accountLabel} className={cn(floatingIconClass, 'hidden sm:grid')}>
                  <UserRound className='size-[19px]' aria-hidden />
                </Link>
              )}
              {config.navigation.showCart ? (
                <Link
                  href={`${home}/cart`}
                  data-tray-target
                  aria-label={`My Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                  title='My Cart'
                  className='press relative ml-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)] transition-[background-color,transform] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-accent)]'
                >
                  <ShoppingBag className='size-[18px]' aria-hidden />
                  <span
                    className={cn(
                      'absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--color-ink)] px-1 text-[10px] font-bold text-[var(--color-canvas)] ring-2 ring-[var(--color-canvas)] transition-[opacity,transform] duration-200',
                      itemCount > 0 ? undefined : 'scale-75 opacity-0',
                    )}
                  >
                    <TrayCount count={itemCount} />
                  </span>
                </Link>
              ) : null}
              <MenuButton
                open={open}
                onClick={() => {
                  setMenuSide('right');
                  setOpen(true);
                }}
                className='grid lg:hidden'
              />
            </div>
          ) : (
          <div className='flex items-center gap-1.5 justify-self-end sm:gap-2'>
            {/* desktop, right side: branch → cart → profile (hidden until location + branch are resolved) */}
            <HeaderBranchPill tone={tone} align='end' className='mr-1 hidden lg:flex' />

            {customer?.signedIn ? (
              <HeaderIconLink
                href={`${home}/orders`}
                label='My Orders'
                icon={ClipboardList}
                aria-label='My Orders'
                aria-current={
                  isActive(pathname, `${home}/orders`, home)
                    ? 'page'
                    : undefined
                }
                className={cn('hidden sm:flex', locationSet && 'lg:hidden')}
              />
            ) : null}

            {config.navigation.showCart ? (
              <HeaderIconLink
                href={`${home}/cart`}
                label='My Cart'
                icon={ShoppingBag}
                data-tray-target
                aria-label={`My Cart, ${itemCount} item${itemCount === 1 ? '' : 's'}`}
                badge={
                  <span
                    className={cn(
                      'absolute -right-1.5 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold transition-[opacity,transform] duration-200',
                      itemCount > 0
                        ? 'bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-foreground)]'
                        : 'scale-75 opacity-0',
                    )}
                  >
                    <TrayCount count={itemCount} />
                  </span>
                }
              />
            ) : null}

            {signedIn ? (
              locationSet ? (
                <button
                  type='button'
                  onClick={() => setProfileOpen(true)}
                  aria-haspopup='dialog'
                  aria-expanded={profileOpen}
                  title={accountLabel}
                  // the 28px disc sits 6px in from every edge of the 40px control, at rest and opened
                  className={cn(
                    headerIconLinkClass,
                    'hidden px-1.5 hover:pl-1.5 hover:pr-4 focus-visible:pl-1.5 focus-visible:pr-4 sm:flex',
                  )}
                >
                  <AccountInitial name={customer?.name} />
                  <span
                    aria-hidden
                    className={cn(
                      headerIconLabelClass,
                      'group-hover/action:ml-2 group-focus-visible/action:ml-2',
                    )}
                  >
                    {accountLabel}
                  </span>
                </button>
              ) : (
                <button
                  type='button'
                  onClick={() => setProfileOpen(true)}
                  aria-haspopup='dialog'
                  aria-expanded={profileOpen}
                  title='Your profile'
                  className='press hidden h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] pl-1.5 pr-4 text-[13px] font-semibold text-[var(--color-brand-foreground)] transition-[background-color,box-shadow] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] hover:shadow-[var(--shadow-brand)] sm:flex'
                >
                  <span
                    aria-hidden
                    className='grid size-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-foreground)_18%,transparent)]'
                  >
                    {customer?.signedIn && customer.name ? (
                      <span className='text-[11px] font-bold uppercase'>
                        {customer.name.slice(0, 1)}
                      </span>
                    ) : (
                      <UserRound className='size-4' />
                    )}
                  </span>
                  <span className='max-w-32 truncate'>{accountLabel}</span>
                </button>
              )
            ) : locationSet ? (
              <HeaderIconLink
                href={accountHref}
                label={accountLabel}
                icon={UserRound}
                aria-label={accountLabel}
                className='hidden sm:flex'
              />
            ) : (
              <Link
                href={accountHref}
                title={accountLabel}
                className='press hidden h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] pl-1.5 pr-4 text-[13px] font-semibold text-[var(--color-brand-foreground)] transition-[background-color,box-shadow] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] hover:shadow-[var(--shadow-brand)] sm:flex'
              >
                <span
                  aria-hidden
                  className='grid size-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-foreground)_18%,transparent)]'
                >
                  {customer?.signedIn && customer.name ? (
                    <span className='text-[11px] font-bold uppercase'>
                      {customer.name.slice(0, 1)}
                    </span>
                  ) : (
                    <UserRound className='size-4' />
                  )}
                </span>
                <span className='max-w-32 truncate'>{accountLabel}</span>
              </Link>
            )}

            <MenuButton
              open={open}
              onClick={() => {
                setMenuSide('right');
                setOpen(true);
              }}
              className='grid lg:hidden'
            />
          </div>
          )}
        </div>
        )}

        {/* phones: the order's branch as a full-width strip along the header's bottom edge. It collapses
            (grid rows 1fr -> 0fr, so the published --header-h follows and sticky rails slide up with it)
            while scrolling down; `inert` keeps the hidden button out of the tab order. */}
        <div
          data-branch-strip
          inert={stripHidden || undefined}
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-out)] motion-reduce:transition-none lg:hidden',
            stripHidden ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          <div className='min-h-0 overflow-hidden'>
            <HeaderBranchPill tone={tone} align='end' variant='strip' />
          </div>
        </div>

        {!orderingOpen ? (
          <p className='border-t border-[var(--rule)] px-4 py-2 text-center text-xs text-[var(--color-muted-ink)]'>
            Online ordering is paused right now. You can still browse the menu
            and book a table.
          </p>
        ) : null}
        </div>
        </div>
      </header>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={restaurant.name}
        tone={light ? 'paper' : 'night'}
        side={menuSide}
      >
        <nav
          aria-label='Mobile'
          className='flex min-h-full flex-col px-5 pb-8 md:px-7'
        >
          <ul>
            {menuItems.map((item, index) => {
              const active = isActive(pathname, item.href, home);
              return (
                <li
                  key={item.href}
                  className='stagger-in'
                  style={{ '--i': index } as React.CSSProperties}
                >
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className='group flex items-center justify-between gap-3 border-b border-[var(--rule)] py-3 font-[family-name:var(--font-display)] text-[1.0625rem] leading-snug tracking-[0.005em]'
                  >
                    <span
                      className={cn(
                        'flex items-center gap-2.5',
                        active
                          ? light
                            ? 'text-[var(--color-brand)]'
                            : 'text-[var(--color-brand-accent)]'
                          : undefined,
                      )}
                    >
                      {active ? (
                        <span
                          aria-hidden
                          className='size-1.5 rounded-full bg-current'
                        />
                      ) : null}
                      {item.label}
                    </span>
                    <ArrowRight
                      className={cn(
                        'size-4 text-[var(--color-muted-ink)] transition-[transform,opacity] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:opacity-100',
                        active ? 'opacity-100' : 'opacity-60',
                      )}
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className='mt-6 grid gap-2.5'>
            {customer?.signedIn ? (
              <Link
                href={`${home}/orders`}
                onClick={() => setOpen(false)}
                className='press flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--rule-strong)] text-[13.5px] font-semibold'
              >
                <ClipboardList className='size-4' aria-hidden />
                My Orders
              </Link>
            ) : null}
            {signedIn ? (
              <button
                type='button'
                onClick={() => {
                  setOpen(false);
                  setProfileOpen(true);
                }}
                className='press flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] text-[13.5px] font-semibold text-[var(--color-brand-foreground)]'
              >
                <UserRound className='size-4' aria-hidden />
                <span className='max-w-60 truncate'>{accountLabel}</span>
              </button>
            ) : (
              <Link
                href={accountHref}
                onClick={() => setOpen(false)}
                className='press flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] text-[13.5px] font-semibold text-[var(--color-brand-foreground)]'
              >
                <UserRound className='size-4' aria-hidden />
                <span className='max-w-60 truncate'>{accountLabel}</span>
              </Link>
            )}
            {restaurant.phone ? (
              <a
                href={`tel:${restaurant.phone.replace(/\s+/g, '')}`}
                className='press flex h-10 items-center justify-center gap-2 text-[13px] font-medium text-[var(--color-muted-ink)]'
              >
                <Phone className='size-4' aria-hidden />
                {restaurant.phone}
              </a>
            ) : null}
          </div>
        </nav>
      </Sheet>

      {signedIn ? (
        <ProfileDrawer
          restaurantSlug={restaurant.slug}
          open={profileOpen}
          onOpenChange={setProfileOpen}
          phoneCountry={
            isSupportedCountry(restaurant.country) ? restaurant.country : 'PK'
          }
          googleMapsApiKey={googleMapsApiKey}
        />
      ) : null}
    </>
  );
}
