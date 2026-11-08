import type { Metadata, Viewport } from "next";
import "./pos.css";

/**
 * The in-store POS shell (SKILL.md §43): no storefront chrome, installable as its own app (manifest + service
 * worker scoped to /pos), and the only place the 80mm print stylesheet is loaded.
 */
export const metadata: Metadata = {
  title: { default: "POS", template: "%s · POS" },
  manifest: "/pos/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "POS", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#f2f0eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <div className="pos-root">{children}</div>;
}
