import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ restaurantSlug: string }>;
}

/**
 * There is no account screen any more: sign-in returns to the page it started from, and a signed-in
 * customer's profile, addresses, orders and sign-out live in the header's profile drawer. Old links and
 * bookmarks to /account land on the storefront home instead of a 404.
 */
export default async function AccountPage({ params }: Props) {
  const { restaurantSlug } = await params;
  redirect(`/r/${restaurantSlug}`);
}
