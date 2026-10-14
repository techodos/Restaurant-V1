import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reverseGeocode } from "@/server/services/geocoding";
import { checkRateLimit } from "@/server/rate-limit";
import { AppError } from "@/server/errors";

/**
 * Proxies reverse geocoding to Nominatim (see `server/services/geocoding.ts`) instead of calling it
 * directly from the browser: lets the server set the User-Agent Nominatim's usage policy requires,
 * throttle to its 1 req/s limit across every customer, and keep the provider swappable in one file.
 */
const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    lat: request.nextUrl.searchParams.get("lat"),
    lng: request.nextUrl.searchParams.get("lng"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 422 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    checkRateLimit({ key: "geocode-reverse", identifier: ip, limit: 20, windowMs: 60_000 });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const result = await reverseGeocode(parsed.data.lat, parsed.data.lng, request.signal);
  if (!result) return NextResponse.json({ result: null }, { status: 200 });
  return NextResponse.json({ result }, { status: 200, headers: { "Cache-Control": "private, max-age=60" } });
}
