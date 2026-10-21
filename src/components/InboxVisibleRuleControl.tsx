import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  parseVisibleRule, parseVisibleShare, VISIBLE_RULES, VISIBLE_RULE_LABELS, VISIBLE_SHARES, VISIBLE_SHARE_LABELS, type VisibleRule, type VisibleShare,
} from '@/lib/visibleFlag';

/* THE VISIBLE RULE (2026-10-21, Paul) — two small selects in Inbox Settings: WHICH engines (Gemini or Google AI / both / off) and HOW
   OFTEN each must name the business in its own answers (more than half by default). Rules: src/lib/visibleFlag.ts. Admin only
   (set_inbox_visible_rule / set_inbox_visible_threshold refuse anyone else). The ai-reply-drafts tick re-judges the leads within a
   few minutes of a change. */
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

export function InboxVisibleRuleControl() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rule, setRule] = useState<VisibleRule | null>(null);
  const [share, setShare] = useState<VisibleShare>('half');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    rpc('inbox_visible_settings').then(({ data, error }) => {
      if (!live || error || !data || typeof data !== 'object') return;
      const d = data as { rule?: unknown; min_share?: unknown };
      setRule(parseVisibleRule(d.rule)); setShare(parseVisibleShare(d.min_share));
    });
    return () => { live = false; };
  }, []);

  if (rule === null) return null;

  const save = async (fn: string, args: Record<string, unknown>, undo: () => void, title: string) => {
    setSaving(true);
    const { error } = await rpc(fn, args);
    setSaving(false);
    if (error) {
      undo();
      toast({ title: "Couldn't change the Visible rule", description: error.message ?? 'Try again.', variant: 'destructive' });
      return;
    }
    void qc.invalidateQueries({ queryKey: ['inbox'] });
    toast({ title, description: 'Leads are re-checked within a few minutes.' });
  };
  const pickRule = (v: string) => {
    const next = parseVisibleRule(v); if (next === rule) return;
    const prev = rule; setRule(next);
    void save('set_inbox_visible_rule', { p_rule: next }, () => setRule(prev), `Visible: ${VISIBLE_RULE_LABELS[next]}`);
  };
  const pickShare = (v: string) => {
    const next = parseVisibleShare(v); if (next === share) return;
    const prev = share; setShare(next);
    void save('set_inbox_visible_threshold', { p_share: next }, () => setShare(prev), `Visible: named ${VISIBLE_SHARE_LABELS[next]}`);
  };

  return (
    <div className="space-y-2" data-testid="visible-rule-control">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Mark a lead <span className="font-medium text-foreground">Visible</span> when its newest audit shows:</p>
        <Select value={rule} onValueChange={pickRule} disabled={saving}>
          <SelectTrigger className="h-8 w-[230px] shrink-0 text-xs" aria-label="Visible rule"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VISIBLE_RULES.map((r) => <SelectItem key={r} value={r} className="text-xs">{VISIBLE_RULE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {rule !== 'off' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Each engine on its own, counting only its answers (ChatGPT ignored):</p>
          <Select value={share} onValueChange={pickShare} disabled={saving}>
            <SelectTrigger className="h-8 w-[230px] shrink-0 text-xs" aria-label="Visible threshold" data-testid="visible-threshold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VISIBLE_SHARES.map((s) => <SelectItem key={s} value={s} className="text-xs">{VISIBLE_SHARE_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
