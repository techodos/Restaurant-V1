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
  // Production builds never use webpack's persistent cache (.next/cache/webpack): on this setup it gets
  // corrupted when sources change between builds and the next build dies with "Cannot read properties of
  // undefined (reading 'length') at WasmHash._updateWithBuffer". `npm run build` already cleared it first
  // (prebuild), so this costs nothing there and also covers a direct `next build` / `npx next build`.
  // `next dev` keeps its cache.
  webpack: (config, { dev }) => {
    if (!dev) config.cache = false;
    return config;
  },
};

export default nextConfig;
