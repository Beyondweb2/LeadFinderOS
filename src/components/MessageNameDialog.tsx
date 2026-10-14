import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { mustChangePassword } from '@/lib/teamAccounts';
import {
  cleanMessageName, emailLocalPart, hasChosenMessageName, MESSAGE_NAME_MAX, MESSAGE_NAME_PROBLEM_WORDS,
  messageNameProblem, messageNameSkipKey,
} from '@/lib/messageName';

/** Open the box from anywhere (the account menu): `window.dispatchEvent(new Event(OPEN_MESSAGE_NAME_EVENT))`. */
export const OPEN_MESSAGE_NAME_EVENT = 'open-message-name';

// The table's generated types predate message_name; read and write it through a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* THE NAME ON YOUR MESSAGES (2026-10-14, src/lib/messageName.ts). ONE small box, the first time a person signs in
   (after any temporary-password change — ProtectedRoute sends them there first), then editable from the account menu.
   ⛔ Not onboarding: one field, nothing else asked. Skipped → the first part of their own email is used and the box
   asks again at the next login (a sessionStorage mark, so it does not nag inside one sign-in). */
export function MessageNameDialog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = user?.id ?? null;
  const fallback = emailLocalPart(user?.email);
  const mustChange = mustChangePassword(user);

  useEffect(() => {
    if (!uid || mustChange) return;
    let alive = true;
    (async () => {
      const { data, error: e } = await sb.from('profiles').select('message_name').eq('user_id', uid).maybeSingle();
      if (!alive || e) return; // unreadable → never block the app with a box
      const name = (data?.message_name as string | null) ?? null;
      setSaved(name);
      let skipped = false;
      try { skipped = sessionStorage.getItem(messageNameSkipKey(uid)) === '1'; } catch { /* ignore */ }
      if (!hasChosenMessageName(name) && !skipped) { setEditing(false); setValue(''); setOpen(true); }
    })();
    return () => { alive = false; };
  }, [uid, mustChange]);

  useEffect(() => {
    const onOpen = () => { setEditing(true); setValue(saved ?? ''); setError(null); setOpen(true); };
    window.addEventListener(OPEN_MESSAGE_NAME_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MESSAGE_NAME_EVENT, onOpen);
  }, [saved]);

  if (!uid) return null;

  const skip = () => {
    if (!editing) { try { sessionStorage.setItem(messageNameSkipKey(uid), '1'); } catch { /* ignore */ } }
    setOpen(false);
  };

  const save = async () => {
    const p = messageNameProblem(value);
    if (p) { setError(MESSAGE_NAME_PROBLEM_WORDS[p]); return; }
    const name = cleanMessageName(value);
    setSaving(true);
    const patch = { message_name: name, message_name_set_at: new Date().toISOString() };
    const { data, error: e } = await sb.from('profiles').update(patch).eq('user_id', uid).select('user_id');
    let failed = e;
    if (!failed && (!data || data.length === 0)) {
      const ins = await sb.from('profiles').insert({ user_id: uid, ...patch });
      failed = ins.error;
    }
    setSaving(false);
    if (failed) { setError('Could not save just now. Try again.'); return; }
    setSaved(name);
    setOpen(false);
    toast({ title: 'Saved', description: `Your messages will be signed “${name}”.` });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) skip(); }}>
      <DialogContent className="sm:max-w-sm" data-testid="message-name-dialog">
        <DialogHero icon={PenLine} tone="blue" title="What name should we use on your messages?"
          subtitle="It goes at the end of WhatsApp messages you send, so the business knows who to reply to. You can change it later in your account menu." />
        <div className="space-y-1.5">
          <Input autoFocus value={value} maxLength={MESSAGE_NAME_MAX} placeholder={fallback ? `e.g. ${fallback}` : 'Your first name'}
            aria-label="Name on your messages" data-testid="message-name-input"
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          {error ? <p className="text-xs text-destructive">{error}</p>
            : !editing && fallback ? <p className="text-xs text-muted-foreground">If you skip, we use “{fallback}” for now and ask again next time you log in.</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={skip}>{editing ? 'Cancel' : 'Skip for now'}</Button>
          <Button size="sm" disabled={saving} onClick={() => void save()} data-testid="message-name-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
