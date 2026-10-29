import { useState } from 'react';
import { Loader2, MailPlus, MessageCircle, PowerOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, SubSection, ToneChip } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { useUgcActions } from '@/hooks/useUgc';

/* UGC settings: the WhatsApp API slot (OFF) and, for the admin, Jess's invite. */

export function UgcSettingsPanel({ admin }: { admin: boolean }) {
  const actions = useUgcActions();
  const { toast } = useToast();
  const [name, setName] = useState('Jess Cousin');
  const [email, setEmail] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

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
          <SubSection title="Invite Jess" icon={MailPlus} tone="purple" hint="A UGC login: it opens this page only and has no LeadFinder role.">
            {sent ? <Callout tone="green" title="Invite sent">She gets an email to set her own password, then lands on this page.</Callout> : (
              <div className="grid gap-2">
                <label className="text-xs font-medium">Name<Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label className="text-xs font-medium">Her email (the invite goes here)<Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label className="text-xs font-medium">Gmail she sends pitches from (if different)<Input className="mt-1" type="email" value={sender} onChange={(e) => setSender(e.target.value)} /></label>
                <Button disabled={busy || !email.trim()} onClick={() => void (async () => {
                  setBusy(true);
                  try { await actions.inviteMember({ name, email, sender_email: sender.trim() || email }); setSent(true); }
                  catch (e) { toast({ title: 'Not sent', description: edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(false); }
                })()}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MailPlus className="mr-1 h-4 w-4" />}Send invite email</Button>
              </div>
            )}
          </SubSection>
        </CardContent></Card>
      )}
    </div>
  );
}
