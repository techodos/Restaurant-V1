import { NextResponse, type NextRequest } from "next/server";

/** Request header carrying the path: server code that gets no URL (Server Actions on /admin, see web/session.ts) reads it. */
export const PATHNAME_HEADER = "x-rp-pathname";

/**
 * Stamps the request path on every page request. Server Actions POST to the page they were called from, so this is
 * how web/session.ts knows an action came from /admin (and so checks this deployment's restaurant membership).
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

// every page; not Next internals, API routes or files with an extension (icons, manifest, images)
export const config = { matcher: "/((?!_next/|api/|.*\\..*).*)" };
