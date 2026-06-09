import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import { demoContent } from "@/templates/barber/demoContent";
import type { BarberSiteContent } from "@/templates/barber/types";

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  return <BarberSiteTemplate content={data ?? demoContent} />;
}
