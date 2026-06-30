import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { SiteEditor, type EditableSite } from "@/components/SiteEditor";
import { publicSiteUrl } from "@/config/publicSite";

/**
 * Rep-facing "Manage site" page at /sites/:id. Reuses the same <SiteEditor> the admin
 * page uses, WITHOUT the admin-only chrome (no delete / status / convert / barber-access
 * cards). Authorisation is by RLS: a rep can only load a site whose LEAD they own (the
 * "Lead owner can read/update their generated sites" policy) — anything else returns
 * nothing → "no access". /admin/sites/:id stays the richer admin-only page.
 */
export default function SiteManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<EditableSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [noAccess, setNoAccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, template")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNoAccess(true); setLoading(false); return; }
      setSite(data as unknown as EditableSite);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (noAccess || !site) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-semibold">This site isn’t available.</p>
        <p className="text-sm text-muted-foreground">It may not exist, or it isn’t one of your leads’ sites.</p>
        <Button variant="outline" onClick={() => navigate("/outreach")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Outreach
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/outreach"))}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <a
            href={publicSiteUrl(site.site_name)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            View live site <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage site</h1>
          <p className="text-sm text-muted-foreground">{site.content?.businessName || site.site_name}</p>
        </div>

        <SiteEditor site={site} onSaved={(content) => setSite({ ...site, content })} />
      </div>
    </div>
  );
}
