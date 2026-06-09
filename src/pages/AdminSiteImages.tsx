import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { SiteImageManager } from "@/components/SiteImageManager";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Admin-only quick image upload page. Pick a generated site and upload its
 * hero / gallery / about / logo images via the shared SiteImageManager.
 * (The fuller per-site editor lives at /admin/sites/:id.)
 */
type SiteRow = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
};

export default function AdminSiteImages() {
  const { isAdmin, isLoading: roleLoading } = useSubscription();
  const navigate = useNavigate();

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");

  const selected = useMemo(
    () => sites.find((s) => s.id === selectedId) ?? null,
    [sites, selectedId],
  );

  const loadSites = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("generated_sites")
      .select("id, site_name, status, content")
      .order("created_at", { ascending: false });
    setSites((data ?? []) as unknown as SiteRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) loadSites();
  }, [isAdmin]);

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/landing" replace />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Barber Site Images</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload images on the barber's behalf. They replace the bundled stock photos on the
        generated site; leave a slot empty to keep the current image. JPEG/PNG/WebP, max 5&nbsp;MB.
        For full text/logo/publish control, open a site's Manage page.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose a site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a generated site…" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.content?.businessName || s.site_name) + ` — ${s.status}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sites.length === 0 && (
              <p className="text-sm text-muted-foreground">No generated sites yet.</p>
            )}

            {selected && (
              <>
                <SiteImageManager
                  key={selected.id}
                  siteId={selected.id}
                  content={selected.content}
                  onSaved={(c) =>
                    setSites((prev) =>
                      prev.map((s) => (s.id === selected.id ? { ...s, content: c } : s)),
                    )
                  }
                />
                <div className="flex items-center gap-4 pt-1">
                  <a
                    href={`/p/${selected.site_name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Preview site <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => navigate(`/admin/sites/${selected.id}`)}
                    className="text-sm text-primary hover:underline"
                  >
                    Open full Manage page →
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
