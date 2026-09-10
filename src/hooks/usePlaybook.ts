import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  buildPlaybook,
  type EvidenceRow, type ListingRecord, type Playbook, type PlaybookLead,
} from '@/lib/buildPlaybook';
import { buildOwnCitations, type OwnCitations } from '@/lib/ownCitations';
import { directoryCheckFold, type DirectoryCheck } from '@/lib/directoryHosts';
import { aggregateSeoFindings, isRenderableSeo, SCORED_ENGINES, type QueueRow } from '@/lib/auditReport';
import type { AiAuditSeo } from '@/lib/aiAuditReportHtml';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { ClientAnswers } from '@/lib/clientRequestSelect';
import { questionnaireHeld } from '@/lib/clientHeld';

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
  /** The town Google says the business is IN. Behind the audit's resolved location_text, ahead of
   *  search_location — see the town precedence where pbLead is built. */
  derived_town: string | null;
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
  /* The newest stored directory check for this lead, or null when none has been run. Fetched HERE
     because the fold needs it — an already-listed host must stop being a task before any counter is
     computed. Null is meaningful: the document then says the check has not been run rather than
     letting the absence of markers imply a clean sweep. */
  directoryCheck: DirectoryCheck | null;
  /* THE CLIENT'S OWN ANSWERS — services and towns from the questionnaire. NOT part of the Playbook:
     that is the evidence fold (what citations say about a trade), and these are what the client told
     us. The page list is the product, so the client request sheet prints it back and asks for the
     facts that make each page specific.
     NULL when there is no onboarding row — a founder-offer payer reaches Stripe straight from the
     report, bypassing the questionnaire, so this is a real state rather than an error. The document
     then asks for the list instead of pretending to know it. */
  answers: ClientAnswers | null;
  /** Which row the id resolved to — printed on the page so the audit-first path is never a mystery. */
  resolvedAs: 'audit' | 'lead' | null;
  auditId: string | null;
  leadId: string | null;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

const AUDIT_COLS = 'id, lead_id, business_name, business_type, location_text, website, business_address, business_phone';
const LEAD_COLS = 'id, business_name, phone, website, address, google_maps_url, place_id, search_keyword, search_location, derived_town, category';

/** A lead row's trade lives in search_keyword for ~20% of rows; category is the fallback. */
const leadTrade = (l: LeadRow) => (l.search_keyword ?? '').trim() || (l.category ?? '').trim() || null;

/** One playbook load. Was eleven useState slots. */
interface PlaybookData {
  playbook: Playbook | null;
  ownCitations: OwnCitations | null;
  seo: AiAuditSeo | null;
  naming: { named: number; total: number } | null;
  directoryCheck: DirectoryCheck | null;
  answers: ClientAnswers | null;
  resolvedAs: 'audit' | 'lead' | null;
  auditId: string | null;
  leadId: string | null;
  /** Returned rather than thrown — see the note in the hook. */
  error: string | null;
}
/** Stable empty, so a pending or errored load has one identity rather than a new object each render. */
const EMPTY_PLAYBOOK: PlaybookData = {
  playbook: null, ownCitations: null, seo: null, naming: null, directoryCheck: null,
  answers: null, resolvedAs: null, auditId: null, leadId: null, error: null,
};

export function usePlaybook(id: string | undefined): UsePlaybookResult {
  const queryClient = useQueryClient();
  /* ⛔ ON REACT QUERY SINCE 2026-09-10. Seven reads — audit, lead, evidence, listings, directory
     check, questionnaire answers, queue rows — refired every time the playbook was opened.
     ⚠️ ERRORS ARE RETURNED AS DATA, NOT THROWN, and that is deliberate. Throwing is the idiom,
     but this loader distinguishes three outcomes the page renders differently: no id, no audit
     or lead with that id, and a mid-fold failure that keeps `resolvedAs` while nulling the
     document. Collapsing all three into React Query's `error` would have flattened them into
     one message and silently changed what the page shows. Behaviour-preserving beats idiomatic
     on a migration whose whole promise is that nothing changes but the caching. */
  const queryKey = useMemo(() => ['playbook', id ?? null] as const, [id]);

  const load = useCallback(async (): Promise<PlaybookData> => {
    if (!id) return { ...EMPTY_PLAYBOOK, error: 'No id in the URL.' };
    /* Locals in place of the eleven setters; the assignments sit where the calls were, so every
       branch — including the not-found early return and the catch — keeps its exact shape. */
    let playbook: Playbook | null = null;
    let ownCitations: OwnCitations | null = null;
    let seo: AiAuditSeo | null = null;
    let naming: { named: number; total: number } | null = null;
    let directoryCheck: DirectoryCheck | null = null;
    let answers: ClientAnswers | null = null;
    let resolvedAs: 'audit' | 'lead' | null = null;
    let auditId: string | null = null;
    let leadId: string | null = null;
    let error: string | null = null;
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
        error = 'No audit or lead with that id.';
        playbook = null; resolvedAs = null; auditId = null; leadId = null;
        return { playbook, ownCitations, seo, naming, directoryCheck, answers, resolvedAs, auditId, leadId, error };
      }

      resolvedAs = (audit ? 'audit' : 'lead');
      auditId = (audit?.id ?? null);
      leadId = (lead?.id ?? null);

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
        /* ── THE TOWN THE BUSINESS IS IN, NOT THE TOWN THAT WAS SEARCHED ──────────────────────────
           This read `search_location || audit.location_text` — the SEARCHED town first — which is
           backwards, and it was wrong on 102 of the 121 leads that have a derived town.

           WHAT IT LOOKED LIKE. A bulk audit of five tattoo studios found from one "Wisbech" search:
           create-ai-audit resolved each one correctly (Blood of Angels stored `Cambridge` with
           location_source `derived`) and the questions genuinely asked about Cambridge — but the
           playbook and the client request form both printed Wisbech, so the paste-values table told
           the operator to put "Wisbech" beside a Cambridge address. The measurement was right the
           whole time; only the documents lied.

           THE AUDIT ROW WINS because it already IS the resolved answer: create-ai-audit applies
           confirmed_location || derived_town || search_location and records which it used in
           location_source. Preferring it keeps the documents agreeing with the measurement by
           construction rather than by re-deriving and hoping the two match.

           derived_town then search_location behind it, for the lead-only case where there is no
           audit to resolve anything (usePlaybook is audit-FIRST, but an id can resolve to a lead). */
        town: (audit?.location_text ?? '').trim()
          || (lead?.derived_town ?? '').trim()
          || (lead?.search_location ?? '').trim()
          || null,
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

      /* 4b. THE DIRECTORY CHECK — a stored, on-demand search for listings this business already has.
         Keyed on the LEAD, so an audit-only business (ABLM has no outreach_leads row) simply has
         none and the document says "not run". Newest row wins; a re-check inserts rather than
         updates so the history stays readable. A failed read must not break the playbook, so it is
         swallowed and treated as "no check". */
      let dirCheck: DirectoryCheck | null = null;
      if (listingKey) {
        try {
          const { data: dcRaw } = await client
            .from('lead_directory_checks').select('*')
            .eq('lead_id', listingKey)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          dirCheck = (dcRaw ?? null) as DirectoryCheck | null;
        } catch { dirCheck = null; }
      }
      directoryCheck = (dirCheck);

      /* THE QUESTIONNAIRE ANSWERS, for the client request sheet's page list. Keyed on the lead, the
         same key the directory check uses. Newest row wins: a client who re-submitted should get the
         list they last sent, not their first attempt.
         Swallowed on failure and left null — a missing service list must degrade to "tell us your
         services" rather than break the document that is asking for everything else. */
      let ans: ClientAnswers | null = null;
      if (listingKey) {
        try {
          const { data: obRaw } = await client
            .from('onboarding_responses')
            /* All six columns predate the questionnaire rewrite and are on every row, so none of them
               can 400 this select. A new column added later MUST be verified live before it goes in
               here: PostgREST rejects the whole select for one unknown name, and the catch below
               would then swallow the SERVICE LIST too — losing a section to gain a field. */
            .select('services_list, areas_list, business_name, confirmed_location, business_address, accreditations')
            .eq('lead_id', listingKey)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          const row = obRaw as Record<string, unknown> | null;
          const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
          if (row) {
            ans = {
              services: list(row.services_list),
              areas: list(row.areas_list),
              held: questionnaireHeld(row),
            };
          }
        } catch { ans = null; }
      }
      answers = (ans);

      /* directoryCheckFold returns EMPTY sets for anything other than an 'ok' check, so a refused,
         errored or empty search can never suppress a task the operator still needs to do. */
      playbook = (buildPlaybook(pbLead, evidence, tradeAuditTotals, listings, directoryCheckFold(dirCheck)));

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
        ownCitations = (buildOwnCitations(qRows, pbLead.business_name ?? ''));

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
          seo = (withSeo
            ? { ...(withSeo as AiAuditSeo), leadFindings: aggregateSeoFindings((withSeo as AiAuditSeo).leadFindings ?? []) }
            : null);

          /* Stored summary counts win, exactly as buildReportData prefers them; otherwise count live
             off the queue rows already fetched above. One datapoint per SCORED engine per DONE row. */
          const stored = rows.map((r) => r.results?.summary)
            .find((s) => typeof s?.named_datapoints === 'number' && typeof s?.total_datapoints === 'number');
          if (stored) {
            naming = ({ named: stored.named_datapoints!, total: stored.total_datapoints! });
          } else {
            let n = 0, t = 0;
            for (const r of qRows) {
              if (r.status !== 'done' || !r.result) continue;
              for (const e of SCORED_ENGINES) { t++; if (r.result[e]?.named) n++; }
            }
            naming = (t > 0 ? { named: n, total: t } : null);
          }
        } catch {
          seo = (null);
          naming = (null);
        }
      } else {
        ownCitations = (null);
        seo = (null);
        naming = (null);
      }
    } catch (e) {
      error = (e instanceof Error ? e.message : 'Could not build that playbook.');
      playbook = (null);
      ownCitations = (null);
      seo = (null);
      naming = (null);
      directoryCheck = (null);
      answers = (null);
    }
    return { playbook, ownCitations, seo, naming, directoryCheck, answers, resolvedAs, auditId, leadId, error };
  }, [id]);

  const query = useQuery({ queryKey, queryFn: load, enabled: true });
  const d = query.data ?? EMPTY_PLAYBOOK;
  const isLoading = query.isPending;

  /* ⛔ `reload` INVALIDATES — calling `load` directly would fetch and discard, leaving the
     button doing nothing visible. Same trap as useCampaignStats. */
  const reload = useCallback(() => { void queryClient.invalidateQueries({ queryKey }); }, [queryClient, queryKey]);
  return {
    playbook: d.playbook, ownCitations: d.ownCitations, seo: d.seo, naming: d.naming,
    directoryCheck: d.directoryCheck, answers: d.answers, resolvedAs: d.resolvedAs,
    auditId: d.auditId, leadId: d.leadId, isLoading, error: d.error, reload,
  };
}
