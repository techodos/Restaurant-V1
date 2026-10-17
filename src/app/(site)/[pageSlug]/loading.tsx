import { PageHeroSkeleton, SectionBlocksSkeleton } from "@/components/storefront/page-skeletons";

/** Website pages (about, contact, …) built from sections: a photo band, then content blocks. */
export default function WebsitePageLoading() {
  return (
    <div aria-busy="true">
      <PageHeroSkeleton size="md" />
      <SectionBlocksSkeleton />
    </div>
  );
}
