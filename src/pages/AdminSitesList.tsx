import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, ExternalLink, Settings2 } from "lucide-react";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Admin-only list of all generated barber sites, each linking to its Manage page.
 */
type SiteRow = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
  created_at: string;
};

export default function AdminSitesList() {
  const { isAdmin, isLoading: roleLoading } = useSubscription();
  const navigate = useNavigate();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, created_at")
        .order("created_at", { ascending: false });
      setSites((data ?? []) as unknown as SiteRow[]);
      setLoading(false);
    })();
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
        <h1 className="text-2xl font-bold text-foreground">Generated Sites</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No generated sites yet. Generate one from the Outreach list.
        </p>
      ) : (
        <div className="space-y-2">
          {sites.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground truncate">
                      {s.content?.businessName || s.site_name}
                    </span>
                    <Badge variant={s.status === "published" ? "default" : "secondary"}>
                      {s.status}
                    </Badge>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">/p/{s.site_name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a href={`/p/${s.site_name}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon" title="Preview">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button size="sm" onClick={() => navigate(`/admin/sites/${s.id}`)}>
                    <Settings2 className="h-4 w-4 mr-2" /> Manage
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
