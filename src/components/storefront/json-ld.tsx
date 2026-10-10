import { scriptSafeJson } from "@/shared/utils";

/** Renders structured data (search engines read it; no browser runs it). */
export function JsonLd({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON-LD is a data payload, escaped by scriptSafeJson
      dangerouslySetInnerHTML={{ __html: scriptSafeJson(data) }}
    />
  );
}
