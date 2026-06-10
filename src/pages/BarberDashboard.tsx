import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, LogOut } from "lucide-react";
import type { BarberSiteContent } from "@/templates/barber/types";

/**
 * Phase 0 barber dashboard scaffold. Lists the site(s) the logged-in barber owns
 * (RLS only returns their own rows). Editing reuses the Manage editor in Phase 2;
 * a Bookings tab arrives when bookings are real.
 */
type OwnedSite = { id: string; site_name: string; status: string; content: BarberSiteContent };

export default function BarberDashboard() {
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const [sites, setSites] = useState<OwnedSite[]>([]);
  const [loading, setLoading] = useState(true);

  // Barber sign-out: clear the session and return to the barber front door —
  // NOT useAuth().signOut(), which redirects to LeadFinder's /landing marketing.
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/barber-login";
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("generated_sites")
        .select("id, site_name, status, content")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      setSites((data ?? []) as unknown as OwnedSite[]);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admins don't belong here; a non-owner who landed here goes home.
  if (sites.length === 0) return <Navigate to={isAdmin ? "/admin" : "/"} replace />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Your site</h1>
          <p className="text-sm text-muted-foreground">Manage your barbershop site.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} title="Sign out">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>

      {sites.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground truncate">
                  {s.content?.businessName || s.site_name}
                </span>
                <Badge variant={s.status === "published" ? "default" : "secondary"}>{s.status}</Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">/p/{s.site_name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={`/p/${s.site_name}`} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="icon" title="Preview your site">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
              <Button size="sm" disabled title="Coming soon">
                Edit my site
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground">Editing and bookings — coming soon.</p>
    </div>
  );
}
