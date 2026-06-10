import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Scissors } from "lucide-react";

/**
 * /barber-login — dedicated barber sign-in. Same Supabase Auth as everyone else
 * (one user pool, same signInWithPassword), but neutral branding and it always
 * routes to /barber (or a ?next= claim link), so a returning barber never sees
 * LeadFinder's login, marketing, or subscribe wall.
 *
 * Invite-only: there is deliberately no sign-up here — accounts are created only
 * by redeeming a claim link.
 */
export default function BarberLogin() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/barber";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → straight through (e.g. opened a claim link while logged in).
  if (!isLoading && user) {
    return <Navigate to={next} replace />;
  }

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError("Incorrect email or password.");
      return;
    }
    navigate(next, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Log in to your website</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitting) handleLogin();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="barber-email">Email</Label>
              <Input
                id="barber-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barber-password">Password</Label>
              <Input
                id="barber-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log in
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            New here? Open the claim link we sent you to get started.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
