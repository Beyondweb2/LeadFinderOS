import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { cellNamed } from '@/lib/namedSignal';
import { asPence, SEO_SCAN_USD } from '@/lib/marketView';
import { supabase } from '@/integrations/supabase/client';
import { runAgainFromSource, RE_AUDIT_EST_USD_PER_QUESTION } from '@/lib/reAudit';
import { auditRepeatable, auditDeletable, repeatRunCount, prefillFromAudit } from '@/lib/auditLifecycle';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { parseQuestionPaste, pasteLineCount } from '@/lib/questionPaste';
import { buildAuditPreviewRequest, buildAuditRunRequest } from '@/lib/auditQuestionContext';
import { AuditQuestionEditor } from '@/components/AuditQuestionEditor';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, X, ArrowLeft, Sparkles, RefreshCw, ExternalLink, Search, Check, FileText,
  Building2, Users, Globe, Map as MapIcon, Download, ChevronDown,
  Copy, Save, CircleStop, ChevronRight, Eye, CopyPlus, AlertTriangle, ListChecks, ClipboardList, Undo2,
  Archive, ShieldCheck, MoreHorizontal, Compass, Trash2 } from 'lucide-react';
// NOTE: lucide's `Map` is imported AS `MapIcon` — importing it as `Map` shadows the global
// Map constructor, and this module uses `new Map()` (e.g. topCompetitors), which crashed
// the page on load ("Map is not a constructor").
import type { Country } from '@/types/outreach';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AiAuditReport } from '@/components/AiAuditReport';
import { ReportBeforeAfter } from '@/components/ReportBeforeAfter';
import { type AiAuditReportData, type AiAuditSeo } from '@/lib/aiAuditReportHtml';
import { downloadReportHtml } from '@/lib/aiAuditReportDownload';
import { isMarketAudit, MARKET_AUDIT_NO_REPORT } from '@/lib/auditReport';
import { measuringState } from '@/lib/measuringState';
import { poolRuns, engineSummary, type PooledInput } from '@/lib/pooledRuns';
import { isPaidLead } from '@/lib/leadPayment';
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells } from '@/lib/competitorCleaning';
import {
  DISPLAY_ENGINES, SCORED_ENGINES, ENGINE_LABELS, isRealCompetitor, isRenderableSeo, buildReportData, seoStyleForAudit, classifyWinnability,
  type EngineResult, type EngineMap, type QueueRow, type RunRow,
} from '@/lib/auditReport';
import { tradeWord } from '@/lib/trade';
import { auditMatches, auditSearchTerms } from '@/lib/auditSearch';
import { explainAuditFailure, shortDate } from '@/lib/auditErrors';
import { shortReportUrl } from '@/lib/reportSlug';
import { useApifyUsage, apifyTone, type ApifyUsage } from '@/hooks/useApifyUsage';
import {
  WIZARD_MIN_QUESTIONS, WIZARD_MAX_QUESTIONS, WIZARD_DEFAULT_QUESTIONS, FULL_MEASURE_QUESTIONS,
  DISCOVERY_QUESTIONS, DISCOVERY_MIN_QUESTIONS, DISCOVERY_MAX_QUESTIONS,
  DISCOVERY_DEFAULT_RUNS, DISCOVERY_MIN_RUNS, DISCOVERY_MAX_RUNS,
} from '@/lib/auditQuestionCounts';
import { clampDiscoveryQuestions, clampDiscoveryRuns, expectedResponses } from '@/lib/auditPlan';
import { reconcileSelection, selectAll, selectedQuestions } from '@/lib/questionSelection';
import { MARKET_MODEL_OPTIONS, MARKET_MODEL_QUESTION, audienceUsefulFor, townRequiredFor, type MarketModel } from '@/lib/marketModel';
/* The LLM "playbook" (playbookHtml.ts + the generate-playbook edge function) was DELETED
   2026-09-09. It recommended Bing Places — zero citations across 10,615 — and ICAEW to an ACCA
   firm. The evidence-derived playbook at /playbook/:id is the only one now. */
import { isAggregatorUrl } from '@/lib/aggregators';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastAction } from '@/components/ui/toast';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  auditProtection, PROTECTION_WORDING,
  type AuditProtectionFacts, type ProtectionVerdict,
} from '@/lib/auditProtection';

// AI Visibility Audit — a stacked/conversational wizard: answered steps stay visible
// and answering one reveals the next below it (no per-step Next). Generates search
// questions, runs them across AI engines via create-ai-audit + the process-ai-audit-queue
// drain, and polls the run for results.

type Step = 'source' | 'name' | 'type' | 'location' | 'website' | 'review' | 'results';
// The stacked wizard steps, in order. `revealed` is the furthest index shown; every
// step 0..revealed is rendered at once. 'results' is a separate phase (step === 'results').
const WIZARD_STEPS = ['source', 'name', 'type', 'location', 'website', 'scope', 'specialisms', 'review'] as const;
const REVIEW_INDEX = WIZARD_STEPS.indexOf('review');

// Question-count selector: how many search questions to generate. The MANUAL path — operator
// selectable, from the shared policy module that create-ai-audit clamps against, so the selector
// and the server bound can't disagree.
const MIN_QUESTION_COUNT = WIZARD_MIN_QUESTIONS;
const MAX_QUESTION_COUNT = WIZARD_MAX_QUESTIONS;
const DEFAULT_QUESTION_COUNT = WIZARD_DEFAULT_QUESTIONS;
const QUESTION_COUNT_OPTIONS = Array.from(
  { length: MAX_QUESTION_COUNT - MIN_QUESTION_COUNT + 1 },
  (_, i) => MIN_QUESTION_COUNT + i,
);
const clampQuestionCount = (n: number) =>
  Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, Math.round(n) || DEFAULT_QUESTION_COUNT));

/* FULL MEASUREMENT mode — day 0, after the baseline is frozen: the winnability gather. ⛔ FIXED at
   FULL_MEASURE_QUESTIONS, from the shared policy module create-ai-audit clamps against. There is
   no dial: it was 10..75 (default 40) while the server's generator hard-capped every call at 20,
   so the screen offered sizes the queue never ran. A persisted count from that era is clamped to
   the fixed value on read (clampFullCount), so the first press after this deploy cannot send 40. */
const FULL_MEASURE_COUNT = FULL_MEASURE_QUESTIONS;
const clampFullCount = (_n: number) => FULL_MEASURE_COUNT;
/* DISCOVERY — the flexible opportunity/research audit (Paul, 2026-09-21): 1..80 questions,
   default 40, x 1..3 runs, default 3, with the operator picking which generated questions run.
   ⛔ IT IS A DIAL HERE AND A FIXED NUMBER FOR THE FULL MEASURE, DELIBERATELY. Raising the
   measure's count raises the Apify bill on every paying client; discovery is the manual audit, so
   discovery is where the dials live.
   ⛔ AND IT IS HONEST ONLY BECAUSE THE SERVER BATCHES ITS GENERATION. The bounds and the clamp
   come from the shared modules create-ai-audit validates against, so the screen cannot offer a
   size the queue will not run — the fault that killed the old 10..75 full-measure dial. */
const DISCOVERY_COUNT = DISCOVERY_QUESTIONS;
const clampDiscoveryCount = (n: number) => clampDiscoveryQuestions(n);
/** The count each mode runs at. One function, so the persisted value, the reset and the mode
 *  switch cannot disagree about what "full" or "discovery" means. */
const countForMode = (m: AuditMode, raw: number) =>
  m === 'full' ? clampFullCount(raw) : m === 'discovery' ? clampDiscoveryCount(raw) : clampQuestionCount(raw);
const defaultCountForMode = (m: AuditMode) =>
  m === 'full' ? FULL_MEASURE_COUNT : m === 'discovery' ? DISCOVERY_COUNT : DEFAULT_QUESTION_COUNT;

/** Quick (3-5, x1) · Full measurement (20 x 3) · Discovery (1-80 x 1-3, default 40 x 3). */
type AuditMode = 'quick' | 'full' | 'discovery';
/** The run options a Discovery audit offers, and what each one buys. The server validates against
 *  the same bounds, so the screen cannot offer a number the queue will not run. */
const DISCOVERY_RUN_OPTIONS: ReadonlyArray<{ runs: number; note: string }> = [
  { runs: 1, note: 'breadth only' },
  { runs: 2, note: 'some consistency signal' },
  { runs: 3, note: 'best for spotting fragmented visibility' },
];
/* The run clamp is the SHARED one (auditPlan.ts) — the same function the server defends itself
   with, so the screen and the queue cannot disagree about what 1..3 means or what absent means. */

// value = the Country name stored/passed to the audit; the edge toCountryCode /
// COUNTRY_TO_ISO2 map converts every name to lowercase ISO-2 uniformly. label = display.
const COUNTRIES: { value: string; label: string }[] = [
  { value: 'UK', label: 'UK' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'USA', label: 'USA' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'NewZealand', label: 'New Zealand' },
  { value: 'Thailand', label: 'Thailand' },
];


/* The audit book's shapes now live in src/types/auditBook.ts so the list, the wizard and the
   results view can each be their own component and still share them. */
import type { AuditRow, RunLite, AuditLite, BusinessGroup, LeadOption } from '@/types/auditBook';
import { AuditBookList } from '@/components/audit/AuditBookList';
const TERMINAL = new Set(['complete', 'capped', 'failed', 'cancelled']);

/** The ceiling the landing list can EVER load — fetchAllRows' runaway guard (50 pages × 1,000).
 *  🔴 THIS WAS A HARD `.limit(1000)` UNTIL 2026-09-13, AND THE BOOK STOOD AT 969. Was 50, then 300
 *  (which hid the oldest 185 of 485 — ABLM and SC Plumbing among them), then 1000; every one of
 *  them silently dropped the oldest audits once the count passed it. The list is paginated now, so
 *  this number only feeds the `auditsCapped` label, which can render only if 50,000 audits exist. */
const AUDIT_FETCH_LIMIT = 50_000;

/** How many name-matched audits the server search pulls in when a term is typed. Generous — a search
 *  should surface every match, not the newest few — but bounded so a one-letter term can't drag the
 *  whole table. */
const AUDIT_SEARCH_LIMIT = 200;

/** The columns the landing list needs off ai_audits — shared by the full-list load and the search
 *  query so the two can't drift into hydrating different shapes. */
/* ⛔ TWO SELECTS, AND THE SECOND IS NOT BELT-AND-BRACES. `archived_at` arrives with a migration
   Paul runs BY HAND in the SQL editor (CLAUDE.md §6), so between this deploying and that running
   the column does not exist — and PostgREST fails the WHOLE query on one unknown column, which
   would blank the entire audit book rather than degrade. This is the exact fault §3 records
   costing 20 minutes of dead submissions: code shipped ahead of its columns.
   `auditSelectFallback` sheds the new column and the list keeps working, unarchived. */
const AUDIT_SELECT_BASE =
  'id, short_code, business_name, business_type, location_text, country, has_website, website, created_at, is_market, lead_id, first_opened_at, open_count, baseline_target_runs, baseline_completed_at, baseline_error, baseline_runs_counted:baseline->>runs_counted, is_measurement, audit_purpose';
const AUDIT_SELECT = `${AUDIT_SELECT_BASE}, archived_at`;

/** True when a PostgREST error is "that column does not exist" (42703) rather than anything else.
 *  Matched on the code AND the column name so an unrelated 42703 is never swallowed. */
function isMissingArchivedColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42703' || /archived_at/i.test(err.message ?? '');
}

/** One ai_audits row as it arrives from AUDIT_SELECT, before hydration: baseline_runs_counted is a
 *  string here (the `baseline->>runs_counted` JSON extract) and runs/report_slug are not fetched yet.
 *  hydrateAudits turns this into an AuditLite. */
type RawAuditRow = AuditRow & {
  lead_id: string | null;
  first_opened_at: string | null;
  open_count: number | null;
  baseline_target_runs: number | null;
  baseline_completed_at: string | null;
  baseline_error: string | null;
  baseline_runs_counted: string | null;
  audit_purpose?: string | null;
};

/** Above this many businesses the list is long enough to need searching. Below it the box would be
 *  furniture over a list you can already read in one glance. */
const SEARCH_MIN_BUSINESSES = 8;
/** Landing-list refresh cadence while ANY run is in flight. The effect is not armed at all when
 *  nothing is draining, so an idle page makes zero requests. */
const LIST_POLL_MS = 5000;
/** Stable empty list — a new [] each render would break every memo downstream. */
const EMPTY_AUDITS: AuditLite[] = [];
const EMPTY_LEADS: LeadOption[] = [];
const LEAD_SELECT_COLUMNS = 'id, business_name, category, country, website, address, search_keyword, search_location';


// Wizard state is persisted to localStorage (USER-SCOPED) so an in-progress New Audit survives
// leaving the page, a full reload, a NEW TAB and even closing the tab — not just same-tab
// navigation (sessionStorage only survived the latter, which is why a draft looked wiped after a
// tab close / reopen). Cleared on a successful submit and by "Start fresh". Only the WIZARD fields
// are persisted — never results/polling state. `revealed` is stored so a return shows ALL
// previously-answered steps stacked, not just a jump.
// ⛔ USER-SCOPED KEY: localStorage outlives a logout on a shared machine, so the draft is keyed by
// user id — one operator never sees another's half-typed form. Same rule as the Inbox drafts.
const WIZARD_KEY_BASE = 'leadfinder:ai-audit-wizard';
const wizardKey = (userId: string | null | undefined) => `${WIZARD_KEY_BASE}:${userId ?? 'anon'}`;
interface PersistedWizard {
  revealed: number;
  mode: 'new' | 'existing' | null;
  leadId: string | null;
  businessName: string;
  businessType: string;
  locationText: string;
  country: Country | '';
  hasWebsite: boolean | null;
  website: string;
  businessScope: MarketModel | null;
  specialisms: string;
  targetAudience?: string;
  discoveryRuns?: number;
  /** Discovery only: the indexes of `questions` that are ticked. Absent → all of them. */
  selectedQuestionIndexes?: number[];
  serviceAreasText?: string;
  sectorsText?: string;
  auditMode?: AuditMode;
  questionCount: number;
  questions: string[];
  previewMoney?: string[];
  unitCost: number;
  engineCount: number;
}
/** Read persisted wizard state for this user (best-effort; null if absent/unavailable/invalid). */
function loadWizard(userId: string | null | undefined): PersistedWizard | null {
  try {
    const raw = localStorage.getItem(wizardKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedWizard>;
    return p && typeof p === 'object' ? (p as PersistedWizard) : null;
  } catch {
    return null;
  }
}
function clearWizard(userId: string | null | undefined) {
  try { localStorage.removeItem(wizardKey(userId)); } catch { /* storage unavailable */ }
}
/** Furthest revealed index from persisted state (back-compat: old sessions stored a
 *  `step` name instead of `revealed`). Clamped to the wizard range. */
function initialRevealed(p: PersistedWizard | null): number {
  if (!p) return 0;
  const legacyStep = (p as unknown as { step?: string }).step;
  const raw = typeof p.revealed === 'number' ? p.revealed
    : legacyStep ? WIZARD_STEPS.indexOf(legacyStep as typeof WIZARD_STEPS[number]) : 0;
  return Math.min(Math.max(raw, 0), WIZARD_STEPS.length - 1);
}

// Site-builder template-default social handles (ported from the edge _shared/aggregators.ts
// isSiteBuilderSocialUrl, generalised to ANY social host so it also catches twitter.com/wix
// and linkedin.com/company/wix-com, not just fb/ig). Flags a scanned link as a likely
// template default so the operator doesn't apply it. Warning-only — never auto-drops.
const SITE_BUILDER_TOKENS = ['wix', 'squarespace', 'godaddy', 'shopify', 'weebly', 'wordpress', 'webflow', 'jimdo', 'strikingly', 'site123', 'duda', 'yola', 'carrd'];
function looksLikeTemplateDefault(url: string): boolean {
  try {
    const path = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname.toLowerCase();
    return SITE_BUILDER_TOKENS.some((t) => path.includes(t));
  } catch {
    return false;
  }
}

const AiAudit = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  // Deep-link params (?runId=… / ?leadId=…) — read + cleared by the deep-link effect below.
  const [searchParams, setSearchParams] = useSearchParams();

  // Rehydrate the wizard once from sessionStorage. Nothing is pre-filled on a fresh
  // start. `step` is only the wizard/results discriminator; results is never persisted.
  const [persisted] = useState<PersistedWizard | null>(() => loadWizard(user?.id));
  const [step, setStep] = useState<Step>('source');
  const [revealed, setRevealed] = useState<number>(() => initialRevealed(persisted));
  /* Whether a saved draft exists for this user. Seeded from the same read that restores the wizard,
     kept in step by the save effect and by dropDraft() — the ONLY two things that write the key. */
  const [draftSaved, setDraftSaved] = useState<boolean>(() => persisted !== null);

  /* ── THE NEW-AUDIT DIALOG ─────────────────────────────────────────────────────────────────────
     The source picker, the business-details form and the question-review step all live in a modal
     now; the page itself is just the list of past audits. Nothing about the form's own logic moved
     — same fields, same `canGenerate` validation, same `confirmAndRun`.

     DELIBERATELY NOT PERSISTED, unlike every other wizard field. The form state IS restored from
     sessionStorage on mount, so if this flag were restored too, a modal would spring open over the
     list every time the page loaded — which is worse than the clutter it replaces. The state
     survives; pressing "New audit" brings it back exactly where it was.

     ⚠️ THE DEEP LINK DEPENDS ON THIS. /ai-audit?leadId=… must OPEN this dialog, prefilled. See the
     deep-link effect below — it sets this true in the same branch that calls pickLead, so the
     prefill path is untouched. If this is ever gated on anything other than that effect, the audit
     pill on an Outreach row lands on a page with no form and the lead's details are unreachable. */
  const [formOpen, setFormOpen] = useState(false);

  /* APIFY'S MONTHLY SPEND. Every question check and every SEO scan runs through Apify, so when its
     cap is reached BOTH stop at once — and the page previously said "term too broad". Surfaced here
     because this is the page where the spending happens. Never blocks: null renders nothing. */
  const { usage: apifyUsage } = useApifyUsage();

  // Wizard form state — no defaults on a fresh start (mode/country unselected, website unknown).
  const [mode, setMode] = useState<'new' | 'existing' | null>(persisted?.mode ?? null);
  const [leadId, setLeadId] = useState<string | null>(persisted?.leadId ?? null);
  const [businessName, setBusinessName] = useState(persisted?.businessName ?? '');
  const [businessType, setBusinessType] = useState(persisted?.businessType ?? '');
  const [locationText, setLocationText] = useState(persisted?.locationText ?? '');
  const [country, setCountry] = useState<Country | ''>(persisted?.country ?? '');
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(persisted?.hasWebsite ?? null);
  const [website, setWebsite] = useState(persisted?.website ?? '');
  // How the client engages — sets business scope explicitly (overrides the downstream guess).
  // Optional: null when the user skips it (then we send null and the heuristic still applies).
  const [businessScope, setBusinessScope] = useState<MarketModel | null>(persisted?.businessScope ?? null);
  const [specialisms, setSpecialisms] = useState(persisted?.specialisms ?? ''); // main services / topics — grounds question generation
  /* MARKET-MODEL FIELDS. All optional, all free text, none persisted in their own column: they
     shape the question set, which is the thing being bought. */
  const [targetAudience, setTargetAudience] = useState(persisted?.targetAudience ?? '');
  const [serviceAreasText, setServiceAreasText] = useState(persisted?.serviceAreasText ?? '');
  const [sectorsText, setSectorsText] = useState(persisted?.sectorsText ?? '');
  /* Discovery only: how many times the SAME approved question set is asked. Default 3. */
  const [discoveryRuns, setDiscoveryRuns] = useState<number>(clampDiscoveryRuns(persisted?.discoveryRuns));
  /* WHICH of the reviewed questions will actually be queued (discovery only). Indexes, not text —
     see questionSelection.ts. Every other mode never reads it and runs the whole list, as before. */
  const [selected, setSelected] = useState<Set<number>>(() => (
    Array.isArray(persisted?.selectedQuestionIndexes)
      ? new Set(persisted.selectedQuestionIndexes)
      /* A draft saved before selection existed carries its questions and no ticks. Absent means
         "not recorded", and the only safe reading of that is the one the operator last saw: every
         question they reviewed was going to run. */
      : selectAll(persisted?.questions ?? [])
  ));
  /* Quick audit (current, unchanged) vs Full measurement (deliberate bulk gather). Additive. */
  const [auditMode, setAuditMode] = useState<AuditMode>(persisted?.auditMode ?? 'quick');
  const fullMode = auditMode === 'full';
  const discoveryMode = auditMode === 'discovery';
  const [questionCount, setQuestionCount] = useState<number>(() => {
    const m: AuditMode = persisted?.auditMode ?? 'quick';
    return countForMode(m, persisted?.questionCount ?? defaultCountForMode(m));
  });
  /* Switch mode: reset the count to that mode's default and clear any previewed questions so the
     review step regenerates at the new count/purpose. Quick↔Full only; never touches a run in flight. */
  const switchAuditMode = useCallback((next: AuditMode) => {
    setAuditMode(next);
    setQuestionCount(defaultCountForMode(next));
    setQuestions([]); setPreviewMoney([]); setSelected(new Set());
  }, []);

  // Existing-lead picker + saved audits
  /* ⛔ THE AUDIT BOOK IS CACHED NOW, AND THAT IS THE FIX FOR "IT RELOADS EVERY TIME I COME BACK".
     This was plain useState filled by a mount effect, so every arrival re-fetched the lot behind a
     spinner. Measured against the live database 2026-09-09: 7.8 SECONDS of queries per arrival
     (958 audits, their runs, the report slugs, the queue counts). React Query holds it for the
     app-wide staleTime (5 min), so leaving the page and coming back is instant and silent.
     ⚠️ `savedAudits` and `setSavedAudits` keep their names and shapes on purpose — the optimistic
     row edits below (delete, rename, cancel) still write straight into the cache, so a mutation
     shows immediately instead of waiting for a refetch. */
  const queryClient = useQueryClient();
  const auditListKey = useMemo(() => ['ai-audit-list', user?.id ?? null] as const, [user?.id]);

  /* THE AUDIT SEARCH. Purely client-side over what is already loaded — no query, no round trip, so
     it filters as you type. Deliberately NOT persisted: a remembered filter is how you come back to
     this page, see four audits and think you have lost 130. */
  const [auditQuery, setAuditQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null); // audit being archived/restored (disables its row buttons)
  /* The archive confirm. Holds the audit AND the verdict computed before the dialog opened, so
     the dialog states a decision already made rather than re-deciding at click time. */
  const [archiveTarget, setArchiveTarget] = useState<{ audit: AuditLite; verdict: ProtectionVerdict } | null>(null);
  // This only connects an existing audit to an existing outreach lead. It never creates or edits a
  // lead: ai_audits.lead_id is the established relationship used by audits launched from Outreach.
  const [connectBusinessOpen, setConnectBusinessOpen] = useState(false);
  const [connectBusinessQuery, setConnectBusinessQuery] = useState('');
  const [connectBusinessResults, setConnectBusinessResults] = useState<LeadOption[]>([]);
  const [connectingLeadId, setConnectingLeadId] = useState<string | null>(null);
  /* Show the archived audits instead of the live ones. Deliberately NOT persisted: it is a
     temporary excursion, and coming back to the page in "archived" mode would read as an empty
     audit book (CLAUDE.md §6c — persist what you were looking at, not a detour). */
  const [showArchived, setShowArchived] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null); // audit whose run is being cancelled
  /** Which trade groups / businesses are expanded. Trades default OPEN (the list should read
   *  as a list), businesses default CLOSED (that is the whole point of collapsing re-runs). */
  const [closedTrades, setClosedTrades] = useState<Set<string>>(new Set());
  const [openBusinesses, setOpenBusinesses] = useState<Set<string>>(new Set());

  // Review (questions) state
  const [previewing, setPreviewing] = useState(false);
  const [questions, setQuestions] = useState<string[]>(persisted?.questions ?? []);
  /* ⛔ WHICH OF `questions` ARE MONEY (buying-moment) QUESTIONS, as reported by the preview. A Full
     Measurement generates at PREVIEW time and confirms with the questions verbatim, so this list is
     the only thing that can tell the server which strings were money questions — it is posted back
     on confirm and stored as the flag (see create-ai-audit).
     ⚠️ Persisted with the draft: without it, resuming a draft would keep the questions and silently
     lose the flag. An EDITED question stops matching and is correctly no longer flagged — an edited
     question is a different question. */
  const [previewMoney, setPreviewMoney] = useState<string[]>(persisted?.previewMoney ?? []);
  // "Paste your own questions" box (review step). Session-only scratch — not persisted; once applied
  // it REPLACES the questions list, and that list is what persists and runs.
  /* RUN AGAIN / DELETE — transient dialogs. Deliberately NOT persisted: each is confirmed or
     abandoned in one sitting, and a stale persisted copy pointing at a previous audit is a worse
     failure than losing a click. (The old re-run editor WAS persisted, which is how an "editing"
     flag could reopen over a different audit; scoping it by run id was the patch for that.) */
  const [reAuditOpen, setReAuditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reAuditQuestions, setReAuditQuestions] = useState<string[]>([]);
  /* Paste-a-list: the raw textarea and its open/closed state. Parsed by the pure
     parseQuestionPaste (blank lines dropped, list markers stripped, duplicates collapsed) into the
     SAME editable rows below, so pasted questions can still be tweaked or deleted before running.
     Nothing about how the audit RUNS changes — this is only how questions get entered. */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [reAuditBusy, setReAuditBusy] = useState(false);
  const [unitCost, setUnitCost] = useState(persisted?.unitCost ?? 0);
  const [engineCount, setEngineCount] = useState(persisted?.engineCount ?? SCORED_ENGINES.length);
  const [running, setRunning] = useState(false);

  // Results state
  const [auditId, setAuditId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  /* ── WHICH RUNS THE SCREEN IS SHOWING ────────────────────────────────────────────────────
     A paid baseline is 3 runs of the same questions and the screen used to show ONE of them —
     the highest run_number — so RG's 12-question baseline read "7/24" when the measurement is
     72 cells. `runScope` is 'all' (pooled, the default whenever there is more than one run) or
     a single run id. `runId` still points at the reference run throughout, so the draining
     poller, Re-run and the report keep working exactly as before. */
  const [auditRuns, setAuditRuns] = useState<{ id: string; run_number: number; status: string; created_at: string }[]>([]);
  const [runScope, setRunScope] = useState<'all' | string>('all');
  const [pooledInputs, setPooledInputs] = useState<PooledInput[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  /* ALL-runs queue rows for the REPORT/preview. A Full Measurement asks each question over several
     runs, so the report aggregates across EVERY run ("named X of 120", not one run's 40). Loaded when
     results are shown and the tracked run is terminal; queueRows stays the SINGLE active run so the
     draining progress bar is unaffected. */
  const [reportRows, setReportRows] = useState<QueueRow[]>([]);
  // Live list of ALL the operator's in-flight audits (pending/running) — so firing a second audit
  // doesn't hide the first; each shows its own X/N. Keyed by run id, refreshed by a poller below.
  const [runningList, setRunningList] = useState<{ runId: string; auditId: string; name: string; done: number; total: number; status: string }[]>([]);
  const [resultsBusinessName, setResultsBusinessName] = useState('');
  // Whether the run's audit has a website — gates the "Add SEO data" paste feature.
  const [resultsHasWebsite, setResultsHasWebsite] = useState(false);
  /* ⛔ THE OPEN RUN'S OWN TRADE + TOWN, MIRRORED RATHER THAN SHARED. Both loaders below
     (rehydrateOpenRun, reopenAudit) used to write the WIZARD's `businessType`/`locationText`
     directly, so returning to the page with a run remembered (openRunId is persisted, by design)
     silently overwrote the details of an audit you were part-way through composing. The results view
     genuinely needs these — the competitor filter, question scoring and the header all read them —
     so the fix is the mirror pattern already used by resultsBusinessName, not removal.
     Read as `resultsBusinessType || businessType` (see resultsType/resultsLoc below): empty while
     the wizard is the only source, populated once a stored run is loaded. */
  const [resultsBusinessType, setResultsBusinessType] = useState('');
  const [resultsLocationText, setResultsLocationText] = useState('');
  /* What the RESULTS view should use: the loaded run's own values, falling back to the wizard's for
     an audit launched in this session before the mirrors were set. Same shape, and the same reason,
     as `resultsBusinessName || businessName` throughout the results half of this page.
     ⚠️ The WIZARD must keep reading the bare fields (its inputs, canGenerate, preview and submit) —
     these two are for displaying and scoring a run, never for composing one. */
  const resultsType = resultsBusinessType || businessType;
  const resultsLoc = resultsLocationText || locationText;
  // Automated SEO scan (run-seo-scan) state + the opt-in in-depth view toggle.
  const [seoScanning, setSeoScanning] = useState(false);
  const [showSeoDetail, setShowSeoDetail] = useState(false);
  const [regenerating, setRegenerating] = useState(false); // Regenerate-button loading state
  const [reextracting, setReextracting] = useState(false); // Re-extract-competitors loading state
  // Public /r/[slug] report PAGE for the open audit (business_reports row, if any). Distinct from
  // the internal `reports` snapshot below: this is the crawlable page served at yoursites.uk/r/.
  const [reportSlug, setReportSlug] = useState<string | null>(null);      // slug of the newest report row
  const [reportStatus, setReportStatus] = useState<string | null>(null);  // 'published' | 'draft' | null
  const [reportPageLoading, setReportPageLoading] = useState(false);      // generate-report in flight
  // Operator-entered professional credentials/regulation for the open audit (ai_audits.credentials).
  // Fed to generate-report as a trust signal; set here inline so it's ready BEFORE generating a listing.
  const [credentials, setCredentials] = useState('');
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  /* The credentials field is opened from the More menu now. NOT persisted: it is a panel you
     opened for one job, and finding it already open on return is the "arrives over the thing you
     came back for" fault (§6c). It springs open with a value already saved, so nothing is lost. */
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  // Which run's report is currently open (null = not viewing a report). Replaces the old
  // boolean so we can open a SPECIFIC run's persisted report snapshot.
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  /* BEFORE/AFTER MODE for the open report. Deliberately NOT persisted and reset whenever a report
     opens or closes: it is a way of LOOKING at the open report, not a place, and a comparison
     springing up over a report you opened to send would be the wrong thing on screen. */
  const [compareOpen, setCompareOpen] = useState(false);
  // Generated report snapshots, keyed by run id. Persisted (per-user, survives navigation
  // AND tab close) so a report that's been generated is shown as-is on return — it is only
  // rebuilt by the explicit Regenerate action, never silently re-derived.
  /* ⛔ version 2: EVICTS every pre-multi-run-aggregation snapshot. Before the all-runs fix,
     openReportForCurrentRun snapshotted a SINGLE run's data (a 3-run measurement froze as "X of 40"
     in localStorage and survived hard reloads). Bumping the key drops those; the next open rebuilds
     from all runs via loadAuditRows. Harmless for quick audits — their snapshot just rebuilds identical. */
  const [reports, setReports] = usePersistedState<Record<string, AiAuditReportData>>(
    'ai-audit-reports', {}, { tier: 'local', scope: user?.id ?? null, version: 2 },
  );

  /* REMOVED 2026-07-30: playbookRunId / playbookView / playbookGenerating / the `playbooks` snapshot
     cache. All four existed only to hold and display the generate-playbook LLM document. Note the
     cache was persisted under 'ai-audit-playbooks' in localStorage — old snapshots may still be on
     this machine, and are now simply never read. */

  // Detailed per-question results are collapsed by default — the opened audit reads as a
  // command centre, not a raw dump. Toggled open on demand.
  const [showDetails, setShowDetails] = useState(false);

  /* ⛔ THE AUDIT'S OWN WEBSITE, AND IT IS THE ONLY SURVIVOR OF THE SCHEMA BLOCK. Schema markup,
     the Link hub and "Scan site & autofill" were removed on 2026-09-09 — Paul: features he never
     uses. Their shared loader also supplied THIS, which is not cosmetic: scoreQuestion uses it to
     exclude the client's own site from the aggregator share, so dropping it would quietly change
     every question's score on a reopened audit. Loaded on its own now. */
  const [auditWebsite, setAuditWebsite] = useState('');
  // The run whose opened-audit view we're on. Persisted (per-tab) so navigating away to the
  // report/playbook sub-views — or off the page entirely — and back returns to THIS audit
  // instead of resetting to the list. Cleared by "New audit" and "Back" (to the list).
  const [openRunId, setOpenRunId] = usePersistedState<string | null>(
    'ai-audit-open-run', null, { tier: 'session', scope: user?.id ?? null, version: 1 },
  );
  /* REMOVED 2026-07-30: the delivery-checklist tick state ('ai-audit-checklist', localStorage). It
     keyed off the LLM playbook's action list, which no longer renders. Existing ticks stay on the
     machine, unread — deliberately not cleared, in case the tickable list comes back somewhere that
     can persist it properly (client_listings, which /playbook/:id already reads). */

  // Refs to move focus to a newly-revealed step (accessibility).
  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLInputElement>(null);
  const townRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const specialismsRef = useRef<HTMLInputElement>(null);

  // ONE actor run per question covers every engine, so cost is per QUESTION — multiplying by
  // engineCount double-counted it (the server-side estimate had the same bug).
  const estimatedCost = Number((questions.length * unitCost).toFixed(2));

  /* ── DISCOVERY'S SUMMARY, DERIVED ────────────────────────────────────────────────────────────
     `runQuestions` is the set that will actually be POSTED, so the count, the expected responses
     and the estimate are all computed from the same list the button sends. Every other mode keeps
     its old behaviour: everything in the list runs.
     ⚠️ `engineCount` is what the SERVER said it queues, not a hardcoded 2 — a preview that has not
     returned yet falls back to the scored engines, which is what it will be. */
  const runQuestions = useMemo(
    () => (discoveryMode ? selectedQuestions(questions, selected) : questions.map((q) => q.trim()).filter(Boolean)),
    [discoveryMode, questions, selected],
  );
  const runCount = discoveryMode ? clampDiscoveryRuns(discoveryRuns) : 1;
  const engineTotal = engineCount || SCORED_ENGINES.length;
  const totalResponses = expectedResponses(runQuestions.length, runCount, engineTotal);
  /* The two reasons the button must stay disabled, named separately so the sentence beside it can
     say which one is true rather than "invalid". Over 80 is reachable by pasting. */
  const tooFewQuestions = runQuestions.length < 1;
  const tooManyQuestions = discoveryMode && runQuestions.length > DISCOVERY_MAX_QUESTIONS;

  /* Selection travels with the list through every edit, add, remove and paste — see
     questionSelection.ts.
     ⛔ NOT A SIDE EFFECT INSIDE A STATE UPDATER. Reconciling from within setQuestions' callback
     would run twice under StrictMode's double-invoke and shift a removal's indexes twice. */
  const changeQuestions = useCallback((next: string[]) => {
    setSelected((sel) => reconcileSelection(questions, next, sel));
    setQuestions(next);
  }, [questions]);
  const toggleQuestion = useCallback((index: number, on: boolean) => {
    setSelected((sel) => {
      const out = new Set(sel);
      if (on) out.add(index); else out.delete(index);
      return out;
    });
  }, []);

  // Reveal the next step (monotonic — earlier answers stay revealed/editable).
  const reveal = (i: number) => setRevealed((r) => Math.max(r, i));

  /* Persist wizard state on change so it survives unmount/remount + refresh.
     ⛔ DO NOT REINTRODUCE A `step === 'results'` CLEAR HERE. It was the cause of the draft loss
     fixed 2026-08-31: `openRunId` is persisted on purpose, so returning to this page rehydrates the
     last run and sets step 'results' — which made this effect DELETE the draft on arrival, and
     suppress every save while the results view was showing. The guard conflated "this wizard was
     spent" with "the page happens to be showing an old run"; those are unrelated facts.
     Clearing is owned by the two places that actually spend a draft, and both do it explicitly:
     a successful submit (search `audit created successfully`) and resetWizard ("New audit"). */
  useEffect(() => {
    try {
      localStorage.setItem(wizardKey(user?.id), JSON.stringify({
        revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, targetAudience, serviceAreasText, sectorsText, auditMode, discoveryRuns, selectedQuestionIndexes: [...selected], questionCount, questions, previewMoney, unitCost, engineCount,
      }));
      /* A draft now EXISTS on disk. Tracked in state (rather than re-reading storage at render time)
         so the "Resume draft" button below can appear and disappear truthfully. React bails out when
         the value is unchanged, so this does not re-render on every keystroke. */
      setDraftSaved(true);
    } catch { /* storage unavailable — persistence is best-effort */ }
    // `step` is deliberately NOT a dependency: this effect no longer branches on it (see above).
  }, [revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, targetAudience, serviceAreasText, sectorsText, auditMode, discoveryRuns, selected, questionCount, questions, previewMoney, unitCost, engineCount, user?.id]);

  /* SETTLED-QUESTION COUNTS for a set of runs — the ONE implementation of "2 of 3 done".
     The queue's terminal statuses are 'done' and 'failed' (NOT 'complete', which is a RUN
     status); counting the wrong word silently reports 0 of N forever. Used by both the
     in-flight strip on the results step and the landing list's progress bars. */
  const fetchQueueCounts = useCallback(async (runIds: string[]) => {
    const counts = new Map<string, { done: number; total: number }>();
    if (!runIds.length) return counts;
    /* Paginated: this is questions x runs, so 40 in-flight runs at 25 questions each already reaches
       the 1000-row cap PostgREST truncates at silently — and a truncated page here does not shrink a
       number, it makes running audits look permanently stalled. .order('id') is the unique tiebreaker
       page boundaries need. */
    const { rows: data } = await fetchAllRows<{ run_id: string; status: string }>('AiAudit (queue)', (from, to) =>
      (supabase as unknown as SupabaseClient)
        .from('ai_audit_queue')
        .select('run_id, status')
        .in('run_id', runIds)
        .order('id', { ascending: true })
        .range(from, to));
    for (const row of data) {
      const c = counts.get(row.run_id) ?? { done: 0, total: 0 };
      c.total++;
      if (row.status === 'done' || row.status === 'failed') c.done++;
      counts.set(row.run_id, c);
    }
    return counts;
  }, []);

  // ── Initial load: the user's leads (for the picker) + saved audits ──────────
  // Loads the whole audit book the list needs in four bounded queries: audits, their runs,
  // published-report slugs, and live queue counts for the runs still in flight. Also the
  // refresh the landing list polls while anything is draining.
  /* HYDRATE a set of audit rows into AuditLite (runs + report pill + live queue progress). Shared
     with the server-side search so both shape a row identically. */
  const hydrateAudits = useCallback(async (auditRows: RawAuditRow[]): Promise<AuditLite[]> => {
    /* 🔴 THIS USED TO CHUNK BY AUDIT ID, AND THE CHUNKING WAS THE WHOLE COST OF OPENING THE PAGE.
       Runs and reports were fetched with `.in('audit_id', batch)` over 60-id batches, awaited ONE
       AFTER ANOTHER — 16 sequential round trips for 958 audits. Measured against the live database
       2026-09-09: 6,038ms for the runs alone, out of 7.8 SECONDS of queries on every single arrival.
       Both tables are owner-RLS, so the id filter was never what scoped them — it only decided how
       many round trips to make. Fetching each table straight through, paginated, is the same rows:
       1,366 runs in 1,124ms over 2 requests. Same data, a fifth of the time.
       ⚠️ A run belonging to an audit outside this page's list is simply never read — runsByAudit is
       keyed by audit_id and looked up per rendered audit — so dropping the filter cannot show
       anything extra. */
    const runsByAudit = new Map<string, RunLite[]>();
    const inFlightRunIds: string[] = [];
    const { rows: runRows } = await fetchAllRows<{
      id: string; audit_id: string; run_number: number; status: string; mention_rate: number | null;
      created_at: string; actor_cost_usd: number | null; seo_grade: string | null;
    }>('AiAudit (runs)', (from, to) =>
      (supabase as unknown as SupabaseClient)
        .from('ai_audit_runs')
        .select('id, audit_id, run_number, status, mention_rate, created_at, actor_cost_usd, seo_grade:results->seo->>overallGrade')
        .order('id', { ascending: true })
        .range(from, to));
    for (const r of runRows) {
      const list = runsByAudit.get(r.audit_id) ?? [];
      list.push({
        id: r.id, audit_id: r.audit_id, run_number: r.run_number, status: r.status,
        // COERCE. Postgres numeric can arrive as a STRING, and then `sum + rate` concatenates
        // instead of adding (avg visibility came out NaN) and `rate === 0` is false for "0".
        mention_rate: r.mention_rate === null || r.mention_rate === undefined ? null : Number(r.mention_rate),
        created_at: r.created_at,
        actor_cost_usd: r.actor_cost_usd === null || r.actor_cost_usd === undefined ? null : Number(r.actor_cost_usd),
        seo_grade: r.seo_grade, done: 0, total: 0,
      });
      runsByAudit.set(r.audit_id, list);
      if (r.status === 'pending' || r.status === 'running') inFlightRunIds.push(r.id);
    }
    /* ⛔ SORTED HERE, NOT BY THE QUERY. The old read ordered by run_number DESC and the expanded
       view depends on newest-first; this one orders by id so pagination has a unique tiebreaker
       (an unstable sort lets a page boundary skip rows — the reason fetchAllRows exists). Sorting
       per audit afterwards is the same result and cannot be broken by paging. */
    for (const list of runsByAudit.values()) list.sort((a, b) => b.run_number - a.run_number);

    // Published report per audit → the "report" pill. Existence only. Same one-pass read.
    const reportByAudit = new Map<string, string>();
    const { rows: reportRowsAll } = await fetchAllRows<{ audit_id: string | null; slug: string }>(
      'AiAudit (reports)', (from, to) =>
        (supabase as unknown as SupabaseClient)
          .from('business_reports')
          .select('audit_id, slug')
          .order('id', { ascending: true })
          .range(from, to));
    for (const r of reportRowsAll) {
      if (r.audit_id && !reportByAudit.has(r.audit_id)) reportByAudit.set(r.audit_id, r.slug);
    }

    // Live progress for the runs still draining — nothing fetched when nothing is in flight.
    const counts = await fetchQueueCounts(inFlightRunIds);
    for (const list of runsByAudit.values()) {
      for (const r of list) {
        const c = counts.get(r.id);
        if (c) { r.done = c.done; r.total = c.total; }
      }
    }

    return auditRows.map((a) => ({
      ...a,
      baseline_runs_counted: a.baseline_runs_counted === null ? null : Number(a.baseline_runs_counted),
      report_slug: reportByAudit.get(a.id) ?? null,
      runs: runsByAudit.get(a.id) ?? [],
    }));
  }, [fetchQueueCounts]);

  /* ⛔ ONE QUERY FOR THE WHOLE AUDIT BOOK, AND `loadSaved` IS NOW ITS REFRESH.
     Every existing caller of loadSaved() still works — it invalidates instead of re-running a
     fetch by hand, so a refresh triggered from three different places cannot start three fetches.
     ⚠️ EMPTY_AUDITS is a module constant, not `[]` inline: a fresh array every render would give
     every memo downstream a new identity and undo the caching this exists for. */
  const auditListQuery = useQuery({
    queryKey: auditListKey,
    enabled: !!user,
    queryFn: async () => {
      /* ⛔ PAGINATED, NOT CAPPED (2026-09-13). This was `.limit(AUDIT_FETCH_LIMIT)` = 1000, and the
         book stood at 969 audits with one bulk job of 25 leaving it six away from the cliff: at
         1,001 the OLDEST audit simply stopped being fetched — not deleted, not archived, just absent
         from the list, and its business with it if that was its only audit. Same paginated reader
         the runs and the reports already use (fetchAllRows), same stable sort (`id` as the
         tiebreaker, because an unstable order lets a page boundary skip a row — the reason that
         helper exists). At the current size this is still ONE request; past 1,000 it becomes two.
         The real fix — page the LIST, poll only the in-flight audits — is still to come; this is
         the hour that stops an audit vanishing before then. */
      const pageWith = (select: string) => fetchAllRows<RawAuditRow>('AiAudit (audits)', (from, to) =>
        (supabase as unknown as SupabaseClient)
          .from('ai_audits')
          .select(select)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to));

      /* Column not there yet (migration unrun) → shed it and fetch again, rather than showing an
         empty book. `archivedReady` tells the UI to hide the archive controls instead of offering
         a button that cannot work. fetchAllRows THROWS the PostgREST error, so the shed is a catch. */
      let archivedReady = true;
      let fetched: { rows: RawAuditRow[]; truncated: boolean };
      try {
        fetched = await pageWith(AUDIT_SELECT);
      } catch (e) {
        if (!isMissingArchivedColumn(e as { code?: string; message?: string })) throw e;
        archivedReady = false;
        fetched = await pageWith(AUDIT_SELECT_BASE);
      }
      return {
        audits: await hydrateAudits(fetched.rows),
        /* Only true if the reader hit its runaway guard (50 pages = 50,000 audits). */
        capped: fetched.truncated,
        archivedReady,
      };
    },
  });
  const savedAudits = auditListQuery.data?.audits ?? EMPTY_AUDITS;
  /* ⛔ A REPORT SNAPSHOT TAKEN WHILE A RUN IS IN FLIGHT CARRIES THE STILL-MEASURING FLAG (2026-09-13).
     Same predicate render-audit-report uses for the live page (src/lib/measuringState.ts), read off
     the list's own run rows, so the preview shows the banner and the PDF button disables instead of
     freezing "4 of 12" on a report that will say "5 of 18" four minutes later. An audit the list has
     not loaded reads as not measuring — the live page is the authority for prospects either way. */
  const attachMeasuring = useCallback((data: AiAuditReportData, auditIdForRuns: string | null) => {
    if (!auditIdForRuns) return;
    const a = savedAudits.find((x) => x.id === auditIdForRuns);
    if (!a) return;
    const st = measuringState(a.runs, a.baseline_target_runs);
    if (st.measuring) data.measuring = { runsDone: st.runsDone, runsTarget: st.runsTarget };
  }, [savedAudits]);
  /** True when the audits query came back full, i.e. older audits exist beyond it. Drives an
   *  honest label instead of a count that silently stops growing. */
  const auditsCapped = auditListQuery.data?.capped ?? false;
  /** False until the `archived_at` migration has run. Everything archive-related hides rather
   *  than rendering a control that would fail — a button that visibly does nothing is the
   *  failure CLAUDE.md §6c names. Defaults FALSE while the first fetch is in flight so the
   *  controls appear only once the column is proven present. */
  const archivedReady = auditListQuery.data?.archivedReady ?? false;
  const loadSaved = useCallback(() => { void queryClient.invalidateQueries({ queryKey: auditListKey }); },
    [queryClient, auditListKey]);
  /* The optimistic row edits below still write directly into the cached list, so a delete or a
     rename shows at once rather than after a round trip. Same shape as the old setSavedAudits. */
  const setSavedAudits = useCallback((update: (prev: AuditLite[]) => AuditLite[]) => {
    queryClient.setQueryData<{ audits: AuditLite[]; capped: boolean; archivedReady: boolean }>(
      auditListKey, (prev) => prev ? { ...prev, audits: update(prev.audits) } : prev);
  }, [queryClient, auditListKey]);

  /* ── SERVER-SIDE NAME SEARCH ─────────────────────────────────────────────────────────────────
     The real fix for old audits vanishing: the client filter only ever saw the fetched window, so a
     name beyond it (ABLM, SC Plumbing — positions 459/484 of 485) could not be found however you
     typed. When a term is present we ALSO ask the database for audits whose business_name matches,
     hydrate them, and merge them into the list source below — so an old match surfaces regardless of
     the fetch cap. Debounced; owner-scoped by RLS; matches already loaded are skipped. Empty/short
     term clears the extras and the list is the normal (capped) load again. */
  const [searchExtras, setSearchExtras] = useState<AuditLite[]>([]);
  useEffect(() => {
    const term = auditQuery.trim();
    if (!user || term.length < 2) { setSearchExtras([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await (supabase as unknown as SupabaseClient)
        .from('ai_audits')
        .select(AUDIT_SELECT)
        .ilike('business_name', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(AUDIT_SEARCH_LIMIT);
      if (!alive) return;
      const loaded = new Set(savedAudits.map((a) => a.id));
      const fresh = ((data ?? []) as RawAuditRow[]).filter((r) => !loaded.has(r.id));
      if (!fresh.length) { setSearchExtras([]); return; }
      const hydrated = await hydrateAudits(fresh);
      if (alive) setSearchExtras(hydrated);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [auditQuery, user, savedAudits, hydrateAudits]);

  /* ⛔ THE LEAD PICKER IS CACHED TOO. This ran on every arrival for a list that only fills a
     dropdown in the new-audit dialog — 500 rows fetched whether or not the dialog was ever opened.
     Same treatment as the audit book above: held for the app-wide staleTime, so returning is free.
     ⚠️ loadSaved() is NOT called here any more. It used to kick the audit fetch from this effect;
     the query does its own fetching, and calling it here would have invalidated the cache on every
     mount — exactly the refetch this change exists to stop. */
  const leadsQuery = useQuery({
    queryKey: ['ai-audit-leads', user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      /* MIGRATION-TOLERANT. derived_town is added by a migration Paul applies BY HAND, so until that
         SQL runs PostgREST fails the WHOLE select with a 400 and the lead picker would come back
         empty — breaking the wizard for a cosmetic prefill. Try with it, fall back without it. */
      let rows = (await supabase
        .from('outreach_leads')
        .select(`${LEAD_SELECT_COLUMNS}, derived_town`)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(500)).data as unknown as LeadOption[] | null;
      if (!rows) {
        rows = (await supabase
          .from('outreach_leads')
          .select(LEAD_SELECT_COLUMNS)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(500)).data as unknown as LeadOption[] | null;
      }
      return rows ?? EMPTY_LEADS;
    },
  });
  const leads = leadsQuery.data ?? EMPTY_LEADS;

  // The normal new-audit picker deliberately loads only the recent 500 leads. Connecting a
  // standalone audit must also find older businesses, so searching here asks the owner-scoped
  // table directly by name and returns a bounded set with enough location detail to distinguish it.
  useEffect(() => {
    const term = connectBusinessQuery.trim();
    if (!connectBusinessOpen || term.length < 2) {
      setConnectBusinessResults([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      let rows = (await supabase
        .from('outreach_leads')
        .select(`${LEAD_SELECT_COLUMNS}, derived_town`)
        .eq('is_archived', false)
        .ilike('business_name', `%${term}%`)
        .order('business_name', { ascending: true })
        .limit(50)).data as unknown as LeadOption[] | null;
      if (!rows) {
        rows = (await supabase
          .from('outreach_leads')
          .select(LEAD_SELECT_COLUMNS)
          .eq('is_archived', false)
          .ilike('business_name', `%${term}%`)
          .order('business_name', { ascending: true })
          .limit(50)).data as unknown as LeadOption[] | null;
      }
      if (alive) setConnectBusinessResults(rows ?? EMPTY_LEADS);
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [connectBusinessOpen, connectBusinessQuery]);

  /* ── Keep the landing list live while audits drain ──────────────────────────────
     THE BUG THIS FIXES. Both existing pollers are gated on step === 'results', so on the
     landing page the list never updated: an audit that finished while you watched kept
     showing a dash and no Report button until a manual reload. Reading that as "stuck" and
     re-running is rational, and each re-run mints another audit row — which is where the
     apparent duplicates came from.

     SELF-SUSPENDING: the interval is only created while something is actually in flight.
     When the last run settles, loadSaved drops inFlightCount to 0, this effect tears the
     timer down, and an idle page makes zero requests. */
  // Derived here rather than from the grouped memo below, which is declared further down the
  // component: this effect must not reference a block-scoped value before its declaration.
  const anyRunInFlight = savedAudits.some((a) => a.runs.some((r) => r.status === 'pending' || r.status === 'running'));
  useEffect(() => {
    if (step === 'results') return;   // the results step has its own pollers
    if (!anyRunInFlight) return;      // nothing draining → no timer at all
    const t = setInterval(() => { loadSaved(); }, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [step, anyRunInFlight, loadSaved]);

  // One-shot fetch of a run's queue rows (used when opening a report for a past audit that
  // has no cached snapshot yet — we need the raw rows to build the report data once).
  const loadRunRows = useCallback(async (rid: string): Promise<QueueRow[]> => {
    const { data: q } = await supabase
      .from('ai_audit_queue')
      .select('id, question, status, result')
      .eq('run_id', rid)
      .order('created_at', { ascending: true });
    return (q ?? []) as QueueRow[];
  }, []);

  /* All-runs queue rows for an audit — the operator report aggregates across the runs of a Full
     Measurement (each question asked MEASUREMENT_RUNS times), so buildReportData sees every run and
     shows the real frequency + the across-runs winnability. For a single-run audit this is just that
     run's rows. Paginated: questions × runs can exceed one PostgREST page on a big measurement. */
  const loadAuditRows = useCallback(async (auditId: string): Promise<QueueRow[]> => {
    const { data: runs } = await supabase.from('ai_audit_runs').select('id').eq('audit_id', auditId);
    const runIds = ((runs ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (!runIds.length) return [];
    const { rows } = await fetchAllRows<QueueRow>('AiAudit (report rows)', (from, to) =>
      supabase.from('ai_audit_queue').select('id, question, status, result')
        .in('run_id', runIds).order('id', { ascending: true }).range(from, to));
    return rows;
  }, []);

  // Restore an opened audit by run id after a remount (route change / refresh) so the user
  // returns to the audit they were on, not the list. Fetches the run + its audit, restores
  // the results state, and lets the poll effect refill the queue rows. Returns false if the
  // run/audit no longer exists (so the caller can clear the stale pointer).
  const rehydrateOpenRun = useCallback(async (rid: string): Promise<boolean> => {
    const { data: latest } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results, created_at')
      .eq('id', rid)
      .maybeSingle();
    if (!latest) return false;
    const { data: audit } = await supabase
      .from('ai_audits')
      .select('id, business_name, business_type, location_text, has_website, website')
      .eq('id', (latest as RunRow).audit_id)
      .maybeSingle();
    if (!audit) return false;
    setAuditId(audit.id);
    setResultsBusinessName(audit.business_name);
    setResultsHasWebsite(audit.has_website === true);
    /* ⛔ MIRRORS, NOT THE WIZARD'S FIELDS. This function runs on ARRIVAL at the page (the persisted
       openRunId restore), so writing setBusinessType/setLocationText here overwrote the details of
       an audit the operator was still composing. */
    setResultsBusinessType(audit.business_type ?? '');
    setResultsLocationText(audit.location_text ?? '');
    setRun(latest as RunRow);
    setRunId((latest as RunRow).id);
    // (Was: hydrate the LLM playbook snapshot from results.playbook — nothing reads it now.)
    setStep('results');
    return true;
  }, []);

  // ── Poll the active run while it drains ─────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRun = useCallback(async (rid: string) => {
    const { data: runRow } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results, created_at')
      .eq('id', rid)
      .maybeSingle();
    const { data: q } = await supabase
      .from('ai_audit_queue')
      .select('id, question, status, result')
      .eq('run_id', rid)
      .order('created_at', { ascending: true });
    if (runRow) setRun(runRow as RunRow);
    setQueueRows((q ?? []) as QueueRow[]);
    return runRow as RunRow | null;
  }, []);

  useEffect(() => {
    if (step !== 'results' || !runId) return;
    let stop = false;
    const tick = async () => {
      const r = await pollRun(runId);
      if (!stop && r && TERMINAL.has(r.status)) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        loadSaved(); // refresh the saved-audits rates
        // extract-competitors rewrites the competitor lists a few seconds AFTER the run flips to
        // complete (it runs post-status-write in the finalisation tick). Polling stops the instant
        // we see a terminal status, so do ONE bounded delayed refetch to pick up the cleaned lists —
        // otherwise the live view latches the pre-extraction regex names until a hard refresh.
        if (settleRef.current) clearTimeout(settleRef.current);
        settleRef.current = setTimeout(() => { if (!stop) pollRun(runId); }, 10_000);
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => {
      stop = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (settleRef.current) { clearTimeout(settleRef.current); settleRef.current = null; }
    };
  }, [step, runId, pollRun, loadSaved]);

  // Poll ALL of the operator's in-flight audits (pending/running) so the results view can list every
  // audit currently running — not just the one that's open. RLS scopes ai_audit_runs to the owner.
  // Per-run X/N is derived from ai_audit_queue counts (done+failed vs total), the SAME notion as the
  // single-run counter. Runs only on the results step; refreshes on runId change so a freshly-fired
  // audit appears immediately. Every 8s while open.
  useEffect(() => {
    if (step !== 'results') { setRunningList([]); return; }
    let stop = false;
    const load = async () => {
      const { data: runs } = await (supabase as unknown as SupabaseClient)
        .from('ai_audit_runs')
        .select('id, audit_id, status, ai_audits(business_name)')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: true });
      const list = (runs ?? []) as Array<{ id: string; audit_id: string; status: string; ai_audits: { business_name?: string } | { business_name?: string }[] | null }>;
      if (list.length === 0) { if (!stop) setRunningList([]); return; }
      // Shared with the landing list's progress bars — one definition of done/total.
      const counts = await fetchQueueCounts(list.map((r) => r.id));
      const next = list.map((r) => {
        const a = Array.isArray(r.ai_audits) ? r.ai_audits[0] : r.ai_audits;
        const c = counts.get(r.id) ?? { done: 0, total: 0 };
        return { runId: r.id, auditId: r.audit_id, name: (a?.business_name ?? '').trim() || 'Audit', done: c.done, total: c.total, status: r.status };
      });
      if (!stop) setRunningList(next);
    };
    load();
    const t = setInterval(load, 8000);
    return () => { stop = true; clearInterval(t); };
  }, [step, runId, fetchQueueCounts]);

  // On mount, if a previously-opened audit was persisted (page was left and returned to),
  // restore it so the user lands back on that audit rather than the list. Runs once; skipped
  // if a session is already active. A stale pointer (deleted run) clears itself.
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (!user || rehydratedRef.current) return;
    if (searchParams.get('runId') || searchParams.get('leadId')) return; // deep-link handler owns this load
    if (runId || step === 'results') return; // already restored / active
    // openRunId is bound to a user-scoped storage key ONCE at mount (usePersistedState). Auth-gating
    // (ProtectedRoute) means `user` is normally resolved before this page mounts, so the key is
    // scoped correctly and openRunId reads fine. Defensive fallback: if openRunId is empty but a
    // user-scoped value exists in storage, read it directly so restoration still works even if the
    // scope wasn't ready at first render. Safe-degrading: any parse/format miss just yields null.
    let rid = openRunId;
    if (!rid && user.id) {
      try {
        const key = `leadfinder:ai-audit-open-run:${user.id}`;
        const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as { d?: unknown }) : null;
        if (parsed && typeof parsed.d === 'string' && parsed.d) rid = parsed.d;
      } catch { /* storage unavailable / corrupt — degrade to no restore */ }
    }
    if (!rid) return;
    rehydratedRef.current = true;
    rehydrateOpenRun(rid).then((ok) => { if (!ok) setOpenRunId(null); });
  }, [user, openRunId, runId, step, rehydrateOpenRun, setOpenRunId, searchParams]);

  /** Drop the saved draft AND the flag that advertises it, together. Every clear goes through here
   *  so "Resume draft" can never offer a draft that is no longer on disk. */
  const dropDraft = () => { clearWizard(user?.id); setDraftSaved(false); };

  const resetWizard = () => {
    dropDraft(); // drop the saved draft too, so "start fresh" is truly fresh
    setMode(null); setLeadId(null); setBusinessName(''); setBusinessType('');
    setLocationText(''); setCountry(''); setHasWebsite(null); setWebsite(''); setSpecialisms('');
    setBusinessScope(null); setTargetAudience(''); setServiceAreasText(''); setSectorsText('');
    setDiscoveryRuns(DISCOVERY_DEFAULT_RUNS);
    setAuditMode('quick'); setQuestionCount(defaultCountForMode('quick'));
    setQuestions([]); setPreviewMoney([]); setUnitCost(0); setEngineCount(SCORED_ENGINES.length);
    setAuditId(null); setRunId(null); setRun(null); setQueueRows([]);
    setOpenRunId(null); setShowDetails(false);
    setRevealed(0); setStep('source');
    // Close the dialog: confirmArchiveAudit calls this, and leaving an emptied form open over
    // the list after archiving the audit you were viewing would look like a bug.
    setFormOpen(false);
  };

  /** "New audit" from the RESULTS view: clear everything, land on the list, open a fresh dialog.
   *  Matches what this button did before the form became a modal (reset → back to the source step),
   *  with the dialog standing in for the form that used to be sitting on the page. */
  const startNewAudit = () => { resetWizard(); setFormOpen(true); };

  /* ── RESUMING AN IN-PROGRESS DRAFT ────────────────────────────────────────────────────────────
     The results view is where you LAND when you come back to this page (openRunId is persisted), so
     it needs a way back to a half-composed audit. "New audit" beside it is the deliberate wipe and
     must stay that way — the two intents are different and neither should be guessed.

     ⛔ THE LABEL NAMES WHAT THE DRAFT HOLDS, and that is the anti-stale measure. A draft can outlive
     its relevance (the lead deleted, the price moved), so it is never restored silently: the operator
     reads what they are resuming and decides. Returns null when there is nothing worth offering, so
     an empty draft — the save effect writes one on a fresh page — shows no button. */
  const draftSummary = (() => {
    if (!draftSaved) return null;                    // spent by a submit, or by "New audit"
    const name = businessName.trim();
    const nQ = questions.length;
    if (!nQ && !name && mode === null) return null;  // nothing meaningful in it
    const what = nQ ? `${nQ} question${nQ === 1 ? '' : 's'}` : 'details';
    return name ? `${what} for ${name}` : what;
  })();
  /** Reopen the dialog WITHOUT resetting: the preserving path, same as the list header's button. */
  const resumeDraft = () => setFormOpen(true);

  // Delete an audit + all its children (ai_audit_runs / ai_audit_queue cascade from the FK).
  /* ════════════════════════════════════════════════════════════════════════════════════════
     ARCHIVING REPLACED DELETING — 2026-09-10.

     🔴 WHAT THIS USED TO DO. `supabase.from('ai_audits').delete()` behind a one-line
     window.confirm, on a 24px trash icon, with NO exemption for a paying customer's baseline.
     The delete CASCADES (ai_audit_runs and ai_audit_queue are both ON DELETE CASCADE, and
     page_plan_queue with them), so it destroyed the run, every question and every stored
     answer — the measurement itself. Nothing is backed up and nothing was recoverable.

     Now: a protection check that REFUSES on anything load-bearing, a confirm that shows what is
     about to go, an UPDATE that only sets a timestamp, and an Undo on the toast. The row and all
     its children stay in the database permanently.
     ⚠️ `deletingId` keeps its name: it is referenced at several render sites and renaming it is
     churn inside a file this stage is deliberately not restructuring. It means "busy on this id".
     ════════════════════════════════════════════════════════════════════════════════════════ */

  /** Gather the four protection facts for one audit. Two are already on the row; two are reads
   *  that may fail — and a failed read returns `null`, NEVER `false`. Under RLS a denied read is
   *  200-with-[] (CLAUDE.md §8), indistinguishable from "nothing found", so collapsing either
   *  into `false` would hand out permission we never verified. */
  const gatherProtectionFacts = useCallback(async (a: AuditLite): Promise<AuditProtectionFacts> => {
    let leadIsPaying: boolean | null = null;
    if (!a.lead_id) {
      /* No lead at all is a KNOWN answer, not an unknown one — a market audit or an
         audit-only business (ABLM) genuinely has no customer behind it. */
      leadIsPaying = false;
    } else {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from('outreach_leads').select('amount_paid, status').eq('id', a.lead_id).maybeSingle();
      /* ⛔ `isPaidLead`, NOT a bare `amount_paid > 0`. The first version of this used the raw
         comparison and so protected a REFUNDED customer's audits as a paying customer's — the
         money went back out, and `refunded` is the one status that subtracts. One rule, in
         src/lib/leadPayment.ts, is what stops the funnel, the campaign card, the Inbox and this
         from disagreeing about who has paid; a second copy here is exactly how they drift.
         ⚠️ A refunded customer's BASELINE is still protected — by `paid_baseline`, which is the
         honest reason. It is evidence of what was measured, whoever ended up paying for it. */
      if (!error) leadIsPaying = isPaidLead(data as { amount_paid?: number | null; status?: string | null } | null);
    }

    return {
      baselineTargetRuns: a.baseline_target_runs ?? null,
      isMeasurement: a.is_measurement ?? null,
      leadIsPaying,
    };
  }, []);

  /** Step 1 of archiving: work out whether we may, and open the confirm showing the answer.
   *  The check runs BEFORE the dialog so the operator never reads "are you sure?" about
   *  something the app is going to refuse anyway. */
  const askArchiveAudit = async (a: AuditLite) => {
    if (deletingId) return;
    if (!archivedReady) {
      toast({
        title: 'Archiving is not set up yet',
        description: 'The archived_at column has not been added to the database. Run the migration SQL, then reload.',
        variant: 'destructive',
      });
      return;
    }
    setDeletingId(a.id);
    try {
      const facts = await gatherProtectionFacts(a);
      setArchiveTarget({ audit: a, verdict: auditProtection(facts) });
    } catch (e) {
      /* Could not even gather the facts → refuse. Same direction as a null fact. */
      toast({
        title: 'Could not check this audit',
        description: `${e instanceof Error ? e.message : 'Read failed'} — nothing was archived.`,
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  /** Flip archived_at. One function for both directions so archive and restore cannot drift. */
  const setArchived = async (a: AuditLite, archived: boolean) => {
    const value = archived ? new Date().toISOString() : null;
    const { error } = await (supabase as unknown as SupabaseClient)
      .from('ai_audits').update({ archived_at: value }).eq('id', a.id);
    if (error) throw new Error(error.message);
    setSavedAudits((prev) => prev.map((x) => x.id === a.id ? { ...x, archived_at: value } : x));
  };

  /** Step 2: actually archive. Only ever reached for an audit the verdict cleared. */
  const confirmArchiveAudit = async () => {
    const target = archiveTarget;
    if (!target || target.verdict.isProtected) return;
    const a = target.audit;
    setDeletingId(a.id);
    try {
      await setArchived(a, true);
      setArchiveTarget(null);
      if (auditId === a.id) resetWizard(); // don't leave an open view of an archived audit
      toast({
        title: 'Audit archived',
        description: `"${a.business_name}" is hidden from the list. Nothing was deleted.`,
        action: (
          <ToastAction altText="Undo" onClick={() => { void restoreAudit(a); }}>Undo</ToastAction>
        ),
      });
    } catch (e) {
      toast({ title: 'Archive failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  /** Bring one back. Used by Undo and by the Restore button in the archived list. */
  const restoreAudit = async (a: AuditLite) => {
    setDeletingId(a.id);
    try {
      await setArchived(a, false);
      toast({ title: 'Audit restored', description: `"${a.business_name}" is back in the list.` });
    } catch (e) {
      toast({ title: 'Restore failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  // Cancel a run: mark its unsettled queue rows + the run 'cancelled'. The queue processor
  // claims only status='pending', so this stops all unclaimed work at once; the processor's
  // cancelled-handling finalises the run as cancelled. Owner RLS covers both. Shared core used
  // by the saved-audits list (cancelAudit) AND the open results view (cancelOpenRun) — one
  // implementation of the two writes so they can't drift.
  const cancelRun = async (runId: string): Promise<void> => {
    const { error: qErr } = await supabase.from('ai_audit_queue')
      .update({ status: 'cancelled' }).eq('run_id', runId).in('status', ['pending', 'running']);
    if (qErr) throw new Error(qErr.message);
    const { error: rErr } = await supabase.from('ai_audit_runs')
      .update({ status: 'cancelled' }).eq('id', runId);
    if (rErr) throw new Error(rErr.message);
  };

  // Stop a still-running audit FROM THE LIST (per-row Stop button).
  const cancelAudit = async (a: AuditRow, runIdToStop: string) => {
    if (cancellingId || !runIdToStop) return;
    if (!window.confirm(`Stop the audit for "${a.business_name}"? It won't finish.`)) return;
    setCancellingId(a.id);
    try {
      await cancelRun(runIdToStop);
      // Reflect it locally, then let the next load settle the real state.
      setSavedAudits((prev) => prev.map((x) => x.id === a.id
        ? { ...x, runs: x.runs.map((r) => r.id === runIdToStop ? { ...r, status: 'cancelled' } : r) }
        : x));
      toast({ title: 'Audit stopped' });
    } catch (e) {
      toast({ title: "Couldn't stop the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  // Stop the CURRENTLY OPEN run (results view). Same two writes as cancelAudit, keyed by the
  // open runId, then refresh the run so the view flips out of the in-flight state ('cancelled'
  // is TERMINAL → isDraining false, polling stops).
  const cancelOpenRun = async () => {
    if (!runId || cancellingId) return;
    if (!window.confirm("Stop this audit? It won't finish.")) return;
    setCancellingId(runId);
    try {
      await cancelRun(runId);
      await pollRun(runId); // refresh run.status → 'cancelled'
      setSavedAudits((prev) => prev.map((x) => ({ ...x, runs: x.runs.map((r) => r.id === runId ? { ...r, status: 'cancelled' } : r) })));
      toast({ title: 'Audit stopped' });
    } catch (e) {
      toast({ title: "Couldn't stop the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
  };

  const pickLead = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    setLeadId(id);
    if (lead) {
      setBusinessName(lead.business_name ?? '');
      setBusinessType(lead.search_keyword || lead.category || '');
      /* derived_town FIRST — the town Google says the business is in, ahead of the town I searched.
         Lead search has a radius, so search_location is a property of my query, not of the business.
         The server applies the full precedence (confirmed || derived || search) and OVERRIDES whatever
         this box contains, so this is about showing the operator the right town before they press go,
         not about being the thing that fixes the bug. */
      setLocationText(lead.derived_town || lead.search_location || lead.address || '');
      if (lead.country) setCountry(lead.country as Country);
      setHasWebsite(!!lead.website);
      setWebsite(lead.website ?? '');
    }
    reveal(WIZARD_STEPS.indexOf('name'));
  };

  // Deep-link receiver: /ai-audit?runId=XXX opens that run (Manage); ?leadId=YYY starts a
  // pre-filled wizard for that lead (Run audit). Fires ONCE (deepLinkHandledRef) — the guard is
  // set true only when we actually handle a param, so the leadId case can wait for `leads` to
  // load then fire. The param is cleared after handling so a refresh/back doesn't re-trigger.
  // Placed after pickLead (referenced in deps) so its const is initialised before this runs.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || !user) return;
    const rid = searchParams.get('runId');
    const lid = searchParams.get('leadId');
    if (!rid && !lid) return; // normal page load — nothing to deep-link
    if (rid) {
      // MANAGE — open the specific run directly (wins over the persisted-run rehydrate).
      deepLinkHandledRef.current = true;
      rehydrateOpenRun(rid).then((ok) => { if (!ok) toast({ title: 'Audit not found', variant: 'destructive' }); });
      setSearchParams({}, { replace: true });
      return;
    }
    // RUN-AUDIT — needs the lead loaded. Wait (without consuming the guard) until loadSaved
    // populates `leads`, then open a pre-filled "existing lead" wizard.
    if (leads.length === 0) return; // effect re-runs when leads changes
    deepLinkHandledRef.current = true;
    const found = leads.some((l) => l.id === lid);
    if (found) {
      setOpenRunId(null);   // drop any previously-open audit so the fresh wizard wins
      setRunId(null);
      setRun(null);
      setMode('existing');
      pickLead(lid!);
      setStep('source');
      /* OPEN THE DIALOG. The form is no longer on the page, so without this the pill on an Outreach
         row would land on the list with the lead silently prefilled into an invisible form. Set in
         the SAME branch as pickLead, on purpose: the two cannot drift apart. */
      setFormOpen(true);
    } else {
      toast({ title: 'Lead not found', variant: 'destructive' });
    }
    setSearchParams({}, { replace: true });
  }, [user, searchParams, leads, rehydrateOpenRun, setSearchParams, pickLead, setMode, setStep, toast, setOpenRunId, setRunId, setRun]);

  /* ⛔ THE ONE CONTEXT. Preview and confirm both build their request from this object, so a field
     cannot shape the questions the operator reviews and then fail to reach the audit that is
     stored — which is what happened while confirm hand-wrote its own body. */
  /* ⛔ THE PURPOSE THE SERVER KEYS ON, DERIVED FROM THE MODE IN ONE PLACE. The preview and the
     confirm both read it, so the questions the operator reviews cannot be generated under one
     purpose and run under another. Quick sends none — an ordinary wizard audit. */
  const auditPurpose: 'measurement' | 'discovery' | null =
    auditMode === 'full' ? 'measurement' : auditMode === 'discovery' ? 'discovery' : null;

  const auditContext = useMemo(() => ({
    business_name: businessName,
    business_category: businessType,
    primary_location: locationText,
    country,
    website: hasWebsite ? website : '',
    has_website: hasWebsite === true,
    market_model: businessScope,
    target_audience: audienceUsefulFor(businessScope) ? targetAudience : '',
    services: specialisms ? [specialisms] : [],
    service_areas: businessScope === 'national' ? [] : (serviceAreasText ? [serviceAreasText] : []),
    specialisms: [],
    specialist_sectors: audienceUsefulFor(businessScope) && sectorsText ? [sectorsText] : [],
  }), [businessName, businessType, locationText, country, hasWebsite, website, businessScope, targetAudience, specialisms, serviceAreasText, sectorsText]);

  // ── Preview questions (generate for the review step) ─────────────────────────
  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: buildAuditPreviewRequest(auditContext, {
          questionCount,
          businessScope: businessScope || undefined,
          ...(auditPurpose ? { purpose: auditPurpose } : {}),
        }),
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'preview failed');
      const generated = Array.isArray(data.questions) ? (data.questions as string[]) : [];
      setQuestions(generated);
      /* A freshly generated set arrives fully selected: the operator asked for N questions and got
         them, so the default is to run them. Deselecting is the deliberate act, not selecting. */
      setSelected(selectAll(generated));
      setPreviewMoney(Array.isArray(data.money_questions) ? (data.money_questions as string[]) : []);
      setUnitCost(typeof data.unit_cost_usd === 'number' ? data.unit_cost_usd : 0);
      setEngineCount(Array.isArray(data.engines) ? data.engines.length : SCORED_ENGINES.length);
    } catch (e) {
      toast({ title: "Couldn't generate questions", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  }, [auditContext, businessScope, questionCount, auditPurpose, toast]);

  // When the review step is first revealed with no questions yet, generate them.
  // Editing type/location later does NOT auto-wipe/regenerate (only reveal-fresh or the
  // explicit Regenerate button do).
  useEffect(() => {
    if (WIZARD_STEPS[revealed] === 'review' && questions.length === 0 && !previewing) runPreview();
    // Fire only on reveal changes — not on every keystroke/question edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  // ── Confirm & run ───────────────────────────────────────────────────────────
  /* ══ THE WRONG-TOWN REFUSAL ═════════════════════════════════════════════════════
     create-ai-audit refuses with 409 business_not_in_town when the business is more than 25km from
     the town the questions would ask about. Held in STATE rather than thrown into a toast, because
     the operator needs a decision here, not a notification — and because "business_not_in_town" on
     its own is the catch-all-error fault again. The dialog carries the server's sentence verbatim. */
  const [distanceBlock, setDistanceBlock] = useState<{ message: string; km: number; town: string } | null>(null);

  const confirmAndRun = async (overrideDistance = false) => {
    /* ⛔ THE SELECTED SET IS WHAT RUNS, AND IT IS THE SAME LIST EVERY NUMBER ON SCREEN WAS
       COMPUTED FROM (runQuestions). Every non-discovery mode has no selection and sends the whole
       list, which is what it has always done. */
    const clean = runQuestions;
    if (clean.length === 0) { toast({ title: discoveryMode ? 'Select at least one question' : 'Add at least one question', variant: 'destructive' }); return; }
    /* The server refuses over the cap rather than truncating; refusing here too means the operator
       is told before a round trip, and both limits come from the same constant. */
    if (discoveryMode && clean.length > DISCOVERY_MAX_QUESTIONS) {
      toast({
        title: `A discovery audit runs at most ${DISCOVERY_MAX_QUESTIONS} questions`,
        description: `${clean.length} are selected — deselect ${clean.length - DISCOVERY_MAX_QUESTIONS}.`,
        variant: 'destructive',
      });
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        /* Same builder as the preview — see auditContext. `questions` travels verbatim, so
           confirming spends nothing on generation: the reviewed set IS the set that runs.
           Full measurement: the server clamps to the measurement ceiling, forces SEO off (the
           builder sends skip_seo) and creates its OWN audit so start vs re-measure stay comparable. */
        body: buildAuditRunRequest(auditContext, {
          /* ⛔ THE COUNT SENT IS THE COUNT BEING SENT. It used to be the wizard's target, which is
             what was ASKED of the generator — so an operator who deselected two questions posted
             40 alongside a list of 38 and the server clamped the disagreement out of sight. */
          questionCount: clean.length,
          businessScope: businessScope || undefined,
          leadId: leadId || undefined,
          ...(auditPurpose ? { purpose: auditPurpose } : {}),
          /* Discovery only. The server clamps it to the same 1..3 and defaults it to 1, so this is
             a preference, not a permission. */
          ...(discoveryMode ? { runCount: discoveryRuns } : {}),
          questions: clean,
          moneyQuestions: previewMoney,
          overrideDistance,
        }),
      });
      /* ⛔ NOT AN ERROR TO THROW. It is a question to put to the operator, so it opens the dialog
         and returns rather than landing in the generic catch as a red toast with a machine string. */
      if (!error && data?.error === 'business_not_in_town') {
        setDistanceBlock({
          message: String(data.message ?? ''),
          km: Number(data.distance_km) || 0,
          town: String(data.town ?? ''),
        });
        return;
      }
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'run failed');
      // Persist the operator's typed audit inputs BACK to the lead, so the next audit / bulk
      // audit prefills instead of re-asking (~80% of leads have no search_keyword/location).
      // Write-back only when the audit came from a lead and the value differs (or the lead's is
      // empty). Best-effort, own catch — a write failure never blocks the run that just started.
      if (leadId) {
        try {
          const lead = leads.find((l) => l.id === leadId) as { search_keyword?: string | null; search_location?: string | null } | undefined;
          const patch: Record<string, string> = {};
          const typedType = businessType.trim();
          const typedLoc = locationText.trim();
          if (typedType && typedType !== (lead?.search_keyword ?? '').trim()) patch.search_keyword = typedType;
          if (typedLoc && typedLoc !== (lead?.search_location ?? '').trim()) patch.search_location = typedLoc;
          if (Object.keys(patch).length) {
            await (supabase as unknown as SupabaseClient).from('outreach_leads').update(patch).eq('id', leadId);
          }
        } catch { /* non-fatal — the audit itself is already running */ }
      }
      dropDraft(); // audit created successfully → the draft is spent, next visit starts clean
      setAuditId(data.audit_id);
      setRunId(data.run_id);
      setOpenRunId(data.run_id);
      setResultsBusinessName(data.business_name ?? businessName);
      setResultsHasWebsite(hasWebsite === true);
      /* Mirror the trade + town for the results view too, so this just-launched audit's header,
         competitor filter and scoring read the same values the loaders below supply for a stored
         run — and do not depend on the wizard fields staying populated behind it. */
      setResultsBusinessType(businessType);
      setResultsLocationText(locationText);
      setRun(null); setQueueRows([]);
      setFormOpen(false);   // the audit is away — close the dialog so the results view is not behind it
      setStep('results');
    } catch (e) {
      toast({ title: "Couldn't start the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  /* ── RE-AUDIT: a NEW ai_audits row for the same business ──────────────────────────────────────
     Distinct from Re-run, which adds a run to the SAME audit row. Mixing post-work runs into the
     original row would destroy the only before-and-after measurement that exists, so this mints a
     separate audit and leaves the old one completely untouched.

     WHY THE ROW IS INSERTED HERE rather than by create-ai-audit. Two reasons, both load-bearing:
       1. create-ai-audit deliberately REUSES an existing audit when handed a lead_id and no
          audit_id — its duplicate guard. Posting the business details plus lead_id would add a run
          to the original row, i.e. precisely the thing this button exists to avoid.
       2. its insert writes ten columns and `credentials` is NOT one of them, so the ACCA/CTA field
          that generate-report and generate-playbook both read would be silently dropped.
     So the row is copied field-for-field here, then create-ai-audit is called with the NEW audit id,
     which takes its reuse branch and honours the supplied questions verbatim.

     BASELINE COLUMNS ARE DELIBERATELY NOT COPIED. `baseline`, `baseline_target_runs` and friends
     mark a PAID measurement; copying them onto an "after" audit would make it look like a second
     paid baseline, and the paid-client backstop would start topping it up every minute. */

  /** MEASURED, not estimated from a price list. Settled 2026-07-30 from `ai_audit_runs.actor_cost_usd`:
   *  **81 runs, mean $0.04207 per run, $3.41 total, 26–30 July.** The runs behind that average are the
   *  3–5 question outreach size that dominates the table, which puts a question at roughly $0.0125 —
   *  and that reproduces both real-world anchors: a 3-question re-audit ≈ 3p, a 10-question × 3-run
   *  baseline ≈ 30p.
   *
   *  This replaces two wrong numbers. The old $0.0025 here was ~5x too LOW; the £1.50 baseline figure
   *  quoted in earlier notes was ~4x too HIGH.
   *
   *  ⚠️ THE SERVER CONSTANT IS STILL WRONG. `_shared/enrichment/sources.ts` has `estCostUsd: 0.0025`,
   *  used by create-ai-audit's cap pre-check and by process-ai-audit-queue. It under-counts spend
   *  against the cap by ~5x. Fixing it means editing a shared module and redeploying every function
   *  that imports it — including the paid-baseline path — so it is deliberately NOT touched here.
   *  Still an ESTIMATE on screen: cost varies per run and the actual figure is recorded afterwards. */
  // RE_AUDIT_EST_USD_PER_QUESTION now lives in src/lib/reAudit.ts (imported above) — shared with the
  // Baseline page's "Re-run this measurement" cost line so the two estimates cannot drift.

  const startRunAgain = () => {
    if (!auditId || isDraining) return;
    const seen = new Set<string>();
    /* VERBATIM, deliberately — including misspellings. "accoutnant in wisbech" asked again is a
       valid like-for-like comparison; a tidied-up version silently measures something else. Only
       exact repeats are dropped, and the first occurrence's original text is what survives. */
    const seed = queueRows
      .map((r) => (r.question ?? '').trim())
      .filter((q) => { if (!q) return false; const k = q.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    setReAuditQuestions(seed.length ? seed : ['']);
    setReAuditOpen(true);
  };

  const cancelReAudit = () => { setReAuditOpen(false); setReAuditQuestions([]); setPasteOpen(false); setPasteText(''); };

  /* Apply a pasted list: REPLACE ALL (clear the existing rows) or ADD TO LIST (append, skipping
     questions already present so a re-paste can't duplicate them). Empty parse -> say so, change
     nothing. */
  const applyPaste = (mode: 'replace' | 'append') => {
    const parsed = parseQuestionPaste(pasteText);
    if (parsed.length === 0) {
      toast({ title: 'Nothing to add', description: 'No questions found in that paste — one question per line.', variant: 'destructive' });
      return;
    }
    setReAuditQuestions((prev) => {
      if (mode === 'replace') return parsed;
      const have = new Set(prev.map((q) => q.trim().toLowerCase()).filter(Boolean));
      const add = parsed.filter((q) => !have.has(q.toLowerCase()));
      const kept = prev.filter((q) => q.trim());   // drop the empty placeholder row when appending
      return [...kept, ...add];
    });
    setPasteOpen(false); setPasteText('');
    toast({ title: mode === 'replace' ? `Replaced with ${parsed.length} question${parsed.length === 1 ? '' : 's'}` : `Added ${parsed.length} pasted question${parsed.length === 1 ? '' : 's'}`,
      description: 'Edit or delete any of them below before running.' });
  };

  /* ── RUN AGAIN ────────────────────────────────────────────────────────────────────────────────
     A NEW audit with the SAME configuration: same business, same stored purpose, same questions in
     the same order, same number of runs. The original is untouched, so the two are independent
     measurement events rather than runs 4, 5 and 6 of one row.
     ⛔ NOTHING IS RE-DECIDED IN THE BROWSER. The copy carries the stored purpose and run count
     (src/lib/reAudit.ts), and the server reads that copy's own purpose for the question ceiling. */
  const confirmRunAgain = async () => {
    if (!auditId || !user) return;
    const clean = reAuditQuestions.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) { toast({ title: 'This audit has no questions to repeat', variant: 'destructive' }); return; }
    const verdict = auditRepeatable(openAuditRow);
    if (!verdict.ok) { toast({ title: "Can't run this one again", description: verdict.reason, variant: 'destructive' }); return; }
    setReAuditBusy(true);
    try {
      const res = await runAgainFromSource(supabase as unknown as SupabaseClient, {
        sourceAuditId: auditId, userId: user.id, questions: clean,
      });
      if (!res.ok) throw new Error('error' in res ? res.error : 'run again failed');

      setReAuditOpen(false); setReAuditQuestions([]);
      setAuditId(res.auditId);
      if (res.runId) { setRunId(res.runId); setOpenRunId(res.runId); }
      setRun(null); setQueueRows([]);
      toast({ title: 'Running again', description: `New audit started — ${clean.length} question${clean.length === 1 ? '' : 's'} × ${runAgainRuns} run${runAgainRuns === 1 ? '' : 's'}. The original is untouched.` });
      loadSaved();
    } catch (e) {
      toast({ title: "Couldn't run it again", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setReAuditBusy(false);
    }
  };

  /* ── START NEW AUDIT ──────────────────────────────────────────────────────────────────────────
     The same business as a starting point, everything else open. Opens the wizard prefilled and
     spends nothing: questions are generated at the review step and run only on Confirm & run. */
  const startNewAuditFromThis = () => {
    if (!openAuditRow) return;
    const pre = prefillFromAudit(openAuditRow);
    setMode('new'); setLeadId(openAuditRow.lead_id ?? null);
    setBusinessName(pre.businessName); setBusinessType(pre.businessType);
    setLocationText(pre.locationText); setCountry(pre.country as Country | '');
    setHasWebsite(pre.hasWebsite); setWebsite(pre.website);
    setBusinessScope(pre.businessScope); setSpecialisms(pre.specialisms);
    /* The question-shaping extras are NOT stored columns (see prefillFromAudit) — they come back
       inside Main services / topics. Cleared here so nothing stale is silently re-sent. */
    setTargetAudience(''); setServiceAreasText(''); setSectorsText('');
    /* A fresh decision every time: mode, run count and questions are the operator's to set. */
    setAuditMode('quick'); setQuestionCount(defaultCountForMode('quick')); setDiscoveryRuns(DISCOVERY_DEFAULT_RUNS);
    setQuestions([]); setPreviewMoney([]); setUnitCost(0);
    setRevealed(WIZARD_STEPS.indexOf('specialisms'));
    setStep('source'); setFormOpen(true);
  };

  /* ── DELETE AUDIT ─────────────────────────────────────────────────────────────────────────────
     ⛔ CANCEL FIRST, THEN DELETE. ai_audit_runs and ai_audit_queue are ON DELETE CASCADE from
     ai_audits, so the rows go — but a row the processor has ALREADY claimed is work in flight, and
     deleting the parent out from under it is not the same as stopping it. cancelRun is the existing
     stop path (the same one the Stop button uses); nothing new is built here.
     ⚠️ Everything else that points at an audit is ON DELETE SET NULL (outreach_leads' three
     pointers, client_pages, client_page_questions, client_listings, whatsapp_auto_replies) —
     verified against the live schema — so the lead, its messages, its other audits and the paid
     relationship all survive. That is also exactly why a paid baseline may not be deleted:
     auditDeletable refuses it, because nulling baseline_audit_id is unrecoverable. */
  const deleteAudit = async () => {
    if (!auditId || !openAuditRow) return;
    const verdict = auditDeletable(openAuditRow);
    if (!verdict.ok) { toast({ title: "This audit can't be deleted", description: verdict.reason, variant: 'destructive' }); return; }
    setDeleteBusy(true);
    try {
      for (const r of (openAuditRow.runs ?? [])) {
        if (!TERMINAL.has(r.status)) await cancelRun(r.id);
      }
      const { error } = await supabase.from('ai_audits').delete().eq('id', auditId);
      if (error) throw new Error(error.message);
      setDeleteOpen(false);
      setAuditId(null); setRunId(null); setRun(null); setQueueRows([]); setOpenRunId(null);
      toast({ title: 'Audit deleted', description: 'Its runs and results are gone. The business is untouched.' });
      loadSaved();
    } catch (e) {
      toast({ title: "Couldn't delete the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
    }
  };


  // Re-extract competitors for THIS run from its already-stored answer text — FREE-ish /
  // instant, NO Apify re-scrape. Calls the extract-competitors edge fn, which has an AI read
  // each engine's stored answer_text and return the real competitor firms it recommended (the
  // way a human would), then writes the cleaned competitors back to BOTH stores
  // (ai_audit_queue rows that drive the report/display + the run.results.questions snapshot the
  // playbook reads). We then reload from those stores and drop the cached report snapshot so
  // the report + "AI names these instead" rebuild clean on view/Regenerate. isRealCompetitor
  // still filters at display as a light final backstop.
  const reextractCompetitors = async () => {
    if (!runId || reextracting) return;
    setReextracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-competitors', { body: { runId } });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'extraction failed');
      // Refresh in-memory state from the updated stores.
      const rows = await loadRunRows(runId);
      setQueueRows(rows);
      const { data: fresh } = await supabase.from('ai_audit_runs').select('results').eq('id', runId).maybeSingle();
      if (fresh?.results) setRun((prev) => (prev ? { ...prev, results: fresh.results } : prev));
      // Invalidate the cached report snapshot so it rebuilds from the cleaned rows.
      setReports((prev) => { const n = { ...prev }; delete n[runId]; return n; });
      toast({ title: 'Competitors re-extracted', description: 'AI re-read the stored answers — no new search run.' });
    } catch (e) {
      toast({ title: "Couldn't re-extract competitors", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setReextracting(false);
    }
  };

  /* Load the opened audit's own website — not in the wizard/results state on a reopened audit. */
  useEffect(() => {
    if (!auditId) { setAuditWebsite(''); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('ai_audits').select('website').eq('id', auditId).maybeSingle();
      if (!cancelled && data) setAuditWebsite((data as { website: string | null }).website ?? '');
    })();
    return () => { cancelled = true; };
  }, [auditId]);

  /** Open an audit's results. `pickRun` opens THAT run instead of the latest — the expanded
   *  view lists every run and each one is openable. */
  const reopenAudit = async (audit: AuditRow, pickRun?: { id: string }) => {
    let latest: unknown = null;
    if (pickRun) {
      const { data } = await supabase
        .from('ai_audit_runs')
        .select('id, audit_id, run_number, status, mention_rate, results, created_at')
        .eq('id', pickRun.id)
        .maybeSingle();
      latest = data;
    } else {
      const { data } = await supabase
        .from('ai_audit_runs')
        .select('id, audit_id, run_number, status, mention_rate, results, created_at')
        .eq('audit_id', audit.id)
        .order('run_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      latest = data;
    }
    if (!latest) { toast({ title: 'No runs yet for this audit', variant: 'destructive' }); return null; }
    setAuditId(audit.id);
    setResultsBusinessName(audit.business_name);
    setResultsHasWebsite(audit.has_website === true);
    // Mirrors, not the wizard's own fields — reopening a past audit must not overwrite a draft.
    setResultsBusinessType(audit.business_type ?? ''); // so the report's "what this means" line is populated for reopened audits
    setResultsLocationText(audit.location_text ?? ''); // so the competitor filter can drop the location for reopened audits
    setRun(latest as RunRow);
    setRunId((latest as RunRow).id);
    setOpenRunId((latest as RunRow).id);
    // (Was: hydrate the LLM playbook cache from results.playbook so the row buttons and the delivery
    // checklist could show it. All three are gone; the Playbook button opens /playbook/:auditId.)
    setStep('results');
    return latest as RunRow;
  };

  /* REMOVED 2026-07-30: viewPlaybookFromRow. It backed the row's "Playbook" button, which opened the
     generate-playbook LLM document — the one that recommends Bing Places (zero citations across
     8,913) and omits Yell. The button is gone from the row; the LLM document is still reachable from
     an audit's results view. Recoverable from git if the row button is ever wanted back. */

  // Open a past audit's report DIRECTLY from its row. Prefers the stored snapshot (shown
  // as-is, never silently regenerated); only builds one if this run has never had a report
  // generated. Loads the run into results state too, so Regenerate has live data to work from.
  const viewReport = async (audit: AuditRow) => {
    /* MARKET AUDITS HAVE NO CLIENT REPORT. This view is the only route to the download button
       as well, so refusing here closes both SPA paths at once. The server refuses independently
       (generate-report and render-audit-report), so this is the operator-facing explanation
       rather than the security boundary. */
    if (isMarketAudit(audit)) {
      toast({ title: 'No report for a market audit', description: MARKET_AUDIT_NO_REPORT, variant: 'destructive' });
      return;
    }
    const latest = await reopenAudit(audit);
    if (!latest) return;
    const rid = latest.id;
    if (reports[rid]) { setReportRunId(rid); return; }   // stored snapshot → show it
    const rows = await loadAuditRows(audit.id);          // ALL runs — aggregate across the repeats
    setQueueRows(rows);
    const data = buildReportData(rows, latest, {
      businessName: audit.business_name,
      businessType: audit.business_type ?? '',
      locationText: audit.location_text ?? '',
      specialisms: '',
      isAggregatorUrl,
      seoStyle: seoStyleForAudit(audit.baseline_target_runs, audit.is_measurement),
      /* Needed for the report's "Cited as a source" figure: without it the domain half of the
         citation test is disabled, and this preview would show a lower `cited` count than the live
         client report, which does pass it (render-audit-report). */
      ownWebsite: audit.website ?? '',
    });
    if (!data) { toast({ title: 'No completed results to report yet', variant: 'destructive' }); return; }
    attachMeasuring(data, audit.id);
    data.internal = true; // snapshot default — OVERRIDDEN at render/print by AiAuditReport's Client/Internal toggle (showInternal); Client is what shows unless the operator switches
    setReports((prev) => ({ ...prev, [rid]: data }));
    setReportRunId(rid);
  };

  // ── Derived results tallies ─────────────────────────────────────────────────
  const doneCount = queueRows.filter((r) => r.status === 'done' || r.status === 'failed').length;
  /* ── LOAD EVERY RUN OF THE OPEN AUDIT, AND POOL THEM ──────────────────────────────────────
     Two reads, both owner-RLS: the audit's runs (so the picker can list them and default
     sensibly), then every queue row belonging to those runs when the scope is pooled.
     ⚠️ Chunked `.in()` is not needed — an audit has single-digit runs — but the queue read IS
     capped by db-max-rows, so it is paginated. 12 questions × 3 runs is 36 rows; a 47-question
     measurement is 141. Silent truncation here would quietly shrink the denominator the
     guarantee is measured on (CLAUDE.md §6). */
  useEffect(() => {
    if (step !== 'results' || !auditId) { setAuditRuns([]); setPooledInputs([]); return; }
    let alive = true;
    (async () => {
      const { data: runs } = await (supabase as unknown as SupabaseClient)
        .from('ai_audit_runs')
        .select('id, run_number, status, created_at')
        .eq('audit_id', auditId)
        .order('run_number', { ascending: true });
      if (!alive) return;
      const list = ((runs ?? []) as { id: string; run_number: number; status: string; created_at: string }[]);
      setAuditRuns(list);
    })();
    return () => { alive = false; };
  }, [step, auditId]);

  useEffect(() => {
    if (step !== 'results' || runScope !== 'all' || auditRuns.length < 2) { setPooledInputs([]); return; }
    let alive = true;
    const ids = auditRuns.map((r) => r.id);
    const numberOf = new Map(auditRuns.map((r) => [r.id, r.run_number]));
    setPoolLoading(true);
    (async () => {
      const out: PooledInput[] = [];
      const PAGE_ROWS = 1000;
      for (let from = 0; ; from += PAGE_ROWS) {
        const { data, error } = await (supabase as unknown as SupabaseClient)
          .from('ai_audit_queue')
          .select('run_id, question, status, result')
          .in('run_id', ids)
          .order('id', { ascending: true })
          .range(from, from + PAGE_ROWS - 1);
        if (error) break;
        const page = (data ?? []) as { run_id: string; question: string; status: string; result: EngineMap | null }[];
        for (const r of page) {
          out.push({ runId: r.run_id, runNumber: numberOf.get(r.run_id) ?? 0, question: r.question, status: r.status, result: r.result });
        }
        if (page.length < PAGE_ROWS) break;
      }
      if (alive) { setPooledInputs(out); setPoolLoading(false); }
    })();
    return () => { alive = false; setPoolLoading(false); };
  }, [step, runScope, auditRuns]);

  /* Picking a single run in the selector LOADS it — same path the expanded row in the list
     uses, so a run opened either way shows identical numbers. Switching back to pooled points
     `runId` at the newest run, because Re-run, Stop and the report all act on a single run and
     must never be left aimed at whichever one happened to be open last. */
  useEffect(() => {
    if (step !== 'results' || auditRuns.length === 0) return;
    if (runScope === 'all') {
      const newest = [...auditRuns].sort((a, b) => b.run_number - a.run_number)[0];
      if (newest && newest.id !== runId) { setRunId(newest.id); void pollRun(newest.id); }
      return;
    }
    if (runScope !== runId) { setRunId(runScope); void pollRun(runScope); }
  }, [step, runScope, auditRuns, runId, pollRun]);

  /* 🔴 POOLING RUNS TAKEN WEEKS APART MIXES A BEFORE WITH AN AFTER, and this audit book really
     contains that shape: one RG audit holds FIVE runs — three on 26 Aug, then singles appended
     on 1 Sep and 8 Sep (CLAUDE.md §17 records the same audit as the reason the comparison picker
     groups by audit AND day). Pooled is still the right default — it is what the operator asked
     for and what three same-day runs mean — but a spread this wide has to be SAID, not silently
     averaged into one number. */
  const runSpanDays = useMemo(() => {
    if (auditRuns.length < 2) return 0;
    const times = auditRuns.map((r) => new Date(r.created_at).getTime()).filter((t) => Number.isFinite(t));
    if (times.length < 2) return 0;
    return (Math.max(...times) - Math.min(...times)) / 86_400_000;
  }, [auditRuns]);
  const POOL_SPAN_WARN_DAYS = 3;

  /** True when the screen is showing every run folded together rather than one. */
  const pooled = runScope === 'all' && auditRuns.length > 1;
  /** The pooled fold. Computed only in pooled mode; a 1-run audit never pays for it. */
  const poolTally = useMemo(
    () => (pooled ? poolRuns(pooledInputs, SCORED_ENGINES, DISPLAY_ENGINES) : null),
    [pooled, pooledInputs],
  );

  const liveTally = queueRows.reduce(
    (acc, r) => {
      if (r.status === 'done' && r.result) {
        acc.done++;
        for (const e of SCORED_ENGINES) { acc.total++; if (cellNamed(r.result[e])) acc.named++; }
      } else if (r.status === 'failed') {
        acc.failed++;
      }
      return acc;
    },
    { named: 0, total: 0, failed: 0, done: 0 },
  );
  const isDraining = !!runId && !(run && TERMINAL.has(run.status));

  /* ⛔ WERE THIS RUN'S COMPETITOR NAMES ACTUALLY CLEANED? Derived from the stored names every time
     they change — never read from a receipt alone, because every audit before 2026-08-28 has no
     receipt and an absent one must not read as clean. A `dirty` verdict is the ONLY thing standing
     between a junk-named report and a client, so it is shown here as a warning, the report
     withholds rival names, and the Re-extract button turns primary. */
  const competitorCleanliness = useMemo(
    () => assessCompetitorCleanliness(collectCompetitorNames(queueRows), run?.results,
      { answeredCells: countAnsweredCells(queueRows) }),
    [queueRows, run?.results],
  );
  /* Load the ALL-RUNS rows for the report/preview once the tracked run is terminal, so a Full
     Measurement's in-place preview aggregates across every run (named X of 120). Cleared while
     draining or when the audit changes, so the draining bar (queueRows) is untouched.
     openReportForCurrentRun also re-fetches fresh at click, so the snapshot is authoritative even if
     later measurement runs finished after this loaded. For a 1-run quick audit this is just that run. */
  useEffect(() => {
    if (step !== 'results' || !auditId || isDraining) { setReportRows([]); return; }
    let cancelled = false;
    (async () => {
      const rows = await loadAuditRows(auditId);
      if (!cancelled) setReportRows(rows);
    })();
    return () => { cancelled = true; };
  }, [step, auditId, isDraining, loadAuditRows]);
  /** The open audit's own list row, for its created_at. A business can hold several audits now, so
   *  the results view has to say which one it is showing. */
  /* The grouping/search source: the fetched window PLUS any server-search matches from beyond it
     (deduped by id). When there is no active search, searchExtras is empty and this is just
     savedAudits. This is what lets a name-matched old audit appear in the list, its search, and the
     open-audit lookup below. Declared before its first use (openAuditRow). */
  const listSource = useMemo<AuditLite[]>(() => {
    if (!searchExtras.length) return savedAudits;
    const loaded = new Set(savedAudits.map((a) => a.id));
    return [...savedAudits, ...searchExtras.filter((a) => !loaded.has(a.id))];
  }, [savedAudits, searchExtras]);

  const openAuditRow = listSource.find((a) => a.id === auditId) ?? null;
  /* ⛔ THE THREE ACTIONS ASK THE SAME MODULE, WHICH ASKS THE STORED PURPOSE. Nothing here reads a
     run count, `is_measurement` on its own, or a question count to decide what this audit is. */
  const runAgainVerdict = auditRepeatable(openAuditRow);
  const deleteVerdict = auditDeletable(openAuditRow);
  const runAgainRuns = repeatRunCount(openAuditRow);
  const connectedBusiness = openAuditRow?.lead_id
    ? leads.find((lead) => lead.id === openAuditRow.lead_id) ?? null
    : null;
  const connectAuditToBusiness = async (lead: LeadOption) => {
    if (!auditId || !openAuditRow || openAuditRow.lead_id || connectingLeadId) return;
    setConnectingLeadId(lead.id);
    try {
      const { error } = await (supabase as unknown as SupabaseClient)
        .from('ai_audits')
        .update({ lead_id: lead.id })
        .eq('id', auditId);
      if (error) throw error;
      setSavedAudits((previous) => previous.map((audit) =>
        audit.id === auditId ? { ...audit, lead_id: lead.id } : audit,
      ));
      setConnectBusinessOpen(false);
      setConnectBusinessQuery('');
      setConnectBusinessResults([]);
      toast({ title: 'Audit connected', description: `Connected to ${lead.business_name}.` });
    } catch (error) {
      toast({
        title: "Couldn't connect this audit",
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setConnectingLeadId(null);
    }
  };
  /* One run, always — a re-audit is a quick diagnostic. */
  const reAuditEstUsd = reAuditQuestions.filter((q) => q.trim()).length * RE_AUDIT_EST_USD_PER_QUESTION * runAgainRuns;

  // The re-run editor is open only for the run it was opened for (persisted flag is run-scoped),
  // so a stale editor can't reopen over a different audit after a tab-away/reload.

  // Scorecard: per-engine hit-rate across the completed questions + the competitors AI
  // named most often (from the per-engine "instead" lists). Cheap; recomputed from the
  // live queue rows so it fills in as the run drains.
  const perEngineScore = DISPLAY_ENGINES.map((engine) => {
    /* Pooled: sum the fold's per-question tallies for this engine, so "ChatGPT 5/12" becomes
       "ChatGPT 15/36" across three runs rather than one run's slice. */
    if (pooled && poolTally) {
      let named = 0; let total = 0;
      for (const q of poolTally.questions) {
        const t = q.perEngine[engine];
        if (t) { named += t.named; total += t.answered; }
      }
      return { engine, named, total };
    }
    let named = 0;
    let total = 0;
    for (const r of queueRows) {
      if (r.status === 'done' && r.result?.[engine]) { total++; if (cellNamed(r.result[engine])) named++; }
    }
    return { engine, named, total };
  });
  const topCompetitors = (() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const r of queueRows) {
      if (r.status !== 'done' || !r.result) continue;
      for (const engine of DISPLAY_ENGINES) {
        const er = r.result[engine];
        if (!er) continue;
        if (engine === 'google_organic') continue; // organic result TITLES aren't AI-named firms
        for (const c of er.competitors) {
          /* No per-name filter: the stored list is final, cleaned at audit time by
             extract-competitors. The operator view and the client report must show the SAME
             names — filtering here and not there is how they drifted apart. */
          if (!String(c).trim()) continue;
          const key = c.trim().toLowerCase();
          if (!key) continue;
          const cur = counts.get(key);
          if (cur) cur.count++; else counts.set(key, { name: c.trim(), count: 1 });
        }
      }
    }
    // Cap at the top 4 real names — better fewer real ones than lots of noise.
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 4).map((x) => x.name);
  })();

  /* WHICH WEBSITE SECTION THE OPEN AUDIT GETS. One lookup, so the preview, the download and the
     regenerate paths cannot disagree with each other — or with the public link, which derives the
     same thing server-side from the same column (seoStyleForAudit). */
  /* is_measurement is passed because baseline_target_runs alone no longer identifies a paid
     baseline - the free-check lane is multi-run too. See seoStyleForAudit. */
  const openSeoStyle = seoStyleForAudit(openAuditRow?.baseline_target_runs, openAuditRow?.is_measurement);

  // Live report data derived from the loaded rows (all runs once a report is opened; results.seo
  // passed straight through). Recomputed each render; snapshotted into `reports` on generate/
  // regenerate. internal:true — this is the OPERATOR preview, so it shows the winnability signal;
  // the client route (render-audit-report) never sets it.
  const liveReportData = (() => {
    /* ⛔ AGGREGATE ACROSS ALL RUNS. reportRows holds every run's rows once the run is terminal, so a
       Full Measurement reports "named X of 120". Falls back to queueRows (the single active run) only
       while draining / before the all-runs load — where a single-run live view is the correct thing. */
    const rd = buildReportData(reportRows.length ? reportRows : queueRows, run, {
      businessName: resultsBusinessName || businessName,
      businessType: resultsType,
      locationText: resultsLoc,
      specialisms,
      isAggregatorUrl,
      /* ⚠️ THE SAME EXPRESSION AS `ownWebsite` FURTHER DOWN, deliberately. It used to read
         `scanTargetUrl`, a variable the deleted Scan-site feature happened to compute earlier in
         the render — the report's own-site exclusion was riding on a scanning helper. Written out
         here so it depends on the audit's website and nothing else. */
      ownWebsite: (auditWebsite || (resultsHasWebsite ? website : '')).trim(),
      seoStyle: openSeoStyle,
    });
    if (rd) rd.internal = true; // snapshot default — OVERRIDDEN at render/print by AiAuditReport's Client/Internal toggle (showInternal)
    return rd;
  })();

  /* The business's own website (the opened audit's stored value, else the wizard URL when it has
     one) — used by scoreQuestion to exclude own-site citations from the aggregator share. May be
     "". ⚠️ This is why auditWebsite survived the schema block: it feeds SCORING, not display. */
  const ownWebsite = (auditWebsite || (resultsHasWebsite ? website : '')).trim();
  // Winnable shortlist headline: done questions that scored a real, targetable opportunity
  // (band winnable/named, score ≥ 6). Recomputed live from the queue rows.
  const winnableCount = queueRows.filter((r) => {
    if (r.status !== 'done' || !r.result) return false;
    const s = scoreQuestion(r.result, resultsBusinessName || businessName, resultsLoc, ownWebsite);
    return (s.band === 'winnable' || s.band === 'named') && (s.score ?? 0) >= 6;
  }).length;

  /* ── Fold the audit book into businesses, then trades ────────────────────────────
     BUSINESS KEY: lead_id when the audit has one, else the normalised name (2 of 43 audits
     were started from the wizard with no lead). Re-runs that minted separate audit rows for
     the same lead therefore collapse into ONE row here without touching the upstream
     behaviour that /a/<auditId> links depend on.
     TRADE: tradeWord(), because the raw business_type does not group — plumber/plumbers/
     Plumber are one trade stored three ways. */
  /* ⛔ ARCHIVED AUDITS ARE FILTERED HERE, NOT IN `listSource`. listSource also feeds
     `openAuditRow`, so filtering it would make an archived audit unopenable by deep link
     (/ai-audit?runId=…) — hidden from the list is not the same as gone from the app.
     ⚠️ `!a.archived_at` and not `a.archived_at === null`: the field is absent, not null, on a
     row fetched by the pre-migration fallback select, and an absent value must read as NOT
     archived or the whole book vanishes (CLAUDE.md §6). */
  const visibleAudits = useMemo<AuditLite[]>(
    () => listSource.filter((a) => (showArchived ? !!a.archived_at : !a.archived_at)),
    [listSource, showArchived],
  );
  /** How many are archived, for the toggle's label. Counted off the fetched window only, which
   *  is the same window the list itself shows — so the number and the list always agree. */
  const archivedCount = useMemo(() => listSource.filter((a) => !!a.archived_at).length, [listSource]);

  const businesses = useMemo<BusinessGroup[]>(() => {
    const byKey = new Map<string, AuditLite[]>();
    for (const a of visibleAudits) {
      const key = a.lead_id ?? `name:${(a.business_name ?? '').trim().toLowerCase()}`;
      const list = byKey.get(key) ?? [];
      list.push(a);
      byKey.set(key, list);
    }
    const out: BusinessGroup[] = [];
    for (const [key, auditsRaw] of byKey) {
      // Newest audit first, so the collapsed row reflects the most recent work.
      const audits = [...auditsRaw].sort((x, y) => y.created_at.localeCompare(x.created_at));
      const latestAudit = audits[0];
      const allRuns = audits.flatMap((a) => a.runs);
      out.push({
        key,
        name: latestAudit.business_name,
        trade: tradeWord(latestAudit.business_type),
        business_type: latestAudit.business_type,
        location: latestAudit.location_text,
        has_website: latestAudit.has_website,
        isMarket: latestAudit.is_market === true,
        audits,
        latestAudit,
        latestRun: latestAudit.runs[0] ?? null,
        runningRun: allRuns.find((r) => r.status === 'pending' || r.status === 'running') ?? null,
        auditCount: audits.length,
        runCount: allRuns.length,
        cost: allRuns.reduce((sum, r) => sum + (r.actor_cost_usd ?? 0), 0),
      });
    }
    // Most recent activity first within a trade.
    return out.sort((a, b) => b.latestAudit.created_at.localeCompare(a.latestAudit.created_at));
  }, [visibleAudits]);

  /* ── THE FILTER ───────────────────────────────────────────────────────────────────────────────
     Matches NAME, TRADE and TOWN, because the way you remember an audit is often "that Wisbech
     locksmith" rather than the company name. All three are already on the group, so this costs
     nothing.
     Case-insensitive SUBSTRING, not word-prefix: "wisb" has to find Wisbech, and "lock" has to find
     both "Locksmith" and "Wellsecure Locksmiths".
     Every term must match SOMEWHERE in the row, so "wisbech locksmith" narrows rather than widening
     — the two words are in different fields, which an all-in-one-field match would miss. */
  /* ⛔ THE SEARCH BOX FILTERS ON A DEFERRED COPY OF WHAT YOU TYPED, AND THAT IS THE TYPING LAG
     FIX. Measured 2026-09-10 against the live database: 968 audits fold into **901 business
     rows**, and `closedTrades` starts EMPTY — every trade group is expanded — so all 901 rows,
     each with its own pill row, were re-rendered synchronously on every single keystroke.
     `useDeferredValue` lets React paint the character you typed first and re-filter the list
     immediately afterwards, interrupting that work if you type again. The input stays bound to
     `auditQuery` (instant), everything downstream reads `deferredQuery`.
     ⚠️ NOT a debounce: nothing is delayed by a timer, and no keystroke is dropped. The list is
     never more than one render behind, and always settles on what you actually typed.
     ⚠️ The SERVER-side name search deliberately keeps reading the raw `auditQuery` — it has its
     own 300ms debounce, and deferring a value that is already debounced would only add lag. */
  const deferredQuery = useDeferredValue(auditQuery);
  const auditQueryTerms = useMemo(() => auditSearchTerms(deferredQuery), [deferredQuery]);
  const filteredBusinesses = useMemo(
    () => (auditQueryTerms.length === 0 ? businesses : businesses.filter((b) => auditMatches(b, auditQueryTerms))),
    [businesses, auditQueryTerms],
  );

  /* REMOVED 2026-09-10: `tradeGroups`, which folded the list into collapsible trade sections.
     Trade is a FILTER in the list now, not a nesting level — the grouping is what put 377
     locksmiths on screen at once and added an indent to reach any single business. The list
     derives its own trade options from the businesses it is given. */

  /** Anything draining? Gates the landing list's poller so an idle page makes no requests. */
  const inFlightCount = useMemo(
    () => businesses.reduce((n, b) => n + b.audits.reduce((m, a) => m + a.runs.filter((r) => r.status === 'pending' || r.status === 'running').length, 0), 0),
    [businesses],
  );

  /* Landing metrics — derived ONLY from data we already have (no invented numbers), and
     computed over BUSINESSES rather than audit rows: a business audited twice used to be
     counted twice in both the average and the invisible tally. "Site · presence" is gone;
     it counted has_website, a static property of the lead list that says nothing about how
     an audit turned out. */
  const metrics = useMemo(() => {
    const rated = businesses.filter((b) => b.latestRun?.mention_rate !== null && b.latestRun?.mention_rate !== undefined);
    const avgPct = rated.length
      ? Math.round((rated.reduce((s, b) => s + (b.latestRun!.mention_rate as number), 0) / rated.length) * 100)
      : null;
    const invisible = businesses.filter((b) => b.latestRun?.mention_rate === 0).length;
    const baselineAudits = savedAudits.filter((a) => Number(a.baseline_target_runs ?? 0) > 1);
    const baselinesDone = baselineAudits.filter((a) => !!a.baseline_completed_at).length;
    const spend = businesses.reduce((sum, b) => sum + b.cost, 0);
    return {
      businesses: businesses.length,
      audits: savedAudits.length,
      avgPct,
      invisible,
      inFlight: inFlightCount,
      baselineTotal: baselineAudits.length,
      baselinesDone,
      spend,
    };
  }, [businesses, savedAudits, inFlightCount]);

  const shown = (name: typeof WIZARD_STEPS[number]) => revealed >= WIZARD_STEPS.indexOf(name);

  // The business-details form is shown as one settled block once a path is chosen
  // (new business, or an existing lead has been picked). No progressive field reveal.
  const showForm = mode === 'new' || (mode === 'existing' && !!leadId);
  // All required fields present → questions can be generated. Website URL is required
  // only when "has website" is Yes (preserves the has_website behaviour). Specialisms
  // are optional.
  /* Location is required for LOCAL/HYBRID audits — both ask "[service] in [town]" questions and the
     server refuses a town-less local audit (create-ai-audit: local_scope_needs_town). A NATIONAL
     business has no town and must not be asked for one. townRequiredFor is the ONE rule, shared
     with the server's own gate, so the screen and the refusal cannot disagree. */
  const needsTown = townRequiredFor(businessScope);
  const showAudienceFields = audienceUsefulFor(businessScope);
  const canGenerate = !!businessName.trim() && !!businessType.trim()
    && (!!locationText.trim() || !needsTown)
    && !!country && hasWebsite !== null && (hasWebsite === false || !!website.trim());

  // Open a report: prefer the stored snapshot for that run (shown as-is), else the live
  // build. Regenerate is enabled only when we have live data for THIS run loaded.
  const rawOpenReportData = reportRunId ? (reports[reportRunId] ?? (reportRunId === runId ? liveReportData : null)) : null;
  // Defensive: a snapshot cached before the seo-guard shipped could still hold a failure
  // marker — strip it so opening a persisted report can't crash the generator.
  const openReportData = rawOpenReportData && rawOpenReportData.seo && !isRenderableSeo(rawOpenReportData.seo)
    ? { ...rawOpenReportData, seo: undefined }
    : rawOpenReportData;
  // Regenerate is available whenever the current run's report is open. It re-fetches live
  // data itself, so it doesn't depend on liveReportData already being in state.
  const canRegenerate = !!reportRunId && reportRunId === runId;

  // Snapshot the current run's live report and open it (used by the results screen). If a
  // snapshot already exists it is kept — opening never silently rebuilds it.
  const openReportForCurrentRun = async () => {
    if (!runId) return;
    if (reports[runId]) { setReportRunId(runId); return; }   // existing snapshot → show it
    /* Build from ALL runs (loadAuditRows), exactly like viewReport/regenerateReport, so a Full
       Measurement's snapshot is "named X of 120", not one run's 40. A 1-run quick audit's loadAuditRows
       returns just that run → identical to before. Fresh at click, so it reflects every run that has
       finished, even if later measurement runs completed after the in-place preview loaded. */
    const aId = run?.audit_id ?? auditId;
    const rows = aId ? await loadAuditRows(aId) : await loadRunRows(runId);
    const data = buildReportData(rows, run, {
      businessName: resultsBusinessName || businessName,
      businessType: resultsType,
      locationText: resultsLoc,
      specialisms,
      isAggregatorUrl,
      ownWebsite,
      seoStyle: openSeoStyle,
    });
    if (!data) { toast({ title: 'No completed results to report yet', variant: 'destructive' }); return; }
    attachMeasuring(data, aId ?? null);
    data.internal = true; // operator preview — winnability shown here, never on the client doc
    setReports((prev) => ({ ...prev, [runId]: data }));
    setReportRunId(runId);
  };
  // Rebuild the open report from the LATEST run data: re-fetch the run + its rows, rebuild
  // via buildReportData, overwrite the persisted snapshot, and surface feedback. (The old
  // version just re-stored the identical in-memory snapshot with no refresh and no feedback,
  // so clicking it did nothing visible.)
  const regenerateReport = async () => {
    if (!reportRunId || regenerating) return;
    const rid = reportRunId;
    setRegenerating(true);
    try {
      const freshRun = await pollRun(rid);          // refresh run + queueRows state, returns the run
      const aId = (freshRun ?? run)?.audit_id;
      const rows = aId ? await loadAuditRows(aId) : await loadRunRows(rid); // ALL runs — aggregate
      const data = buildReportData(rows, freshRun ?? run, {
        businessName: resultsBusinessName || businessName,
        businessType: resultsType,
        locationText: resultsLoc,
        specialisms,
        isAggregatorUrl,
        ownWebsite,
        seoStyle: openSeoStyle,
      });
      if (!data) {
        toast({ title: 'Nothing to rebuild yet', description: 'This run has no completed results.', variant: 'destructive' });
        return;
      }
      attachMeasuring(data, aId ?? null);
      data.internal = true; // snapshot default — OVERRIDDEN at render/print by AiAuditReport's Client/Internal toggle (showInternal); Client is what shows unless the operator switches
      setReports((prev) => ({ ...prev, [rid]: data }));
      toast({ title: 'Report regenerated', description: 'Rebuilt from the latest run data.' });
    } catch (e) {
      toast({ title: "Couldn't regenerate", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  // Does this run already have a graded SEO block? Drives the button label + panel copy.
  const hasSeo = isRenderableSeo((run?.results as { seo?: unknown } | null)?.seo);

  // Opened-audit header tiles. AI visibility = named datapoints (folded summary, else live
  // tally); SEO = the graded overall letter. Same sources the headline/report already use —
  // no new metric invented.
  const vizSummary = (run?.results as { summary?: { named_datapoints: number; total_datapoints: number } } | null)?.summary;
  /* ⛔ IN POOLED MODE THE STORED PER-RUN SUMMARY IS BYPASSED, and that is the whole point.
     `run.results.summary` is one run's own count, so preferring it here is exactly how a 3-run
     measurement came to read "7/24" instead of 20/72. Pooled reads the fold; single-run keeps
     the stored summary first, unchanged. */
  const vizNamed = pooled ? (poolTally?.named ?? 0) : (vizSummary?.named_datapoints ?? liveTally.named);
  const vizTotal = pooled ? (poolTally?.total ?? 0) : (vizSummary?.total_datapoints ?? liveTally.total);
  const vizPct = vizTotal > 0 ? Math.round((vizNamed / vizTotal) * 100) : 0;
  const vizTone: TileTone = vizTotal === 0 ? 'muted' : vizPct >= 50 ? 'green' : vizPct > 0 ? 'amber' : 'red';
  const seoGrade = hasSeo ? String((run?.results as { seo?: { overallGrade?: string } } | null)?.seo?.overallGrade ?? '') : '';

  // Run the automated Apify SEO scan → run-seo-scan (maps + stores AiAuditSeo at results.seo).
  // The actor takes ~30-120s. On success: refresh the run so results.seo is live, and INVALIDATE
  // this run's cached report snapshot so the SEO section shows immediately (not a stale snapshot).
  const runSeoScan = async () => {
    if (!runId || seoScanning) return;
    setSeoScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-seo-scan', { body: { runId } });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'scan failed');
      await pollRun(runId);                                   // refresh run.results (now has seo)
      setReports((prev) => {                                  // drop stale snapshot for this run
        if (!(runId in prev)) return prev;
        const next = { ...prev }; delete next[runId]; return next;
      });
      toast({ title: 'SEO scan complete', description: 'The report now includes the SEO section.' });
    } catch (e) {
      toast({ title: "SEO scan failed", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSeoScanning(false);
    }
  };

  /* REMOVED 2026-07-30: generatePlaybook. It was the ONLY caller of the generate-playbook edge
     function from the app, so that function is now unreachable — left in the repo on purpose, not
     deleted. It also carried the "no SEO scan yet, generate anyway?" confirm, which has no
     equivalent here and needs none: the evidence document reads the stored scan if one exists and
     prints its own honest line when it does not. Nothing is generated, so nothing can be generated
     prematurely. */

  // ── Public report page (/r/[slug]) ──────────────────────────────────────────
  // Look up the newest business_reports row for the OPEN audit, so the action row can show
  // "View report" (published) vs "Generate report" (none yet). business_reports isn't in the
  // generated types, so query through an untyped client cast. Keyed on auditId; cleared when
  // no audit is open. `cancelled` guards against a late response after the audit switched.
  useEffect(() => {
    let cancelled = false;
    if (!auditId) { setReportSlug(null); setReportStatus(null); setCredentials(''); return; }
    (async () => {
      const { data } = await (supabase as unknown as SupabaseClient)
        .from('business_reports')
        .select('slug, status')
        .eq('audit_id', auditId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { slug?: string; status?: string } | null;
      setReportSlug(row?.slug ?? null);
      setReportStatus(row?.status ?? null);
      // Pre-fill the inline credentials field from the audit's stored value (may be null). Untyped
      // cast: `credentials` was added by migration but isn't in the (stale) generated types yet.
      const { data: aud } = await (supabase as unknown as SupabaseClient)
        .from('ai_audits').select('credentials').eq('id', auditId).maybeSingle();
      if (cancelled) return;
      setCredentials(((aud as { credentials?: string | null } | null)?.credentials ?? '').toString());
    })();
    return () => { cancelled = true; };
  }, [auditId]);

  // Save the inline credentials field back to ai_audits.credentials. The NEXT "Generate listing"
  // picks it up (generate-report reads this column). Untyped cast: credentials isn't in the gen types.
  const saveCredentials = async () => {
    if (!auditId || credentialsSaving) return;
    setCredentialsSaving(true);
    try {
      const { error } = await (supabase as unknown as SupabaseClient)
        .from('ai_audits')
        .update({ credentials: credentials.trim() || null })
        .eq('id', auditId);
      if (error) throw new Error(error.message);
      toast({ title: 'Credentials saved', description: 'Included next time you generate the listing.' });
    } catch (e) {
      toast({ title: "Couldn't save credentials", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setCredentialsSaving(false);
    }
  };

  const openReportPage = (slug: string) =>
    window.open(`https://yoursites.uk/r/${slug}`, '_blank', 'noopener');

  // Generate the public report PAGE for this audit (generate-report edge fn → inserts a published
  // business_reports row), then link to it. Admin-gated on the edge, so we pass the session token
  // explicitly. Takes ~10-20s; the button shows a loading state meanwhile.
  const generateReportPage = async () => {
    if (!auditId || reportPageLoading) return;
    setReportPageLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const { data, error } = await supabase.functions.invoke('generate-report', {
        body: { auditId },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (error || !data?.ok || !data.slug) throw new Error(error?.message ?? data?.error ?? 'generation failed');
      const slug = data.slug as string;
      setReportSlug(slug);
      setReportStatus('published');   // generate-report inserts as published
      toast({ title: 'Report generated', description: 'The public report page is live.' });
      openReportPage(slug);            // auto-open the new page
    } catch (e) {
      toast({ title: "Couldn't generate the report", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setReportPageLoading(false);
    }
  };

  /* REMOVED 2026-07-30: the LLM playbook viewer (iframe preview + Internal/Client toggle + Regenerate
     + Download PDF) and generatePlaybook alongside it. It rendered the generate-playbook document,
     which recommended Bing Places (zero citations in 10,615) and omitted Checkatrade (662 across 58
     of 59 plumber audits). The single Playbook button in the action bar now opens /playbook/:auditId
     instead — evidence-derived, no model, nothing to generate.

     THE EDGE FUNCTION IS DELIBERATELY LEFT IN PLACE and is now simply unreachable from the app. It is
     not deleted, so the prompt and its output schema stay readable as the record of what went wrong.
     ⚠️ The Internal/Client toggle went with it — see the note on buildClientDoc in buildPlaybook.ts:
     the evidence path has a client-document BUILDER but nothing renders it, so there is currently no
     client-facing version of the playbook. That is a known gap, not an oversight of this change. */

  // Client-facing report is a separate view (replaces results while open).
  if (reportRunId && openReportData) {
    /* BEFORE / AFTER — the same report, twice, side by side and scaled down. The builder is passed
       IN so both sides use the identical buildReportData options this page already uses for the
       single report; three views, one rule. `auditId` may be null on a live run that has not been
       persisted yet, in which case there is nothing to compare against and the button is absent. */
    if (compareOpen && auditId) {
      return (
        <ReportBeforeAfter
          auditId={auditId}
          businessName={resultsBusinessName || businessName}
          ownWebsite={ownWebsite}
          buildData={(rows, run) => buildReportData(rows, run, {
            businessName: resultsBusinessName || businessName,
            businessType: resultsType,
            locationText: resultsLoc,
            specialisms,
            isAggregatorUrl,
            ownWebsite,
            seoStyle: openSeoStyle,
          })}
          onBack={() => setCompareOpen(false)}
        />
      );
    }
    return (
      <>
      <AiAuditReport
        /* key per report: remounting on open resets the Client/Internal toggle to Client (safety —
           an internal selection never carries into the next report). */
        key={reportRunId}
        data={openReportData}
        onBack={() => { setCompareOpen(false); setReportRunId(null); }}
        /* Only offered when there IS an audit to look for earlier runs in — a button that opens an
           empty comparison is worse than no button. */
        onCompare={auditId ? () => setCompareOpen(true) : undefined}
        /* Print follows the current view: the toggle hands us its choice; Client is the default and
           downloadReportHtml also fails safe to Client if internal is unset. */
        onDownload={(internal) => downloadReportHtml({ ...openReportData, internal })}
        reportUrl={openAuditRow?.short_code
          ? shortReportUrl(openAuditRow.short_code)
          : auditId ? `https://findable.live/report/${auditId}` : undefined}
        connectedBusinessLabel={openAuditRow?.lead_id
          ? (connectedBusiness?.business_name ?? 'an outreach business')
          : undefined}
        onConnectBusiness={!openAuditRow?.lead_id ? () => setConnectBusinessOpen(true) : undefined}
        onRegenerate={canRegenerate ? regenerateReport : undefined}
        regenerating={regenerating}
      />
      <Dialog open={connectBusinessOpen} onOpenChange={(open) => {
        setConnectBusinessOpen(open);
        if (!open) { setConnectBusinessQuery(''); setConnectBusinessResults([]); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect to Business</DialogTitle>
            <DialogDescription>
              Attach {openAuditRow?.business_name ?? 'this audit'} to an existing outreach business. No business or lead will be created.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={connectBusinessQuery}
            onChange={(event) => setConnectBusinessQuery(event.target.value)}
            placeholder="Search existing business name…"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {connectBusinessQuery.trim().length < 2 ? (
              <p className="p-3 text-sm text-muted-foreground">Enter at least two characters to search your outreach businesses.</p>
            ) : connectBusinessResults.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No matching outreach business found.</p>
            ) : connectBusinessResults.map((lead) => {
              const location = lead.derived_town || lead.address || lead.search_location || lead.country;
              return (
                <button
                  key={lead.id}
                  type="button"
                  disabled={!!connectingLeadId}
                  onClick={() => { void connectAuditToBusiness(lead); }}
                  className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{lead.business_name}</span>
                    {location && <span className="block truncate text-xs text-muted-foreground">{location}</span>}
                  </span>
                  {connectingLeadId === lead.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      </>
    );
  }


  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-7">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 justify-center sm:justify-start">
          <Sparkles className="h-5 w-5 text-primary" /> AI Visibility Audit
        </h1>
        <p className="text-sm text-muted-foreground">
          See whether AI assistants name a business when customers ask. Scored on ChatGPT and Gemini; Google's AI Overview is recorded where Google shows one.
        </p>
      </div>

      {/* APIFY SPEND — outside the step blocks on purpose, so it shows on the list, the results view
          and the empty state alike. It is the thing that silently stops every audit working. */}
      <ApifyUsageLine usage={apifyUsage} />

      {/* Stacked wizard — answered steps stay visible; each answer reveals the next. */}
      {step !== 'results' && (
        <div className="space-y-4">
          {/* ⛔ ONE LINE, NOT SIX CARDS. This was a six-tile dashboard sitting above the list,
              so it was the first thing on screen every time — including "IN FLIGHT 0", which is
              what it reads for all but a few minutes a week. These are reference numbers you
              glance at, not decisions you act on. Every figure is unchanged and still derived
              over BUSINESSES rather than audit rows: a business audited twice used to be counted
              twice in both the average and the invisible tally.
              ⚠️ Each figure hides itself when it has nothing to say, rather than printing a zero
              that reads as a measurement. */}
          {metrics.audits > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{metrics.businesses}</span> businesses
                {auditsCapped ? <span className="text-muted-foreground/70"> (of latest {AUDIT_FETCH_LIMIT})</span> : null}
              </span>
              {metrics.avgPct !== null && (
                <span>
                  <span className={`font-semibold ${metrics.avgPct >= 50 ? 'text-emerald-500' : metrics.avgPct > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                    {metrics.avgPct}%
                  </span> avg visibility
                </span>
              )}
              {metrics.invisible > 0 && (
                <span><span className="font-semibold text-red-500">{metrics.invisible}</span> invisible</span>
              )}
              {metrics.inFlight > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="font-semibold text-foreground">{metrics.inFlight}</span> running
                </span>
              )}
              {/* Paid baselines finalised vs started — the guarantee's measuring stick. */}
              {metrics.baselineTotal > 0 && (
                <span>
                  <span className={`font-semibold ${metrics.baselinesDone === metrics.baselineTotal ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {metrics.baselinesDone}/{metrics.baselineTotal}
                  </span> baselines done
                </span>
              )}
              {/* Real actor spend from ai_audit_runs.actor_cost_usd — only runs since that column
                  started being written carry a figure, so this is a floor, not a total. */}
              <span>
                <span className="font-semibold text-foreground">${metrics.spend.toFixed(2)}</span> recorded spend
              </span>
            </div>
          )}

          <AuditBookList
            businesses={businesses}
            filteredBusinesses={filteredBusinesses}
            metrics={metrics}
            auditsCapped={auditsCapped}
            fetchLimit={AUDIT_FETCH_LIMIT}
            searchMinBusinesses={SEARCH_MIN_BUSINESSES}
            auditQuery={auditQuery}
            deferredQuery={deferredQuery}
            auditQueryTerms={auditQueryTerms}
            onQueryChange={setAuditQuery}
            archivedReady={archivedReady}
            archivedCount={archivedCount}
            showArchived={showArchived}
            onToggleArchived={() => { setShowArchived((v) => !v); setAuditQuery(''); }}
            onNewAudit={() => setFormOpen(true)}
            onOpenAudit={reopenAudit}
            onViewReport={viewReport}
            onCancelRun={cancelAudit}
            onArchive={askArchiveAudit}
            onRestore={restoreAudit}
            busyId={deletingId}
            cancellingId={cancellingId}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          NEW-AUDIT DIALOG — the source picker, the business-details form and the question review,
          all of which used to sit on the page itself.

          RELOCATED, NOT REWRITTEN. Same fields in the same order, the same `canGenerate` rule, the
          same `runPreview` / `confirmAndRun`, the same write-back of the typed type + town to the
          lead. `StepCard` (a Card wrapper) became a plain divided block because a card inside a
          modal is a box inside a box.

          ⚠️ THE OUTREACH DEEP LINK OPENS THIS. /ai-audit?leadId=… sets `formOpen` in the very same
          branch that calls `pickLead`, so the prefill cannot silently stop reaching the operator.
          If this dialog is ever moved back inside the `step !== 'results'` block above, check that
          case again — it would unmount the moment an audit starts.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> New audit
            </DialogTitle>
            {/* Required by Radix: DialogContent without a description logs an a11y warning, and it
                is what a screen reader announces after the title. */}
            <DialogDescription>
              Pick a business, check the details, then review the questions before anything is spent.
            </DialogDescription>
          </DialogHeader>

          {/* START FRESH — your typed answers are saved and restored automatically (they survive
              leaving, reload, a new tab, even closing the tab). This clears the saved draft so the
              next audit starts blank — so a stale draft is never trapped. Only shown when there IS
              something to clear. */}
          {(mode !== null || !!businessName.trim() || !!businessType.trim() || !!locationText.trim() || !!website.trim() || !!specialisms.trim()) && (
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span>Your progress is saved automatically.</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={startNewAudit}>
                <RefreshCw className="mr-1 h-3 w-3" /> Start fresh
              </Button>
            </div>
          )}

          {/* SOURCE — moved in with the form. Without it the dialog could not switch to a different
              lead once open, which the page could always do. */}
          <div className="space-y-3">
            <StepHeader title="Audit a new business, or an existing lead?" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ChoiceButton active={mode === 'new'} onClick={() => { setMode('new'); setLeadId(null); reveal(WIZARD_STEPS.indexOf('name')); }} icon={<Building2 className="h-4 w-4" />} label="New business" hint="Enter the details yourself" />
              <ChoiceButton active={mode === 'existing'} onClick={() => setMode('existing')} icon={<Users className="h-4 w-4" />} label="Existing lead" hint="Pick from your CRM" />
            </div>
            {mode === 'existing' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Choose a lead</Label>
                <Select value={leadId ?? undefined} onValueChange={pickLead}>
                  <SelectTrigger><SelectValue placeholder="Select a lead…" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.business_name}{l.address ? ` — ${l.address}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Business details — one settled form, all fields visible at once */}
          {showForm && (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <StepHeader title="Business details" />
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Business name</Label>
                  <Input ref={nameRef} value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Joe's Barbers" />
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Business category / what they do</Label>
                  <Input ref={typeRef} value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="e.g. electrician, dentist, AI visibility service" />
                </div>

                {/* ⛔ THE MARKET MODEL, AND IT SITS ABOVE THE TOWN ON PURPOSE. It decides whether a
                    town is required at all, so asking it after the town field is what let a national
                    business be typed in as a local one. Wording comes from marketModel.ts — the same
                    module the generator's prompt blocks are built from. */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{MARKET_MODEL_QUESTION}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {MARKET_MODEL_OPTIONS.map((opt) => (
                      <ChoiceButton
                        key={opt.value}
                        active={businessScope === opt.value}
                        onClick={() => setBusinessScope(opt.value)}
                        label={opt.label}
                        hint={opt.blurb}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">This decides the shape of the questions: local searches, national buying questions, or both.</p>
                </div>

                {/* Location + country */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {needsTown ? 'Town / city' : 'Town / city (not needed)'}
                    </Label>
                    <Input ref={townRef} value={locationText} onChange={(e) => setLocationText(e.target.value)}
                      disabled={!needsTown}
                      placeholder={needsTown ? 'e.g. Leeds' : 'Not used — this business is not chosen for proximity'} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{businessScope === 'national' ? 'Country / market' : 'Country'}</Label>
                    <Select value={country || undefined} onValueChange={(v) => setCountry(v as Country)}>
                      <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                      <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Website (URL box appears only when "Yes" — drives has_website / SEO step) */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Does it have a website?</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <ChoiceButton active={hasWebsite === true} onClick={() => { setHasWebsite(true); setTimeout(() => urlRef.current?.focus(), 0); }} label="Yes" hint="Enter the URL" />
                    <ChoiceButton active={hasWebsite === false} onClick={() => { setHasWebsite(false); setWebsite(''); }} label="No" hint="Presence-led audit" />
                  </div>
                  {hasWebsite === true && (
                    <Input ref={urlRef} value={website} onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://…" />
                  )}
                </div>

                {/* Main services / topics (optional) — the grounding list every scope reads. */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Main services / topics</Label>
                  <Input ref={specialismsRef} value={specialisms} onChange={(e) => setSpecialisms(e.target.value)}
                    placeholder="e.g. rewires, EV chargers, fuse board upgrades" />
                  <p className="text-[11px] text-muted-foreground">Optional — helps us generate realistic searches customers might use.</p>
                </div>

                {/* Extra service areas — local and hybrid only; a national market has no towns. */}
                {needsTown && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Other service areas</Label>
                    <Input value={serviceAreasText} onChange={(e) => setServiceAreasText(e.target.value)}
                      placeholder="e.g. Rotherham, Barnsley" />
                    <p className="text-[11px] text-muted-foreground">Optional — a minority of questions may use these. We do not repeat the same question per town.</p>
                  </div>
                )}

                {/* Audience + sectors — national and hybrid only. A local trade's buyer is "people
                    in the town", so asking it there would add a field that changes nothing. */}
                {showAudienceFields && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Target customer / audience</Label>
                      <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)}
                        placeholder="e.g. UK local businesses" />
                      <p className="text-[11px] text-muted-foreground">Optional — who is doing the searching.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Specialist sectors / niches</Label>
                      <Input value={sectorsText} onChange={(e) => setSectorsText(e.target.value)}
                        placeholder="e.g. trades, hospitality" />
                      <p className="text-[11px] text-muted-foreground">Optional — used for a minority of the questions at most.</p>
                    </div>
                  </>
                )}

                {/* ── MODE: Quick check · Full measurement · Discovery ───────────────────────────
                    Quick is unchanged (3–5 questions, one run). Full is the deliberate before/after
                    gather, 20 × 3. Discovery is 1–80 × 1–3, default 40 × 3 (Paul, 2026-09-21) — it
                    finds where a business appears and where it is missing, and a gap it turns up is
                    a lead to follow rather than a measurement. Each hint states its own count and
                    runs, because those two numbers ARE the difference between the three. */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Audit mode</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <ChoiceButton
                      active={auditMode === 'quick'}
                      onClick={() => switchAuditMode('quick')}
                      icon={<Sparkles className="h-4 w-4" />}
                      label="Quick check"
                      hint={`${MIN_QUESTION_COUNT}–${MAX_QUESTION_COUNT} questions × 1 · fast snapshot`}
                    />
                    <ChoiceButton
                      active={fullMode}
                      onClick={() => switchAuditMode('full')}
                      icon={<ListChecks className="h-4 w-4" />}
                      label="Full measurement"
                      hint={`${FULL_MEASURE_COUNT} questions × 3 · more reliable`}
                    />
                    <ChoiceButton
                      active={discoveryMode}
                      onClick={() => switchAuditMode('discovery')}
                      icon={<Compass className="h-4 w-4" />}
                      label="Discovery"
                      hint={`up to ${DISCOVERY_MAX_QUESTIONS} questions × up to ${DISCOVERY_MAX_RUNS} · broad opportunity scan`}
                    />
                  </div>
                </div>

                {/* Number of questions. Quick: WIZARD 3–5, operator's choice. Full measurement:
                    FIXED at its constant — the paid methodology, no dial. Discovery: typed 1..80,
                    because a dropdown of eighty entries is worse than a box. Every bound comes
                    from the shared policy module the server validates against. */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">How many questions?</Label>
                  <div className="flex items-center gap-3">
                    {discoveryMode ? (
                      <Input
                        type="number"
                        className="w-24"
                        min={DISCOVERY_MIN_QUESTIONS}
                        max={DISCOVERY_MAX_QUESTIONS}
                        value={questionCount}
                        aria-label="How many questions to generate"
                        onChange={(e) => setQuestionCount(clampDiscoveryQuestions(Number(e.target.value)))}
                      />
                    ) : fullMode ? (
                      <span className="inline-flex h-9 w-24 items-center justify-center rounded-md border bg-muted/40 text-sm font-medium">{questionCount}</span>
                    ) : (
                      <Select
                        value={String(questionCount)}
                        onValueChange={(v) => setQuestionCount(clampQuestionCount(Number(v)))}
                      >
                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUESTION_COUNT_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      We'll generate {questionCount} search question{questionCount === 1 ? '' : 's'}
                      {unitCost > 0 ? ` · est. cost ~$${(questionCount * unitCost).toFixed(2)}` : ''}.
                    </span>
                  </div>
                  {fullMode && (
                    <p className="text-[11px] text-muted-foreground/80">
                      A full measure asks {FULL_MEASURE_COUNT} questions across ChatGPT and Gemini, three runs each, and is
                      <strong> paced through the queue</strong> (max ~24 running at once). It finds which questions
                      and towns are winnable so we know where to build pages. It is never compared to anything —
                      the refund is judged on the frozen baseline, not this. SEO scan is skipped.
                    </p>
                  )}
                  {discoveryMode && (
                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs text-muted-foreground">Runs</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {DISCOVERY_RUN_OPTIONS.map((o) => (
                          <ChoiceButton
                            key={o.runs}
                            active={discoveryRuns === o.runs}
                            onClick={() => setDiscoveryRuns(o.runs)}
                            label={`${o.runs} run${o.runs === 1 ? '' : 's'}`}
                            hint={o.note}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {questionCount} question{questionCount === 1 ? '' : 's'} × {discoveryRuns} run{discoveryRuns === 1 ? '' : 's'}
                        {unitCost > 0 ? ` · est. cost ~${(questionCount * discoveryRuns * unitCost).toFixed(2)}` : ''}
                        {discoveryRuns > 1
                          ? ' · the same questions each time, so you can see which ones the engines answer consistently.'
                          : ` · one ask per question is a single sample. ${DISCOVERY_DEFAULT_RUNS} is the default for a reason.`}
                      </p>
                    </div>
                  )}
                  {discoveryMode && (
                    <p className="text-[11px] text-muted-foreground/80">
                      Discovery asks {questionCount} different question{questionCount === 1 ? '' : 's'} across ChatGPT and Gemini
                      to find where this business shows up, where it is missing, who keeps getting named instead
                      and which sources the engines lean on. You pick which of them to run on the next step.
                      Breadth first — treat a gap as somewhere to look, not as a measurement, and measure anything
                      important properly afterwards. Never compared to a baseline. SEO scan is skipped.
                    </p>
                  )}
                </div>

                {/* Generate → reveals the review step, which generates the questions */}
                <div className="pt-1">
                  <Button onClick={() => reveal(REVIEW_INDEX)} disabled={!canGenerate}>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate questions
                  </Button>
                  {!canGenerate && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Fill in name, category, {needsTown ? 'town, ' : ''}country and the website choice to continue.
                      {needsTown && ' (No town is needed if you pick “National / remote”.)'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Review the questions + cost — second stage of the same dialog. Kept in here rather than
              left on the page: it is part of creating an audit, and leaving it outside would put form
              content back on the list page, which is the thing this change set out to remove. */}
          {shown('review') && (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-2">
                <StepHeader title="Review the questions" />
                <Button variant="ghost" size="sm" onClick={runPreview} disabled={previewing} title="Regenerate questions">
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${previewing ? 'animate-spin' : ''}`} /> Regenerate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                These are the searches we'll run across {SCORED_ENGINES.map((e) => ENGINE_LABELS[e]).join(' + ')} (plus AI Overview & Google). Edit, add or remove any.
              </p>
              {/* WHY THIS SET. Without it the operator is judging questions with no sight of the
                  context they came from, which is how a national business's local-looking set got
                  approved. Reads straight off the same state the request was built from. */}
              <p className="text-[11px] text-muted-foreground -mt-2">
                Generated for <strong>{businessName || 'this business'}</strong>
                {businessType ? ` · ${businessType}` : ''}
                {` · ${MARKET_MODEL_OPTIONS.find((o) => o.value === businessScope)?.label ?? 'market model not set'}`}
                {needsTown && locationText ? ` · ${locationText}` : ''}
                {country ? ` · ${country}` : ''}
                {showAudienceFields && targetAudience ? ` · for ${targetAudience}` : ''}
                {specialisms ? ` · ${specialisms}` : ''}
              </p>

              {previewing ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" /> Generating questions…
                </div>
              ) : (
                <>
                  <AuditQuestionEditor
                    questions={questions}
                    onChange={changeQuestions}
                    busy={running}
                    {...(discoveryMode ? { selected, onToggle: toggleQuestion } : {})}
                  />
                  {/* ── THE SUMMARY BEFORE THE BUTTON — discovery only ─────────────────────────
                      Everything here is derived from the SELECTED list, so it is a statement about
                      the audit that is about to start rather than about the wizard's settings.
                      The total is expectedResponses(), the same function the server records on the
                      run, so the number quoted and the number recorded cannot drift. */}
                  {discoveryMode && (
                    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Questions</span>
                        <span className={`font-medium ${tooManyQuestions || tooFewQuestions ? 'text-destructive' : ''}`}>
                          {runQuestions.length} / {DISCOVERY_MAX_QUESTIONS} questions selected
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Runs per question</span>
                        <span className="font-medium">{runCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Engines</span>
                        <span className="font-medium">{SCORED_ENGINES.map((e) => ENGINE_LABELS[e]).join(' + ')}</span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-1 mt-1">
                        <span className="text-muted-foreground">Expected AI responses</span>
                        <span className="font-semibold">
                          {totalResponses} <span className="font-normal text-muted-foreground">({runQuestions.length} × {runCount} × {engineTotal})</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button type="button" size="sm" variant="outline" disabled={running} onClick={() => setSelected(selectAll(questions))}>Select all</Button>
                        <Button type="button" size="sm" variant="outline" disabled={running} onClick={() => setSelected(new Set())}>Deselect all</Button>
                      </div>
                      {tooManyQuestions && (
                        <p className="text-destructive pt-1">
                          Deselect {runQuestions.length - DISCOVERY_MAX_QUESTIONS} — a discovery audit runs at most {DISCOVERY_MAX_QUESTIONS} questions.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {runQuestions.length} question{runQuestions.length === 1 ? '' : 's'}
                      {discoveryMode ? ` × ${runCount} run${runCount === 1 ? '' : 's'}` : ''} · est. cost ~$
                      {(discoveryMode ? Number((runQuestions.length * runCount * unitCost).toFixed(2)) : estimatedCost).toFixed(2)}
                    </span>
                    {/* ⛔ ARROW, NOT A BARE REFERENCE. onClick={confirmAndRun} passes the click EVENT as the
                        first argument, which is truthy — the distance override would be ON for every
                        single audit and the guard would never fire once. */}
                    <Button onClick={() => confirmAndRun()} disabled={running || tooFewQuestions || tooManyQuestions}>
                      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Confirm & run
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ THE WRONG-TOWN BLOCK ════════════════════════════════════════════════════
          Nothing has been spent at this point — create-ai-audit refuses before generating questions
          or inserting queue rows, so cancelling costs nothing and overriding costs the normal audit. */}
      {/* ════════════════════════════════════════════════════════════════════════════════════
          ARCHIVE CONFIRM — replaces a one-line window.confirm that said only "this can't be
          undone" and was, unusually, telling the truth. It now shows WHAT is being archived
          (how many audits and runs sit under it), states plainly that nothing is deleted, and
          when the audit is load-bearing it REFUSES with the reason instead of asking.
          ⚠️ The verdict was computed before this opened — the dialog reports a decision, it
          does not make one, so the confirm button cannot race the check. */}
      <Dialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          {archiveTarget && (() => {
            const { audit, verdict } = archiveTarget;
            const runCount = audit.runs?.length ?? 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {verdict.isProtected
                      ? (<><ShieldCheck className="h-4 w-4 text-primary" /> Kept — this one is protected</>)
                      : (<><Archive className="h-4 w-4" /> Archive this audit?</>)}
                  </DialogTitle>
                  <DialogDescription className="pt-1">
                    <span className="font-medium text-foreground">{audit.business_name}</span>
                    {audit.location_text ? <> · {audit.location_text}</> : null}
                    {' · '}
                    {new Date(audit.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </DialogDescription>
                </DialogHeader>

                {verdict.isProtected ? (
                  <div className="space-y-3 text-sm">
                    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                      {/* Every reason, not just the headline: an audit can be a customer's
                          baseline AND part of a locked set, and hiding the second one would
                          make a later refusal look inconsistent. */}
                      <ul className="space-y-1.5">
                        {verdict.reasons.map((r) => (
                          <li key={r} className="text-foreground">{PROTECTION_WORDING[r]}</li>
                        ))}
                      </ul>
                    </div>
                    <p className="text-muted-foreground">
                      {verdict.uncertain
                        ? 'Because that check did not answer, this audit is being kept. Try again in a moment, or archive it once the check succeeds.'
                        : 'Audits like this are the evidence behind what a customer was promised, so they cannot be archived from here.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      It will be hidden from the audit list. <span className="font-medium text-foreground">Nothing is deleted</span> —
                      the audit, its {runCount === 1 ? 'run' : `${runCount} runs`} and every stored answer stay in the database,
                      and you can bring it back at any time from <span className="font-medium text-foreground">Show archived</span>.
                    </p>
                    <p className="text-muted-foreground">
                      Any report link already sent to a prospect keeps working.
                    </p>
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={() => setArchiveTarget(null)}>
                    {verdict.isProtected ? 'Close' : 'Cancel'}
                  </Button>
                  {!verdict.isProtected && (
                    <Button onClick={confirmArchiveAudit} disabled={deletingId === audit.id}>
                      {deletingId === audit.id
                        ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Archiving…</>)
                        : (<><Archive className="mr-2 h-4 w-4" /> Archive</>)}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!distanceBlock} onOpenChange={(o) => { if (!o) setDistanceBlock(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              This business is {distanceBlock?.km} km from {distanceBlock?.town}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {/* The server's own sentence, verbatim. One wording, one place to change it. */}
              {distanceBlock?.message}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            Nothing has been spent. Cancel and fix the town on the lead, or audit anyway if you know
            they work there.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDistanceBlock(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={running}
              onClick={() => { setDistanceBlock(null); confirmAndRun(true); }}
            >
              Audit anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {step === 'results' && (
        <div className="space-y-4">
          {/* All in-flight audits (this operator) — one progress row each, so firing a second audit
              doesn't wipe the first from view. Driven by the runningList poller (ai_audit_runs +
              queue counts), independent of the single open run detailed below. */}
          {runningList.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Audits running now ({runningList.length})</div>
                {runningList.map((r) => (
                  <div key={r.runId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{r.name}{r.runId === runId ? ' · current' : ''}</span>
                      <span className="shrink-0 text-muted-foreground">{r.done}/{r.total || '…'}</span>
                    </div>
                    <Progress value={r.total ? (r.done / r.total) * 100 : 0} className="h-1.5" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {/* ── Command-centre header: business + two score tiles + actions ── */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* ════════════════════════════════════════════════════════════════════════════
                  THE RESULTS HEADER — rebuilt 2026-09-10.

                  🔴 WHAT IT WAS. Eight to eleven buttons in one undifferentiated row, all the
                  same size and weight, above a credentials text field — and only BELOW all of
                  that did the business name and its score appear. So the thing you opened the
                  page to read started four rows down, and "Re-extract competitors" (a technical
                  repair, used rarely) was the brightest control on screen while "Create report"
                  (the reason the page exists) was an outline button in the middle of the row.

                  ⛔ THE RULE APPLIED: the ANSWER comes first, then the one action you are most
                  likely to want, then everything else behind one menu. Nothing was removed —
                  every action below is still reachable, and the count is unchanged.

                  ⚠️ TWO THINGS ARE DELIBERATELY NOT IN THE MENU:
                  · STOP, while a run is draining — it is urgent and time-limited.
                  · RE-EXTRACT, when the names are proven dirty — it is the FIX for the warning
                    directly above it, and the old code put it there on purpose. Burying a fix
                    in a menu under the warning that demands it is how a warning gets ignored.
                  ════════════════════════════════════════════════════════════════════════════ */}
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" className="-ml-2" onClick={() => { setStep('source'); setOpenRunId(null); }}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to audits
                </Button>
                <div className="flex items-center gap-2">
                  {/* Urgent and time-limited: never behind a menu. */}
                  {isDraining && runId && (
                    <Button variant="outline" size="sm" onClick={cancelOpenRun} disabled={cancellingId === runId}
                      className="text-destructive hover:text-destructive" title="Stop this audit — it won't finish">
                      {cancellingId === runId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleStop className="mr-2 h-4 w-4" />}
                      {cancellingId === runId ? 'Stopping…' : 'Stop'}
                    </Button>
                  )}

                  {/* ── WHICH RUNS ─────────────────────────────────────────────────────────
                      Only when there is a choice to make. A 1-run audit gets no picker: a
                      control with one option is furniture. */}
                  {!isDraining && auditRuns.length > 1 && (
                    <Select value={runScope} onValueChange={(v) => setRunScope(v)}>
                      <SelectTrigger className="h-8 w-[168px] text-[13px]"><SelectValue /></SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="all">All {auditRuns.length} runs (pooled)</SelectItem>
                        {[...auditRuns].sort((a, b) => b.run_number - a.run_number).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            Run {r.run_number} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            {r.status !== 'complete' ? ` · ${r.status}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* THE PRIMARY ACTION — the report is what this screen is for.
                      ⚠️ I BRIEFLY HID THIS IN POOLED MODE ON A FALSE PREMISE, 2026-09-10. The
                      belief was that a report is one run's document, so pooling the screen while
                      the button built from a single run would be dishonest. It is not: the
                      REPORT HAS ALWAYS POOLED. `openReportForCurrentRun` calls
                      loadAuditRows(auditId) — every run of the audit — and buildReportData does
                      not filter by run at all; it counts whatever rows it is handed and uses
                      `run` only for the cleaning stamp and metadata. So the button is correct in
                      both modes and always was. What was genuinely per-run was the RESULTS
                      SCREEN reading one run out of component state, which is the thing pooling
                      fixed. Caught by a second session reading the code rather than the comment
                      I wrote about it. */}
                  {!isDraining && liveTally.done > 0 && (
                    <Button size="sm" onClick={openReportForCurrentRun}>
                      <FileText className="mr-2 h-4 w-4" /> {runId && reports[runId] ? 'View report' : 'Create report'}
                    </Button>
                  )}

                  {/* Everything else. One menu, grouped, with prices on the faces that spend. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" title="More actions for this audit">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">More actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuLabel>Audit this business again</DropdownMenuLabel>
                      {/* ⛔ TWO ACTIONS, TWO MEANINGS, AND THEY NO LONGER OVERLAP. "Re-audit" and
                          "Re-run" sat here together: one minted a copy, the other added a run to
                          THIS row, and neither label said which. Run again repeats the whole
                          configuration as a NEW audit; Start new audit reopens the wizard on the
                          same business so everything can change. Nothing adds runs to an audit that
                          has already been measured — that is what mixed an after into a before. */}
                      {!isDraining && auditId && (
                        <DropdownMenuItem
                          onSelect={startRunAgain}
                          disabled={running || isDraining || reAuditOpen || reAuditBusy || !runAgainVerdict.ok}
                          title={runAgainVerdict.ok ? undefined : runAgainVerdict.reason}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          <span className="flex-1">Run again</span>
                          <span className="text-[10px] text-muted-foreground">
                            {runAgainVerdict.ok ? `same set × ${runAgainRuns}` : 'not for this kind'}
                          </span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onSelect={startNewAuditFromThis} disabled={running || !openAuditRow}>
                        <CopyPlus className="mr-2 h-4 w-4" />
                        <span className="flex-1">Start new audit</span>
                        <span className="text-[10px] text-muted-foreground">prefilled</span>
                      </DropdownMenuItem>
                      {/* Automated SEO scan — website audits only. Price on the face: the house
                          rule is that every spend says what it costs, derived from the
                          sync-guarded constant and never hand-typed (§4). */}
                      {!isDraining && resultsHasWebsite && (
                        <DropdownMenuItem onSelect={runSeoScan} disabled={seoScanning}>
                          <Globe className="mr-2 h-4 w-4" />
                          <span className="flex-1">{hasSeo ? 'Re-run SEO scan' : 'Run SEO scan'}</span>
                          <span className="text-[10px] text-muted-foreground">~{asPence(SEO_SCAN_USD)}</span>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Deliverables</DropdownMenuLabel>
                      {/* Public LISTING page (/r/[slug]) — distinct from the in-app report above:
                          this is the crawlable public listing. Needs auditId (generate-report's key). */}
                      {!isDraining && liveTally.done > 0 && auditId && (
                        reportSlug && reportStatus === 'published' ? (
                          <DropdownMenuItem onSelect={() => openReportPage(reportSlug)}>
                            <ExternalLink className="mr-2 h-4 w-4" /> View listing
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={generateReportPage} disabled={reportPageLoading}>
                            <FileText className="mr-2 h-4 w-4" />
                            {reportPageLoading ? 'Generating…' : 'Generate listing'}
                          </DropdownMenuItem>
                        )
                      )}
                      {/* ── PLAYBOOK. ONE BUTTON, ONE DOCUMENT. Goes to /playbook/:auditId, the
                          EVIDENCE-derived document — not the deleted generate-playbook LLM one
                          that recommended Bing Places (zero citations in 10,615) and never
                          mentioned Checkatrade (662 across 58 of 59 plumber audits).
                          GATED ON auditId ALONE, deliberately not on liveTally.done: the ranking
                          is trade-level, so the document is complete even when THIS run failed.
                          Macca-Gas's run died at the Apify cap and its playbook is still right. */}
                      {auditId && (
                        <DropdownMenuItem asChild>
                          {/* Carries the open run, so Back comes straight back to this audit's
                              results rather than dropping you at the top of the list. */}
                          <Link to={`/playbook/${auditId}`} state={{ from: runId ? `/ai-audit?runId=${runId}` : '/ai-audit', fromLabel: 'AI Audit' }}>
                            <MapIcon className="mr-2 h-4 w-4" /> Playbook
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {/* Credentials moved in here: an occasional field that was holding a
                          permanent row of vertical space above the actual result. */}
                      {!isDraining && liveTally.done > 0 && auditId && (
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setCredentialsOpen((v) => !v); }}>
                          <Save className="mr-2 h-4 w-4" />
                          <span className="flex-1">Credentials for listing</span>
                          {credentials.trim() ? <Check className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      {/* Re-extract — FREE and instant: recomputes from the STORED answers, no
                          re-scrape. It also appears as a button under the dirty-names warning,
                          which is where it belongs when it is actually needed. */}
                      {!isDraining && liveTally.done > 0 && (
                        <DropdownMenuItem onSelect={reextractCompetitors} disabled={reextracting}>
                          <Users className="mr-2 h-4 w-4" />
                          <span className="flex-1">{reextracting ? 'Re-extracting…' : 'Re-extract competitors'}</span>
                          <span className="text-[10px] text-muted-foreground">free</span>
                        </DropdownMenuItem>
                      )}
                      {/* RESUME DRAFT — labelled with its contents so it is never a silent restore. */}
                      {draftSummary && (
                        <DropdownMenuItem onSelect={resumeDraft}>
                          <Undo2 className="mr-2 h-4 w-4" />
                          <span className="truncate">Resume draft — {draftSummary}</span>
                        </DropdownMenuItem>
                      )}
                      {/* ⚠️ DISCARDS the draft above, on purpose. Named "blank" so it cannot be
                          confused with "Start new audit", which prefills from THIS business. */}
                      <DropdownMenuItem onSelect={startNewAudit}>
                        <Plus className="mr-2 h-4 w-4" /> New audit — blank
                      </DropdownMenuItem>

                      {/* ⛔ DESTRUCTIVE, LAST, AND SEPARATED. Refused outright for a paid baseline
                          or a day-28 replay: deleting one nulls the lead's pointer and the claim
                          trigger is AFTER INSERT only, so nothing can ever put it back. The reason
                          is on the item rather than in a toast nobody reads. */}
                      {auditId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setDeleteOpen(true)}
                            disabled={deleteBusy || !deleteVerdict.ok}
                            title={deleteVerdict.ok ? undefined : deleteVerdict.reason}
                            className={deleteVerdict.ok ? 'text-destructive focus:text-destructive' : undefined}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span className="flex-1">Delete audit</span>
                            {!deleteVerdict.ok && <span className="text-[10px] text-muted-foreground">protected</span>}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* ⛔ THE FAIL-SAFE, VISIBLE. Paul's rule 2026-08-28: never ship a junk-named report
                  without knowing. Basis = "the names themselves", so it fires on historic audits
                  too, not only on ones carrying a cleaning receipt.
                  ⚠️ THE FIX LIVES INSIDE THE WARNING, and that is deliberate. Re-extract is in the
                  More menu the rest of the time; when the names are PROVEN dirty it belongs under
                  the sentence demanding it. A warning whose remedy is hidden behind a menu is a
                  warning that gets scrolled past. */}
              {competitorCleanliness.verdict === 'dirty' && !isDraining && (
                <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
                  {/* ⛔ THE HEADING AND THE CONSEQUENCE BOTH READ `suppressNames`, NOT the verdict.
                      They used to be hardcoded, and from 2026-09-14 that would have been a lie in
                      the one place an operator goes to find out what happened: an incomplete
                      cleaning receipt with ZERO junk names now WARNS without withholding anything,
                      so "do not send to client" and "rival names are withheld" would both be false
                      while the report printed its competitors perfectly. A banner that overstates
                      is how a real warning stops being read. */}
                  <div className="font-medium text-amber-700 dark:text-amber-400">
                    {competitorCleanliness.suppressNames
                      ? 'Competitor names not cleaned — do not send to client'
                      : 'Competitor names only partly cleaned — the names themselves look fine'}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {competitorCleanliness.warning}
                    {competitorCleanliness.suppressNames
                      ? ' Rival names are withheld from the report until this is re-extracted, so it'
                        + ' cannot print raw text as a competitor.'
                      : ' The report still prints them: nothing stored for this run is provable junk,'
                        + ' and a receipt saying an answer id came back empty is not evidence of dirty data.'}
                  </div>
                  {competitorCleanliness.junkExamples.length > 0 && (
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {competitorCleanliness.junkExamples.slice(0, 12).join(' · ')}
                      {competitorCleanliness.junkExamples.length > 12
                        ? ` · +${competitorCleanliness.junkExamples.length - 12} more` : ''}
                    </div>
                  )}
                  {liveTally.done > 0 && (
                    <Button size="sm" className="mt-2" onClick={reextractCompetitors} disabled={reextracting}
                      title="Recompute competitor names from the stored answers — an AI re-read, no new search">
                      {reextracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                      {reextracting ? 'Re-extracting…' : 'Re-extract competitors — free'}
                    </Button>
                  )}
                </div>
              )}

              {/* Inline credentials/regulation for the listing — a small operator field. Saved to
                  ai_audits.credentials; the NEXT "Generate listing" picks it up. Same gate as the
                  listing button (a valid, non-draining audit). */}
              {credentialsOpen && !isDraining && liveTally.done > 0 && auditId && (
                <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-3">
                  <Label className="text-xs text-muted-foreground">Credentials / regulation (for listing)</Label>
                  <div className="flex items-center gap-2">
                    <Input value={credentials} onChange={(e) => setCredentials(e.target.value)}
                      placeholder="e.g. ACCA regulated, Chartered Tax Adviser (CTA)" className="h-8 text-sm" />
                    <Button variant="outline" size="sm" onClick={saveCredentials} disabled={credentialsSaving} className="shrink-0">
                      {credentialsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {credentialsSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Set before generating the listing — it's surfaced as a trust signal.</p>
                </div>
              )}

              {/* RE-AUDIT confirmation — questions prefilled VERBATIM from the audit being re-audited,
                  editable, with the cost stated before anything is created. Nothing is written until
                  Start re-audit is pressed. */}
              {/* ── RUN AGAIN — CONFIRMATION, NOT AN EDITOR ────────────────────────────────────
                  ⛔ READ-ONLY ON PURPOSE. "Run again" means the SAME set, in the SAME order, with
                  the SAME settings — an independent repeat of one measurement. The moment this
                  screen let the questions be edited, "run it again" and "measure something else"
                  became one button, which is the ambiguity this whole change removes. Editing (and
                  pasting) lives in the wizard, one item up, behind "Start new audit".
                  Nothing is written until Run again is pressed. */}
              {reAuditOpen && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Run again — creates a NEW audit</span>
                    <Button variant="ghost" size="sm" onClick={cancelReAudit} disabled={reAuditBusy}>Cancel</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A separate audit for <span className="font-medium text-foreground">{resultsBusinessName || 'this business'}</span>,
                    with the same questions, the same order and the same settings.
                    <span className="font-medium text-foreground"> This audit is not modified</span> — it keeps its own
                    runs and results.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Questions are copied exactly as they were asked, including any misspellings, so the two
                    are like-for-like. To change anything, use <span className="font-medium text-foreground">Start new audit</span> instead.
                  </p>
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background/60 p-2">
                    {reAuditQuestions.filter((q) => q.trim()).map((q, i) => (
                      <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground/60">{i + 1}.</span>
                        <span className="text-foreground">{q}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="text-xs text-muted-foreground">
                      {/* The run count is the STORED one, so a 40 x 3 discovery scan repeats as 40 x 3. */}
                      <span className="font-medium text-foreground">
                        {reAuditQuestions.filter((q) => q.trim()).length} question{reAuditQuestions.filter((q) => q.trim()).length === 1 ? '' : 's'}
                        {' × '}{runAgainRuns} run{runAgainRuns === 1 ? '' : 's'}
                      </span>
                      {' · '}
                      estimated cost{' '}
                      <span className="font-medium text-foreground">
                        ${reAuditEstUsd.toFixed(2)}
                      </span>
                      {' '}(~£{(reAuditEstUsd * 0.8).toFixed(2)})
                      <span className="block text-[10px] text-muted-foreground/70">
                        ${RE_AUDIT_EST_USD_PER_QUESTION}/question × {runAgainRuns} run{runAgainRuns === 1 ? '' : 's'},
                        from measured spend (81 runs, mean $0.042/run). Varies per run — the actual figure
                        is recorded when it finishes.
                      </span>
                    </div>
                    <Button size="sm" onClick={confirmRunAgain}
                      disabled={reAuditBusy || reAuditQuestions.filter((q) => q.trim()).length === 0}>
                      {reAuditBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      {reAuditBusy ? 'Starting…' : 'Run again'}
                    </Button>
                  </div>
                </div>
              )}

              {/* ⛔ THE "Re-run" EDITOR IS GONE (2026-09-20). It added a run to THIS audit with
                  edited questions — a second measurement wearing the first one's id, which is how an
                  "after" gets mixed into a "before". Its two real jobs are now separate and named:
                  repeat it exactly → Run again (a new audit); measure something different → Start
                  new audit (the wizard, with paste and editing). */}

              {deleteOpen && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
                  <span className="text-sm font-semibold text-destructive">Delete this audit?</span>
                  <p className="text-xs text-muted-foreground">
                    This permanently removes this audit and its runs and results.
                    <span className="font-medium text-foreground"> The business itself will not be deleted</span> —
                    its lead, its messages and any other audits it has are untouched.
                  </p>
                  {(openAuditRow?.runs ?? []).some((r) => !TERMINAL.has(r.status)) && (
                    <p className="text-[11px] text-muted-foreground">
                      This audit still has work in flight. It will be stopped first, so nothing can run after it is gone.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-destructive/30 pt-3">
                    <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={deleteAudit} disabled={deleteBusy}>
                      {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      {deleteBusy ? 'Deleting…' : 'Delete audit'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Business name — large + bold. The audit DATE is shown here because a business can now
                  have several audits (before / after), and without it there is no way to tell from this
                  screen which one is open. Full year: a before/after can straddle a year boundary. */}
              <div>
                <h2 className="text-2xl font-bold tracking-tight leading-tight">{resultsBusinessName || 'Audit'}</h2>
                {(resultsType || resultsLoc || openAuditRow) && (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {[resultsType, resultsLoc].filter(Boolean).join(' · ')}
                    {openAuditRow && (
                      <>
                        {(resultsType || resultsLoc) && ' · '}
                        <span className="font-medium text-foreground/80">
                          audit of {new Date(openAuditRow.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* While draining: progress. Once complete: two score tiles side-by-side. */}
              {isDraining ? (
                <div className="space-y-1.5">
                  <Progress value={queueRows.length ? (doneCount / queueRows.length) * 100 : 0} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running searches… {doneCount}/{queueRows.length || '…'}
                    {run?.status === 'capped' && <span className="text-amber-500">· cost cap reached</span>}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ScoreTile
                    label={pooled ? `AI Visibility · ${auditRuns.length} runs pooled` : 'AI Visibility'}
                    value={vizTotal > 0 ? `${vizNamed}/${vizTotal}` : poolLoading ? '…' : '—'}
                    /* ⚠️ 0/0 must never read as 0%. `vizTotal > 0` is the guard, and the pooled
                       branch says "loading" rather than "—" while the runs are still being read,
                       so an in-flight fold is not mistaken for a measurement of nothing. */
                    sub={vizTotal > 0
                      ? `${vizPct}% of AI answers name them${pooled ? ` · across ${auditRuns.length} runs` : ''}`
                      : poolLoading ? 'Reading every run…' : 'No searches completed'}
                    tone={vizTone}
                  />
                  {hasSeo ? (
                    <ScoreTile label="SEO grade" value={seoGrade || '—'} sub="Website SEO health" tone={gradeTone(seoGrade)} />
                  ) : resultsHasWebsite ? (
                    <ScoreTile label="SEO grade" value="No scan yet" sub="Use Run SEO scan to grade this site" tone="muted" />
                  ) : (
                    <ScoreTile label="SEO grade" value="N/A" sub="No website for this business" tone="muted" />
                  )}
                </div>
              )}

              {/* ⛔ SAY IT WHEN THE POOL SPANS DATES. Three runs on one morning are one
                  measurement; five runs across a fortnight are a before and an after, and
                  folding them into a single percentage hides exactly the change the
                  re-measurement exists to show. */}
              {pooled && runSpanDays > POOL_SPAN_WARN_DAYS && (
                <div className="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-[11px]">
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    These {auditRuns.length} runs span {Math.round(runSpanDays)} days
                  </span>
                  <span className="text-muted-foreground">
                    {' '}({new Date(Math.min(...auditRuns.map((r) => +new Date(r.created_at)))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {' – '}
                    {new Date(Math.max(...auditRuns.map((r) => +new Date(r.created_at)))).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}).
                    {' '}Pooling them averages a before and an after into one number. To compare the two, use
                    {' '}Re-audit's before/after view, or pick a single run above.
                  </span>
                </div>
              )}

              {/* SEO in-depth — opt-in; the fuller detail behind the 3-grade overview. Renders all
                  9 actor category scores + issues with fix hints. The overview (the report) is
                  unchanged. Null-safe: only shows when a scan with scanDetail exists (old
                  paste-sourced SEO has none, so it simply doesn't appear). */}
              {!isDraining && hasSeo && resultsHasWebsite && (() => {
                const detail = (run?.results as { seo?: { scanDetail?: Record<string, unknown> } } | null)?.seo?.scanDetail ?? null;
                if (!detail) return null;
                const cats = (detail.categoryScores && typeof detail.categoryScores === 'object' ? detail.categoryScores : {}) as Record<string, unknown>;
                const issues = Array.isArray(detail.issues) ? detail.issues as { title: string; detail: string; severity: string }[] : [];
                return (
                  <div className="space-y-2">
                    <button type="button" onClick={() => setShowSeoDetail((s) => !s)}
                      className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50">
                      <span className="text-sm font-semibold">SEO in-depth
                        <span className="ml-1.5 font-normal text-muted-foreground">· {Object.keys(cats).length} category scores · {issues.length} {issues.length === 1 ? 'issue' : 'issues'}</span>
                      </span>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSeoDetail ? 'rotate-180' : ''}`} />
                    </button>
                    {showSeoDetail && (
                      <Card><CardContent className="p-4 sm:p-5 space-y-4">
                        <div>
                          <div className="text-xs font-semibold mb-2">Category scores</div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(cats).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5">
                                <span className="text-xs capitalize text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="text-sm font-semibold tabular-nums">{typeof v === 'number' ? v : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {issues.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold mb-2">Issues &amp; fixes</div>
                            <ul className="space-y-1.5">
                              {issues.map((it, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${it.severity === 'high' ? 'bg-[hsl(var(--badge-not-interested))]/15 text-[hsl(var(--badge-not-interested))]' : it.severity === 'low' ? 'bg-muted text-muted-foreground' : 'bg-[hsl(var(--badge-waiting))]/15 text-[hsl(var(--badge-waiting))]'}`}>{it.severity}</span>
                                  <span className="text-xs"><span className="font-medium text-foreground">{it.title}</span>{it.detail ? <span className="text-muted-foreground"> — {it.detail}</span> : null}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent></Card>
                    )}
                  </div>
                );
              })()}

              {/* At-a-glance signals: where AI named them + who it names instead. */}
              {!isDraining && liveTally.done > 0 && (perEngineScore.some((pe) => pe.total > 0) || topCompetitors.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                  {perEngineScore.some((pe) => pe.total > 0) && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Where AI named them</div>
                      {perEngineScore.filter((pe) => pe.total > 0).map((pe) => (
                        <div key={pe.engine} className="flex items-center gap-3">
                          <span className="w-24 shrink-0 text-xs font-medium">{ENGINE_LABELS[pe.engine] ?? pe.engine}</span>
                          {pe.named > 0
                            ? <Check className="h-4 w-4 shrink-0 text-[hsl(var(--badge-interested))]" />
                            : <X className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-[hsl(var(--badge-interested))]" style={{ width: `${Math.round((pe.named / pe.total) * 100)}%` }} />
                          </div>
                          <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">{pe.named}/{pe.total}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {topCompetitors.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI names these instead</div>
                      <div className="flex flex-wrap gap-1.5">
                        {topCompetitors.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* REMOVED 2026-07-30: the Delivery checklist card. Every item in it came from
              `playbook.actions` — the generate-playbook LLM output — and its empty state was a
              "Generate playbook" button, i.e. another route into that document. The evidence-derived
              checklist at /playbook/:auditId is the same job done from citations, and the Playbook
              button above now opens it.
              ⚠️ ONE THING GENUINELY LOST: this card's items were TICKABLE and the ticks persisted per
              run. /playbook/:id shows done/verified flags from client_listings but cannot SET them
              (that table is read-only there). So there is currently nowhere to tick delivery work off.
              Flagged rather than quietly dropped. */}

          {/* Detailed per-question results — collapsed by default behind one toggle. */}
          {!isDraining && queueRows.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">
                  Detailed results
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {pooled
                      ? `· ${poolTally?.questions.length ?? 0} questions × ${auditRuns.length} runs`
                      : `· ${queueRows.length} ${queueRows.length === 1 ? 'question' : 'questions'}`}
                  </span>
                  {winnableCount > 0 && (
                    <span
                      className="ml-1.5 font-normal text-muted-foreground"
                      title={'OPERATOR VIEW ONLY, AND NOT RELIABLE. Measured over all 402 stored answered questions: 77.6% classify as "winnable" and 0% have ever classified as "locked", because the rule fires on 6+ distinct firms named and the mean is 15.3 - it reads breadth as opportunity. 17.9% of repeated questions changed verdict between identical runs with no work done. Never quote this to a client.'}
                    >
                      · {winnableCount} flagged winnable <span className="text-amber-500">(unreliable)</span>
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>
              {showDetails && (
                <p className="px-1 text-[11px] text-muted-foreground">
                  Scores are a heuristic read of what AI shows today (how many rivals are named and whether they lean on directory listings) — a guide to where you can win, not a guarantee.
                </p>
              )}
              {/* ⛔ POOLED: ONE LINE PER QUESTION, SHOWING HOW IT WENT ACROSS THE RUNS. The
                  per-run QuestionCard is the right thing when you are reading ONE run and the
                  wrong thing here — it would print the same 12 questions three times over and
                  leave the operator to do the arithmetic that the whole point of pooling is to
                  do for them. Pick a single run in the selector to get the full cards back. */}
              {showDetails && pooled && poolTally && (
                <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                  {poolTally.questions.map((q) => (
                    <div key={q.question} className="flex items-start gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 text-[13px] text-foreground">{q.question}</span>
                      <span className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
                        {DISPLAY_ENGINES.filter((e) => (q.perEngine[e]?.answered ?? 0) > 0).map((e) => (
                          <span key={e} className="tabular-nums">
                            {ENGINE_LABELS[e]} <span className={q.perEngine[e].named > 0 ? 'font-semibold text-foreground' : ''}>{engineSummary(q.perEngine[e])}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                  {poolTally.unanswered > 0 && (
                    /* Never folded into the denominator, so it has to be said out loud —
                       otherwise a run that failed half its questions looks like a clean one. */
                    <div className="px-3 py-2 text-[11px] text-muted-foreground">
                      {poolTally.unanswered} question-run{poolTally.unanswered === 1 ? '' : 's'} never returned an answer and
                      {' '}are excluded from the totals above.
                    </div>
                  )}
                </div>
              )}
              {showDetails && !pooled && queueRows.map((row) => (
                <QuestionCard
                  key={row.id}
                  row={row}
                  businessName={resultsBusinessName}
                  locationText={resultsLoc}
                  ownWebsite={ownWebsite}
                  /* So an Apify cap failure can say WHEN it clears rather than just that it happened. */
                  apifyCycleEnd={apifyUsage?.cycleEnd ?? null}
                />
              ))}
            </div>
          )}
          {queueRows.length === 0 && !isDraining && (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

/* REMOVED 2026-07-30: the DeliveryChecklist component (and its ChecklistItem type). It rendered the
 * generate-playbook LLM document's action list as a tickable checklist. The evidence-derived
 * checklist at /playbook/:auditId does the same job from citations, and the Playbook button in the
 * action bar opens it. Recoverable from git if the tickable behaviour is wanted back � but it should
 * then persist to client_listings rather than localStorage. */

/* ── Small presentational helpers ─────────────────────────────────────────── */

/* ── APIFY MONTHLY SPEND ─────────────────────────────────────────────────────────────────────────
   One line, always in the same place. Apify runs every question check and every SEO scan, so at 100%
   both stop dead — which is what happened on 2026-07-30, when the account had been at 99.8% since
   lunchtime and the page blamed the question wording.

   Amber at 75%, red at 90%, matching apify-usage.ts's own WARN/CRITICAL thresholds so the log line
   and this line can never disagree. Renders NOTHING when there is no snapshot or no cap recorded:
   an empty gap is honest, a "0%" would be a lie about a number we do not have. */
function ApifyUsageLine({ usage }: { usage: ApifyUsage | null }) {
  if (!usage || usage.monthlyUsageUsd == null || !usage.maxMonthlyUsageUsd) return null;
  const used = usage.monthlyUsageUsd;
  const cap = usage.maxMonthlyUsageUsd;
  const pct = usage.usagePct ?? used / cap;
  const tone = apifyTone(pct);
  // shortDate formats in UTC — the cycle end is 23:59:59.999Z, which in BST would render as the
  // NEXT day and tell the operator the wrong reset date. See the note on shortDate.
  const resets = shortDate(usage.cycleEnd);

  const cls = tone === 'critical'
    ? 'border-destructive/40 bg-destructive/10 text-destructive'
    : tone === 'warn'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500'
      : 'border-border/60 bg-card/60 text-muted-foreground';

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[12px] ${cls}`}>
      {tone === 'ok' ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
      <span className="font-semibold">Apify ${used.toFixed(2)} of ${cap.toFixed(2)}</span>
      <span className="tabular-nums">({(pct * 100).toFixed(1)}%)</span>
      <span>this billing cycle{resets ? `, resets ${resets}` : ''}.</span>
      {/* The consequence, stated only when it is actually near — no crying wolf at 40%. */}
      {tone !== 'ok' && (
        <span className="font-medium">
          {pct >= 1
            ? 'At the cap: audit questions and SEO scans will both fail until it is raised or the cycle rolls.'
            : 'At 100% audit questions and SEO scans both stop.'}
        </span>
      )}
    </div>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {onBack && (
        <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={onBack} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}
function ChoiceButton({ active, onClick, label, hint, icon }: { active: boolean; onClick: () => void; label: string; hint: string; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`group rounded-xl border p-3.5 text-left transition-all ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/60 bg-card/60 hover:border-primary/40 hover:bg-card hover:shadow-sm'}`}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {label}{active && <Check className="h-3.5 w-3.5 text-primary" />}
          </div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
      </div>
    </button>
  );
}
/* Live progress for a run still draining. Replaces the bare "-" that made a finishing audit look
   broken and cost four redundant re-runs. done counts SETTLED queue rows ('done' or 'failed' -
   the queue's vocabulary, NOT 'complete', which is a RUN status), so a run whose questions all
   failed still reaches the end of the bar instead of hanging. total 0 means the queue rows are not
   readable yet (the run was created seconds ago), so it says "starting" rather than "0 of 0". */
/* NOTE ON COLOURS: --badge-*-fg is the foreground designed to sit ON that badge's SOLID fill
   (it is black). Any treatment here that uses a TINT or a transparent frame must colour its text
   with the BASE variable instead, or it renders black on a dark card and disappears. Measured:
   the C grade, the client pill and every mid-range score were doing exactly that.

   IN FLIGHT. Deliberately shares NO visual language with the score: the old version drew a
   progress bar and "0 of 3", which reads as a nil result rather than work in progress. A spinner
   plus the word "running" plus the question count can only mean one thing, and there is no
   score-shaped element on the row at all while a run is going. */
// A single score tile for the opened-audit header. Colour-toned by outcome; optionally
// clickable (used for the "Add SEO data" empty state).
type TileTone = 'green' | 'amber' | 'red' | 'muted';
const TILE_TONE: Record<TileTone, string> = {
  green: 'border-[hsl(var(--badge-closed))]/30 bg-[hsl(var(--badge-closed))]/10 text-[hsl(var(--badge-closed))]',
  amber: 'border-[hsl(var(--badge-waiting))]/30 bg-[hsl(var(--badge-waiting))]/10 text-[hsl(var(--badge-waiting))]',
  red: 'border-[hsl(var(--badge-not-interested))]/30 bg-[hsl(var(--badge-not-interested))]/10 text-[hsl(var(--badge-not-interested))]',
  muted: 'border-border bg-muted/40 text-muted-foreground',
};
function ScoreTile({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub?: string; tone: TileTone; onClick?: () => void;
}) {
  const cls = `rounded-lg border p-3.5 ${TILE_TONE[tone]} ${onClick ? 'text-left w-full transition-colors hover:bg-muted/60 cursor-pointer' : ''}`;
  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-xs opacity-80">{sub}</div>}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

// Grade → tone for the SEO tile. A/B are strong, C is middling, D/E/F are weak.
function gradeTone(grade: string): TileTone {
  const g = (grade || '').trim().charAt(0).toUpperCase();
  if (g === 'A' || g === 'B') return 'green';
  if (g === 'C') return 'amber';
  if (g === 'D' || g === 'E' || g === 'F') return 'red';
  return 'muted';
}

function ResultsHeadline({ run, live, draining }: { run: RunRow | null; live: { named: number; total: number; failed: number; done: number }; draining: boolean }) {
  // Prefer the folded summary once complete; otherwise the live tally as it drains.
  const summary = (run?.results as { summary?: { named_datapoints: number; total_datapoints: number; failed_questions?: number; done_questions?: number } } | null)?.summary;
  const named = summary?.named_datapoints ?? live.named;
  const total = summary?.total_datapoints ?? live.total;
  const failed = summary?.failed_questions ?? live.failed;
  // Finished with zero completed searches → make "everything failed" explicit rather
  // than a bare "Named in 0 of 0" (which reads like a real zero-visibility result).
  if (!draining && total === 0) {
    return (
      <div className="text-lg font-bold tracking-tight">
        {failed > 0 ? `All ${failed} ${failed === 1 ? 'search' : 'searches'} failed` : 'No searches completed'}
      </div>
    );
  }
  return (
    <div className="text-lg font-bold tracking-tight">
      Named in {named} of {total} AI answers
      {!draining && total > 0 && <span className="text-muted-foreground font-normal text-sm"> ({Math.round((named / total) * 100)}%)</span>}
      {failed > 0 && <span className="text-amber-500 font-normal text-sm"> · {failed} failed</span>}
    </div>
  );
}

/* Per-term winnability badge styling — OPERATOR VIEW ONLY.
   These verdicts are NOT shown to customers and must not be quoted to one. The rule is currently
   inverted and noise-driven: it fires "open" on `U >= 6` distinct firms named when the mean U is
   15.3, so 77.6% of 402 stored questions read winnable and "locked" has never once fired; and
   17.9% of repeated questions changed verdict between identical runs with no work done. Kept
   visible here, labelled, so the logic can be worked on with real examples in front of you.
   Fixing it needs multi-run stability, inverted thresholds and citation-source analysis. */
const WINNABILITY_BADGE: Record<'open' | 'contested' | 'locked' | 'named' | 'no-local-race', { label: string; cls: string }> = {
  open:            { label: 'Open?',             cls: 'bg-green-500/20 text-green-500 border-transparent' },
  contested:       { label: 'Contested?',        cls: 'bg-amber-500/20 text-amber-500 border-transparent' },
  locked:          { label: 'Locked?',           cls: 'bg-red-500/20 text-red-400 border-transparent' },
  named:           { label: 'Named',            cls: 'bg-blue-500/20 text-blue-400 border-transparent' },
  'no-local-race': { label: 'Not a local race', cls: 'bg-muted text-muted-foreground border-transparent' },
};

type ScoreBand = 'named' | 'winnable' | 'hard' | 'no-local-race';
interface QuestionScore {
  score: number | null;      // /10; null when there's no local race to score
  band: ScoreBand;
  reason: string;            // ONE plain-English sentence — the thing a human reads
  namedFirms: string[];      // real competitor firms AI named (isRealCompetitor-filtered)
  clientNamed: boolean;
}

/** Per-question winnability for the badge — a thin adapter over the SHARED classifyWinnability
 *  rule (auditReport.ts), mapped back into QuestionScore so bandVerdict + QuestionCard stay
 *  unchanged. isAggregatorUrl is dependency-injected (the SPA's own copy). The fragmentation +
 *  cross-engine-consensus logic (and the reason text) lives entirely in the shared helper. */
function scoreQuestion(result: EngineMap, businessName: string, locationText: string, ownWebsite: string): QuestionScore {
  const w = classifyWinnability(result, { businessName, locationText, ownWebsite, isAggregatorUrl });
  // Map the helper's verdict back to a ScoreBand. 'open'/'contested' both → 'winnable'; bandVerdict
  // re-derives open vs contested from the score (open 7-9 / contested 4-6), so the verdict round-trips.
  const band: ScoreBand =
    w.verdict === 'named' ? 'named'
    : w.verdict === 'no-local-race' ? 'no-local-race'
    : w.verdict === 'locked' ? 'hard'
    : 'winnable';
  return { score: w.score, band, reason: w.reason, namedFirms: w.namedFirms, clientNamed: w.clientNamed };
}

/** Map a score band → the existing WINNABILITY_BADGE key so styling stays consistent. */
function bandVerdict(band: ScoreBand, score: number | null): 'open' | 'contested' | 'locked' | 'named' | 'no-local-race' {
  if (band === 'named') return 'named';
  if (band === 'hard') return 'locked';
  if (band === 'no-local-race') return 'no-local-race';
  return (score ?? 0) >= 7 ? 'open' : 'contested'; // winnable
}

function QuestionCard({ row, businessName, locationText, ownWebsite, apifyCycleEnd }: { row: QueueRow; businessName: string; locationText: string; ownWebsite: string; apifyCycleEnd?: string | null }) {
  const pending = row.status === 'pending' || row.status === 'running';
  // Failed rows store { error } (not an engine map). They have NO answer data, so no score.
  const failed = row.status === 'failed';
  /* THE REAL REASON, not a guess. This used to print one hardcoded line — "term too broad to
     complete" — for every failure, while the actual error sat unread in row.result.error. On
     2026-07-30 that line was shown for an Apify HTTP 402 (monthly spend cap exhausted) and sent the
     operator off to rewrite questions that had worked two hours earlier. There is no breadth
     detection anywhere in this codebase, so that sentence was never a real diagnosis. */
  const failure = failed ? explainAuditFailure(row.result, { apifyCycleEnd }) : null;
  // The plain-English verdict + /10 score, computed from THIS question's real answer data.
  const s = row.status === 'done' && row.result ? scoreQuestion(row.result, businessName, locationText, ownWebsite) : null;
  const verdict = s ? bandVerdict(s.band, s.score) : null;
  // The chip on the right: the score /10, or an honest non-score state.
  const scoreChip = failed ? 'Couldn’t check' : pending ? null : s ? (s.score != null ? `${s.score}/10` : 'Not scored') : null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{row.question}</span>
              {verdict && (
                <Badge className={`shrink-0 ${WINNABILITY_BADGE[verdict].cls}`}>{WINNABILITY_BADGE[verdict].label}</Badge>
              )}
            </div>
            {/* The upgrade: a one-line plain-English read of WHY + who's named + how hard. */}
            {s && <p className="text-[13px] leading-relaxed text-foreground/90">{s.reason}</p>}
            {failure && (
              <div className="space-y-1">
                {/* Our-cap stops are deliberate, not faults — amber. A vendor refusing is red. */}
                <p className={`text-[13px] font-medium leading-relaxed ${failure.kind === 'our_cap' ? 'text-amber-500' : 'text-destructive'}`}>
                  {failure.headline}
                </p>
                {failure.detail && (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{failure.detail}</p>
                )}
                {/* THE RAW STORED ERROR, ALWAYS. Shown for mapped cases too: the plain-English line is
                    our interpretation, and the operator must be able to see the string it came from. */}
                {failure.raw && (
                  <p className="font-mono text-[11px] leading-relaxed text-muted-foreground/70 break-all">{failure.raw}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {scoreChip && (
              <span className={`text-sm font-bold tabular-nums ${failed ? 'text-muted-foreground' : s?.score != null ? 'text-foreground' : 'text-muted-foreground'}`}>{scoreChip}</span>
            )}
            {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : failed ? <Badge variant="secondary">failed</Badge>
              : null}
          </div>
        </div>
        {/* Per-engine detail stays below the summary — the breakdown is still useful. */}
        {row.status === 'done' && row.result && (
          <div className="space-y-2.5">
            {DISPLAY_ENGINES.map((e) => {
              const er = row.result?.[e];
              if (!er) return null;
              return <EngineRow key={e} engine={e} er={er} businessName={businessName} locationText={locationText} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EngineRow({ engine, er, businessName, locationText }: { engine: string; er: EngineResult; businessName: string; locationText: string }) {
  // Belt-and-braces: filter raw stored competitors through isRealCompetitor before display, matching
  // the scorecard + buildReportData, so regex-scraped junk can't show even pre re-extraction.
  /* The stored list, as stored. It used to be re-filtered through isRealCompetitor "belt-and-
     braces", which rejected 7% of real firms — see keepRival in auditReport.ts. */
  const shownCompetitors = er.competitors.filter((c) => !!String(c).trim());
  return (
    <div className="rounded-lg border border-border/50 p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold w-24 shrink-0">{ENGINE_LABELS[engine] ?? engine}</span>
        {cellNamed(er)
          ? <Badge className="border-transparent bg-[hsl(var(--badge-interested))] text-[hsl(var(--badge-interested-fg))]">Named{er.position ? ` · #${er.position}` : ''}</Badge>
          : <Badge className="border-transparent bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))]">Not named</Badge>}
        {engine !== 'google_organic' && shownCompetitors.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            instead: {shownCompetitors.slice(0, 5).join(', ')}
          </span>
        )}
      </div>
      {/* The gut-punch: show what the AI actually said when the business is absent. */}
      {!cellNamed(er) && er.answer_text && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground italic line-clamp-4">
          "{er.answer_text.slice(0, 320)}{er.answer_text.length > 320 ? '…' : ''}"
        </p>
      )}
      {er.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {er.citations.slice(0, 6).map((c, i) => (
            <a key={i} href={c.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary/90 hover:underline max-w-[220px] truncate">
              <ExternalLink className="h-3 w-3 shrink-0" />{c.title || c.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default AiAudit;
