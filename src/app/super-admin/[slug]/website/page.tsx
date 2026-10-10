import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { requireSuperAdminPage } from "@/web/session";
import { getWebsiteForPlatform } from "@/server/services/platform";
import { getPlatformRestaurant } from "@/web/platform";
import { PagesManager, WebsiteForm } from "@/components/super-admin/website-forms";
import { EmptyState } from "@/components/super-admin/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Website & pages" };

export default async function SuperAdminWebsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireSuperAdminPage();
  const restaurant = await getPlatformRestaurant(slug);
  const { website, pages } = await getWebsiteForPlatform(actor, restaurant.id);

  if (!website) {
    return <EmptyState icon={Globe} title="No website yet" description="This restaurant has no website record, so there is nothing to configure here." />;
  }
  return (
    <div className="space-y-8">
      <PagesManager slug={slug} restaurantId={restaurant.id} pages={pages} />
      <WebsiteForm key={website.id} restaurantId={restaurant.id} website={website} />
    </div>
  );
}
