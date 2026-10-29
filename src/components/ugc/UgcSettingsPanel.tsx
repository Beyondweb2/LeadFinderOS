import { useState } from 'react';
import { KeyRound, Loader2, MessageCircle, PowerOff, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, SubSection, ToneChip } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { useUgcActions } from '@/hooks/useUgc';
import { generateTempPassword } from '@/lib/teamAccounts';

/* UGC settings: the WhatsApp API slot (OFF) and, for the admin, Jess's login. */

export function UgcSettingsPanel({ admin }: { admin: boolean }) {
  const actions = useUgcActions();
  const { toast } = useToast();
  const [name, setName] = useState('Jess Cousin');
  const [email, setEmail] = useState('');
  const [sender, setSender] = useState('');
  const [pw, setPw] = useState(() => generateTempPassword());
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(false);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="space-y-3 p-4 text-sm">
        <SubSection title="WhatsApp sending" icon={MessageCircle} tone="grey" action={<ToneChip tone="grey" icon={PowerOff}>Off</ToneChip>}>
          <p>Today WhatsApp is <b>Open WhatsApp chat</b> on your own phone — nothing is sent by the app.</p>
          <p className="mt-2 text-xs text-muted-foreground">Sending from the app (a UGC queue and inbox) stays switched off until a WhatsApp number that is yours is connected. It will never use the Findable number. When it is switched on: a daily cap between 25 and 100 (starts at 25), a check that the number is a real contact, and opt-out honoured at once.</p>
          <p className="mt-2 text-xs text-muted-foreground">No SMS for UGC.</p>
        </SubSection>
      </CardContent></Card>

      {admin && (
        <Card><CardContent className="space-y-3 p-4 text-sm">
          <SubSection title="Give Jess her login" icon={UserPlus} tone="purple" hint="A UGC login: it opens this page only and has no LeadFinder role.">
            {made ? <Callout tone="green" title="Login created">Give Jess the email and the temporary password; she sets her own at first sign-in.</Callout> : (
              <div className="grid gap-2">
                <label className="text-xs font-medium">Name<Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="text-xs font-medium">Login email<Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label className="text-xs font-medium">Gmail she sends from (if different)<Input className="mt-1" type="email" value={sender} onChange={(e) => setSender(e.target.value)} /></label>
                <label className="text-xs font-medium">Temporary password
                  <div className="mt-1 flex gap-1.5"><Input value={pw} onChange={(e) => setPw(e.target.value)} className="font-mono" />
                    <Button type="button" variant="outline" size="icon" onClick={() => setPw(generateTempPassword())} aria-label="New password"><KeyRound className="h-4 w-4" /></Button></div></label>
                <Button disabled={busy || !email.trim()} onClick={() => void (async () => {
                  setBusy(true);
                  try { await actions.createMember({ name, email, sender_email: sender.trim() || email, password: pw }); setMade(true); }
                  catch (e) { toast({ title: 'Not created', description: edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(false); }
                })()}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}Create login</Button>
              </div>
            )}
          </SubSection>
        </CardContent></Card>
      )}
    </div>
  );
}
