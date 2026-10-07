import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cleanCloseEmail, CLOSE_EMAIL_INVALID_TEXT } from '@/lib/closeEmail';

/* The "Email the link" control for BOTH close routes (Agreement & Payment, Full Setup).
   ⛔ It only ever shows or sends to the CUSTOMER's email (src/lib/closeEmail.ts). With none on file it asks for one right
   here — it never falls back to the salesperson's or Paul's address. Email is optional: WhatsApp and Copy sit beside it
   and work without one. Saving writes the lead's own email field (quick-close mode save_email), so the same address
   shows everywhere. */
export function CustomerEmailControl({ email, busy, onSave, onSend, testId }: {
  /** The saved customer email (server-resolved), or null. */
  email: string | null;
  busy: string | null;
  /** Save the typed address; resolves true when it is stored (the screen then re-renders with it). */
  onSave: (email: string) => Promise<boolean>;
  onSend: () => void;
  testId: string;
}) {
  const [draft, setDraft] = useState('');
  const [changing, setChanging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const asking = !email || changing;
  const save = async () => {
    const c = cleanCloseEmail(draft);
    if (!c.ok) { setErr(CLOSE_EMAIL_INVALID_TEXT); return; }
    setErr(null);
    if (await onSave(c.email)) { setDraft(''); setChanging(false); }
  };
  const saving = busy === 'email-save';
  return (
    <div className="space-y-2" data-testid={testId}>
      {asking ? (
        <div data-testid={`${testId}-ask`}>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor={`${testId}-input`}>Customer email{!email && ' (optional — ask them, or use WhatsApp / copy)'}</label>
          <div className="mt-1 flex gap-2">
            <Input id={`${testId}-input`} type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" value={draft}
              onChange={(e) => { setDraft(e.target.value); setErr(null); }} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
              className="h-11 flex-1 text-sm" data-testid={`${testId}-input`} />
            <Button variant="outline" className="h-11 shrink-0" onClick={() => void save()} disabled={!draft.trim() || !!busy} data-testid={`${testId}-save`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save email'}
            </Button>
            {changing && <Button variant="ghost" className="h-11 shrink-0" onClick={() => { setChanging(false); setErr(null); setDraft(''); }}>Cancel</Button>}
          </div>
          {err && <p className="mt-1 text-xs text-destructive" role="alert" data-testid={`${testId}-error`}>{err}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-to`}>
          Email goes to <span className="font-semibold text-foreground">{email}</span>.{' '}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => { setChanging(true); setDraft(email ?? ''); }} data-testid={`${testId}-change`}>Change</button>
        </p>
      )}
      <Button variant="outline" className="h-12 w-full gap-1.5" onClick={onSend} disabled={!email || changing || !!busy} data-testid={`${testId}-send`}
        title={email ? `Emails the link to ${email}` : 'Add the customer’s email first, or use WhatsApp / copy'}>
        {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Email the link
      </Button>
    </div>
  );
}
