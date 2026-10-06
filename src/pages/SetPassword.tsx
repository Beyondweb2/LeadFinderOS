import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, Link2Off, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { homeFor } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, IconTile, LoadState, SURFACE } from '@/components/operator/ui';
import { cn } from '@/lib/utils';

/* SET YOUR PASSWORD — where an invite (or a fresh link from the Team page) lands (multi-user,
 * 2026-09-27). Supabase signs the invitee in from the link itself; this page only lets them choose a
 * password so they can sign in normally next time. The admin never sees it. */
export default function SetPassword() {
  const { user, isLoading } = useAuth();
  const { role } = useSubscription();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <LoadState className="min-h-screen" />;
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
        <div className={cn(SURFACE, 'flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center')}>
          <IconTile icon={Link2Off} tone="amber" size="lg" />
          <h1 className="text-lg font-bold tracking-tight">This link has expired or was already used</h1>
          <p className="text-sm text-muted-foreground">Ask the admin for a new link from the Team page.</p>
          <Button variant="outline" onClick={() => navigate('/auth')}>Go to sign in</Button>
        </div>
      </div>
    );
  }

  const save = async () => {
    setErr(null);
    if (pw.length < 10) { setErr('Use at least 10 characters.'); return; }
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setErr(error.message); return; }
      navigate(homeFor(role), { replace: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
      <div className={cn(SURFACE, 'w-full max-w-sm space-y-3 p-6')}>
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={KeyRound} tone="blue" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">Choose your password</h1>
            <p className="break-words text-sm text-muted-foreground">Signed in as {user.email}. You will use this password to sign in from now on.</p>
          </div>
        </div>
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat it" />
        {err && <Callout tone="red" icon={AlertTriangle}>{err}</Callout>}
        <Button className="w-full" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}</Button>
      </div>
    </div>
  );
}
