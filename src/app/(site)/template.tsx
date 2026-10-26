/**
 * Re-mounted on every storefront page change (not on search-param or dish-sheet changes), so each new
 * page fades in once. Data loading is still the route's own `loading.tsx` skeleton; this never waits.
 */
export default function StorefrontTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
