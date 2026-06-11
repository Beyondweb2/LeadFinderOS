import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, ExternalLink, Settings2, Trash2, CheckCircle2 } from "lucide-react";
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
  owner_id: string | null;
};

export default function AdminSitesList() {
  const { isAdmin, isLoading: roleLoading } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (s: SiteRow) => {
    if (!window.confirm(`Delete "${s.content?.businessName || s.site_name}"? This can't be undone.`)) return;
    setDeletingId(s.id);
    const { error } = await supabase.from("generated_sites").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      setDeletingId(null);
      return;
    }
    setSites((prev) => prev.filter((x) => x.id !== s.id));
    setDeletingId(null);
    toast({ title: "Site deleted" });
  };

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content, created_at, owner_id")
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
        <Button
          variant="ghost"
          size="icon"
          title="Back"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/admin"))}
        >
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
                    {s.owner_id && (
                      <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Activated
                      </Badge>
                    )}
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
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
