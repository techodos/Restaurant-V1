/** Renders structured data; React escapes the payload safely for <script>. */
export function JsonLd({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON-LD is a data payload, not markup
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
