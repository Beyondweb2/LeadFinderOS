import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Scissors } from "lucide-react";

/**
 * /claim/:token — the barber's self-contained front door. Neutral branding (NO
 * LeadFinder chrome). Validates the token, shows "Claim your website for X" with
 * its OWN inline create-account form, then claims the site and lands the barber in
 * /barber. A logged-in visitor gets a one-click claim instead of the form.
 *
 * Barbers are invite-only: this page is only reachable with a token, and account
 * creation happens server-side in claim-site only when the token is valid.
 */
type Phase = "loading" | "invalid" | "ready" | "claimed" | "working";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Claim() {
  const { token = "" } = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [businessName, setBusinessName] = useState("your business");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState(false);

  // Validate the token / fetch the business name.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: invokeError } = await supabase.functions.invoke("claim-info", {
        body: { token },
      });
      if (cancelled) return;
      if (invokeError || !data?.valid) {
        setPhase("invalid");
        return;
      }
      setBusinessName(data.businessName || "your business");
      setPhase(data.alreadyClaimed ? "claimed" : "ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const mapError = (code: string): string => {
    switch (code) {
      case "invalid_token":
      case "already_used":
      case "expired":
        return "This claim link is no longer valid. Ask for a fresh link.";
      case "already_claimed":
        return "This website has already been claimed.";
      case "invalid_email":
        return "Please enter a valid email address.";
      case "weak_password":
        return "Password must be at least 8 characters.";
      default:
        return "Something went wrong. Please try again.";
    }
  };

  // New-account claim: create the account + claim, then sign in and go to /barber.
  const handleCreateAndClaim = async () => {
    setError(null);
    setExistingEmail(false);
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setPhase("working");
    const { data, error: invokeError } = await supabase.functions.invoke("claim-site", {
      body: { token, email: email.trim(), password },
    });

    if (invokeError || !data?.ok) {
      const code = (data?.error as string) || "";
      if (code === "email_exists") {
        setExistingEmail(true);
        setError("You already have an account with this email.");
        setPhase("ready");
        return;
      }
      setError(mapError(code));
      setPhase(code === "already_claimed" ? "claimed" : "ready");
      return;
    }

    // Account created + site claimed server-side. Sign in to get a session.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      // Claim succeeded but auto-login failed — send them to log in manually.
      navigate("/barber-login", { replace: true });
      return;
    }
    navigate("/barber", { replace: true });
  };

  // Logged-in claim: one click, no form.
  const handleClaimAsMe = async () => {
    setError(null);
    setPhase("working");
    const { data, error: invokeError } = await supabase.functions.invoke("claim-site", {
      body: { token },
    });
    if (invokeError || !data?.ok) {
      const code = (data?.error as string) || "";
      setError(mapError(code));
      setPhase(code === "already_claimed" ? "claimed" : "ready");
      return;
    }
    navigate("/barber", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Scissors className="h-5 w-5 text-primary" />
          </div>
          {phase === "invalid" ? (
            <CardTitle className="text-xl">Claim link unavailable</CardTitle>
          ) : phase === "claimed" ? (
            <CardTitle className="text-xl">Already claimed</CardTitle>
          ) : (
            <CardTitle className="text-xl">
              Claim your website for{" "}
              <span className="text-primary">{businessName}</span>
            </CardTitle>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {phase === "loading" && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {phase === "invalid" && (
            <p className="text-center text-sm text-muted-foreground">
              This claim link is invalid or has expired. Please ask for a fresh link.
            </p>
          )}

          {phase === "claimed" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This website has already been claimed.
              </p>
              <Link to="/barber-login">
                <Button variant="outline" className="w-full">Log in to manage it</Button>
              </Link>
            </div>
          )}

          {(phase === "ready" || phase === "working") && !authLoading && (
            <>
              {user ? (
                // Already signed in → one-click claim.
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    You're signed in as <span className="font-medium text-foreground">{user.email}</span>.
                    Claim this website to manage it.
                  </p>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button className="w-full" onClick={handleClaimAsMe} disabled={phase === "working"}>
                    {phase === "working" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Claim my website
                  </Button>
                </div>
              ) : (
                // Self-contained create-account form.
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Create an account to manage your website. It takes a few seconds.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-email">Email</Label>
                    <Input
                      id="claim-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-password">Password</Label>
                    <Input
                      id="claim-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive">
                      {error}{" "}
                      {existingEmail && (
                        <Link
                          to={`/barber-login?next=${encodeURIComponent(`/claim/${token}`)}`}
                          className="font-medium underline"
                        >
                          Log in instead
                        </Link>
                      )}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleCreateAndClaim}
                    disabled={phase === "working"}
                  >
                    {phase === "working" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create account &amp; claim
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                      to={`/barber-login?next=${encodeURIComponent(`/claim/${token}`)}`}
                      className="underline"
                    >
                      Log in
                    </Link>
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
