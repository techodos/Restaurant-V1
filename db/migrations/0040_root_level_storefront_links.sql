-- =============================================================================
-- 0040 — Stored storefront links move from /r/<slug>/... to root-level paths
--
-- One deployment now serves ONE restaurant and its URLs no longer carry the
-- restaurant slug: /r/zaytoun/menu is now /menu, /r/zaytoun is /. The app's
-- own links are built in code, but admins (and the seeds) also typed links
-- into JSONB: header/footer navigation and announcement links in
-- websites.config, CTA buttons in website_pages.sections. Those still pointed
-- at /r/<slug>/..., which is now a 404.
--
-- Rewrites, for every restaurant slug that exists in this database (so an
-- unrelated "/r/..." string is never touched):
--   "/r/<slug>/anything"  ->  "/anything"
--   "/r/<slug>"           ->  "/"   (when followed by " ? # ) or whitespace)
-- Absolute links (https://host/r/<slug>/menu) are rewritten the same way.
-- Idempotent: a second run finds nothing left to change.
-- =============================================================================

do $$
declare
  r record;
  prefix text;
begin
  for r in select slug from restaurants loop
    -- slugs are [a-z0-9-] (enforced by the app), so they are safe inside a regex
    prefix := '/r/' || r.slug;

    update websites
       set config = regexp_replace(regexp_replace(config::text, prefix || '/', '/', 'g'), prefix || '(["?#)\s])', '/\1', 'g')::jsonb,
           seo    = regexp_replace(regexp_replace(seo::text,    prefix || '/', '/', 'g'), prefix || '(["?#)\s])', '/\1', 'g')::jsonb
     where config::text like '%' || prefix || '%'
        or seo::text like '%' || prefix || '%';

    update website_pages
       set sections = regexp_replace(regexp_replace(sections::text, prefix || '/', '/', 'g'), prefix || '(["?#)\s])', '/\1', 'g')::jsonb,
           seo      = regexp_replace(regexp_replace(seo::text,      prefix || '/', '/', 'g'), prefix || '(["?#)\s])', '/\1', 'g')::jsonb,
           config   = regexp_replace(regexp_replace(config::text,   prefix || '/', '/', 'g'), prefix || '(["?#)\s])', '/\1', 'g')::jsonb
     where sections::text like '%' || prefix || '%'
        or seo::text like '%' || prefix || '%'
        or config::text like '%' || prefix || '%';
  end loop;
end
$$;
