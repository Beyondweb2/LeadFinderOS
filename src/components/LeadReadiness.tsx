import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Callout, ToneChip } from '@/components/operator/ui';
import { supabase } from '@/integrations/supabase/client';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import {
  readinessHeadline, readinessLines, type LeadReadiness, type ReadinessFix, type ReadinessSummary,
} from '@/lib/leadReadiness';

/* ══ LEAD READINESS ON SCREEN (2026-10-15) — the rules are src/lib/leadReadiness.ts; this only draws them.
   · ReadinessSummary — "X ready, Y need something", grouped by what is missing, with the names (add / import / audit).
   · NeedsInfoTag — the lead list / Inbox tag: tooltip lists exactly what is missing; a click opens the fix.
   · ReadinessFixDialog — the one-click edit: trade and town for every role (lead_set_details, role-checked);
     business name and phone for the admin (the admin's direct write, as the lead popup does). A salesperson is told
     to ask Paul for those two — their edits go through role-checked functions, and none sets a name or a phone. */

const MAX_NAMES = 8;
const nameList = (names: string[]) => names.length <= MAX_NAMES ? names.join(', ') : `${names.slice(0, MAX_NAMES).join(', ')} and ${names.length - MAX_NAMES} more`;

export function ReadinessSummaryBlock({ summary, testId = 'readiness-summary', onFixName, hideHeadline = false }: {
  summary: ReadinessSummary; testId?: string;
  /** The caller says the count itself (the bulk audit dialog's "N will be skipped"). */
  hideHeadline?: boolean;
  /** When given, a name in a fixable group is a button that opens its fix. */
  onFixName?: (name: string) => void;
}) {
  const total = summary.ready + summary.needs;
  if (total === 0) return null;
  return (
    <div className="space-y-1.5 text-xs" data-testid={testId}>
      {!hideHeadline && <p className="flex items-center gap-1.5 text-sm font-semibold">
        {summary.needs === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
        {readinessHeadline(summary)}
      </p>}
      {summary.groups.length > 0 && (
        <ul className="space-y-1">
          {summary.groups.map((g) => (
            <li key={g.key + g.words} className="rounded-md bg-amber-500/10 px-2 py-1">
              <span className="font-medium">{g.words}</span> <span className="text-muted-foreground">({g.names.length})</span>
              <span className="block text-muted-foreground">
                {onFixName && g.fix
                  ? g.names.slice(0, MAX_NAMES).map((n, i) => (
                    <span key={n}>{i > 0 && ', '}<button type="button" className="underline decoration-dotted hover:text-foreground" onClick={() => onFixName(n)}>{n}</button></span>
                  ))
                  : nameList(g.names)}
                {onFixName && g.fix && g.names.length > MAX_NAMES && ` and ${g.names.length - MAX_NAMES} more`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {summary.pending.length > 0 && (
        <ul className="space-y-0.5 text-muted-foreground">
          {summary.pending.map((g) => (
            <li key={g.key + g.words} className="flex items-start gap-1"><Clock className="mt-0.5 h-3 w-3 shrink-0" />{g.words}: {g.names.length}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Needs info" — only for what a person can fix on the lead (name, trade, town, phone). */
export function NeedsInfoTag({ readiness, onEdit, className }: { readiness: LeadReadiness; onEdit?: () => void; className?: string }) {
  if (readiness.needsInfo.length === 0) return null;
  const lines = readinessLines(readiness);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={className} data-testid="needs-info-tag"
          aria-label={`Needs info: ${readiness.needsInfo.map((i) => i.words).join('; ')}`}
          onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
          <ToneChip tone="amber" dot>Needs info</ToneChip>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <ul className="space-y-0.5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        {onEdit && <p className="mt-1 text-muted-foreground">Click to fix.</p>}
      </TooltipContent>
    </Tooltip>
  );
}

export interface FixableLead {
  id: string;
  business_name?: string | null;
  phone?: string | null;
  search_keyword?: string | null;
  search_location?: string | null;
}

/** The one-click edit. Saves only the fields that changed; never blanks one that was not touched. */
export function ReadinessFixDialog({ lead, fixes, isAdmin, open, onOpenChange, onSaved, save: pageSave }: {
  lead: FixableLead | null; fixes: ReadinessFix[]; isAdmin: boolean; open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (patch: Partial<FixableLead>) => void;
  /** The page's own lead save (useOutreach.updateLead: admin direct, a salesperson through planSalesPatch → lead_set_details).
   *  When given it is used for every field, so the page's list updates in place. */
  save?: (patch: Record<string, string>) => Promise<unknown>;
}) {
  const [v, setV] = useState({ name: '', phone: '', trade: '', town: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!lead) return;
    setV({ name: lead.business_name ?? '', phone: lead.phone ?? '', trade: lead.search_keyword ?? '', town: lead.search_location ?? '' });
    setErr(null);
  }, [lead?.id, open]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!lead) return null;
  const want = new Set(fixes.filter(Boolean));
  const save = async () => {
    setBusy(true); setErr(null);
    const patch: Partial<FixableLead> = {};
    try {
      if (pageSave) {
        const all: Record<string, string> = {};
        if (want.has('trade') && v.trade.trim() && v.trade.trim() !== (lead.search_keyword ?? '')) all.search_keyword = v.trade.trim();
        if (want.has('town') && v.town.trim() && v.town.trim() !== (lead.search_location ?? '')) all.search_location = v.town.trim();
        if (isAdmin && want.has('name') && v.name.trim() && v.name.trim() !== (lead.business_name ?? '')) all.business_name = v.name.trim();
        if (isAdmin && want.has('phone') && v.phone.trim() && v.phone.trim() !== (lead.phone ?? '')) all.phone = v.phone.trim();
        if (Object.keys(all).length) {
          const r = await pageSave(all);
          if (r === null || r === false) throw new Error('Could not save.');
          notifyLeadChanged(lead.id, 'readiness-fix', all);
        }
        onSaved?.(all as Partial<FixableLead>);
        onOpenChange(false);
        return;
      }
      const trade = v.trade.trim(), town = v.town.trim();
      if ((want.has('trade') && trade && trade !== (lead.search_keyword ?? '')) || (want.has('town') && town && town !== (lead.search_location ?? ''))) {
        const r = await leadRpc('lead_set_details', {
          _lead_id: lead.id, _contact_name: null,
          _search_keyword: want.has('trade') && trade ? trade : null,
          _search_location: want.has('town') && town ? town : null,
        });
        if (!r.ok) throw new Error(r.error === 'too_long' ? 'That is too long (200 characters at most).' : 'Could not save the trade / town.');
        if (want.has('trade') && trade) patch.search_keyword = trade;
        if (want.has('town') && town) patch.search_location = town;
      }
      if (isAdmin) {
        const upd: Record<string, string> = {};
        if (want.has('name') && v.name.trim() && v.name.trim() !== (lead.business_name ?? '')) upd.business_name = v.name.trim();
        if (want.has('phone') && v.phone.trim() && v.phone.trim() !== (lead.phone ?? '')) upd.phone = v.phone.trim();
        if (Object.keys(upd).length) {
          const { error } = await supabase.from('outreach_leads').update(upd as never).eq('id', lead.id);
          if (error) throw new Error('Could not save the name / phone.');
          Object.assign(patch, upd);
        }
      }
      if (Object.keys(patch).length) notifyLeadChanged(lead.id, 'readiness-fix', patch as Record<string, unknown>);
      onSaved?.(patch);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  const field = (key: 'name' | 'phone' | 'trade' | 'town', label: string, placeholder: string, adminOnly: boolean) => {
    if (!want.has(key)) return null;
    const locked = adminOnly && !isAdmin;
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Input value={v[key]} placeholder={placeholder} disabled={locked} onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))} data-testid={`fix-${key}`} />
        {locked && <p className="text-[11px] text-muted-foreground">Ask Paul to correct this one.</p>}
      </div>
    );
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fix {lead.business_name || 'this lead'}</DialogTitle>
          <DialogDescription>Fill in what is missing so the audit and messages can run.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {field('name', 'Business name', 'e.g. Ace Plumbing', true)}
          {field('trade', 'Trade', 'e.g. plumbers', false)}
          {field('town', 'Town', 'e.g. Rugby', false)}
          {field('phone', 'Phone (a mobile, for WhatsApp / texts)', 'e.g. 07700 900123', true)}
          {err && <Callout tone="red">{err}</Callout>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => { void save(); }} disabled={busy} data-testid="fix-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
