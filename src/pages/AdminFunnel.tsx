import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

type FunnelData = Record<string, { last7: number; allTime: number }>;

const pct = (a: number, b: number) =>
  b === 0 ? "–" : `${((a / b) * 100).toFixed(1)}%`;

const AdminFunnel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<FunnelData | null>(null);
  const [error, setError] = useState(false);

  // Check admin role
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data: role }) => setIsAdmin(!!role));
  }, [user]);

  // Fetch funnel data
  useEffect(() => {
    if (!isAdmin) return;
    supabase.functions
      .invoke("admin-funnel")
      .then(({ data: d, error: e }) => {
        if (e || !d || d.error) {
          console.error("Funnel fetch error:", e || d?.error);
          setError(true);
        } else {
          setData(d as FunnelData);
        }
      })
      .catch((err) => {
        console.error("Funnel fetch exception:", err);
        setError(true);
      });
  }, [isAdmin]);

  if (!user) return null;
  if (isAdmin === null) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="p-8 text-destructive font-semibold">Unauthorized</div>;

  const checkout7 = data?.checkout_attempts?.last7 ?? 0;
  const trial7 = data?.trial_started?.last7 ?? 0;
  const paid7 = data?.subscription_active?.last7 ?? 0;
  const checkoutAll = data?.checkout_attempts?.allTime ?? 0;
  const trialAll = data?.trial_started?.allTime ?? 0;
  const paidAll = data?.subscription_active?.allTime ?? 0;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Admin
      </Button>
      <h1 className="text-2xl font-bold mb-6">Funnel Stats</h1>

      {error && (
        <p className="text-destructive mb-4">Data temporarily unavailable</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* Last 7 Days */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Last 7 Days</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Checkout Attempts" value={checkout7} />
              <StatCard label="Trial Started" value={trial7} />
              <StatCard label="Subscription Active" value={paid7} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <RateCard label="Checkout → Trial" value={pct(trial7, checkout7)} />
              <RateCard label="Trial → Paid" value={pct(paid7, trial7)} />
              <RateCard label="Checkout → Paid" value={pct(paid7, checkout7)} />
            </div>
          </section>

          {/* All Time */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-muted-foreground">All Time</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Checkout Attempts" value={checkoutAll} />
              <StatCard label="Trial Started" value={trialAll} />
              <StatCard label="Subscription Active" value={paidAll} />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <RateCard label="Checkout → Trial" value={pct(trialAll, checkoutAll)} />
              <RateCard label="Trial → Paid" value={pct(paidAll, trialAll)} />
              <RateCard label="Checkout → Paid" value={pct(paidAll, checkoutAll)} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm text-muted-foreground font-medium">{label}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold">{value}</p>
    </CardContent>
  </Card>
);

const RateCard = ({ label, value }: { label: string; value: string }) => (
  <Card className="bg-muted/30">
    <CardContent className="pt-4 pb-3 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </CardContent>
  </Card>
);

export default AdminFunnel;
