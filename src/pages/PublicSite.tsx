import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContent } from "@/templates/shared/content";
import { getTemplateDef, normaliseTemplate, DEFAULT_TEMPLATE_KEY } from "@/templates/registry";
import { useSiteBranding } from "@/hooks/useSiteBranding";

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
    queryFn: async (): Promise<{ content: SiteContent | null; template: string }> => {
      const res = await supabase
        .from("generated_sites")
        .select("content, template")
        .eq("site_name", slug!)
        .maybeSingle();
      if (res.error) {
        // The `template` column may not exist yet — retry with content only and
        // assume the historical barber template so live sites keep working.
        const fallback = await supabase
          .from("generated_sites")
          .select("content")
          .eq("site_name", slug!)
          .maybeSingle();
        if (fallback.error) return { content: null, template: DEFAULT_TEMPLATE_KEY };
        return {
          content: (fallback.data?.content as unknown as SiteContent) ?? null,
          template: DEFAULT_TEMPLATE_KEY,
        };
      }
      const row = res.data as { content: unknown; template: unknown } | null;
      return {
        content: (row?.content as SiteContent) ?? null,
        template: normaliseTemplate(row?.template),
      };
    },
  });

  const content = data?.content ?? null;
  const template = data?.template ?? DEFAULT_TEMPLATE_KEY;

  // Booking is enabled only when the shop has set up bookable staff (Phase 2).
  // Counts active staff for this published site (no rows fetched, just the count).
  const { data: bookingReady } = useQuery({
    queryKey: ["booking-ready", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { count } = await sb
        .from("booking_staff")
        .select("id, generated_sites!inner(site_name)", { count: "exact", head: true })
        .eq("generated_sites.site_name", slug!)
        .eq("is_active", true);
      return (count ?? 0) > 0;
    },
  });

  // Tab title = the business name, template-appropriate favicon — not LeadFinder's.
  const def = getTemplateDef(template);
  const businessName = content?.businessName ?? "";
  useSiteBranding(businessName || def.brandFallbackLabel, template);

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${def.loadingBgClass}`}>
        <Loader2 className={`h-8 w-8 animate-spin ${def.loadingSpinnerClass}`} />
      </div>
    );
  }

  const Template = def.Component;
  return (
    <Template
      content={content ?? def.demoContent}
      bookingEnabled={!!bookingReady}
      bookingSlug={content ? slug : undefined}
    />
  );
}
