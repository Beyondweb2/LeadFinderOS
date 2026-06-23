import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Scissors, ArrowLeft } from "lucide-react";
import { SETUP_BY_NAME, SUPPORT_CONTACT, supportContactHref } from "@/config/barberBrand";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import { applyPendingBarberEdits } from "@/lib/barberEdits";
import type { BarberSiteContent } from "@/templates/barber/types";
import { useBarberBranding } from "@/hooks/useBarberBranding";
import "@/templates/barber/fonts.css";

/**
 * /claim/:token - the barber's self-contained front door. Barber-branded (NO
 * LeadFinder chrome). Two steps:
 *   1. "preview" - the barber sees their ACTUAL website (the real template,
 *      booking disabled) with a fixed "Claim for free" bar.
 *   2. "signup"  - clicking claim brings up the create-account form (or a
 *      one-click claim if already signed in), then claims the site → /barber.
 *
 * Barbers are invite-only: this page is only reachable with a token, and account
 * creation happens server-side in claim-site only when the token is valid.
 */
type Phase = "loading" | "invalid" | "ready" | "claimed" | "working";
type Step = "preview" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function Claim() {
  const { token = "" } = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Coming from the /s/:token share link, the barber has already seen + browsed
  // their site, so skip the redundant preview step and land on the claim form.
  // Direct /claim visits (e.g. an admin-sent link) still see the preview first.
  const fromShare = (location.state as { fromShare?: boolean } | null)?.fromShare === true;
  // Why they arrived: "more-photos" = they hit the 3-photo pre-sign-in cap, so we
  // tailor the copy to explain the account unlocks more customising.
  const claimReason = (location.state as { reason?: string } | null)?.reason;

  const [phase, setPhase] = useState<Phase>("loading");
  const [step, setStep] = useState<Step>(fromShare ? "signup" : "preview");
  const [businessName, setBusinessName] = useState("your business");
  const [content, setContent] = useState<BarberSiteContent | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState(false);

  // Validate the token / fetch the site content for the preview.
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
      setContent((data.content as BarberSiteContent) ?? null);
      setPhase(data.alreadyClaimed ? "claimed" : "ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useBarberBranding(
    businessName && businessName !== "your business"
      ? `Your website - ${businessName}`
      : "Your website",
  );

  const mapError = (code: string): string => {
    switch (code) {
      case "invalid_token":
      case "already_used":
      case "expired":
        return "This link is no longer valid. Ask for a fresh link.";
      case "already_claimed":
        return "This website has already been set up.";
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
      // Claim succeeded but auto-login failed - send them to log in manually.
      navigate("/barber-login", { replace: true });
      return;
    }
    await applyPendingBarberEdits(supabase); // apply pre-sign-in colour choice (best-effort)
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
    await applyPendingBarberEdits(supabase); // apply pre-sign-in colour choice (best-effort)
    navigate("/barber", { replace: true });
  };

  // Full-screen spinner while validating.
  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  // Step 1 - show the barber their ACTUAL website, with a "Claim for free" bar.
  if (phase === "ready" && step === "preview" && content) {
    return (
      <BarberSiteTemplate content={content} bookingEnabled={false} onClaim={() => setStep("signup")} />
    );
  }

  // Card layout - sign-up step, plus the invalid / already-claimed states.
  return (
    <div className={SHELL} style={{ backgroundImage: SHELL_BG }}>
      <div className={CARD}>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber/30 bg-amber/10">
            <Scissors className="h-5 w-5 text-amber" />
          </div>
          {phase === "invalid" ? (
            <h1 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
              Link unavailable
            </h1>
          ) : phase === "claimed" ? (
            <h1 className="mt-4 font-display text-3xl uppercase tracking-wide text-white">
              Already set up
            </h1>
          ) : (
            <h1 className="mt-4 font-display text-2xl sm:text-3xl uppercase leading-tight tracking-wide text-white break-words">
              Your website for{" "}
              <span className="text-amber break-words">{businessName}</span>
            </h1>
          )}
        </div>

        <div className="mt-6 space-y-4">
          {phase === "invalid" && (
            <p className="text-center text-sm text-zinc-400">
              This link is invalid or has expired. Please ask for a fresh link.
            </p>
          )}

          {phase === "claimed" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-zinc-400">This website has already been set up.</p>
              <Link to="/barber-login">
                <Button
                  variant="outline"
                  className="w-full rounded-full border-line bg-white/[0.03] text-zinc-100 hover:border-amber/50 hover:text-white"
                >
                  Log in to manage it
                </Button>
              </Link>
            </div>
          )}

          {(phase === "ready" || phase === "working") && !authLoading && (
            <div className="space-y-4">
              {content && phase === "ready" && (
                <button
                  type="button"
                  onClick={() => setStep("preview")}
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-amber"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to your website
                </button>
              )}

              {claimReason === "more-photos" && (
                <div className="rounded-xl border border-amber/25 bg-amber/[0.07] px-4 py-3 text-sm leading-relaxed text-amber-soft">
                  <span className="font-semibold text-amber">You've added 3 photos.</span>{" "}
                  Create your account below to add more and keep everything you've changed.
                </div>
              )}

              {user ? (
                // Already signed in → one-click save.
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">
                    You're signed in as{" "}
                    <span className="font-medium text-zinc-200">{user.email}</span>. Save this
                    website to your account.
                  </p>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button className={PRIMARY_BTN} onClick={handleClaimAsMe} disabled={phase === "working"}>
                    {phase === "working" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save my website
                  </Button>
                </div>
              ) : (
                // Self-contained create-account form.
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">
                    Create an account to manage your website. It takes a few seconds.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-email" className="text-zinc-300">Email</Label>
                    <Input
                      id="claim-email"
                      type="email"
                      autoComplete="email"
                      className={INPUT}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-password" className="text-zinc-300">Password</Label>
                    <Input
                      id="claim-password"
                      type="password"
                      autoComplete="new-password"
                      className={INPUT}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-red-400">
                      {error}{" "}
                      {existingEmail && (
                        <Link
                          to={`/barber-login?next=${encodeURIComponent(`/claim/${token}`)}`}
                          className="font-medium text-amber underline hover:text-amber-soft"
                        >
                          Log in instead
                        </Link>
                      )}
                    </p>
                  )}
                  <Button className={PRIMARY_BTN} onClick={handleCreateAndClaim} disabled={phase === "working"}>
                    {phase === "working" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create account &amp; save
                  </Button>
                  <p className="text-center text-xs text-zinc-500">
                    Already have an account?{" "}
                    <Link
                      to={`/barber-login?next=${encodeURIComponent(`/claim/${token}`)}`}
                      className="text-amber underline hover:text-amber-soft"
                    >
                      Log in
                    </Link>
                  </p>
                </div>
              )}

              <p className="text-center text-xs text-zinc-500">
                All your text, services and photos are fully editable from your dashboard once you sign in.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-zinc-500">
          Set up by {SETUP_BY_NAME}
          {SUPPORT_CONTACT && (
            <>
              {" "}- questions?{" "}
              {supportContactHref ? (
                <a href={supportContactHref} className="text-amber underline hover:text-amber-soft">
                  {SUPPORT_CONTACT}
                </a>
              ) : (
                <span className="text-zinc-400">{SUPPORT_CONTACT}</span>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
