import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SiteContent } from "@/templates/shared/content";
import { getTemplateDef, normaliseTemplate, DEFAULT_TEMPLATE_KEY } from "@/templates/registry";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { bookingUrl } from "@/lib/subdomain";

const sb = supabase as unknown as SupabaseClient;

/**
 * Renders a barber's site on their custom subdomain (<label>.yoursites.uk).
 *
 * Mounted by App.tsx ONLY when the host resolves to a barber subdomain (see
 * src/lib/subdomain.ts) — it bypasses the operator app entirely. Resolution is by
 * `generated_sites.subdomain` (vs PublicSite's `site_name`); rendering is otherwise
 * the same. RLS limits anon to published rows, so an unpublished/unknown subdomain
 * shows a neutral "not found" rather than any operator chrome.
 *
 * The /p/:slug route is untouched — this is purely additive.
 */
export default function SubdomainSite({ label }: { label: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["subdomain-site", label],
    queryFn: async (): Promise<{ content: SiteContent | null; template: string; siteName: string | null; bookingOnly: boolean }> => {
      const res = await sb
        .from("generated_sites")
        .select("site_name, content, template, booking_only")
        .eq("subdomain", label)
        .maybeSingle();
      if (res.error) {
        // `template`/`booking_only` columns may not exist yet on an older deploy → retry minimal.
        const fb = await sb
          .from("generated_sites")
          .select("site_name, content")
          .eq("subdomain", label)
          .maybeSingle();
        if (fb.error) return { content: null, template: DEFAULT_TEMPLATE_KEY, siteName: null, bookingOnly: false };
        const r = fb.data as { site_name?: string; content?: unknown } | null;
        return {
          content: (r?.content as SiteContent) ?? null,
          template: DEFAULT_TEMPLATE_KEY,
          siteName: r?.site_name ?? null,
          bookingOnly: false,
        };
      }
      const row = res.data as { site_name?: string; content?: unknown; template?: unknown; booking_only?: boolean } | null;
      return {
        content: (row?.content as SiteContent) ?? null,
        template: normaliseTemplate(row?.template),
        siteName: row?.site_name ?? null,
        bookingOnly: !!row?.booking_only,
      };
    },
  });

  // Booking-only rows have no marketing site → send them to their booking page.
  useEffect(() => {
    if (data?.bookingOnly && data?.siteName) window.location.replace(bookingUrl(data.siteName));
  }, [data?.bookingOnly, data?.siteName]);

  const content = data?.content ?? null;
  const template = data?.template ?? DEFAULT_TEMPLATE_KEY;
  const siteName = data?.siteName ?? null;

  // Booking is enabled only when the shop has PAID (online booking is a paid
  // feature) AND set up bookable staff (matches PublicSite).
  const { data: bookingReady } = useQuery({
    queryKey: ["booking-ready-sub", siteName],
    enabled: !!siteName,
    queryFn: async () => {
      const { count } = await sb
        .from("booking_staff")
        .select("id, generated_sites!inner(site_name)", { count: "exact", head: true })
        .eq("generated_sites.site_name", siteName!)
        .eq("generated_sites.is_paid", true)
        .eq("is_active", true);
      return (count ?? 0) > 0;
    },
  });

  const def = getTemplateDef(template);
  useSiteBranding(content?.businessName || def.brandFallbackLabel, template);

  // Render gate (kills the marketing flash): a booking-only row must NEVER paint the
  // marketing template — show the loader until the redirect (useEffect above) sends
  // the visitor to the booking page. Render-gate, not render-then-redirect.
  if (isLoading || data?.bookingOnly) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${def.loadingBgClass}`}>
        <Loader2 className={`h-8 w-8 animate-spin ${def.loadingSpinnerClass}`} />
      </div>
    );
  }

  // No published site for this subdomain → neutral message (never the operator app).
  if (!content || !siteName) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center ${def.loadingBgClass}`}>
        <p className="text-lg font-semibold text-white">This site isn’t available yet.</p>
        <p className="text-sm text-zinc-400">Please check back soon.</p>
      </div>
    );
  }

  const Template = def.Component;
  return (
    <Template content={content} bookingEnabled={!!bookingReady} bookingSlug={siteName} />
  );
}
