/* Find Leads: which results are already in the CRM, asked for the results on screen only (2026-10-13).
   The rules and the batching are in src/lib/findLeadsCrmMatch.ts; this hook runs the lookup when the
   results change, re-asks after anything on the page adds or removes a lead, and shows an add or a
   removal made here at once (a lookup that started before it cannot undo it). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { errorMessageOf } from '@/lib/leadLoadError';
import { isFreshLead } from '@/lib/leadStatus';
import {
  crmMatchSelect, lookupCrmMatches, sortNewestFirst, withLocalChanges, crmMatchFor, inOutreachFor,
  type CrmMatchIndex, type CrmMatchRow, type CrmState, type HistoryMatchRow, type ResultIdentity,
} from '@/lib/findLeadsCrmMatch';
import type { Lead } from '@/types/lead';
import type { OutreachLead } from '@/types/outreach';

/** Window events that mean a lead was added, removed or changed somewhere on this page. */
const REFRESH_EVENTS = ['crm-lead-added', 'crm-lead-purged', 'sales-lead-changed', 'lead-row-changed'] as const;

export interface FindLeadsCrmStats { rows: number; requests: number; ms: number }

export function useFindLeadsCrm(results: readonly Lead[], role: 'admin' | 'sales' | null | undefined) {
  const { toast } = useToast();
  const [fetched, setFetched] = useState<CrmMatchIndex>({ leads: [], history: [] });
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [stats, setStats] = useState<FindLeadsCrmStats | null>(null);
  /* Adds and removals made on this page, each with the time it finished. A lookup that STARTED after
     that time has seen it, so it is dropped once such a lookup lands. */
  const [added, setAdded] = useState<Array<{ row: CrmMatchRow; at: number }>>([]);
  const [removed, setRemoved] = useState<Array<{ id: string; at: number }>>([]);
  const genRef = useRef(0);
  const [tick, setTick] = useState(0);

  const identities = useMemo<ResultIdentity[]>(
    () => results.map((l) => ({ id: l.id, name: l.name, googleMapsUrl: l.googleMapsUrl ?? null })),
    [results],
  );
  const sig = useMemo(() => identities.map((r) => `${r.id}|${r.googleMapsUrl ?? ''}|${r.name}`).join('\n'), [identities]);

  useEffect(() => {
    if (!role || identities.length === 0) { setStatus('idle'); return; }
    const gen = ++genRef.current;
    const startedAt = Date.now();
    setStatus('loading');
    const src = leadSourceFor(role);
    const select = crmMatchSelect(role);
    type Q = { select: (s: string) => { or: (f: string) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null; error: unknown }> } } };
    const sb = supabase as unknown as { from: (t: string) => Q };
    void lookupCrmMatches(identities, {
      leads: async (or) => {
        const { data, error } = await sb.from(src.table).select(select).or(or).limit(1000);
        if (error) throw error;
        return (data ?? []) as CrmMatchRow[];
      },
      history: async (or) => {
        const { data, error } = await sb.from('outreach_history').select('business_name, google_maps_url').or(or).limit(1000);
        if (error) throw error;
        return (data ?? []) as HistoryMatchRow[];
      },
    }).then((res) => {
      if (gen !== genRef.current) return;
      setFetched({ leads: sortNewestFirst(res.leads), history: res.history });
      setAdded((prev) => prev.filter((a) => a.at > startedAt));
      setRemoved((prev) => prev.filter((r) => r.at > startedAt));
      setStats({ rows: res.leads.length + res.history.length, requests: res.requests, ms: Date.now() - startedAt });
      setStatus('ready');
    }).catch((e) => {
      if (gen !== genRef.current) return;
      console.error('Find Leads: the already-added check failed:', e);
      setStatus('failed');
      toast({
        title: 'Could not check which results are already added',
        description: `The "In CRM" markers may be missing. Add to CRM still checks for duplicates before saving. (Detail: ${errorMessageOf(e)})`,
        variant: 'destructive',
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, role, tick]);

  /* Re-ask after anything on the page adds, removes or changes a lead. Coalesced: a bulk add of 20
     fires 20 events and asks once. */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => setTick((n) => n + 1), 400); };
    for (const ev of REFRESH_EVENTS) window.addEventListener(ev, bump);
    return () => { if (t) clearTimeout(t); for (const ev of REFRESH_EVENTS) window.removeEventListener(ev, bump); };
  }, []);

  const index = useMemo(
    () => withLocalChanges(fetched, added.map((a) => a.row), new Set(removed.map((r) => r.id))),
    [fetched, added, removed],
  );

  const getCrmState = useCallback((lead: Lead): CrmState => {
    const match = crmMatchFor({ id: lead.id, name: lead.name, googleMapsUrl: lead.googleMapsUrl ?? null }, index);
    if (!match) return { inCrm: false, isFresh: false, crmLeadId: null, campaignId: null };
    return { inCrm: true, isFresh: isFreshLead(match as Partial<OutreachLead>), crmLeadId: match.id, campaignId: match.campaign_id ?? null };
  }, [index]);

  const isInOutreach = useCallback((name: string, googleMapsUrl?: string) => inOutreachFor(name, googleMapsUrl, index), [index]);

  /** A result just added: shown as in the CRM at once, keyed by the result's own place id / Maps link / name. */
  const noteAdded = useCallback((lead: Lead, row: Partial<OutreachLead> | null | undefined, campaignId: string | null) => {
    if (!row?.id) return;
    const r: CrmMatchRow = {
      id: String(row.id),
      business_name: lead.name,
      google_maps_url: lead.googleMapsUrl ?? null,
      place_id: lead.id || null,
      campaign_id: row.campaign_id ?? campaignId ?? null,
      is_archived: false,
      created_at: new Date().toISOString(),
      // A new lead has no Next Action (absent reads as none in isFreshLead); this row is display-only.
      status: row.status ?? 'not_contacted',
    };
    setAdded((prev) => [...prev.filter((a) => a.row.id !== r.id), { row: r, at: Date.now() }]);
    setRemoved((prev) => prev.filter((x) => x.id !== r.id));
  }, []);

  /** A lead just removed here: unmarked at once. */
  const noteRemoved = useCallback((leadId: string) => {
    setRemoved((prev) => [...prev.filter((x) => x.id !== leadId), { id: leadId, at: Date.now() }]);
    setAdded((prev) => prev.filter((a) => a.row.id !== leadId));
  }, []);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return { getCrmState, isInOutreach, noteAdded, noteRemoved, refresh, status, stats };
}
