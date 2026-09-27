import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { homeFor } from '@/lib/access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

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

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-6 max-w-sm space-y-3 text-center">
          <h1 className="font-semibold">This link has expired or was already used</h1>
          <p className="text-sm text-muted-foreground">Ask the admin for a new link from the Team page.</p>
          <Button variant="outline" onClick={() => navigate('/auth')}>Go to sign in</Button>
        </Card>
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="p-6 w-full max-w-sm space-y-3">
        <h1 className="text-lg font-semibold">Choose your password</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}. You will use this password to sign in from now on.</p>
        <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat it" />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <Button className="w-full" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save password'}</Button>
      </Card>
    </div>
  );
}
