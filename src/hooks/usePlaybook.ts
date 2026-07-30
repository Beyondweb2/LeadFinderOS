import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  buildPlaybook,
  type EvidenceRow, type ListingRecord, type Playbook, type PlaybookLead,
} from '@/lib/buildPlaybook';
import { buildOwnCitations, type OwnCitations } from '@/lib/ownCitations';
import { aggregateSeoFindings, isRenderableSeo, SCORED_ENGINES, type QueueRow } from '@/lib/auditReport';
import type { AiAuditSeo } from '@/lib/aiAuditReportHtml';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * usePlaybook(id) — loads everything buildPlaybook needs and folds it.
 *
 * ID RESOLUTION IS AUDIT-FIRST, DELIBERATELY. ABLM is the only delivery client and has an ai_audits
 * row with NO outreach_leads row at all. Resolving as a lead first would 404 the one business this
 * page exists to serve, so the audit lookup goes first and the lead is optional enrichment.
 *
 * When there is no lead, the PlaybookLead is built from ai_audits: business_type carries the trade
 * and location_text the town. Those two columns are the whole reason a lead row is not required.
 *
 * client_listings is READ-ONLY here. The table exists with RLS on and nobody has confirmed the
 * logged-in operator can write to it, so a done/verified flag is displayed if present and never set.
 */

interface AuditRow {
  id: string;
  lead_id: string | null;
  business_name: string;
  business_type: string | null;
  location_text: string | null;
  website: string | null;
  business_address: string | null;
  business_phone: string | null;
}

interface LeadRow {
  id: string;
  business_name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  google_maps_url: string | null;
  place_id: string | null;
  search_keyword: string | null;
  search_location: string | null;
  category: string | null;
}

interface EvidenceResponse {
  evidence: EvidenceRow[];
  tradeAuditTotals: Record<string, number>;
}

export interface UsePlaybookResult {
  playbook: Playbook | null;
  /** What the engines cited when asked about THIS business. Null when the id resolved to a lead with
   *  no audit — there are no citations to read without an audit. */
  ownCitations: OwnCitations | null;
  /* THE REAL SEO SCAN for this audit's latest scanned run, or null when no scan has been run.
     Read straight off ai_audit_runs.results.seo — the SAME stored object the customer report renders,
     so the document cannot show a grade the report disagrees with.

     Findings go through aggregateSeoFindings, exactly as buildReportData does. The scan actor reports
     per CRAWLED PAGE, so a 3-page crawl emits "6 images without alt text", "5 images…" and "4 images…"
     as three separate findings of the same fault — Macca-Gas has precisely that. Printing them raw
     would pad the sheet with the same issue three times.

     NOT fed into buildPlaybook, deliberately. It changes no ranking, no priority and no task: it is a
     separately-charged add-on rendered in its own section. Website quality is measured NOT to be why a
     business goes unnamed, so letting it touch the fold would be wrong as well as unnecessary. */
  seo: AiAuditSeo | null;
  /* HOW OFTEN THE ENGINES NAMED THEM, for the document's summary line. Null when no question has
     completed. Derived by the SAME rule as the customer report (buildReportData:636-649): one
     datapoint per SCORED engine per DONE question, preferring the run's stored summary counts when
     present so the sheet and the report cannot disagree. */
  naming: { named: number; total: number } | null;
  /** Which row the id resolved to — printed on the page so the audit-first path is never a mystery. */
  resolvedAs: 'audit' | 'lead' | null;
  auditId: string | null;
  leadId: string | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

const AUDIT_COLS = 'id, lead_id, business_name, business_type, location_text, website, business_address, business_phone';
const LEAD_COLS = 'id, business_name, phone, website, address, google_maps_url, place_id, search_keyword, search_location, category';

/** A lead row's trade lives in search_keyword for ~20% of rows; category is the fallback. */
const leadTrade = (l: LeadRow) => (l.search_keyword ?? '').trim() || (l.category ?? '').trim() || null;

export function usePlaybook(id: string | undefined): UsePlaybookResult {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [ownCitations, setOwnCitations] = useState<OwnCitations | null>(null);
  const [seo, setSeo] = useState<AiAuditSeo | null>(null);
  const [naming, setNaming] = useState<{ named: number; total: number } | null>(null);
  const [resolvedAs, setResolvedAs] = useState<'audit' | 'lead' | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setIsLoading(false); setError('No id in the URL.'); return; }
    setIsLoading(true);
    setError(null);
    try {
      /* Untyped client: client_listings is not in the generated types, and the audit/lead selects
         only need the columns named above. Same cast Baseline.tsx uses. */
      const client = supabase as unknown as SupabaseClient;

      // 1. AUDIT FIRST — see the note at the top of this file.
      const { data: aRaw, error: aErr } = await client
        .from('ai_audits').select(AUDIT_COLS).eq('id', id).maybeSingle();
      if (aErr) throw aErr;
      const audit = (aRaw ?? null) as AuditRow | null;

      // 2. The lead: the audit's lead_id when we came in by audit, otherwise the id itself.
      const wantLeadId = audit ? audit.lead_id : id;
      let lead: LeadRow | null = null;
      if (wantLeadId) {
        const { data: lRaw, error: lErr } = await client
          .from('outreach_leads').select(LEAD_COLS).eq('id', wantLeadId).maybeSingle();
        /* A failed lead read must not kill an audit-resolved playbook — ABLM has no lead row and
           that is the normal case, not an error. */
        if (lErr && !audit) throw lErr;
        lead = (lRaw ?? null) as LeadRow | null;
      }

      if (!audit && !lead) {
        setError('No audit or lead with that id.');
        setPlaybook(null); setResolvedAs(null); setAuditId(null); setLeadId(null);
        return;
      }

      setResolvedAs(audit ? 'audit' : 'lead');
      setAuditId(audit?.id ?? null);
      setLeadId(lead?.id ?? null);

      /* THE FOLD'S INPUT. Lead fields win where present because they are enriched from Google Place
         Details; the audit fills the gaps and is the only source when there is no lead at all. */
      const pbLead: PlaybookLead = {
        id: lead?.id ?? audit?.id ?? id,
        business_name: lead?.business_name ?? audit?.business_name ?? null,
        phone: lead?.phone ?? audit?.business_phone ?? null,
        website: lead?.website ?? audit?.website ?? null,
        address: lead?.address ?? audit?.business_address ?? null,
        google_maps_url: lead?.google_maps_url ?? null,
        place_id: lead?.place_id ?? null,
        trade: (lead ? leadTrade(lead) : null) ?? audit?.business_type ?? null,
        town: (lead?.search_location ?? '').trim() || audit?.location_text || null,
      };

      // 3. Evidence — the edge function, because the fold needs SQL PostgREST cannot express.
      const { data: evRaw, error: evErr } = await client.functions
        .invoke<EvidenceResponse>('playbook-evidence', { body: {} });
      if (evErr) throw evErr;
      const evidence = Array.isArray(evRaw?.evidence) ? evRaw.evidence : [];
      const tradeAuditTotals = evRaw?.tradeAuditTotals ?? {};

      // 4. Anything already recorded, so a done task shows as done. Read-only.
      let listings: ListingRecord[] = [];
      const listingKey = lead?.id ?? audit?.lead_id ?? null;
      if (listingKey) {
        const { data: lsRaw } = await client
          .from('client_listings').select('host, done_at, verified_at, listing_url').eq('lead_id', listingKey);
        listings = (lsRaw ?? []) as ListingRecord[];
      }

      setPlaybook(buildPlaybook(pbLead, evidence, tradeAuditTotals, listings));

      /* 5. THIS AUDIT'S OWN CITATIONS — a second, sharper signal alongside the trade fold, never a
         replacement for it. Only possible when the id resolved to an audit: without one there are no
         answers to read. Paginated, because ai_audit_queue is questions x runs and PostgREST
         truncates at db-max-rows silently — a short page here would quietly shrink a host's count. */
      if (audit) {
        const { rows: qRows } = await fetchAllRows<QueueRow>('Playbook (own citations)', (from, to) =>
          client.from('ai_audit_queue')
            .select('id, question, status, result')
            .eq('audit_id', audit.id)
            .order('id', { ascending: true })
            .range(from, to));
        setOwnCitations(buildOwnCitations(qRows, pbLead.business_name ?? ''));

        /* 6. THE SEO SCAN, if one has ever been run for this audit. Newest run first, and the first
           one carrying a RENDERABLE scan wins — a later run without a scan must not blank a scan an
           earlier run produced. isRenderableSeo is the report's own guard (needs both category
           grades), so a half-written or failed scan object is treated as no scan at all rather than
           rendering an empty grade box. Failure here is non-fatal: the document simply omits the
           section, because a missing add-on must never cost the operator the directory list. */
        try {
          const { data: runRows } = await client
            .from('ai_audit_runs').select('id, results, created_at')
            .eq('audit_id', audit.id).order('created_at', { ascending: false });
          const rows = (runRows ?? []) as Array<{ results?: { seo?: unknown; summary?: { named_datapoints?: number; total_datapoints?: number } } | null }>;
          const withSeo = rows.map((r) => r.results?.seo).find((s) => isRenderableSeo(s));
          setSeo(withSeo
            ? { ...(withSeo as AiAuditSeo), leadFindings: aggregateSeoFindings((withSeo as AiAuditSeo).leadFindings ?? []) }
            : null);

          /* Stored summary counts win, exactly as buildReportData prefers them; otherwise count live
             off the queue rows already fetched above. One datapoint per SCORED engine per DONE row. */
          const stored = rows.map((r) => r.results?.summary)
            .find((s) => typeof s?.named_datapoints === 'number' && typeof s?.total_datapoints === 'number');
          if (stored) {
            setNaming({ named: stored.named_datapoints!, total: stored.total_datapoints! });
          } else {
            let n = 0, t = 0;
            for (const r of qRows) {
              if (r.status !== 'done' || !r.result) continue;
              for (const e of SCORED_ENGINES) { t++; if (r.result[e]?.named) n++; }
            }
            setNaming(t > 0 ? { named: n, total: t } : null);
          }
        } catch {
          setSeo(null);
          setNaming(null);
        }
      } else {
        setOwnCitations(null);
        setSeo(null);
        setNaming(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build that playbook.');
      setPlaybook(null);
      setOwnCitations(null);
      setSeo(null);
      setNaming(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { playbook, ownCitations, seo, naming, resolvedAs, auditId, leadId, isLoading, error, reload: load };
}
