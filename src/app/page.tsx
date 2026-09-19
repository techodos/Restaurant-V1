import { redirect } from "next/navigation";

/**
 * The platform root has no content of its own: each restaurant lives at
 * /r/[restaurantSlug]. Custom domains will resolve to a slug in middleware;
 * until then the default restaurant answers here.
 */
export default function RootPage() {
  const slug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT ?? "bella-napoli";
  redirect(`/r/${slug}`);
}
