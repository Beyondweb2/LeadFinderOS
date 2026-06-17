import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Scissors } from "lucide-react";
import { useBarberBranding } from "@/hooks/useBarberBranding";
import "@/templates/barber/fonts.css";

/**
 * /barber-login — dedicated barber sign-in. Same Supabase Auth as everyone else
 * (one user pool, same signInWithPassword), but barber-branded and it always
 * routes to /barber (or a ?next= claim link), so a returning barber never sees
 * LeadFinder's login, marketing, or subscribe wall.
 *
 * Invite-only: there is deliberately no sign-up here — accounts are created only
 * by redeeming a claim link.
 */
const SHELL =
  "min-h-screen flex items-center justify-center bg-ink font-body text-zinc-300 antialiased p-4";
const SHELL_BG =
  "radial-gradient(1100px 600px at 85% -8%, rgba(230,162,75,0.10), transparent 60%)," +
  "radial-gradient(800px 500px at -10% 8%, rgba(230,162,75,0.05), transparent 55%)";
const CARD =
  "w-full max-w-md rounded-2xl border border-line bg-ink-card p-7 sm:p-8 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]";
const INPUT =
  "bg-ink-soft border-line text-white placeholder:text-zinc-500 focus-visible:ring-amber/60";
const PRIMARY_BTN =
  "w-full rounded-full bg-amber font-bold text-ink shadow-[0_8px_30px_-6px_rgba(230,162,75,0.5)] transition-all hover:-translate-y-0.5 hover:bg-amber-soft";

export default function BarberLogin() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/barber";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useBarberBranding("Log in to manage your website");

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
    <div className={SHELL} style={{ backgroundImage: SHELL_BG }}>
      <div className={CARD}>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber/30 bg-amber/10">
            <Scissors className="h-5 w-5 text-amber" />
          </div>
          <h1 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
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
            <Label htmlFor="barber-email" className="text-zinc-300">Email</Label>
            <Input
              id="barber-email"
              type="email"
              autoComplete="email"
              className={INPUT}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="barber-password" className="text-zinc-300">Password</Label>
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className={PRIMARY_BTN} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log in
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-zinc-500">
          New here? Open the claim link we sent you to get started.
        </p>
      </div>
    </div>
  );
}
