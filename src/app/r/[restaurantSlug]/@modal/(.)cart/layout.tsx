import { RouteSheet } from "@/components/motion/route-sheet";

/**
 * The tray drawer frame lives in a layout so it slides in the moment the tray is tapped; the cart
 * itself (one database read) streams into it, with loading.tsx filling the gap.
 */
export default function TrayDrawerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteSheet title="Your tray" description="Dishes in your tray and the order summary">
      {children}
    </RouteSheet>
  );
}
