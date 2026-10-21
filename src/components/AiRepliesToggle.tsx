import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { AiDraftOutcomes } from '@/components/AiDraftOutcomes';

/* "AI HANDLES REPLIES" — the on/off switch (2026-10-11, Paul). Default OFF. Admin only: a non-admin's read is
   refused and the switch stays hidden. It lives beside "When a prospect replies" because that is where the reply
   automation already lives (there is no Settings page).
   ⛔ ON ALONE NEVER MEANS SENDING. On = a draft is written for each new WhatsApp reply and waits for a person to press
   Approve & send. Replies from before it was switched on are never drafted.
   LEVEL 2 (2026-10-21): a reply type switched on under Draft outcomes → "Sends by itself" (all off when shipped) may go
   on its own (src/lib/aiAutoSend.ts). This switch is the MASTER kill switch: off cancels every automatic reply waiting. */
export function AiRepliesToggle() {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [on, setOn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    invokeEdge<{ ok: true; enabled: boolean }>('ai-reply-drafts', { action: 'settings' })
      .then((r) => { if (live) { setOn(r.enabled === true); setVisible(true); } })
      .catch(() => { /* not an admin, or not deployed yet: stay hidden */ });
    return () => { live = false; };
  }, []);

  if (!visible) return null;

  const flip = async (next: boolean) => {
    setSaving(true);
    const prev = on;
    setOn(next);
    try {
      const r = await invokeEdge<{ ok: true; enabled: boolean }>('ai-reply-drafts', { action: 'set_enabled', enabled: next });
      setOn(r.enabled === true);
      toast({
        title: r.enabled ? 'AI handles replies: on' : 'AI handles replies: off',
        description: r.enabled
          ? 'New WhatsApp replies get a draft marked "Needs approving". Only the reply types switched on under Draft outcomes → Sends by itself go out on their own; everything else waits for Approve & send.'
          : 'No new drafts will be written, and any automatic reply still waiting was cancelled. Drafts already waiting stay until they are sent or discarded.',
      });
    } catch (e) {
      setOn(prev);
      toast({ title: "Couldn't change AI handles replies", description: edgeErrorMessage(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
    <label className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-muted-foreground"
      title="When on, each new WhatsApp reply gets an AI draft to approve. Only reply types switched on under Draft outcomes send by themselves. Off stops everything.">
      <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
      AI handles replies
      <Switch checked={on} disabled={saving} onCheckedChange={(v) => void flip(v)} aria-label="AI handles replies" data-testid="ai-replies-switch" />
    </label>
    {/* What happened to each draft (admin only, like the switch). */}
    <AiDraftOutcomes />
    </div>
  );
}
