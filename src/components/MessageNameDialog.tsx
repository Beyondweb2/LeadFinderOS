import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { MY_MESSAGE_NAME_KEY } from '@/hooks/useMyMessageName';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { mustChangePassword } from '@/lib/teamAccounts';
import {
  cleanMessageName, hasChosenMessageName, MESSAGE_NAME_MAX, MESSAGE_NAME_PROBLEM_WORDS,
  messageNameProblem,
} from '@/lib/messageName';

/** Open the box from anywhere (the account menu): `window.dispatchEvent(new Event(OPEN_MESSAGE_NAME_EVENT))`. */
export const OPEN_MESSAGE_NAME_EVENT = 'open-message-name';

// The table's generated types predate message_name; read and write it through a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* THE NAME ON YOUR MESSAGES (2026-10-14, src/lib/messageName.ts). ONE small box, the first time a person signs in
   (after any temporary-password change — ProtectedRoute sends them there first), then editable from the account menu.
   ⛔ Not onboarding: one field, nothing else asked.
   ⛔ REQUIRED (Paul, 2026-10-26): the first-time box cannot be skipped or closed until a name is saved — the hook message is
   signed with it (hookSignature.ts). Editing later from the account menu can be cancelled. An unreadable profile never
   blocks the app (no box); the sender then refuses to sign a hook with no name.
   ⛔ PAUL APPROVES A SALESPERSON'S NAME (2026-10-27, migration 20261128100000): a non-admin's save goes to
   message_name_pending and is used on messages only after Paul approves it on the Team page (the database enforces it). */
export function MessageNameDialog() {
  const { user } = useAuth();
  const { role } = useSubscription();
  const [waiting, setWaiting] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = user?.id ?? null;
  const mustChange = mustChangePassword(user);

  useEffect(() => {
    if (!uid || mustChange) return;
    let alive = true;
    (async () => {
      const { data, error: e } = await sb.from('profiles').select('message_name, message_name_pending').eq('user_id', uid).maybeSingle();
      if (!alive || e) return; // unreadable → never block the app with a box
      const name = (data?.message_name as string | null) ?? null;
      const pend = (data?.message_name_pending as string | null) ?? null;
      setSaved(name);
      setWaiting(hasChosenMessageName(pend) ? pend : null);
      /* A name waiting for approval counts as chosen: the first-time box does not ask again. */
      if (!hasChosenMessageName(name) && !hasChosenMessageName(pend)) { setEditing(false); setValue(''); setOpen(true); }
    })();
    return () => { alive = false; };
  }, [uid, mustChange]);

  useEffect(() => {
    const onOpen = () => { setEditing(true); setValue(waiting ?? saved ?? ''); setError(null); setOpen(true); };
    window.addEventListener(OPEN_MESSAGE_NAME_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MESSAGE_NAME_EVENT, onOpen);
  }, [saved, waiting]);
  const needsApproval = role !== 'admin';

  if (!uid) return null;

  /* Only an edit from the account menu can be cancelled; the first-time box stays until a name is saved. */
  const cancel = () => { if (editing) setOpen(false); };
  const required = !editing;

  const save = async () => {
    const p = messageNameProblem(value);
    if (p) { setError(MESSAGE_NAME_PROBLEM_WORDS[p]); return; }
    const name = cleanMessageName(value);
    setSaving(true);
    const now = new Date().toISOString();
    const patch = needsApproval ? { message_name_pending: name, message_name_pending_at: now } : { message_name: name, message_name_set_at: now };
    const { data, error: e } = await sb.from('profiles').update(patch).eq('user_id', uid).select('user_id');
    let failed = e;
    if (!failed && (!data || data.length === 0)) {
      const ins = await sb.from('profiles').insert({ user_id: uid, ...patch });
      failed = ins.error;
    }
    setSaving(false);
    if (failed) { setError('Could not save just now. Try again.'); return; }
    if (needsApproval) setWaiting(name); else setSaved(name);
    void qc.invalidateQueries({ queryKey: MY_MESSAGE_NAME_KEY });
    setOpen(false);
    toast(needsApproval
      ? { title: 'Sent to Paul to approve', description: `Your messages will be signed “${name}” once Paul approves it.` }
      : { title: 'Saved', description: `Your messages will be signed “${name}”.` });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="sm:max-w-sm" data-testid="message-name-dialog" hideClose={required}
        onEscapeKeyDown={(e) => { if (required) e.preventDefault(); }} onPointerDownOutside={(e) => { if (required) e.preventDefault(); }}
        onInteractOutside={(e) => { if (required) e.preventDefault(); }}>
        <DialogHero icon={PenLine} tone="blue" title="What name should we use on your messages?"
          subtitle="It goes at the end of WhatsApp messages you send, so the business knows who to reply to. You can change it later in your account menu." />
        <div className="space-y-1.5">
          <Input autoFocus value={value} maxLength={MESSAGE_NAME_MAX} placeholder="Your first name, e.g. Sam"
            aria-label="Name on your messages" data-testid="message-name-input"
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
          {error ? <p className="text-xs text-destructive">{error}</p>
            : required ? <p className="text-xs text-muted-foreground">Needed before you start: the first message to a business ends with this name.{needsApproval ? ' Paul approves it before it is used.' : ''}</p> : null}
          {!error && editing && needsApproval && (
            <p className="text-xs text-muted-foreground" data-testid="message-name-approval-note">
              {waiting ? `“${waiting}” is waiting for Paul's approval.` : 'Paul approves a new name before it is used.'}{saved ? ` Until then your messages are signed “${saved}”.` : ''}
            </p>
          )}
        </div>
        <DialogFooter>
          {editing && <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>}
          <Button size="sm" disabled={saving} onClick={() => void save()} data-testid="message-name-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
