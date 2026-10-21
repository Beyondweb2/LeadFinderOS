import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseVisibleRule, VISIBLE_RULES, VISIBLE_RULE_LABELS, type VisibleRule } from '@/lib/visibleFlag';

/* THE VISIBLE RULE (2026-10-21, Paul) — one small select in Inbox Settings: when is a lead marked Visible (AI already names it, so no
   pitch, no Needs you, its follow-ups cancelled)? Rules: src/lib/visibleFlag.ts. Default: Gemini or Google AI names them in the
   newest audit's answer. Admin only (set_inbox_visible_rule refuses anyone else). The ai-reply-drafts tick re-judges the leads
   within a few minutes of a change. */
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);

export function InboxVisibleRuleControl() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [rule, setRule] = useState<VisibleRule | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    rpc('inbox_visible_rule').then(({ data, error }) => { if (live && !error) setRule(parseVisibleRule(data)); });
    return () => { live = false; };
  }, []);

  if (rule === null) return null;

  const pick = async (v: string) => {
    const next = parseVisibleRule(v);
    if (next === rule) return;
    const prev = rule;
    setRule(next); setSaving(true);
    const { error } = await rpc('set_inbox_visible_rule', { p_rule: next });
    setSaving(false);
    if (error) {
      setRule(prev);
      toast({ title: "Couldn't change the Visible rule", description: error.message ?? 'Try again.', variant: 'destructive' });
      return;
    }
    void qc.invalidateQueries({ queryKey: ['inbox'] });
    toast({ title: `Visible: ${VISIBLE_RULE_LABELS[next]}`, description: 'Leads are re-checked within a few minutes.' });
  };

  return (
    <div className="flex items-center justify-between gap-3" data-testid="visible-rule-control">
      <p className="text-xs text-muted-foreground">Mark a lead <span className="font-medium text-foreground">Visible</span> when its newest audit shows:</p>
      <Select value={rule} onValueChange={pick} disabled={saving}>
        <SelectTrigger className="h-8 w-[230px] shrink-0 text-xs" aria-label="Visible rule"><SelectValue /></SelectTrigger>
        <SelectContent>
          {VISIBLE_RULES.map((r) => <SelectItem key={r} value={r} className="text-xs">{VISIBLE_RULE_LABELS[r]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
