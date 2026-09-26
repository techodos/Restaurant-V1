import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second build/dev server (e.g. a verification run) can use its own output folder so it never
  // replaces the .next that a running `next start` serves from. Unset = the normal .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
