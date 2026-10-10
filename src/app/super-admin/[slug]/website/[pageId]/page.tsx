import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/web/session";
import { AppError } from "@/server/errors";
import { getPageForPlatform } from "@/server/services/platform";
import { getPlatformRestaurant } from "@/web/platform";
import { PageEditor } from "@/components/super-admin/website-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit page" };

export default async function SuperAdminPageEditorPage({ params }: { params: Promise<{ slug: string; pageId: string }> }) {
  const { slug, pageId } = await params;
  const actor = await requireSuperAdminPage();
  const restaurant = await getPlatformRestaurant(slug);
  const page = await getPageForPlatform(actor, restaurant.id, pageId).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  return <PageEditor key={page.id} restaurantId={restaurant.id} slug={slug} page={page} />;
}
