import { RefreshCw, Route, MapPin, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils";

export interface AuthPerk {
  icon: LucideIcon;
  label: string;
}

/** What an account is good for: true of every restaurant (live tracking, saved addresses, reorder). */
export const ACCOUNT_PERKS: AuthPerk[] = [
  { icon: Route, label: "Track every order from kitchen to door" },
  { icon: MapPin, label: "Saved addresses and branches" },
  { icon: RefreshCw, label: "Reorder your favourites in one tap" },
];
const PERK_SHORT = ["Track orders", "Saved addresses", "1-tap reorder"];

/** The faint tile pattern on the night ground, in the theme's accent. */
function AuthPattern({ id, className }: { id: string; className?: string }) {
  return (
    <svg aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 size-full text-[var(--color-brand-accent)]", className)}>
      <defs>
        <pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse">
          <rect x="18" y="18" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1" />
          <rect x="18" y="18" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(45 32 32)" />
          <circle cx="32" cy="32" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

const ACCENT_TEXT = "text-[color-mix(in_srgb,var(--color-brand-accent)_65%,var(--color-on-night))]";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex min-w-0 items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.2em]", ACCENT_TEXT, className)}>
      <span aria-hidden className="h-[1.5px] w-7 shrink-0 bg-[var(--color-brand-accent)] lg:w-9" />
      <span className="truncate">{children}</span>
    </p>
  );
}

function PerkList({ perks }: { perks: AuthPerk[] }) {
  return (
    <ul className="flex max-w-[20rem] flex-col gap-4">
      {perks.map(({ icon: Icon, label }) => (
        <li key={label} className="flex items-start gap-3 text-[15px] leading-[1.45] text-[color-mix(in_srgb,var(--color-on-night)_86%,transparent)]">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-accent)_16%,transparent)]", ACCENT_TEXT)}>
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="pt-1">{label}</span>
        </li>
      ))}
    </ul>
  );
}

interface AuthShellProps {
  /** small caps line (the restaurant's name, so the page fits every restaurant) */
  eyebrow: string;
  /** the form's heading ("Sign in"); on phones it is the band's title unless `mobileTitle` is set */
  title: string;
  /** the phone band's title ("Welcome back") */
  mobileTitle?: string;
  description?: string;
  /** desktop: the big line on the night panel ("Welcome back to the table.") */
  panelTitle: React.ReactNode;
  /** desktop panel list; phones show the short strip under the form. Pass [] for none. */
  perks?: AuthPerk[];
  children: React.ReactNode;
}

/**
 * Customer sign-in / sign-up / Google phone step. One markup, three arrangements:
 * - phones: a night band (theme `--color-night` + faint accent tile pattern) with eyebrow, title and line,
 *   then the form on a canvas panel overlapping it by 30px with rounded top corners, perks strip at its foot;
 * - md: the same, the panel a centred 440px card;
 * - lg+: one 1080px split card: night panel (eyebrow, big serif line, perks list) left, form right with its
 *   own heading. `data-auth-split` lets the forms put "Continue with Google" first there.
 * Colours are theme tokens only, so every restaurant gets its own version.
 */
export function AuthShell({ eyebrow, title, mobileTitle, description, panelTitle, perks = ACCOUNT_PERKS, children }: AuthShellProps) {
  return (
    <div data-auth-split className="pb-6 md:pb-16 lg:px-6 lg:py-14 xl:py-16">
      <div className="lg:mx-auto lg:flex lg:max-w-[1080px] lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-[var(--color-hairline)] lg:bg-[var(--color-canvas)] lg:shadow-[0_40px_80px_-40px_color-mix(in_srgb,var(--color-night)_55%,transparent)]">
        <section className="tone-night relative isolate overflow-hidden bg-[var(--color-night)] text-[var(--color-on-night)] lg:flex lg:min-h-[600px] lg:flex-[1_1_46%] lg:flex-col lg:gap-7 lg:p-12 xl:p-14">
          <AuthPattern id="auth-tiles" className="opacity-[0.14] lg:opacity-[0.12]" />
          {/* phones + tablets */}
          <div className="mx-auto flex min-h-[248px] max-w-[440px] flex-col justify-end px-6 pb-[58px] pt-8 md:min-h-[272px] md:pb-[70px] lg:hidden">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-3 text-balance display-face text-[34px] leading-[1.02] min-[375px]:text-[36px] md:text-[40px]">{mobileTitle ?? title}</h1>
            {description ? <p className="mt-3 max-w-[22rem] text-[14px] leading-relaxed text-[color-mix(in_srgb,var(--color-on-night)_78%,transparent)]">{description}</p> : null}
          </div>
          {/* desktop panel */}
          <div className="hidden lg:contents">
            <Eyebrow className="text-[13px] tracking-[0.24em]">{eyebrow}</Eyebrow>
            <p className="max-w-[24rem] text-balance display-face text-[48px] leading-[1] xl:text-[52px]">{panelTitle}</p>
            {perks.length ? <PerkList perks={perks} /> : null}
          </div>
        </section>

        <div className="relative -mt-[30px] rounded-t-[28px] bg-[var(--color-canvas)] px-6 py-[26px] md:mx-auto md:max-w-[440px] md:rounded-[28px] md:border md:border-[var(--color-hairline)] md:px-8 md:py-8 md:shadow-[var(--shadow-card)] lg:mx-0 lg:mt-0 lg:flex lg:max-w-none lg:flex-[1_1_54%] lg:flex-col lg:justify-center lg:rounded-none lg:border-0 lg:px-14 lg:py-14 lg:shadow-none xl:px-16">
          <div className="lg:mx-auto lg:w-full lg:max-w-[400px]">
            <div className="mb-7 hidden lg:block">
              <h1 className="display-face text-[40px] leading-[1.02] text-[var(--color-ink)]">{title}</h1>
              {description ? <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{description}</p> : null}
            </div>
            {children}
            {perks.length ? (
              <p className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-[var(--color-hairline)] pt-4 text-center text-[12px] text-[var(--color-muted-ink)] lg:hidden">
                {PERK_SHORT.map((perk) => (
                  <span key={perk} className="whitespace-nowrap">
                    <span aria-hidden className="text-[var(--color-brand-accent)]">✦</span> {perk}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StaffAuthShellProps {
  restaurantName: string;
  /** a link back to the storefront */
  back: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The restaurant's staff sign-in (`/admin/login`): the customer sign-in's visual language for the staff side.
 * Desktop: full-height split, night aside (name, "Staff portal", big line) left, the form centred right.
 * Phones/tablets: the whole screen is the night ground and the form a raised canvas card on it.
 * The form renders ONCE; only the chrome around it changes per breakpoint. Theme tokens only.
 */
export function StaffAuthShell({ restaurantName, back, children }: StaffAuthShellProps) {
  const heading = "Sign in to the portal";
  const line = "Use the work email your manager set up for you.";
  const note = "Authorised staff only. Can't get in? Ask your restaurant's owner or manager to reset your access.";
  const onNightSoft = "text-[color-mix(in_srgb,var(--color-on-night)_78%,transparent)]";

  return (
    <div className="relative isolate grid min-h-dvh grid-cols-[minmax(0,1fr)] overflow-hidden bg-[var(--color-night)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:bg-[var(--color-canvas)]">
      <AuthPattern id="staff-tiles-m" className="opacity-[0.12] lg:hidden" />

      <aside className="relative isolate hidden overflow-hidden bg-[var(--color-night)] px-14 py-10 text-[var(--color-on-night)] lg:flex lg:flex-col lg:justify-between lg:gap-10">
        <AuthPattern id="staff-tiles" className="opacity-[0.12]" />
        <span className="display-face text-[28px] leading-none">{restaurantName}</span>
        <div className="flex max-w-[460px] flex-col gap-[18px]">
          <Eyebrow className="text-[13px] tracking-[0.24em]">Staff portal</Eyebrow>
          <p className="display-face text-[48px] leading-[0.98] xl:text-[58px]">
            The kitchen,
            <br />
            behind the pass.
          </p>
          <p className={cn("text-[16px] leading-relaxed", onNightSoft)}>Orders, menu, branches and staff, managed in one place.</p>
        </div>
        <span className="text-[13px] text-[color-mix(in_srgb,var(--color-on-night)_62%,transparent)]">Internal use only · {restaurantName}</span>
      </aside>

      <main className="flex min-h-dvh flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))] sm:px-6 lg:items-center lg:justify-center lg:py-14">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col lg:max-w-[420px] lg:flex-none lg:gap-[18px]">
          {/* phones: name + chip, then the title on the night ground */}
          <div className="text-[var(--color-on-night)] lg:hidden">
            <div className="flex items-center justify-between gap-3 px-2">
              <span className="truncate display-face text-[24px] leading-none">{restaurantName}</span>
              <span className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--color-brand-accent)_50%,transparent)] px-2.5 text-[11px] font-semibold uppercase tracking-[0.16em]", ACCENT_TEXT)}>
                <ShieldCheck className="size-3" aria-hidden />
                Staff portal
              </span>
            </div>
            <div className="px-2 pt-10">
              <h1 className="text-balance display-face text-[32px] leading-[1.02] min-[375px]:text-[34px]">{heading}</h1>
              <p className={cn("mt-2.5 text-[14px] leading-relaxed", onNightSoft)}>{line}</p>
            </div>
          </div>
          {/* desktop: chip + title over the form */}
          <span className="hidden h-[30px] items-center gap-2 self-start rounded-full bg-[var(--brand-tint)] px-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand)] lg:flex">
            <ShieldCheck className="size-3.5" aria-hidden />
            Admin access
          </span>
          <div className="hidden lg:block">
            <h1 className="display-face text-[40px] leading-[1.02] text-[var(--color-ink)]">{heading}</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{line}</p>
          </div>

          <div className="mt-7 rounded-[22px] bg-[var(--color-canvas)] px-[18px] py-[22px] shadow-[0_30px_50px_-24px_rgb(0_0_0/0.6)] sm:px-6 lg:mt-1.5 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
            {children}
          </div>

          <p className={cn("mt-5 flex gap-2.5 px-2 text-[13px] leading-relaxed lg:mt-0 lg:gap-3 lg:rounded-[14px] lg:border lg:border-[var(--color-hairline)] lg:bg-[var(--color-canvas-muted)] lg:px-4 lg:py-3.5 lg:text-[var(--color-muted-ink)]", onNightSoft)}>
            <ShieldCheck className={cn("mt-0.5 size-4 shrink-0 lg:size-[18px] lg:text-[var(--color-brand)]", ACCENT_TEXT)} aria-hidden />
            <span>{note}</span>
          </p>
          <div className="mt-auto flex justify-center pt-6 max-lg:[&_a]:text-[color-mix(in_srgb,var(--color-brand-accent)_65%,var(--color-on-night))] lg:mt-0 lg:pt-0">{back}</div>
        </div>
      </main>
    </div>
  );
}
