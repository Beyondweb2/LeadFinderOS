import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Globe } from "lucide-react";
import { useBarberBranding, NEUTRAL_FAVICON } from "@/hooks/useBarberBranding";
import { phoneToSyntheticEmail } from "@/lib/phoneAuth";

/**
 * /barber-login — dedicated barber sign-in. Same Supabase Auth as everyone else
 * (one user pool, same signInWithPassword), but barber-branded and it always
 * routes to /barber (or a ?next= claim link), so a returning barber never sees
 * LeadFinder's login, marketing, or subscribe wall.
 *
 * Invite-only: there is deliberately no sign-up here — accounts are created only
 * by redeeming a claim link.
 */
// Neutral, trade-agnostic styling built on the app's own design tokens (matches the
// owner-dashboard picker) — no barber ink/amber palette, no display font.
const SHELL =
  "min-h-screen flex items-center justify-center bg-background text-foreground antialiased p-4";
const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, hsl(var(--primary) / 0.06), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, hsl(var(--primary) / 0.04), transparent 55%)";
const CARD =
  "w-full max-w-md rounded-2xl border border-border bg-card p-7 sm:p-8 shadow-xl";
const INPUT =
  "bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-ring";
const PRIMARY_BTN =
  "w-full rounded-full font-semibold transition-all hover:-translate-y-0.5";

export default function BarberLogin() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/barber";

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useBarberBranding("Log in to manage your site", NEUTRAL_FAVICON);

  // Already signed in → straight through (e.g. opened a claim link while logged in).
  if (!isLoading && user) {
    return <Navigate to={next} replace />;
  }

  const handleLogin = async () => {
    setError(null);
    setSubmitting(true);
    const entered = phone.trim();
    // Phone → hidden synthetic email, then sign in via the email path.
    const first = await supabase.auth.signInWithPassword({
      email: phoneToSyntheticEmail(entered),
      password,
    });
    // Legacy fallback: a handful of early barbers may have signed up with a REAL
    // email before phone auth existed. If the field actually holds an email and the
    // phone attempt failed, retry it as a raw email so they're not locked out.
    // Invisible to phone users (a phone never contains "@").
    let err = first.error;
    if (err && entered.includes("@")) {
      const retry = await supabase.auth.signInWithPassword({ email: entered, password });
      err = retry.error;
    }
    setSubmitting(false);
    if (err) {
      setError("Incorrect phone number or password.");
      return;
    }
    navigate(next, { replace: true });
  };

  return (
    <div className={SHELL} style={{ backgroundImage: SHELL_BG }}>
      <div className={CARD}>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
            Log in to manage your website
          </h1>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitting) handleLogin();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="barber-phone" className="text-foreground">Mobile number</Label>
            <Input
              id="barber-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={INPUT}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07… or +44…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="barber-password" className="text-foreground">Password</Label>
            <Input
              id="barber-password"
              type="password"
              autoComplete="current-password"
              className={INPUT}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className={PRIMARY_BTN} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log in
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          New here? Open the claim link we sent you to get started.
        </p>
      </div>
    </div>
  );
}
