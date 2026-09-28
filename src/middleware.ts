import { NextResponse, type NextRequest } from "next/server";

/** Request header carrying the path, so the root 404 can theme itself for the restaurant in the URL. */
export const PATHNAME_HEADER = "x-rp-pathname";

/**
 * The root not-found page receives no params or URL, and it is what renders for an unknown restaurant, an unmatched
 * deep path, or a notFound() thrown by the storefront layout. Passing the path lets it wear that restaurant's theme
 * instead of the platform default.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/r/:path*" };
