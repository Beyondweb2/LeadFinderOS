import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, Link2, Link2Off, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { homeFor } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, IconTile, LoadState, SURFACE } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
import { EXPIRED_LINK_COPY } from '@/lib/teamActivation';
import { linkErrorFromUrl, mustChangePassword, PASSWORD_PROBLEM_WORDS, passwordProblem, readLinkParams } from '@/lib/teamAccounts';

/* SET YOUR PASSWORD — where an invite, a fresh link from the Team page, a Forgot password email, or a
 * first sign-in with a temporary password lands (multi-user, 2026-09-27; 2026-10-14).
 *
 * Two kinds of link arrive here:
 *  · ours (?token_hash=…&type=…) — nothing happens until the person presses Continue, so an email scanner or a
 *    WhatsApp link preview that opens the page cannot use the link up (src/lib/teamAccounts.ts scannerSafeLink);
 *  · the provider's own (the Forgot password email) — the session is already set from the link, or the
 *    provider reports it was used / expired in the address (#error_code=otp_expired).
 * The admin never sees the password chosen here. */
export default function SetPassword() {
  const { user, isLoading } = useAuth();
  const { role } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [linkUsed, setLinkUsed] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);

  const linkParams = linkUsed ? null : readLinkParams(location.search);
  const providerError = linkErrorFromUrl(location.hash, location.search);

  const expired = (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
      <div className={cn(SURFACE, 'flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center')} data-testid="link-expired">
        <IconTile icon={Link2Off} tone="amber" size="lg" />
        <h1 className="text-lg font-bold tracking-tight">{EXPIRED_LINK_COPY.title}</h1>
        <p className="text-sm text-muted-foreground">{EXPIRED_LINK_COPY.body}</p>
        <p className="text-xs text-muted-foreground">{EXPIRED_LINK_COPY.scanner}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => navigate('/auth')}>Go to sign in</Button>
          <Button variant="outline" onClick={() => navigate('/auth?forgot=1')}>Forgot password</Button>
        </div>
      </div>
    </div>
  );

  if (isLoading) return <LoadState className="min-h-screen" />;
  if (linkFailed) return expired;

  /* OUR LINK: one press uses it. Whoever is signed in on this browser is replaced by the link's person. */
  if (linkParams) {
    const continueWithLink = async () => {
      setBusy(true);
      try {
        const { error } = await supabase.auth.verifyOtp({ token_hash: linkParams.tokenHash, type: linkParams.type });
        if (error) { setLinkFailed(true); return; }
        setLinkUsed(true);
        navigate('/set-password', { replace: true });
      } finally { setBusy(false); }
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
        <div className={cn(SURFACE, 'w-full max-w-sm space-y-3 p-6')} data-testid="link-continue">
          <div className="flex min-w-0 items-start gap-3">
            <IconTile icon={Link2} tone="blue" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">{linkParams.type === 'recovery' ? 'Reset your password' : 'Set up your account'}</h1>
              <p className="text-sm text-muted-foreground">Press Continue to choose your password. The link works once.</p>
            </div>
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void continueWithLink()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}</Button>
        </div>
      </div>
    );
  }

  /* The provider said the link was used or has expired — say so even if someone is signed in on this browser. */
  if (providerError || !user) return expired;

  const firstLogin = mustChangePassword(user);

  const save = async () => {
    setErr(null);
    const problem = passwordProblem(pw, { email: user.email });
    if (problem) { setErr(PASSWORD_PROBLEM_WORDS[problem]); return; }
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw, data: { password_set_at: new Date().toISOString() } });
      if (error) {
        setErr(/different from the old|same_password/i.test(`${error.message} ${(error as { code?: string }).code ?? ''}`)
          ? 'Choose a password that is different from the temporary one.'
          : error.message);
        return;
      }
      navigate(homeFor(role), { replace: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
      <div className={cn(SURFACE, 'w-full max-w-sm space-y-3 p-6')} data-testid={firstLogin ? 'first-login-change' : 'choose-password'}>
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={KeyRound} tone="blue" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">{firstLogin ? 'Choose a new password' : 'Choose your password'}</h1>
            <p className="break-words text-sm text-muted-foreground">
              {firstLogin
                ? `Signed in as ${user.email} with a temporary password. Choose your own before you carry on — only you will know it.`
                : `Signed in as ${user.email}. You will use this password to sign in from now on.`}
            </p>
          </div>
        </div>
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat it" />
        <p className="text-xs text-muted-foreground">{PASSWORD_PROBLEM_WORDS.too_short} {PASSWORD_PROBLEM_WORDS.needs_letter_and_number}</p>
        {err && <Callout tone="red" icon={AlertTriangle}>{err}</Callout>}
        <Button className="w-full" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}</Button>
      </div>
    </div>
  );
}
