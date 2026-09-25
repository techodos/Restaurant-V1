import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import { config } from "@/server/config";
import "./globals.css";

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-sans-fallback", display: "swap" });
const displayFont = Playfair_Display({ subsets: ["latin"], variable: "--font-display-fallback", display: "swap" });

const siteUrl = config.app.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Restaurant Platform", template: "%s" },
  description: "Order online, book a table and explore the menu.",
  applicationName: "Restaurant Platform",
  formatDetection: { telephone: true, address: true, email: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster
          position="top-center"
          closeButton
          toastOptions={{
            className: "rounded-[var(--radius-brand)] border border-[var(--color-hairline)]",
          }}
        />
      </body>
    </html>
  );
}
