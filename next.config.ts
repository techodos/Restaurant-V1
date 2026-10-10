import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second build/dev server (e.g. a verification run) can use its own output folder so it never
  // replaces the .next that a running `next start` serves from. Unset = the normal .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Next gzips every page itself: ~5–15 ms of CPU per storefront page (measured, 15–30% of a render). Behind a
  // proxy/CDN that compresses anyway (nginx, Cloudflare; Vercel ignores this), set NEXT_COMPRESS=false.
  compress: process.env.NEXT_COMPRESS !== "false",
  // Baseline browser protections for every route: no framing by other sites (admin/checkout clickjacking), no
  // MIME sniffing, no full URLs in cross-site referrers (order links carry an access token), HTTPS pinning
  // (ignored on plain http, so local dev is unaffected). geolocation stays allowed for the delivery map picker.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
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
