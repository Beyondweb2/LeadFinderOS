import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import { demoContent } from "@/templates/barber/demoContent";
import type { BarberSiteContent } from "@/templates/barber/types";
import { useBarberBranding } from "@/hooks/useBarberBranding";

// booking_staff isn't in the generated types yet (Phase 1 migration applied via
// the SQL runner) — untyped view for the booking-ready probe. RLS still applies.
const sb = supabase as unknown as SupabaseClient;

/**
 * Public, unauthenticated barber site at /p/:slug.
 *
 * Looks up the generated_sites row whose slug (stored in site_name) matches the
 * URL and renders its content. Falls back to the bundled demo content when no
 * row matches (including /p/demo) or on any read error.
 *
 * Public visibility is enforced at the DB layer (RLS): anon visitors only see
 * status='published' rows, so logged-out users see published sites only, while
 * an admin can preview any status (incl. drafts) via the admin RLS policy.
 */
export default function BarberSite() {
  const { slug } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["generated-site", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_sites")
        .select("content")
        .eq("site_name", slug!)
        .maybeSingle();
      if (error) return null; // permission / network error → fall back to demo
      return (data?.content as unknown as BarberSiteContent) ?? null;
    },
  });

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

  // Tab title = the shop name, barber favicon — not LeadFinder's.
  useBarberBranding(data?.businessName || "Barber website");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  return (
    <BarberSiteTemplate
      content={data ?? demoContent}
      bookingEnabled={!!bookingReady}
      bookingSlug={data ? slug : undefined}
    />
  );
}
