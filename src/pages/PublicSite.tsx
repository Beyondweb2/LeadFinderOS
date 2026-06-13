import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import { SalonSiteTemplate } from "@/templates/salon/SalonSiteTemplate";
import { demoContent as barberDemo } from "@/templates/barber/demoContent";
import { demoContent as salonDemo } from "@/templates/salon/demoContent";
import type { SiteContent } from "@/templates/shared/content";
import { useSiteBranding } from "@/hooks/useSiteBranding";

// booking_staff isn't in the generated types yet (Phase 1 migration applied via
// the SQL runner) — untyped view for the booking-ready probe. RLS still applies.
const sb = supabase as unknown as SupabaseClient;

/** Which design template a generated site renders with. Stored in the
 *  generated_sites.template column (text, default 'barber'). Unknown/missing
 *  values fall back to the barber template. */
type Template = "barber" | "salon";

function normaliseTemplate(value: unknown): Template {
  return value === "salon" ? "salon" : "barber";
}

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
    queryFn: async (): Promise<{ content: SiteContent | null; template: Template }> => {
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
        if (fallback.error) return { content: null, template: "barber" };
        return {
          content: (fallback.data?.content as unknown as SiteContent) ?? null,
          template: "barber",
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
  const template = data?.template ?? "barber";

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
  const isSalon = template === "salon";
  const businessName = content?.businessName ?? "";
  useSiteBranding(
    businessName || (isSalon ? "Salon website" : "Barber website"),
    template
  );

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isSalon ? "bg-salon-bg" : "bg-ink"
        }`}
      >
        <Loader2 className={`h-8 w-8 animate-spin ${isSalon ? "text-salon-rose" : "text-amber"}`} />
      </div>
    );
  }

  if (isSalon) {
    return (
      <SalonSiteTemplate
        content={content ?? salonDemo}
        bookingEnabled={!!bookingReady}
        bookingSlug={content ? slug : undefined}
      />
    );
  }

  return (
    <BarberSiteTemplate
      content={content ?? barberDemo}
      bookingEnabled={!!bookingReady}
      bookingSlug={content ? slug : undefined}
    />
  );
}
