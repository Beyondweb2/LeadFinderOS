import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContent } from "@/templates/shared/content";
import { getTemplateDef, normaliseTemplate, DEFAULT_TEMPLATE_KEY } from "@/templates/registry";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { bookingUrl } from "@/lib/subdomain";

// booking_staff isn't in the generated types yet (Phase 1 migration applied via
// the SQL runner) — untyped view for the booking-ready probe. RLS still applies.
const sb = supabase as unknown as SupabaseClient;

/**
 * Public, unauthenticated generated site at /p/:slug.
 *
 * Looks up the generated_sites row whose slug (stored in site_name) matches the
 * URL, reads its `template` discriminator and renders the matching design
 * (barber → <BarberSiteTemplate>, salon → <SalonSiteTemplate>). Falls back to
 * the bundled demo content for the resolved template when no row matches
 * (including /p/demo) or on any read error.
 *
 * Resilience: the row is read selecting `content, template`. If that errors
 * because the `template` column hasn't been added yet (e.g. the branch is
 * deployed before the migration is run), we retry selecting only `content` and
 * treat the site as 'barber' — so existing live barber sites keep rendering
 * correctly rather than falling back to demo.
 *
 * Public visibility is enforced at the DB layer (RLS): anon visitors only see
 * status='published' rows, so logged-out users see published sites only, while
 * an admin can preview any status (incl. drafts) via the admin RLS policy.
 */
export default function PublicSite() {
  const { slug } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["generated-site", slug],
    enabled: !!slug,
    queryFn: async (): Promise<{ content: SiteContent | null; template: string; bookingOnly: boolean }> => {
      const res = await sb
        .from("generated_sites")
        .select("content, template, booking_only")
        .eq("site_name", slug!)
        .maybeSingle();
      if (res.error) {
        // The `template`/`booking_only` columns may not exist yet — retry with
        // content only and assume the historical barber template so live sites keep working.
        const fallback = await sb
          .from("generated_sites")
          .select("content")
          .eq("site_name", slug!)
          .maybeSingle();
        if (fallback.error) return { content: null, template: DEFAULT_TEMPLATE_KEY, bookingOnly: false };
        return {
          content: (fallback.data?.content as unknown as SiteContent) ?? null,
          template: DEFAULT_TEMPLATE_KEY,
          bookingOnly: false,
        };
      }
      const row = res.data as { content: unknown; template: unknown; booking_only?: boolean } | null;
      return {
        content: (row?.content as SiteContent) ?? null,
        template: normaliseTemplate(row?.template),
        bookingOnly: !!row?.booking_only,
      };
    },
  });

  // Booking-only rows have no marketing site → send them to their booking page.
  useEffect(() => {
    if (data?.bookingOnly && slug) window.location.replace(bookingUrl(slug));
  }, [data?.bookingOnly, slug]);

  const content = data?.content ?? null;
  const template = data?.template ?? DEFAULT_TEMPLATE_KEY;

  // Booking is enabled only when the shop has PAID (online booking is a paid
  // feature, £29.99) AND set up bookable staff. Counts active staff for this
  // published, paid site (no rows fetched, just the count).
  const { data: bookingReady, isPending: bookingPending } = useQuery({
    queryKey: ["booking-ready", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { count } = await sb
        .from("booking_staff")
        .select("id, generated_sites!inner(site_name)", { count: "exact", head: true })
        .eq("generated_sites.site_name", slug!)
        .eq("generated_sites.is_paid", true)
        .eq("is_active", true);
      return (count ?? 0) > 0;
    },
  });

  // Tab title = the business name, template-appropriate favicon — not LeadFinder's.
  const def = getTemplateDef(template);
  const businessName = content?.businessName ?? "";
  // Null while loading → keep the per-barber title the /p/ edge function set in the
  // served HTML; set the real title only once data is in (no fallback flash).
  useSiteBranding(isLoading ? null : (businessName || def.brandFallbackLabel), template);

  // Render gate (kills the marketing flash): a booking-only row must NEVER paint the
  // marketing template. Show the loader until the redirect (useEffect above) sends
  // the visitor to the booking page — render-gate, not render-then-redirect.
  if (isLoading || data?.bookingOnly) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${def.loadingBgClass}`}>
        <Loader2 className={`h-8 w-8 animate-spin ${def.loadingSpinnerClass}`} />
      </div>
    );
  }

  // No content for this slug → a neutral "not available" page, NOT the template's
  // demo content (which would render a fake barber site for a missing/unknown slug).
  if (!content) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center ${def.loadingBgClass}`}>
        <p className="text-lg font-semibold text-white">This site isn’t available.</p>
        <p className="text-sm text-zinc-400">Please check the link, or check back soon.</p>
      </div>
    );
  }

  // Wait for the booking-state query too, so the page paints ONCE with booking known
  // (no "Book" button popping in a beat after the rest of the page).
  if (bookingPending) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${def.loadingBgClass}`}>
        <Loader2 className={`h-8 w-8 animate-spin ${def.loadingSpinnerClass}`} />
      </div>
    );
  }

  const Template = def.Component;
  return (
    <Template
      content={content}
      bookingEnabled={!!bookingReady}
      bookingSlug={slug}
    />
  );
}
