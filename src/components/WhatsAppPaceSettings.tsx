import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Callout } from '@/components/operator/ui';
import {
  DEFAULT_DAILY_CAP, DEFAULT_GAP_FLOOR_MIN, MAX_DAILY_CAP, MAX_GAP_FLOOR_MIN, MAX_PERSON_DAILY_LIMIT, checkPaceValue,
} from '@/lib/whatsappPace';

/* ══ THE WHATSAPP CAP, PACE AND PER-PERSON LIMITS — ADMIN ONLY (2026-10-14, test day) ═══════════════════════════
   Shown inside the WhatsApp queue panel only when the panel has team controls (the server refuses set_pace and the
   status read to anyone else). Every number is checked by the ONE rule (src/lib/whatsappPace.ts) here AND on the
   server; blank = the default. Sent today per person is the status read's own count (a queue send is credited to
   whoever holds the lead — the admin dashboard's rule). */

export interface PaceStatus {
  sentToday: number;
  cap: number;
  paused: boolean;
  pace?: { dailyCap: number; gapFloorMin: number; personDefault: number | null; maxDailyCap: number; stored?: { daily_cap: number | null; min_gap_minutes: number | null } };
  autoPausedAt?: string | null;
  autoPauseReason?: string | null;
  perPersonToday?: Array<{ user_id: string | null; name: string; sent: number }> | null;
  personLimits?: Array<{ user_id: string; name: string; limit: number | null }> | null;
}

const asText = (n: number | null | undefined) => (n == null ? '' : String(n));

export function WhatsAppPaceSettings({ team, onSaved }: { team: PaceStatus | null; onSaved: () => Promise<void> | void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cap, setCap] = useState('');
  const [gap, setGap] = useState('');
  const [personDefault, setPersonDefault] = useState('');
  const [people, setPeople] = useState<Record<string, string>>({});

  // Fill the form from the server each time it opens (never from a stale edit).
  useEffect(() => {
    if (!open || !team?.pace) return;
    setCap(asText(team.pace.stored?.daily_cap ?? null));
    setGap(asText(team.pace.stored?.min_gap_minutes ?? null));
    setPersonDefault(asText(team.pace.personDefault));
    setPeople(Object.fromEntries((team.personLimits ?? []).map((p) => [p.user_id, asText(p.limit)])));
  }, [open, team?.pace, team?.personLimits]);

  if (!team) return null;
  const perPerson = team.perPersonToday ?? null;

  const save = async () => {
    const checks = [
      ['Daily cap', checkPaceValue('daily_cap', cap)],
      ['Minutes between sends', checkPaceValue('min_gap_minutes', gap)],
      ['Default per-person limit', checkPaceValue('person_daily_limit_default', personDefault)],
      ...Object.entries(people).map(([, v]) => ['A person’s limit', checkPaceValue('person_limit', v)] as const),
    ] as const;
    const bad = checks.find(([, c]) => !c.ok);
    if (bad) { toast({ title: `${bad[0]} is out of range`, description: 'Use a whole number in the range shown, or leave it blank for the default.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const body = {
        mode: 'set_pace',
        daily_cap: cap.trim() === '' ? null : Number(cap),
        min_gap_minutes: gap.trim() === '' ? null : Number(gap),
        person_daily_limit_default: personDefault.trim() === '' ? null : Number(personDefault),
        person_limits: Object.entries(people).map(([user_id, v]) => ({ user_id, limit: v.trim() === '' ? null : Number(v) })),
      };
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body });
      if (error) throw error;
      if (!data?.ok) throw new Error(String(data?.error ?? 'refused'));
      toast({ title: 'WhatsApp limits saved', description: 'They apply from the next queue tick.' });
      await onSaved();
    } catch (e) {
      toast({ title: 'Limits not saved', description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-2 space-y-2" data-testid="queue-pace">
      {team.paused && team.autoPauseReason && (
        <Callout tone="red" icon={AlertTriangle} className="px-3 py-2 text-[11px]" testId="queue-auto-paused">
          <strong>The queue paused itself.</strong> {team.autoPauseReason}
        </Callout>
      )}
      {perPerson && perPerson.length > 0 && (
        <p className="text-[11px] text-muted-foreground" data-testid="queue-per-person">
          <span className="font-medium text-foreground/80">Sent today: </span>
          {perPerson.map((p) => `${p.name} ${p.sent}`).join(' · ')}
        </p>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground" data-testid="queue-pace-toggle">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Limits: {team.pace?.dailyCap ?? team.cap} a day for the team · at least {team.pace?.gapFloorMin ?? DEFAULT_GAP_FLOOR_MIN} min apart
        {team.pace?.personDefault != null ? ` · ${team.pace.personDefault} a day per salesperson` : ''}
      </button>
      {open && (
        <div className="rounded-xl bg-muted/30 p-3 ring-1 ring-inset ring-border/40 space-y-3 text-xs" data-testid="queue-pace-form">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Team daily cap (0–{MAX_DAILY_CAP})</span>
              <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" placeholder={`Default ${DEFAULT_DAILY_CAP}`} data-testid="pace-cap" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Minutes between sends (1–{MAX_GAP_FLOOR_MIN})</span>
              <Input value={gap} onChange={(e) => setGap(e.target.value)} inputMode="numeric" placeholder={`Default ${DEFAULT_GAP_FLOOR_MIN}`} data-testid="pace-gap" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Per salesperson a day (default)</span>
              <Input value={personDefault} onChange={(e) => setPersonDefault(e.target.value)} inputMode="numeric" placeholder="No limit" data-testid="pace-person-default" />
            </label>
          </div>
          {(team.personLimits ?? []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-muted-foreground">Per-person override (leads each salesperson can queue for WhatsApp a day; blank = the default, 0–{MAX_PERSON_DAILY_LIMIT})</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(team.personLimits ?? []).map((p) => (
                  <label key={p.user_id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate">{p.name}</span>
                    <Input value={people[p.user_id] ?? ''} onChange={(e) => setPeople((m) => ({ ...m, [p.user_id]: e.target.value }))} inputMode="numeric" placeholder="Default" className="h-8" />
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            One WhatsApp number sends for the whole team. Meta limits how many new people a number may message in 24 hours by its messaging tier;
            {' '}the cap can never go above {MAX_DAILY_CAP}. If the number is still on the 250 starter tier in Meta, set the cap to 250 or less.
            {' '}The queue sends at most one message a minute between 7:00 and 21:30, so about 800 is the most it can reach in a day.
          </p>
          <div className="flex justify-end">
            <Button size="sm" className="h-8 text-xs" onClick={() => void save()} disabled={saving} data-testid="pace-save">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save limits'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
