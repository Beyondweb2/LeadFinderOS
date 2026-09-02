import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { asPence, SEO_SCAN_USD } from '@/lib/marketView';
import { supabase } from '@/integrations/supabase/client';
import { reAuditFromSource, RE_AUDIT_EST_USD_PER_QUESTION } from '@/lib/reAudit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { parseQuestionPaste, pasteLineCount } from '@/lib/questionPaste';
import { isMeasurementSource, runsForReAuditMode, defaultReAuditMode, type ReAuditMode } from '@/lib/measurementRuns';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, X, ArrowLeft, Sparkles, RefreshCw, ExternalLink, Search, Check, FileText,
  Building2, Users, TrendingUp, EyeOff, Globe, MapPin, Map as MapIcon, Download, ChevronDown,
  Copy, Save, Trash2, CircleStop, ChevronRight, Eye, CopyPlus, AlertTriangle, ListChecks, ClipboardList, Undo2 } from 'lucide-react';
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
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells } from '@/lib/competitorCleaning';
import {
  DISPLAY_ENGINES, SCORED_ENGINES, ENGINE_LABELS, isRealCompetitor, isRenderableSeo, buildReportData, seoStyleForAudit, classifyWinnability,
  type EngineResult, type EngineMap, type QueueRow, type RunRow,
} from '@/lib/auditReport';
import { tradeWord } from '@/lib/trade';
import { auditMatches, auditSearchTerms } from '@/lib/auditSearch';
import { explainAuditFailure, shortDate } from '@/lib/auditErrors';
import { useApifyUsage, apifyTone, type ApifyUsage } from '@/hooks/useApifyUsage';
import { WIZARD_MIN_QUESTIONS, WIZARD_MAX_QUESTIONS, WIZARD_DEFAULT_QUESTIONS } from '@/lib/auditQuestionCounts';
/* playbookHtml.ts (the LLM document renderer) is NO LONGER IMPORTED HERE — that was the last import
   of it from any page, so the LLM playbook is now unreachable from the app. The file and the
   generate-playbook edge function both stay in the repo on purpose. */
import { buildSchema, normalizeUrl } from '@/lib/schemaType';
import { isAggregatorUrl } from '@/lib/aggregators';
import { usePersistedState } from '@/hooks/usePersistedState';

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

/* FULL MEASUREMENT mode — the deliberate bulk citation gather. Higher ceiling than the quick
   wizard, mirroring MEASUREMENT_* in create-ai-audit. v1 stays ≤75 so a single run stays under the
   queue's per-run $1 Apify cap; the run is paced by the queue (≤24 scrapes in flight), never fired
   at once. Quick audit is completely unchanged. */
const FULL_MIN_QUESTIONS = 10;
const FULL_MAX_QUESTIONS = 75;
const FULL_DEFAULT_QUESTIONS = 40;
/* 20 is here for a reason: it is the BASELINE repeat ceiling, so a 20-question measurement is
   the largest one whose runs 2 and 3 carried the full set even BEFORE the advanceBaseline purpose fix
   (2026-08-28). Kept as an option because it is the safe choice on any deploy where that fix is not
   live. */
const FULL_QUESTION_OPTIONS = [10, 20, 25, 40, 60, 75];
const clampFullCount = (n: number) =>
  Math.min(FULL_MAX_QUESTIONS, Math.max(FULL_MIN_QUESTIONS, Math.round(n) || FULL_DEFAULT_QUESTIONS));

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


interface AuditRow { id: string; business_name: string; business_type: string | null; location_text: string | null; country: string | null; has_website: boolean; created_at: string;
  /** The client's own site. Selected so the report's "Cited as a source" figure can tell a
   *  citation of their OWN domain from a citation of somebody else's. May be null. */
  website?: string | null;
  /** MARKET audit: a trade and a town with no business attached. Its named count is 0 by
   *  construction, so nothing here may render it as a business's result — see isMarketAudit. */
  is_market?: boolean | null;
  /** Full Measurement (3-run, full question set). Re-audit reads this to reproduce a LIKE-FOR-LIKE
   *  re-measure — a measurement re-audits as a measurement, a quick audit stays quick. */
  is_measurement?: boolean | null;
  /** > 1 marks a PAID BASELINE — the only report that still shows SEO grades (seoStyleForAudit).
   *  Optional because the market/report list selects vary; absent reads as "not a baseline", which
   *  is the safe direction (withhold the grade rather than show one we cannot justify). */
  baseline_target_runs?: number | null }

/* ── The audit book, grouped ────────────────────────────────────────────────────
   The list used to be one flat row per AUDIT, which reads as duplicates because the
   Inbox button, the bulk runner and the wizard each mint a NEW ai_audits row for the
   same lead (only the wizard's edited re-run and the baseline chain reuse an audit id).
   That upstream behaviour is deliberately left alone: /a/<auditId> report links are
   already out with real prospects, and reusing ids would change which run they resolve to.

   So the grouping happens HERE: audits are folded by BUSINESS (lead_id when we have one,
   else the normalised name), and businesses are folded by TRADE via tradeWord(). One
   collapsed row per business; every audit and run stays reachable underneath. */

/** One run, with the scalars the list needs pulled out of results so no big JSONB moves. */
interface RunLite {
  id: string;
  audit_id: string;
  run_number: number;
  status: string;
  mention_rate: number | null;
  created_at: string;
  actor_cost_usd: number | null;
  seo_grade: string | null;
  /** Live progress, only meaningful while in flight. done counts queue rows that have
   *  SETTLED — status 'done' or 'failed' (the queue's vocabulary is not 'complete'). */
  done: number;
  total: number;
}

interface AuditLite extends AuditRow {
  lead_id: string | null;
  first_opened_at: string | null;
  open_count: number | null;
  baseline_target_runs: number | null;
  baseline_runs_counted: number | null;
  baseline_completed_at: string | null;
  baseline_error: string | null;
  report_slug: string | null;
  /** Whether the linked lead has paid. The slot the audit asked to keep: nothing qualifies yet
   *  (amount_paid is null on all 409 leads), so it simply does not render until one does. */
  lead_paid?: boolean;
  /** Newest run first. */
  runs: RunLite[];
}

interface BusinessGroup {
  key: string;
  name: string;
  trade: string;
  business_type: string | null;
  location: string | null;
  has_website: boolean;
  /** A trade-and-town audit with no business attached. Read off the newest audit — already
   *  selected, so no extra query. Searchable like anything else, but badged, because a sentinel
   *  called "[market] locksmiths · Hastings" is not a client and must not read as one. */
  isMarket: boolean;
  /** Newest audit first. */
  audits: AuditLite[];
  /** The newest audit and its latest run — what the collapsed row shows. */
  latestAudit: AuditLite;
  latestRun: RunLite | null;
  runningRun: RunLite | null;
  auditCount: number;
  runCount: number;
  cost: number;
}
interface LeadOption { id: string; business_name: string; category: string | null; country: string | null; website: string | null; address: string | null; search_keyword?: string | null; search_location?: string | null; derived_town?: string | null }

const TERMINAL = new Set(['complete', 'capped', 'failed', 'cancelled']);

/** How many audits the landing list loads. Was 50, then 300; both silently truncated once the audit
 *  count passed them (300 hid the oldest 185 of 485 — ABLM and SC Plumbing among them). Raised well
 *  above the live count. The `auditsCapped` label still renders honestly if we ever approach it, and
 *  the server-side name search below now finds audits BEYOND this window regardless. */
const AUDIT_FETCH_LIMIT = 1000;

/** How many name-matched audits the server search pulls in when a term is typed. Generous — a search
 *  should surface every match, not the newest few — but bounded so a one-letter term can't drag the
 *  whole table. */
const AUDIT_SEARCH_LIMIT = 200;

/** The columns the landing list needs off ai_audits — shared by the full-list load and the search
 *  query so the two can't drift into hydrating different shapes. */
const AUDIT_SELECT =
  'id, business_name, business_type, location_text, country, has_website, website, created_at, is_market, lead_id, first_opened_at, open_count, baseline_target_runs, baseline_completed_at, baseline_error, baseline_runs_counted:baseline->>runs_counted, is_measurement';

/** Split ids into batches so a `.in(ids)` filter never builds a querystring long enough to hit the
 *  gateway URL limit: 300 ids was already ~11KB and 485 ~18KB, near the edge. 150 keeps every read
 *  well under it at any list size. */
const IN_CHUNK = 150;
function chunkIds<T>(arr: T[], n = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
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
};

/** Above this many businesses the list is long enough to need searching. Below it the box would be
 *  furniture over a list you can already read in one glance. */
const SEARCH_MIN_BUSINESSES = 8;
/** Landing-list refresh cadence while ANY run is in flight. The effect is not armed at all when
 *  nothing is draining, so an idle page makes zero requests. */
const LIST_POLL_MS = 5000;


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
  businessScope: 'national' | 'local' | 'hybrid' | null;
  specialisms: string;
  auditMode?: 'quick' | 'full';
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
  const [businessScope, setBusinessScope] = useState<'national' | 'local' | 'hybrid' | null>(persisted?.businessScope ?? null);
  const [specialisms, setSpecialisms] = useState(persisted?.specialisms ?? ''); // optional — grounds question generation
  /* Quick audit (current, unchanged) vs Full measurement (deliberate bulk gather). Additive. */
  const [auditMode, setAuditMode] = useState<'quick' | 'full'>(persisted?.auditMode ?? 'quick');
  const fullMode = auditMode === 'full';
  const [questionCount, setQuestionCount] = useState<number>(() => {
    const m = persisted?.auditMode ?? 'quick';
    const raw = persisted?.questionCount ?? (m === 'full' ? FULL_DEFAULT_QUESTIONS : DEFAULT_QUESTION_COUNT);
    return m === 'full' ? clampFullCount(raw) : clampQuestionCount(raw);
  });
  /* Switch mode: reset the count to that mode's default and clear any previewed questions so the
     review step regenerates at the new count/purpose. Quick↔Full only; never touches a run in flight. */
  const switchAuditMode = useCallback((next: 'quick' | 'full') => {
    setAuditMode(next);
    setQuestionCount(next === 'full' ? FULL_DEFAULT_QUESTIONS : DEFAULT_QUESTION_COUNT);
    setQuestions([]); setPreviewMoney([]);
  }, []);

  // Existing-lead picker + saved audits
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [savedAudits, setSavedAudits] = useState<AuditLite[]>([]);
  /** True when the audits query came back full, i.e. older audits exist beyond it. Drives an
   *  honest label instead of a count that silently stops growing. */
  const [auditsCapped, setAuditsCapped] = useState(false);
  /* THE AUDIT SEARCH. Purely client-side over what is already loaded — no query, no round trip, so
     it filters as you type. Deliberately NOT persisted: a remembered filter is how you come back to
     this page, see four audits and think you have lost 130. */
  const [auditQuery, setAuditQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null); // audit being deleted (disables its row buttons)
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
  const [pasteQuestions, setPasteQuestions] = useState('');
  // Editable re-run (results view): an inline editor seeded with the current run's questions.
  // Persisted (session, per-user) so a tab-away/reload doesn't lose the operator's edits — the
  // editor reopens with them. reRunForRunId scopes the editor to the run it was opened for, so a
  // persisted "editing" flag can't reopen a stale editor over a DIFFERENT audit.
  const [reRunEditing, setReRunEditing] = usePersistedState<boolean>(
    'ai-audit-rerun-editing', false, { tier: 'session', scope: user?.id ?? null, version: 1 },
  );
  const [reRunForRunId, setReRunForRunId] = usePersistedState<string | null>(
    'ai-audit-rerun-run', null, { tier: 'session', scope: user?.id ?? null, version: 1 },
  );
  // RE-AUDIT (a NEW audit row for the same business) — transient, unlike the re-run editor: it is
  // confirmed or abandoned in one sitting, and a stale persisted copy pointing at a previous audit
  // is a worse failure than losing a few typed edits.
  const [reAuditOpen, setReAuditOpen] = useState(false);
  const [reAuditQuestions, setReAuditQuestions] = useState<string[]>([]);
  /* ⛔ ONE VALUE FEEDS THE PRICE AND THE ACTION. The cost line multiplies by runs derived from
     THIS, and confirmReAudit passes THIS to reAuditFromSource, which writes baseline_target_runs
     from the same helper — so the number shown is the number charged. Two parallel booleans is how
     a screen ends up saying "× 1 run" while the server runs three.
     ⚠️ Plain useState, not persisted: it is seeded from the source audit each time the dialog
     opens (startReAudit), and a remembered choice from another audit is exactly the wrong default
     on a paid action. */
  const [reAuditMode, setReAuditMode] = useState<ReAuditMode>('quick');
  /* Paste-a-list: the raw textarea and its open/closed state. Parsed by the pure
     parseQuestionPaste (blank lines dropped, list markers stripped, duplicates collapsed) into the
     SAME editable rows below, so pasted questions can still be tweaked or deleted before running.
     Nothing about how the audit RUNS changes — this is only how questions get entered. */
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [reAuditBusy, setReAuditBusy] = useState(false);
  const [reRunQuestions, setReRunQuestions] = usePersistedState<string[]>(
    'ai-audit-rerun-questions', [], { tier: 'session', scope: user?.id ?? null, version: 1 },
  );
  const [unitCost, setUnitCost] = useState(persisted?.unitCost ?? 0);
  const [engineCount, setEngineCount] = useState(persisted?.engineCount ?? SCORED_ENGINES.length);
  const [running, setRunning] = useState(false);

  // Results state
  const [auditId, setAuditId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
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

  // "Schema markup" section — collapsible JSON-LD generator with editable NAP + specialism.
  // The four fields + the website URL are loaded from ai_audits (not in the wizard state on a
  // reopened audit) and saved back on demand, so they pre-fill next visit.
  const [showSchema, setShowSchema] = useState(false);
  const [schemaNap, setSchemaNap] = useState({ phone: '', address: '', email: '', specialism: '' });
  const [schemaWebsite, setSchemaWebsite] = useState('');
  // The audit's explicit stored engagement scope (null when unset) — preferred over the
  // playbook-derived scope when building the JSON-LD schema.
  const [schemaScope, setSchemaScope] = useState<'national' | 'local' | 'hybrid' | null>(null);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  // "Link hub" section — collapsible list of the client's own URLs (label + url), loaded from
  // ai_audits.client_links and saved back per audit. Mirrors the Schema markup section.
  const [showLinks, setShowLinks] = useState(false);
  const [clientLinks, setClientLinks] = useState<{ label: string; url: string }[]>([]);
  const [linksSaving, setLinksSaving] = useState(false);
  const [linkCopiedIdx, setLinkCopiedIdx] = useState<number | null>(null);
  // "Scan site & autofill" — scan the client's own site (scan-site-details), review the found
  // details + links, then apply into schemaNap / clientLinks via the EXISTING save paths.
  // Nothing auto-saves; scanReview holds the editable, include-gated review until applied.
  const [scanning, setScanning] = useState(false);
  const [scanReview, setScanReview] = useState<null | {
    details: { phone: string; address: string; email: string; hours: string };
    detailInclude: { phone: boolean; address: boolean; email: boolean; hours: boolean };
    links: { label: string; url: string; include: boolean; templateDefault: boolean }[];
  }>(null);
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
        revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, auditMode, questionCount, questions, previewMoney, unitCost, engineCount,
      }));
      /* A draft now EXISTS on disk. Tracked in state (rather than re-reading storage at render time)
         so the "Resume draft" button below can appear and disappear truthfully. React bails out when
         the value is unchanged, so this does not re-render on every keystroke. */
      setDraftSaved(true);
    } catch { /* storage unavailable — persistence is best-effort */ }
    // `step` is deliberately NOT a dependency: this effect no longer branches on it (see above).
  }, [revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, auditMode, questionCount, questions, previewMoney, unitCost, engineCount, user?.id]);

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
  /* HYDRATE a set of audit rows into AuditLite (runs + report pill + live queue progress). Extracted
     from loadSaved UNCHANGED so the server-side search can reuse the exact same shaping — the only
     difference from before is the `.in()` reads are chunked (see chunkIds). */
  const hydrateAudits = useCallback(async (auditRows: RawAuditRow[]): Promise<AuditLite[]> => {
    const ids = auditRows.map((a) => a.id);
    // ALL runs per audit (newest first): the expanded view lists every run, and the collapsed row's
    // cost is the sum across them. Chunked so a large id list never overflows the querystring.
    const runsByAudit = new Map<string, RunLite[]>();
    const inFlightRunIds: string[] = [];
    for (const idBatch of chunkIds(ids)) {
      const { data: runs } = await (supabase as unknown as SupabaseClient)
        .from('ai_audit_runs')
        .select('id, audit_id, run_number, status, mention_rate, created_at, actor_cost_usd, seo_grade:results->seo->>overallGrade')
        .in('audit_id', idBatch)
        .order('run_number', { ascending: false });
      for (const r of (runs ?? []) as Array<{
        id: string; audit_id: string; run_number: number; status: string; mention_rate: number | null;
        created_at: string; actor_cost_usd: number | null; seo_grade: string | null;
      }>) {
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
    }

    // Published report per audit → the "report" pill. Existence only. Chunked like the runs read.
    const reportByAudit = new Map<string, string>();
    for (const idBatch of chunkIds(ids)) {
      const { data: reports } = await (supabase as unknown as SupabaseClient)
        .from('business_reports')
        .select('audit_id, slug')
        .in('audit_id', idBatch);
      for (const r of (reports ?? []) as Array<{ audit_id: string | null; slug: string }>) {
        if (r.audit_id && !reportByAudit.has(r.audit_id)) reportByAudit.set(r.audit_id, r.slug);
      }
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

  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data: audits } = await (supabase as unknown as SupabaseClient)
      .from('ai_audits')
      .select(AUDIT_SELECT)
      .order('created_at', { ascending: false })
      .limit(AUDIT_FETCH_LIMIT);
    const auditRows = (audits ?? []) as RawAuditRow[];
    setAuditsCapped(auditRows.length >= AUDIT_FETCH_LIMIT);
    setSavedAudits(await hydrateAudits(auditRows));
  }, [user, hydrateAudits]);

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

  useEffect(() => {
    if (!user) return;
    (async () => {
      const LEAD_COLS = 'id, business_name, category, country, website, address, search_keyword, search_location';
      /* MIGRATION-TOLERANT. derived_town is added by a migration Paul applies BY HAND, so until that
         SQL runs PostgREST fails the WHOLE select with a 400 and the lead picker would come back
         empty — breaking the wizard for a cosmetic prefill. Try with it, fall back without it.
         `as unknown as` because the column is not in the generated types yet either; once it is live
         and types are regenerated the plain cast works again. */
      let rows = (await supabase
        .from('outreach_leads')
        .select(`${LEAD_COLS}, derived_town`)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(500)).data as unknown as LeadOption[] | null;
      if (!rows) {
        rows = (await supabase
          .from('outreach_leads')
          .select(LEAD_COLS)
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(500)).data as unknown as LeadOption[] | null;
      }
      setLeads(rows ?? []);
    })();
    loadSaved();
  }, [user, loadSaved]);

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
    setAuditMode('quick'); setQuestionCount(DEFAULT_QUESTION_COUNT);
    setQuestions([]); setPreviewMoney([]); setUnitCost(0); setEngineCount(SCORED_ENGINES.length);
    setAuditId(null); setRunId(null); setRun(null); setQueueRows([]);
    setOpenRunId(null); setShowDetails(false);
    setRevealed(0); setStep('source');
    // Close the dialog: deleteAudit calls this, and leaving an emptied form open over the list
    // after deleting the audit you were viewing would look like a bug.
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
  // Owner RLS lets the browser delete its own row. Mirrors AdminSitesList: confirm → delete →
  // optimistic filter → toast. If the deleted audit is the one open in the results view, reset.
  const deleteAudit = async (a: AuditRow) => {
    if (deletingId) return;
    if (!window.confirm(`Delete "${a.business_name}"? This can't be undone.`)) return;
    setDeletingId(a.id);
    try {
      const { error } = await supabase.from('ai_audits').delete().eq('id', a.id);
      if (error) throw new Error(error.message);
      setSavedAudits((prev) => prev.filter((x) => x.id !== a.id));
      if (auditId === a.id) resetWizard(); // don't leave a stale open view of a deleted audit
      toast({ title: 'Audit deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
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

  // ── Preview questions (generate for the review step) ─────────────────────────
  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          preview: true,
          business_name: businessName, business_type: businessType,
          location_text: locationText, country, has_website: hasWebsite,
          website: website || undefined, business_scope: businessScope || undefined,
          specialisms: specialisms || undefined,
          question_count: questionCount,
          // Full measurement: same purpose the run uses, so the PREVIEW generates the full count
          // (a plain call would be clamped to the wizard's 5).
          ...(fullMode ? { purpose: 'measurement', skip_seo: true } : {}),
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'preview failed');
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setPreviewMoney(Array.isArray(data.money_questions) ? (data.money_questions as string[]) : []);
      setUnitCost(typeof data.unit_cost_usd === 'number' ? data.unit_cost_usd : 0);
      setEngineCount(Array.isArray(data.engines) ? data.engines.length : SCORED_ENGINES.length);
    } catch (e) {
      toast({ title: "Couldn't generate questions", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  }, [businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, questionCount, fullMode, toast]);

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
    const clean = questions.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) { toast({ title: 'Add at least one question', variant: 'destructive' }); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          business_name: businessName, business_type: businessType,
          location_text: locationText, country, has_website: hasWebsite,
          website: website || undefined, lead_id: leadId || undefined,
          business_scope: businessScope || undefined,
          specialisms: specialisms || undefined,
          question_count: questionCount,
          questions: clean,
          /* The money flag for the set being sent. Filtered to `clean` here as well as server-side,
             so an edited or removed question cannot arrive flagged. */
          ...(previewMoney.length
            ? { money_questions: previewMoney.filter((q) => clean.includes(q)) }
            : {}),
          // Full measurement: the deliberate bulk gather. Server clamps to the measurement ceiling,
          // forces SEO off, and creates its OWN audit (not a run on an existing one) so start vs
          // re-measure stay comparable. The queue paces the run — this never fires all at once.
          ...(fullMode ? { purpose: 'measurement', skip_seo: true } : {}),
          ...(overrideDistance ? { override_distance: true } : {}),
        },
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

  // ── Re-run (new run on the SAME audit) — now EDITABLE. "Re-run" opens an inline editor
  //    seeded with the current run's questions; the operator tweaks the terms and confirms.
  //    Submit sends { audit_id, questions } — create-ai-audit honors providedQuestions on the
  //    reuse path (else reuses verbatim), so edits take effect on the same audit.
  const startReRun = () => {
    if (!auditId || isDraining) return;
    const seen = new Set<string>();
    const seed = queueRows
      .map((r) => (r.question ?? '').trim())
      .filter((q) => { if (!q) return false; const k = q.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    setReRunQuestions(seed.length ? seed : ['']);
    setReRunForRunId(runId);   // scope this editor to the currently-open run
    setReRunEditing(true);
  };

  const cancelReRun = () => { setReRunEditing(false); setReRunForRunId(null); setReRunQuestions([]); };

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

  const startReAudit = () => {
    if (!auditId || isDraining) return;
    const seen = new Set<string>();
    /* VERBATIM, deliberately — including misspellings. "accoutnant in wisbech" asked again is a
       valid like-for-like comparison; a tidied-up version silently measures something else. Only
       exact repeats are dropped, and the first occurrence's original text is what survives. */
    const seed = queueRows
      .map((r) => (r.question ?? '').trim())
      .filter((q) => { if (!q) return false; const k = q.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    setReAuditQuestions(seed.length ? seed : ['']);
    /* Opens on whatever the SOURCE implies, so leaving the toggle alone reproduces exactly the
       behaviour this button had before the picker existed. */
    setReAuditMode(defaultReAuditMode(listSource.find((a) => a.id === auditId) ?? null));
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

  const confirmReAudit = async () => {
    if (!auditId || !user) return;
    const clean = reAuditQuestions.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) { toast({ title: 'Add at least one question', variant: 'destructive' }); return; }
    setReAuditBusy(true);
    try {
      /* ⛔ THE SHARED HELPER OWNS THE FIXED LOGIC. reAuditFromSource (src/lib/reAudit.ts) reads the
         source audit's markers, applies the exact type-aware check (is_measurement === true ||
         baseline_target_runs > 1), mints the copy and calls create-ai-audit with purpose:'measurement'
         when it is a measurement. The Baseline page's "Re-run this measurement" calls the SAME helper,
         so the two paths cannot drift back into the 5-question / 1-run bug. */
      const res = await reAuditFromSource(supabase as unknown as SupabaseClient, {
        /* The SAME value the cost line priced. reAuditFromSource turns it into the copy row's
           is_measurement + baseline_target_runs, so a 3-run price cannot become a 1-run audit. */
        sourceAuditId: auditId, userId: user.id, questions: clean, mode: reAuditMode,
      });
      if (!res.ok) throw new Error('error' in res ? res.error : 're-audit failed');

      setReAuditOpen(false); setReAuditQuestions([]);
      setAuditId(res.auditId);
      if (res.runId) { setRunId(res.runId); setOpenRunId(res.runId); }
      setRun(null); setQueueRows([]);
      toast({ title: 'Re-audit started', description: 'New audit row created — the original is untouched.' });
      loadSaved();
    } catch (e) {
      toast({ title: "Couldn't re-audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setReAuditBusy(false);
    }
  };

  const confirmReRun = async () => {
    if (!auditId) return;
    const clean = reRunQuestions.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) { toast({ title: 'Add at least one question', variant: 'destructive' }); return; }
    setRunning(true);
    try {
      /* Re-run amends THIS audit. If it is a Full Measurement, send purpose:'measurement' so its
         full question set isn't silently clamped to the 5-question wizard cap (the before/after
         path is Re-audit, which mints a fresh copy). Read the flag fresh so it's right even if the
         open audit changed. */
      const curSelect: string = 'is_measurement, baseline_target_runs'; // non-literal: skip column type-validation (see confirmReAudit)
      const { data: cur } = await supabase.from('ai_audits').select(curSelect).eq('id', auditId).maybeSingle();
      const curMarkers = cur as unknown as { is_measurement?: boolean | null; baseline_target_runs?: number | null } | null;
      // Same rule as confirmReAudit: a paid baseline (baseline_target_runs > 1) counts as a measurement
      // even though is_measurement is false, so its full question set isn't clamped to 5.
      const curIsMeasurement = curMarkers?.is_measurement === true || Number(curMarkers?.baseline_target_runs ?? 0) > 1;
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: { audit_id: auditId, questions: clean, ...(curIsMeasurement ? { purpose: 'measurement', skip_seo: true } : {}) },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 're-run failed');
      // Editor done → clear its persisted state so it doesn't reopen after the new run starts.
      setReRunEditing(false); setReRunForRunId(null); setReRunQuestions([]);
      setRunId(data.run_id);
      setOpenRunId(data.run_id);
      setRun(null); setQueueRows([]);
    } catch (e) {
      toast({ title: "Couldn't re-run", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
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

  // Load the audit's stored NAP + specialism + website for the Schema section whenever the
  // opened audit changes (these aren't in the wizard/results state on a reopened audit).
  useEffect(() => {
    if (!auditId) { setSchemaNap({ phone: '', address: '', email: '', specialism: '' }); setSchemaWebsite(''); setSchemaScope(null); setClientLinks([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('ai_audits')
        .select('website, business_phone, business_address, business_email, specialism, business_scope, client_links')
        .eq('id', auditId)
        .maybeSingle();
      if (cancelled || !data) return;
      const d = data as { website: string | null; business_phone: string | null; business_address: string | null; business_email: string | null; specialism: string | null; business_scope: string | null; client_links: unknown };
      setSchemaWebsite(d.website ?? '');
      setSchemaNap({ phone: d.business_phone ?? '', address: d.business_address ?? '', email: d.business_email ?? '', specialism: d.specialism ?? '' });
      setSchemaScope(d.business_scope === 'national' || d.business_scope === 'local' || d.business_scope === 'hybrid' ? d.business_scope : null);
      // Guard: only accept an array of {label,url}; anything else falls back to [].
      const links = Array.isArray(d.client_links)
        ? (d.client_links as unknown[]).map((l) => {
            const o = (l ?? {}) as { label?: unknown; url?: unknown };
            return { label: typeof o.label === 'string' ? o.label : '', url: typeof o.url === 'string' ? o.url : '' };
          })
        : [];
      setClientLinks(links);
    })();
    return () => { cancelled = true; };
  }, [auditId]);

  // Copy the JSON-LD block (existing inline clipboard convention).
  const copySchema = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  // Persist the four schema fields back to ai_audits so they pre-fill next visit.
  const saveSchemaDetails = async () => {
    if (!auditId || schemaSaving) return;
    setSchemaSaving(true);
    try {
      const { error } = await supabase.from('ai_audits').update({
        business_phone: schemaNap.phone.trim() || null,
        business_address: schemaNap.address.trim() || null,
        business_email: schemaNap.email.trim() || null,
        specialism: schemaNap.specialism.trim() || null,
      }).eq('id', auditId);
      if (error) throw new Error(error.message);
      toast({ title: 'Details saved' });
    } catch (e) {
      toast({ title: "Couldn't save details", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSchemaSaving(false);
    }
  };

  // Persist the link hub to ai_audits.client_links: trim, drop rows blank in BOTH fields, and
  // normalise each url with the shared schemaType helper. Mirrors saveSchemaDetails.
  const saveClientLinks = async () => {
    if (!auditId || linksSaving) return;
    setLinksSaving(true);
    try {
      const cleaned = clientLinks
        .map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) }))
        .filter((l) => l.label || l.url);
      const { error } = await supabase.from('ai_audits').update({ client_links: cleaned }).eq('id', auditId);
      if (error) throw new Error(error.message);
      setClientLinks(cleaned);
      toast({ title: 'Links saved' });
    } catch (e) {
      toast({ title: "Couldn't save links", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setLinksSaving(false);
    }
  };

  // Copy a single link's URL (reuses the inline clipboard convention from copySchema).
  const copyLink = async (url: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(normalizeUrl(url));
      setLinkCopiedIdx(idx);
      setTimeout(() => setLinkCopiedIdx((i) => (i === idx ? null : i)), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  // The site to scan: the schema website, else the wizard website when the audit has one.
  const scanTargetUrl = (schemaWebsite || (resultsHasWebsite ? website : '')).trim();

  // Scan the client's own site → open the editable review panel. Saves NOTHING.
  const runScan = async () => {
    if (!auditId || !scanTargetUrl || scanning) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-site-details', {
        body: { website: scanTargetUrl, business_name: resultsBusinessName || businessName, audit_id: auditId },
      });
      if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? 'scan failed');
      const d = (data.details ?? {}) as { phone?: string; address?: string; email?: string; hours?: string };
      const rawLinks = Array.isArray(data.links) ? data.links as { label?: string; url?: string }[] : [];
      setScanReview({
        details: { phone: d.phone ?? '', address: d.address ?? '', email: d.email ?? '', hours: d.hours ?? '' },
        detailInclude: { phone: !!d.phone, address: !!d.address, email: !!d.email, hours: false }, // hours: no column to save into
        links: rawLinks.map((l) => {
          const url = (l.url ?? '').trim();
          const templateDefault = looksLikeTemplateDefault(url);
          // Default-EXCLUDE template defaults (facebook.com/wix etc.) so they're never applied by accident.
          return { label: (l.label ?? '').trim(), url, include: !templateDefault, templateDefault };
        }),
      });
      if (!data.found) toast({ title: 'Nothing found', description: "The scan didn't find details or links on that site." });
    } catch (e) {
      toast({ title: "Couldn't scan the site", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  // Apply the INCLUDED, non-empty scanned details into the schemaNap fields (does NOT save —
  // the operator then clicks the existing "Save details"). Opens the Schema section so the
  // pre-filled fields are visible. Overwrites are never silent: the review shows the current
  // value + a "will replace" flag, and each field is include-gated + editable before this.
  const applyScanDetails = () => {
    if (!scanReview) return;
    const r = scanReview;
    setSchemaNap((p) => ({
      ...p,
      phone: r.detailInclude.phone && r.details.phone.trim() ? r.details.phone.trim() : p.phone,
      address: r.detailInclude.address && r.details.address.trim() ? r.details.address.trim() : p.address,
      email: r.detailInclude.email && r.details.email.trim() ? r.details.email.trim() : p.email,
      // hours has no ai_audits column — intentionally NOT applied (see review note).
    }));
    setShowSchema(true);
    toast({ title: 'Details applied', description: 'Review the Schema-markup fields, then Save details.' });
  };

  // Append the INCLUDED scanned links into clientLinks (never wipes existing; dedups by URL).
  // Operator then clicks the existing "Save links".
  const applyScanLinks = () => {
    if (!scanReview) return;
    const chosen = scanReview.links
      .filter((l) => l.include && (l.label.trim() || l.url.trim()))
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
    if (!chosen.length) { toast({ title: 'No links selected' }); return; }
    setClientLinks((prev) => {
      const have = new Set(prev.map((x) => x.url.trim().toLowerCase().replace(/\/+$/, '')));
      const add = chosen.filter((l) => !have.has(l.url.toLowerCase().replace(/\/+$/, '')));
      return [...prev, ...add];
    });
    setShowLinks(true);
    toast({ title: 'Links added', description: 'Review the Link hub rows, then Save links.' });
  };

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
    data.internal = true; // snapshot default — OVERRIDDEN at render/print by AiAuditReport's Client/Internal toggle (showInternal); Client is what shows unless the operator switches
    setReports((prev) => ({ ...prev, [rid]: data }));
    setReportRunId(rid);
  };

  // ── Derived results tallies ─────────────────────────────────────────────────
  const doneCount = queueRows.filter((r) => r.status === 'done' || r.status === 'failed').length;
  const liveTally = queueRows.reduce(
    (acc, r) => {
      if (r.status === 'done' && r.result) {
        acc.done++;
        for (const e of SCORED_ENGINES) { acc.total++; if (r.result[e]?.named) acc.named++; }
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
  /* Runs + cost for the re-audit estimate, from the CHOSEN mode (not the source's own markers)
     through the SAME helper reAuditFromSource writes baseline_target_runs with — so the figure
     approved here is the figure actually spent, whichever mode is picked.
     `reAuditSourceIsMeasurement` is kept separately: it is what the SOURCE was, used only to warn
     when a real measurement is being downgraded to a single run. */
  const reAuditSourceIsMeasurement = isMeasurementSource(openAuditRow);
  const reAuditRuns = runsForReAuditMode(reAuditMode, openAuditRow?.baseline_target_runs ?? null);
  const reAuditEstUsd = reAuditQuestions.filter((q) => q.trim()).length * RE_AUDIT_EST_USD_PER_QUESTION * reAuditRuns;

  // The re-run editor is open only for the run it was opened for (persisted flag is run-scoped),
  // so a stale editor can't reopen over a different audit after a tab-away/reload.
  const reRunOpen = reRunEditing && !!runId && reRunForRunId === runId;

  // Scorecard: per-engine hit-rate across the completed questions + the competitors AI
  // named most often (from the per-engine "instead" lists). Cheap; recomputed from the
  // live queue rows so it fills in as the run drains.
  const perEngineScore = DISPLAY_ENGINES.map((engine) => {
    let named = 0;
    let total = 0;
    for (const r of queueRows) {
      if (r.status === 'done' && r.result?.[engine]) { total++; if (r.result[engine]!.named) named++; }
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
          if (!isRealCompetitor(c, resultsLoc)) continue; // drop stopwords / location / fragments
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
      // Same expression as `ownWebsite` further down (schema value, else the wizard URL).
      // scanTargetUrl is computed earlier in this render, so reading it here is safe.
      ownWebsite: scanTargetUrl,
      seoStyle: openSeoStyle,
    });
    if (rd) rd.internal = true; // snapshot default — OVERRIDDEN at render/print by AiAuditReport's Client/Internal toggle (showInternal)
    return rd;
  })();

  // The business's own website (opened-run schema value, else the wizard URL when it has one) —
  // used by scoreQuestion to exclude own-site citations from the aggregator share. May be "".
  const ownWebsite = (schemaWebsite || (resultsHasWebsite ? website : '')).trim();
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
  const businesses = useMemo<BusinessGroup[]>(() => {
    const byKey = new Map<string, AuditLite[]>();
    for (const a of listSource) {
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
  }, [listSource]);

  /* ── THE FILTER ───────────────────────────────────────────────────────────────────────────────
     Matches NAME, TRADE and TOWN, because the way you remember an audit is often "that Wisbech
     locksmith" rather than the company name. All three are already on the group, so this costs
     nothing.
     Case-insensitive SUBSTRING, not word-prefix: "wisb" has to find Wisbech, and "lock" has to find
     both "Locksmith" and "Wellsecure Locksmiths".
     Every term must match SOMEWHERE in the row, so "wisbech locksmith" narrows rather than widening
     — the two words are in different fields, which an all-in-one-field match would miss. */
  const auditQueryTerms = useMemo(() => auditSearchTerms(auditQuery), [auditQuery]);
  const filteredBusinesses = useMemo(
    () => (auditQueryTerms.length === 0 ? businesses : businesses.filter((b) => auditMatches(b, auditQueryTerms))),
    [businesses, auditQueryTerms],
  );

  /** Trades, largest group first — of whatever survived the filter. */
  const tradeGroups = useMemo(() => {
    const byTrade = new Map<string, BusinessGroup[]>();
    for (const b of filteredBusinesses) {
      const list = byTrade.get(b.trade) ?? [];
      list.push(b);
      byTrade.set(b.trade, list);
    }
    return [...byTrade.entries()]
      .map(([trade, items]) => ({ trade, items }))
      .sort((a, b) => b.items.length - a.items.length || a.trade.localeCompare(b.trade));
  }, [filteredBusinesses]);

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
  /* Location is required for LOCAL/HYBRID audits — the questions are "[service] in [town]" and the
     server refuses a town-less local audit (create-ai-audit: local_scope_needs_town). A NATIONAL /
     remote client has NO town, and the server skips that gate for business_scope 'national', so a
     town must NOT be forced here either. Any other scope (including unset) still needs a town. */
  const canGenerate = !!businessName.trim() && !!businessType.trim()
    && (!!locationText.trim() || businessScope === 'national')
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
  const vizNamed = vizSummary?.named_datapoints ?? liveTally.named;
  const vizTotal = vizSummary?.total_datapoints ?? liveTally.total;
  const vizPct = vizTotal > 0 ? Math.round((vizNamed / vizTotal) * 100) : 0;
  const vizTone: TileTone = vizTotal === 0 ? 'muted' : vizPct >= 50 ? 'green' : vizPct > 0 ? 'amber' : 'red';
  const seoGrade = hasSeo ? String((run?.results as { seo?: { overallGrade?: string } } | null)?.seo?.overallGrade ?? '') : '';

  // Live JSON-LD schema for the "Schema markup" section — rebuilt each render as the NAP /
  // specialism inputs change. businessScope precedence: explicit stored scope > the generated
  // playbook's scope > undefined (buildSchema then falls back to its own heuristic).
  const playbookScope = (run?.results as { playbook?: { businessScope?: 'national' | 'local' | 'hybrid' } } | null)?.playbook?.businessScope;
  const schemaBusinessScope = schemaScope ?? playbookScope;
  const schemaCode = `<script type="application/ld+json">\n${JSON.stringify(buildSchema({
    name: resultsBusinessName || businessName,
    url: schemaWebsite || (resultsHasWebsite ? website : ''),
    businessType: resultsType,
    businessScope: schemaBusinessScope,
    locationText: resultsLoc,
    country,
    phone: schemaNap.phone,
    address: schemaNap.address,
    email: schemaNap.email,
    specialism: schemaNap.specialism,
  }), null, 2)}\n</script>`;

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
        onRegenerate={canRegenerate ? regenerateReport : undefined}
        regenerating={regenerating}
      />
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
          {/* Metrics strip - a quick read on the whole audit book (only when there are audits).
              Computed over BUSINESSES, not audit rows: a business audited twice used to be counted
              twice in both the average and the invisible tally. "Site . presence" is gone - it
              counted has_website, a static property of the lead list that says nothing about how
              any audit turned out. */}
          {metrics.audits > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard
                icon={<FileText className="h-4 w-4" />}
                label={auditsCapped ? `Businesses (of latest ${AUDIT_FETCH_LIMIT})` : 'Businesses'}
                value={String(metrics.businesses)}
              />
              {metrics.avgPct !== null && (
                <MetricCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Avg visibility"
                  value={`${metrics.avgPct}%`}
                  tone={metrics.avgPct >= 50 ? 'good' : metrics.avgPct > 0 ? 'mid' : 'bad'}
                />
              )}
              <MetricCard
                icon={<EyeOff className="h-4 w-4" />}
                label="Invisible"
                value={String(metrics.invisible)}
                tone={metrics.invisible > 0 ? 'bad' : 'good'}
              />
              <MetricCard
                icon={<Loader2 className={`h-4 w-4 ${metrics.inFlight > 0 ? 'animate-spin' : ''}`} />}
                label="In flight"
                value={String(metrics.inFlight)}
                tone={metrics.inFlight > 0 ? 'mid' : undefined}
              />
              {/* Paid baselines finalised vs started - the guarantee's measuring stick. */}
              {metrics.baselineTotal > 0 && (
                <MetricCard
                  icon={<Check className="h-4 w-4" />}
                  label="Baselines"
                  value={`${metrics.baselinesDone}/${metrics.baselineTotal}`}
                  tone={metrics.baselinesDone === metrics.baselineTotal ? 'good' : 'mid'}
                />
              )}
              {/* Real actor spend, summed from ai_audit_runs.actor_cost_usd. Only runs since that
                  column started being written carry a figure, so this is a floor, not a total. */}
              <MetricCard
                icon={<Download className="h-4 w-4" />}
                label="Spend (recorded)"
                value={`$${metrics.spend.toFixed(2)}`}
              />
            </div>
          )}

          {/* THE PAGE IS NOW JUST THE LIST. The source picker and the whole business-details form
              moved into the dialog at the bottom of this component — they used to sit in this same
              card, above the list, which is what made the page feel cluttered. */}
          <StepCard>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <Label className="text-sm font-semibold text-foreground">Past audits</Label>
                  {/* Honest about the window: the count is what was LOADED, and says so when full.
                      AND WITH A SEARCH ACTIVE IT DESCRIBES THE SEARCH, not the page — leaving
                      "129 businesses" above a list of three would make the filter look broken. */}
                  <span className="text-[11px] text-muted-foreground">
                    {auditQueryTerms.length > 0
                      ? `${filteredBusinesses.length} of ${metrics.businesses} match`
                      : `${metrics.businesses} business${metrics.businesses === 1 ? '' : 'es'} · ${metrics.audits} audit${metrics.audits === 1 ? '' : 's'}`}
                    {auditsCapped ? ` (latest ${AUDIT_FETCH_LIMIT})` : ''}
                  </span>
                </div>
                {/* Opens the dialog WITHOUT resetting, so this is a pure relocation of what the page
                    did before: any form state restored from sessionStorage is still there, exactly as
                    it would have been sitting on the page. Choosing "New business" or a different
                    lead inside the dialog is what changes the subject, same as it always was. */}
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> New audit
                </Button>
              </div>

              {/* ── SEARCH ────────────────────────────────────────────────────────────────────────
                  Only once there is enough to lose something in. Below that the list IS the search,
                  and a box over four rows is furniture. */}
              {businesses.length > SEARCH_MIN_BUSINESSES && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={auditQuery}
                    onChange={(e) => setAuditQuery(e.target.value)}
                    /* Escape clears rather than blurring. preventDefault stops it closing anything
                       this input happens to sit inside. */
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { e.preventDefault(); setAuditQuery(''); }
                    }}
                    placeholder="Search by name, trade or town"
                    aria-label="Search past audits"
                    className="h-8 pl-8 pr-8 text-[13px]"
                  />
                  {auditQuery !== '' && (
                    <button
                      type="button"
                      onClick={() => setAuditQuery('')}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* NOTHING MATCHED — said out loud, with the term quoted back and a way out. An empty
                  list reads as "you have no audits", which is the opposite of the truth, and is
                  exactly how a filter left on by accident becomes a panic. */}
              {businesses.length > 0 && filteredBusinesses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
                  <Search className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <div className="text-sm font-medium">No audits match &ldquo;{auditQuery}&rdquo;</div>
                  <div className="text-[11px] text-muted-foreground">
                    Searched {businesses.length} business{businesses.length === 1 ? '' : 'es'} by name, trade and town
                    {auditsCapped ? `, from the latest ${AUDIT_FETCH_LIMIT} audits loaded` : ''}.
                  </div>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setAuditQuery('')}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Clear search
                  </Button>
                </div>
              ) : businesses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
                  <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <div className="text-sm font-medium">No audits yet</div>
                  {/* "above" was correct when the form sat at the top of this card. It doesn't now. */}
                  <div className="text-[11px] text-muted-foreground">Run your first audit to see how AI answers for a business.</div>
                  <Button size="sm" className="mt-3" onClick={() => setFormOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> New audit
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {tradeGroups.map(({ trade, items }) => {
                    const collapsed = closedTrades.has(trade);
                    const running = items.filter((b) => b.runningRun).length;
                    return (
                      <div key={trade} className="space-y-1.5">
                        {/* Trade header — collapsible, largest trade first */}
                        <button
                          onClick={() => setClosedTrades((prev) => {
                            const next = new Set(prev);
                            if (next.has(trade)) next.delete(trade); else next.add(trade);
                            return next;
                          })}
                          className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/50"
                        >
                          {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-xs font-semibold capitalize">{trade}</span>
                          <span className="text-[11px] text-muted-foreground">{items.length}</span>
                          {running > 0 && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--badge-waiting))] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--badge-waiting-fg))]">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />{running} running
                            </span>
                          )}
                        </button>

                        {!collapsed && items.map((b) => {
                          const expanded = openBusinesses.has(b.key);
                          const nested = b.auditCount > 1 || b.runCount > 1;
                          const inFlight = b.runningRun;
                          const a = b.latestAudit;
                          const run = b.latestRun;
                          return (
                            <div key={b.key} className="rounded-lg border border-border/60 bg-card/60 transition-colors hover:bg-card">
                              {/* Collapsed row: ONE per business */}
                              <div className="flex items-center gap-2 px-3 py-2">
                                {nested ? (
                                  <button
                                    onClick={() => setOpenBusinesses((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(b.key)) next.delete(b.key); else next.add(b.key);
                                      return next;
                                    })}
                                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
                                    title={expanded ? 'Hide runs' : `Show ${b.auditCount} audits, ${b.runCount} runs`}
                                  >
                                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </button>
                                ) : <span className="w-[18px] shrink-0" />}

                                <button onClick={() => reopenAudit(a)} className="min-w-0 flex-1 text-left" title="Open latest results">
                                  {/* PRIMARY: the business. Heavier and darker than everything else on the row. */}
                                  <div className="flex items-center gap-1.5 truncate text-[0.95rem] font-semibold text-foreground">
                                    {b.has_website ? <Globe className="h-3 w-3 shrink-0 text-muted-foreground/70" /> : <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/70" />}
                                    <span className="truncate">{b.name}</span>
                                    {/* A MARKET AUDIT IS NOT A CLIENT. It sits in this list because it
                                        is an audit, and it stays searchable — but "[market] locksmiths
                                        · Hastings" reading like a business name is how one gets pitched
                                        by mistake. Badged, not hidden. */}
                                    {b.isMarket && (
                                      <span className="shrink-0 rounded border border-border bg-muted/60 px-1 py-0.5 text-[10px] font-medium text-muted-foreground">market</span>
                                    )}
                                    {nested && <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">{b.runCount} runs</span>}
                                  </div>
                                  {/* SECONDARY: trade and place, deliberately recessive. */}
                                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                                    {b.business_type || '—'}{b.location ? ` · ${b.location}` : ''}
                                  </div>
                                  {/* TERTIARY: the pill row gets its own line so it is readable rather than
                                      squeezed against the location text. */}
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    <AuditPills audit={a} run={run} />
                                  </div>
                                </button>

                                {/* State: live progress while draining, else the score */}
                                {inFlight ? <RunningChip run={inFlight} /> : <MentionPill rate={run?.mention_rate ?? null} />}

                                {/* Report — once the latest run has a score */}
                                {run?.mention_rate !== null && run?.mention_rate !== undefined && (
                                  <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => viewReport(a)} title="View report">
                                    <FileText className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Report</span>
                                  </Button>
                                )}
                                {/* REMOVED 2026-07-30: the row's "Playbook" button. It opened the
                                    generate-playbook LLM document, which is NOT the same thing as the
                                    `checklist` pill beside it — that one links to /playbook/:id, the
                                    evidence-derived document a client actually receives.
                                    Still reachable: open the audit's results and use View playbook.
                                    The LLM document is also the one with the known content problem
                                    (recommends Bing Places, which has zero citations across 8,913;
                                    omits Yell, which is cited). CLAUDE.md §5 and §9. */}
                                {inFlight && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => cancelAudit(a, inFlight.id)} disabled={cancellingId === a.id} title="Stop this audit">
                                    {cancellingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />}
                                  </Button>
                                )}
                                {/* Delete stays on the row ONLY for a single-audit business. With several
                                    audits it would be ambiguous which one goes, so it moves inside. */}
                                {!nested && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteAudit(a)} disabled={deletingId === a.id} title="Delete this audit">
                                    {deletingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </Button>
                                )}
                              </div>

                              {/* Expanded: every audit, and every run inside it */}
                              {expanded && nested && (
                                <div className="border-t border-border/60 bg-muted/20 px-3 py-2 space-y-2">
                                  {b.audits.map((au) => (
                                    <div key={au.id} className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                          {/* Year included: a before/after pair can straddle a year end,
                                              and "21 Jul" alone would not distinguish them. */}
                                          Audit {new Date(au.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                        <AuditPills audit={au} run={au.runs[0] ?? null} />
                                        <span className="flex-1" />
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteAudit(au)} disabled={deletingId === au.id} title="Delete this audit and its runs">
                                          {deletingId === au.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        </Button>
                                      </div>
                                      {au.runs.length === 0 ? (
                                        <div className="pl-3 text-[11px] text-muted-foreground">No runs</div>
                                      ) : au.runs.map((r) => {
                                        const draining = r.status === 'pending' || r.status === 'running';
                                        return (
                                          <div key={r.id} className="flex items-center gap-2 pl-3">
                                            <button onClick={() => reopenAudit(au, r)} className="min-w-0 flex-1 text-left text-[11px] hover:underline" title="Open this run">
                                              Run {r.run_number}
                                              <span className="text-muted-foreground"> · {r.status}</span>
                                              {r.actor_cost_usd !== null && <span className="text-muted-foreground"> · ${r.actor_cost_usd.toFixed(3)}</span>}
                                            </button>
                                            {draining ? <RunningChip run={r} /> : <MentionPill rate={r.mention_rate} />}
                                            {draining && (
                                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => cancelAudit(au, r.id)} disabled={cancellingId === au.id} title="Stop this run">
                                                <CircleStop className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </StepCard>
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
                  <Label className="text-xs text-muted-foreground">Business type</Label>
                  <Input ref={typeRef} value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="e.g. barber, plumber, dentist" />
                </div>

                {/* Location + country */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Town / city</Label>
                    <Input ref={townRef} value={locationText} onChange={(e) => setLocationText(e.target.value)}
                      placeholder="e.g. Leeds" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Country</Label>
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

                {/* Engagement scope — sets business_scope explicitly (overrides the downstream guess) */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">How do clients work with you?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ChoiceButton active={businessScope === 'local'} onClick={() => setBusinessScope('local')} label="They come to my premises" hint="Local" />
                    <ChoiceButton active={businessScope === 'national'} onClick={() => setBusinessScope('national')} label="I work remotely / across the country" hint="National" />
                    <ChoiceButton active={businessScope === 'hybrid'} onClick={() => setBusinessScope('hybrid')} label="A mix of both" hint="Hybrid" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">This shapes whether we focus on local listings or national directories.</p>
                </div>

                {/* Specialisms (optional) */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">What are they known for? (optional)</Label>
                  <Input ref={specialismsRef} value={specialisms} onChange={(e) => setSpecialisms(e.target.value)}
                    placeholder="e.g. kava, pool tables, vinyl" />
                  <p className="text-[11px] text-muted-foreground">Optional — helps ground the questions.</p>
                </div>

                {/* ── MODE TOGGLE: Quick audit (current) vs Full measurement (bulk gather) ────────
                    Quick is unchanged (3–5 questions). Full is the deliberate before/after gather —
                    a large DISTINCT question set × all engines, paced through the same queue. */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Audit mode</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ChoiceButton
                      active={!fullMode}
                      onClick={() => switchAuditMode('quick')}
                      icon={<Sparkles className="h-4 w-4" />}
                      label="Quick audit"
                      hint={`${MIN_QUESTION_COUNT}–${MAX_QUESTION_COUNT} questions · fast check`}
                    />
                    <ChoiceButton
                      active={fullMode}
                      onClick={() => switchAuditMode('full')}
                      icon={<ListChecks className="h-4 w-4" />}
                      label="Full measurement"
                      hint={`up to ${FULL_MAX_QUESTIONS} questions · before/after gather`}
                    />
                  </div>
                </div>

                {/* Number of questions. Quick: WIZARD 3–5. Full: MEASUREMENT 10–75 (server clamps to
                    match). Full stays ≤75 so one run stays under the queue's per-run $1 Apify cap. */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">How many questions?</Label>
                  <div className="flex items-center gap-3">
                    <Select
                      value={String(questionCount)}
                      onValueChange={(v) => setQuestionCount(fullMode ? clampFullCount(Number(v)) : clampQuestionCount(Number(v)))}
                    >
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(fullMode ? FULL_QUESTION_OPTIONS : QUESTION_COUNT_OPTIONS).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-muted-foreground">
                      We'll generate {questionCount} search question{questionCount === 1 ? '' : 's'}
                      {unitCost > 0 ? ` · est. cost ~$${(questionCount * unitCost).toFixed(2)}` : ''}.
                    </span>
                  </div>
                  {fullMode && (
                    <p className="text-[11px] text-muted-foreground/80">
                      Full measurement gathers citations across ChatGPT, Gemini &amp; Google AI and is
                      <strong> paced through the send queue</strong> (max ~24 running at once) — it won't fire all at
                      once. Run this once at the start and again at the end to show before/after. SEO scan is skipped.
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
                      Fill in name, type, {businessScope === 'national' ? '' : 'location, '}country and the website choice to continue.
                      {businessScope !== 'national' && ' (Location is optional if you pick “I work remotely / across the country”.)'}
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

              {/* ── PASTE YOUR OWN QUESTIONS (verbatim benchmark) ──────────────────────────────────
                  For a fixed benchmark the operator supplies the EXACT questions and a re-measure
                  compares like-for-like, so this REPLACES the whole list — nothing auto-generated is
                  left mixed in. One per line, stored and run word-for-word (create-ai-audit uses a
                  full provided set verbatim: no paraphrase, no town injection, no regeneration). */}
              {(() => {
                const parsed = pasteQuestions.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
                return (
                  <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
                    <Label className="text-xs font-medium">Paste your own questions (one per line)</Label>
                    <p className="text-[11px] text-muted-foreground -mt-0.5">
                      <strong>Replaces the list below entirely</strong> — exactly what you paste is what runs and gets stored, word-for-word. Use this for a fixed benchmark you'll re-measure against.
                    </p>
                    <Textarea
                      value={pasteQuestions}
                      onChange={(e) => setPasteQuestions(e.target.value)}
                      rows={6}
                      placeholder={"One question per line…\ne.g. best online menopause clinic UK\nHRT prescription online UK"}
                      className="text-sm"
                    />
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={parsed.length === 0}
                        onClick={() => {
                          setQuestions(parsed);        // REPLACE — no auto-generated questions remain
                          setPasteQuestions('');
                          toast({ title: `Replaced with ${parsed.length} pasted question${parsed.length === 1 ? '' : 's'}`, description: 'These run and are stored exactly as pasted.' });
                        }}
                      >
                        Replace list with these
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{parsed.length} line{parsed.length === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                );
              })()}

              {previewing ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" /> Generating questions…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {questions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={q} onChange={(e) => setQuestions((prev) => prev.map((x, xi) => xi === i ? e.target.value : x))} />
                        <Button variant="ghost" size="icon" onClick={() => setQuestions((prev) => prev.filter((_, xi) => xi !== i))} title="Remove">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setQuestions((prev) => [...prev, ''])}>
                      <Plus className="mr-1 h-4 w-4" /> Add question
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {questions.length} question{questions.length === 1 ? '' : 's'} · est. cost ~${estimatedCost.toFixed(2)}
                    </span>
                    {/* ⛔ ARROW, NOT A BARE REFERENCE. onClick={confirmAndRun} passes the click EVENT as the
                        first argument, which is truthy — the distance override would be ON for every
                        single audit and the guard would never fire once. */}
                    <Button onClick={() => confirmAndRun()} disabled={running || questions.length === 0}>
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
              {/* Top bar: back to the list + tidy action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" size="sm" className="-ml-2" onClick={() => { setStep('source'); setOpenRunId(null); }}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to audits
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Stop — only while the open run is still in flight (pending/running). */}
                  {isDraining && runId && (
                    <Button variant="outline" size="sm" onClick={cancelOpenRun} disabled={cancellingId === runId}
                      className="text-destructive hover:text-destructive" title="Stop this audit — it won't finish">
                      {cancellingId === runId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleStop className="mr-2 h-4 w-4" />}
                      {cancellingId === runId ? 'Stopping…' : 'Stop'}
                    </Button>
                  )}
                  {/* Automated SEO scan — website audits only. Runs the Apify actor (~30-120s). */}
                  {!isDraining && resultsHasWebsite && (
                    <Button variant="outline" size="sm" onClick={runSeoScan} disabled={seoScanning}>
                      {seoScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                      {/* Price on the face — the house rule: every spend says what it costs.
                          Derived from the sync-guarded constant, never hand-typed (§4). */}
                      {seoScanning ? 'Scanning…' : `${hasSeo ? 'Re-run SEO scan' : 'Run SEO scan'} · ~${asPence(SEO_SCAN_USD)}`}
                    </Button>
                  )}
                  {!isDraining && liveTally.done > 0 && (
                    <Button variant="outline" size="sm" onClick={openReportForCurrentRun}>
                      <FileText className="mr-2 h-4 w-4" /> {runId && reports[runId] ? 'View report' : 'Create report'}
                    </Button>
                  )}
                  {/* Public LISTING page (/r/[slug]): View if a published one exists, else Generate.
                      Distinct from the internal in-app report button above — this is the crawlable
                      public listing served at yoursites.uk/r/. Needs auditId (the generate-report key). */}
                  {!isDraining && liveTally.done > 0 && auditId && (
                    reportSlug && reportStatus === 'published' ? (
                      <Button variant="outline" size="sm" onClick={() => openReportPage(reportSlug)}
                        title="Open the public listing page (yoursites.uk/r/…)">
                        <ExternalLink className="mr-2 h-4 w-4" /> View listing
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={generateReportPage} disabled={reportPageLoading}
                        title="Generate the public listing page for this business">
                        {reportPageLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                        {reportPageLoading ? 'Generating…' : 'Generate listing'}
                      </Button>
                    )
                  )}
                  {/* ── PLAYBOOK. ONE BUTTON, ONE DOCUMENT. ────────────────────────────────────────
                      Was TWO buttons ("Generate playbook" / "View playbook"), both opening the
                      generate-playbook LLM document — the one that recommends Bing Places (zero
                      citations in 10,615) and never mentions Checkatrade (662 citations across 58 of
                      59 plumber audits). This goes to /playbook/:auditId, the evidence-derived
                      document, which is the actual deliverable.

                      NOTHING TO GENERATE ANY MORE, WHICH IS WHY THE VERB IS GONE. The evidence
                      document is a pure fold over stored citations — it exists the moment the audit
                      does. There is no model call, no cost, and no "generate" step to wait for.

                      GATED ON auditId ALONE, deliberately not on liveTally.done or !isDraining: the
                      ranking is trade-level, so the document is complete even when THIS run failed or
                      is still going. Macca-Gas's run failed at the Apify cap and its playbook is still
                      correct — locking the deliverable behind a successful run would have hidden it
                      exactly when it was needed. */}
                  {auditId && (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/playbook/${auditId}`} state={{ from: '/ai-audit', fromLabel: 'AI Audit' }}
                        title="Open the delivery playbook — directories evidenced from citations for this trade">
                        <MapIcon className="mr-2 h-4 w-4" /> Playbook
                      </Link>
                    </Button>
                  )}
                  {/* ⛔ THE FAIL-SAFE, VISIBLE. Paul's rule 2026-08-28: never ship a junk-named report
                      without knowing. Basis="the names themselves", so it fires on historic audits too. */}
                  {competitorCleanliness.verdict === 'dirty' && !isDraining && (
                    <div className="w-full rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
                      <div className="font-medium text-amber-700 dark:text-amber-400">
                        Competitor names not cleaned — do not send to client
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {competitorCleanliness.warning}
                        {' '}Rival names are withheld from the report until this is re-extracted, so it
                        cannot print raw text as a competitor.
                      </div>
                      {competitorCleanliness.junkExamples.length > 0 && (
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {competitorCleanliness.junkExamples.slice(0, 12).join(' · ')}
                          {competitorCleanliness.junkExamples.length > 12
                            ? ` · +${competitorCleanliness.junkExamples.length - 12} more` : ''}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Re-extract competitors — FREE/instant: recompute from stored answers, no re-scrape.
                      Highlighted when the stored names PROVE the cleaner never covered this run, so
                      the fix sits under the warning rather than somewhere else on the page. */}
                  {!isDraining && liveTally.done > 0 && (
                    <Button variant={competitorCleanliness.verdict === 'dirty' ? 'default' : 'outline'} size="sm"
                      onClick={reextractCompetitors} disabled={reextracting}
                      title="Recompute competitor names from the stored answers — an AI re-read, no new search">
                      {reextracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                      {reextracting ? 'Re-extracting…' : 'Re-extract competitors'}
                    </Button>
                  )}
                  {/* RESUME DRAFT — only when one exists, and labelled with its contents so it is
                      never a silent restore. Reopens the dialog exactly where it was left. */}
                  {draftSummary && (
                    <Button variant="secondary" size="sm" onClick={resumeDraft}
                      title="Reopen the audit you were part-way through composing. Nothing is regenerated and your edits are kept.">
                      <Undo2 className="mr-2 h-4 w-4" />
                      Resume draft — {draftSummary}
                    </Button>
                  )}
                  {/* startNewAudit = resetWizard (what this did before) + open the dialog, since the
                      form it used to reveal on the page is now in the modal.
                      ⚠️ This DISCARDS the draft above, on purpose — that is what "new" means here. */}
                  <Button variant="outline" size="sm" onClick={startNewAudit}
                    title={draftSummary ? 'Start fresh — this discards the draft beside it' : undefined}>
                    New audit
                  </Button>
                  {/* RE-AUDIT — a NEW audit row, prefilled. The measurement you want at week 8:
                      "Re-run" would add runs to THIS row and mix the after into the before. */}
                  {!isDraining && auditId && (
                    <Button variant="outline" size="sm" onClick={startReAudit}
                      disabled={running || isDraining || reAuditOpen || reAuditBusy}
                      title="Create a NEW audit for this business, prefilled from this one. Leaves this audit untouched as your before.">
                      <CopyPlus className="mr-2 h-4 w-4" /> Re-audit
                    </Button>
                  )}
                  <Button size="sm" onClick={startReRun} disabled={running || isDraining || reRunOpen}>
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Re-run
                  </Button>
                </div>
              </div>

              {/* Inline credentials/regulation for the listing — a small operator field. Saved to
                  ai_audits.credentials; the NEXT "Generate listing" picks it up. Same gate as the
                  listing button (a valid, non-draining audit). */}
              {!isDraining && liveTally.done > 0 && auditId && (
                <div className="space-y-1">
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
              {reAuditOpen && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Re-audit — creates a NEW audit</span>
                    <Button variant="ghost" size="sm" onClick={cancelReAudit} disabled={reAuditBusy}>Cancel</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A separate audit row for <span className="font-medium text-foreground">{resultsBusinessName || 'this business'}</span>,
                    carrying over the business details and credentials. <span className="font-medium text-foreground">This audit is not
                    modified</span> — it stays as your before.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Questions are copied exactly as they were asked, including any misspellings, so the
                    comparison is like-for-like. Edit them only if you want to measure something different.
                  </p>
                  {/* ⛔ MODE — the same ChoiceButton pair the New-audit flow uses, so the two
                      screens offer this choice identically. Quick = 1 run; Full measurement = the
                      source's repeat target (3 for a fresh one). The price below reads this. */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">How thorough?</span>
                    <div className="grid grid-cols-2 gap-2">
                      <ChoiceButton
                        active={reAuditMode === 'quick'}
                        onClick={() => setReAuditMode('quick')}
                        icon={<Sparkles className="h-4 w-4" />}
                        label="Quick"
                        hint="1 run · cheapest check"
                      />
                      <ChoiceButton
                        active={reAuditMode === 'measurement'}
                        onClick={() => setReAuditMode('measurement')}
                        icon={<ListChecks className="h-4 w-4" />}
                        label="Full measurement"
                        hint={`${runsForReAuditMode('measurement', openAuditRow?.baseline_target_runs ?? null)} runs · every question, every run`}
                      />
                    </div>
                    {/* ⚠️ A DOWNGRADE IS ALLOWED BUT NAMED. Cheaper, so it can never overspend —
                        but a 1-run "after" against a 3-run "before" is not a like-for-like
                        comparison, and that is a measurement error, not a saving. Warn, never block. */}
                    {reAuditSourceIsMeasurement && reAuditMode === 'quick' && (
                      <p className="text-[11px] text-amber-600">
                        This audit was measured over several runs. A 1-run re-audit is cheaper but
                        won&rsquo;t compare cleanly against it — a single run swings on luck, which is
                        why the before was repeated.
                      </p>
                    )}
                    {!reAuditSourceIsMeasurement && reAuditMode === 'measurement' && (
                      <p className="text-[11px] text-muted-foreground">
                        Upgrading a single-run audit: the new one repeats every question on all{' '}
                        {runsForReAuditMode('measurement', openAuditRow?.baseline_target_runs ?? null)} runs, so it
                        becomes a proper baseline to measure future work against. The original stays as it is.
                      </p>
                    )}
                  </div>
                  {/* PASTE A LIST — one question per line; numbered/bulleted lines are cleaned. */}
                  <div className="rounded-md border border-border/60 bg-background/60 p-2">
                    {!pasteOpen ? (
                      <Button variant="outline" size="sm" disabled={reAuditBusy} onClick={() => setPasteOpen(true)}>
                        <ClipboardList className="mr-2 h-4 w-4" /> Paste a list
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          One question per line. Blank lines are ignored, and numbered or bulleted lines
                          (&ldquo;1.&rdquo;, &ldquo;2)&rdquo;, &ldquo;-&rdquo;) are cleaned up automatically.
                        </p>
                        <Textarea
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          disabled={reAuditBusy}
                          rows={8}
                          placeholder={['How much does AndroFeme cost in the UK?', 'Can I get HRT online without a GP referral?', '3. Which UK clinics prescribe testosterone?'].join('\n')}
                          className="text-sm"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" disabled={reAuditBusy || !pasteText.trim()} onClick={() => applyPaste('replace')}>
                            Replace all ({parseQuestionPaste(pasteText).length})
                          </Button>
                          <Button variant="outline" size="sm" disabled={reAuditBusy || !pasteText.trim()} onClick={() => applyPaste('append')}>
                            Add to list ({parseQuestionPaste(pasteText).length})
                          </Button>
                          <Button variant="ghost" size="sm" disabled={reAuditBusy} onClick={() => { setPasteOpen(false); setPasteText(''); }}>Cancel</Button>
                          {pasteText.trim() && (
                            <span className="text-[11px] text-muted-foreground">
                              {parseQuestionPaste(pasteText).length} clean question{parseQuestionPaste(pasteText).length === 1 ? '' : 's'} from {pasteLineCount(pasteText)} line{pasteLineCount(pasteText) === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {reAuditQuestions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={q} disabled={reAuditBusy}
                          onChange={(e) => setReAuditQuestions((prev) => prev.map((x, xi) => xi === i ? e.target.value : x))} />
                        <Button variant="ghost" size="icon" disabled={reAuditBusy} title="Remove"
                          onClick={() => setReAuditQuestions((prev) => prev.filter((_, xi) => xi !== i))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" disabled={reAuditBusy}
                    onClick={() => setReAuditQuestions((prev) => [...prev, ''])}>
                    <Plus className="mr-2 h-4 w-4" /> Add question
                  </Button>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <div className="text-xs text-muted-foreground">
                      {/* ⛔ THE ESTIMATE MUST PRICE WHAT THE SERVER WILL ACTUALLY DO. It used to say
                          "× 1 run" and multiply by 1 while create-ai-audit ran MEASUREMENT_RUNS (3)
                          on the measurement path — a 47-question Solene re-audit priced at ~47p
                          against a real ~£1.17. The run count now comes from runsForReAuditMode over
                          the CHOSEN mode — the very same call reAuditFromSource uses to write the new
                          row's baseline_target_runs — so the price and the charge are one number, not
                          two that agree today. scripts/check-measurement-runs.mjs still fails the
                          build if the UI's MEASUREMENT_RUNS and create-ai-audit's ever diverge. */}
                      <span className="font-medium text-foreground">
                        {reAuditQuestions.filter((q) => q.trim()).length} question{reAuditQuestions.filter((q) => q.trim()).length === 1 ? '' : 's'}
                        {' × '}{reAuditRuns} run{reAuditRuns === 1 ? '' : 's'}
                      </span>
                      {' · '}
                      estimated cost{' '}
                      <span className="font-medium text-foreground">
                        ${reAuditEstUsd.toFixed(2)}
                      </span>
                      {' '}(~£{(reAuditEstUsd * 0.8).toFixed(2)})
                      <span className="block text-[10px] text-muted-foreground/70">
                        ${RE_AUDIT_EST_USD_PER_QUESTION}/question × {reAuditRuns} run{reAuditRuns === 1 ? '' : 's'}
                        {reAuditRuns > 1 ? ' (measurement — each question is asked on every run, matching the original baseline)' : ''},
                        from measured spend (81 runs, mean $0.042/run). Varies per run — the actual figure
                        is recorded when it finishes.
                      </span>
                    </div>
                    <Button size="sm" onClick={confirmReAudit}
                      disabled={reAuditBusy || reAuditQuestions.filter((q) => q.trim()).length === 0}>
                      {reAuditBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CopyPlus className="mr-2 h-4 w-4" />}
                      {reAuditBusy ? 'Creating…' : 'Start re-audit'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Editable re-run — inline editor seeded with the current run's questions. Edit/add/
                  remove terms, then Start re-run (submits { audit_id, questions } on the SAME audit).
                  Leaving them unchanged re-runs the same questions. */}
              {reRunOpen && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Edit questions for the re-run</span>
                    <Button variant="ghost" size="sm" onClick={cancelReRun} disabled={running}>Cancel</Button>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Edit, add or remove the search terms for this re-run. Leaving them unchanged re-runs the same questions on this audit.
                  </p>
                  <div className="space-y-2">
                    {reRunQuestions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={q} onChange={(e) => setReRunQuestions((prev) => prev.map((x, xi) => xi === i ? e.target.value : x))} />
                        <Button variant="ghost" size="icon" onClick={() => setReRunQuestions((prev) => prev.filter((_, xi) => xi !== i))} title="Remove">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setReRunQuestions((prev) => [...prev, ''])}>
                      <Plus className="mr-1 h-4 w-4" /> Add question
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {reRunQuestions.filter((q) => q.trim()).length} question{reRunQuestions.filter((q) => q.trim()).length === 1 ? '' : 's'}
                    </span>
                    <Button size="sm" onClick={confirmReRun} disabled={running || reRunQuestions.filter((q) => q.trim()).length === 0}>
                      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Start re-run
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
                    label="AI Visibility"
                    value={vizTotal > 0 ? `${vizNamed}/${vizTotal}` : '—'}
                    sub={vizTotal > 0 ? `${vizPct}% of AI answers name them` : 'No searches completed'}
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

          {/* Scan site & autofill — pull NAP + links off the client's own site to review, then
              apply into the Schema-markup fields + Link hub below (via their existing save paths). */}
          {!isDraining && liveTally.done > 0 && (
            <Card>
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Scan site &amp; autofill</div>
                    <div className="text-[11px] text-muted-foreground">Pull contact details + links off the client's own site to review, then apply to the fields below.</div>
                  </div>
                  <Button size="sm" className="shrink-0" onClick={runScan} disabled={scanning || !scanTargetUrl}>
                    {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                    {scanning ? 'Scanning…' : 'Scan site'}
                  </Button>
                </div>
                {!scanTargetUrl && (
                  <p className="text-[11px] text-muted-foreground">No website on this audit — nothing to scan.</p>
                )}

                {scanReview && (
                  <div className="rounded-lg border border-primary/40 bg-card/60 p-3 space-y-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Review — nothing is saved until you apply</div>

                    {/* Details found — editable + include-gated; conflicts with existing values flagged */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold">Details found</div>
                      {(['phone', 'address', 'email', 'hours'] as const).map((f) => {
                        const current = f === 'hours' ? '' : schemaNap[f]; // hours has no ai_audits column
                        const conflict = f !== 'hours' && current.trim() && current.trim() !== scanReview.details[f].trim();
                        return (
                          <div key={f} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-2 h-4 w-4 shrink-0 accent-primary disabled:opacity-40"
                              checked={scanReview.detailInclude[f]}
                              disabled={f === 'hours'}
                              onChange={(e) => setScanReview((s) => s && ({ ...s, detailInclude: { ...s.detailInclude, [f]: e.target.checked } }))}
                            />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <Label className="text-[11px] capitalize">
                                {f}{f === 'hours' && <span className="ml-1 font-normal text-muted-foreground">— no field to save into yet</span>}
                              </Label>
                              <Input
                                value={scanReview.details[f]}
                                placeholder={`No ${f} found`}
                                onChange={(e) => setScanReview((s) => s && ({ ...s, details: { ...s.details, [f]: e.target.value } }))}
                              />
                              {conflict && (
                                <div className="text-[11px] text-[hsl(var(--badge-waiting))]">Current: "{current}" — applying will replace it</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <Button variant="outline" size="sm" onClick={applyScanDetails}>Apply details → Schema fields</Button>
                    </div>

                    {/* Links found — editable + include-gated; template defaults flagged + default-excluded */}
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <div className="text-xs font-semibold">Links found</div>
                      {scanReview.links.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">No social / booking links found on the homepage.</p>
                      )}
                      {scanReview.links.map((l, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-2 h-4 w-4 shrink-0 accent-primary"
                            checked={l.include}
                            onChange={(e) => setScanReview((s) => s && ({ ...s, links: s.links.map((x, xi) => xi === i ? { ...x, include: e.target.checked } : x) }))}
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Input
                                className="sm:max-w-[10rem]"
                                value={l.label}
                                placeholder="Label"
                                onChange={(e) => setScanReview((s) => s && ({ ...s, links: s.links.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x) }))}
                              />
                              <Input
                                value={l.url}
                                placeholder="https://…"
                                onChange={(e) => setScanReview((s) => s && ({ ...s, links: s.links.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x) }))}
                              />
                            </div>
                            {l.templateDefault && (
                              <div className="text-[11px] font-medium text-[hsl(var(--badge-not-interested))]">⚠ Looks like a template default — likely wrong, fix the URL or leave unchecked</div>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={applyScanLinks}>Apply links → Link hub</Button>
                    </div>

                    <div className="border-t border-border/60 pt-2">
                      <Button variant="ghost" size="sm" onClick={() => setScanReview(null)}>Dismiss</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Schema markup — copy-paste JSON-LD, collapsed by default (mirrors Detailed results). */}
          {!isDraining && liveTally.done > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowSchema((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">
                  Schema markup
                  <span className="ml-1.5 font-normal text-muted-foreground">· JSON-LD for the site &lt;head&gt;</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSchema ? 'rotate-180' : ''}`} />
              </button>
              {showSchema && (
                <Card>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <p className="text-sm text-muted-foreground">Structured data that helps AI engines read this business. Fill in the details below, then copy the code into the site's &lt;head&gt;.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Phone</Label>
                        <Input value={schemaNap.phone} onChange={(e) => setSchemaNap((p) => ({ ...p, phone: e.target.value }))} placeholder="+44 …" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input value={schemaNap.email} onChange={(e) => setSchemaNap((p) => ({ ...p, email: e.target.value }))} placeholder="hello@example.co.uk" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Address</Label>
                        <Input value={schemaNap.address} onChange={(e) => setSchemaNap((p) => ({ ...p, address: e.target.value }))} placeholder="Street, town, postcode" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Specialism</Label>
                        <Input value={schemaNap.specialism} onChange={(e) => setSchemaNap((p) => ({ ...p, specialism: e.target.value }))} placeholder="e.g. CIS / construction" />
                      </div>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed"><code>{schemaCode}</code></pre>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => copySchema(schemaCode)}>
                        {schemaCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {schemaCopied ? 'Copied' : 'Copy code'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={saveSchemaDetails} disabled={schemaSaving}>
                        {schemaSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {schemaSaving ? 'Saving…' : 'Save details'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Link hub — the client's own URLs, collapsed by default (mirrors Schema markup). */}
          {!isDraining && liveTally.done > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowLinks((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">
                  Link hub
                  <span className="ml-1.5 font-normal text-muted-foreground">· {clientLinks.length} {clientLinks.length === 1 ? 'link' : 'links'}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showLinks ? 'rotate-180' : ''}`} />
              </button>
              {showLinks && (
                <Card>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <p className="text-sm text-muted-foreground">Store this client's own links — Wix login, Companies House, Google Business Profile, live site — so they're always to hand.</p>
                    <div className="space-y-2">
                      {clientLinks.map((link, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            className="sm:max-w-[12rem]"
                            value={link.label}
                            placeholder="Label"
                            onChange={(e) => setClientLinks((prev) => prev.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))}
                          />
                          <Input
                            value={link.url}
                            placeholder="https://…"
                            onChange={(e) => setClientLinks((prev) => prev.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x))}
                          />
                          <Button variant="ghost" size="icon" onClick={() => copyLink(link.url, i)} title="Copy URL" disabled={!link.url.trim()}>
                            {linkCopiedIdx === i ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setClientLinks((prev) => prev.filter((_, xi) => xi !== i))} title="Remove">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setClientLinks((prev) => [...prev, { label: '', url: '' }])}>
                        <Plus className="mr-1 h-4 w-4" /> Add link
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={saveClientLinks} disabled={linksSaving}>
                        {linksSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {linksSaving ? 'Saving…' : 'Save links'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

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
                  <span className="ml-1.5 font-normal text-muted-foreground">· {queueRows.length} {queueRows.length === 1 ? 'question' : 'questions'}</span>
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
              {showDetails && queueRows.map((row) => (
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

function StepCard({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="p-4 sm:p-5 space-y-4">{children}</CardContent></Card>;
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
function RunningChip({ run }: { run: RunLite }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[hsl(var(--badge-waiting))]/40 bg-[hsl(var(--badge-waiting))]/15 px-2 py-1 text-[11px] font-semibold text-[hsl(var(--badge-waiting))]"
      title={run.total ? `${run.done} of ${run.total} questions answered` : 'Starting'}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      {run.total ? <>running <span className="tabular-nums">{run.done}/{run.total}</span></> : <>starting</>}
    </span>
  );
}

/* ── PILL VOCABULARY ────────────────────────────────────────────────────────────────────
   Four categories, four deliberately different treatments, because they mean different things
   and previously all read as one thing ("opened" and "baseline 3/3" were both plain green).

     engagement  a PROSPECT ACTED. The most commercially useful signal here, so it gets the only
                 solid high-contrast fill on the row, and the repeat count is set larger than the
                 label so "7" is what the eye lands on.
     client      a PAYING CUSTOMER. Distinct from engagement AND from assets: bordered, tinted,
                 with a filled dot, so it reads as a status rather than an event.
     asset       a FACT about what exists (report, playbook). Deliberately recessive - ghost grey.
     data        a MEASUREMENT (SEO grade). Recessive frame, but the value itself is
                 colour-coded, since C/D/F is the part worth noticing. */

function EngagementPill({ count, title }: { count: number; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[hsl(var(--badge-closed))] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--badge-closed-fg))]"
    >
      <Eye className="h-3 w-3" />
      opened
      {count > 1 && <span className="ml-0.5 text-[12px] font-extrabold leading-none tabular-nums">{count}&times;</span>}
    </span>
  );
}

function ClientPill({ children, title, bad }: { children: React.ReactNode; title?: string; bad?: boolean }) {
  const tone = bad
    ? 'border-[hsl(var(--badge-not-interested))]/50 bg-[hsl(var(--badge-not-interested))]/10 text-[hsl(var(--badge-not-interested))]'
    : 'border-[hsl(var(--badge-closed))]/50 bg-[hsl(var(--badge-closed))]/10 text-[hsl(var(--badge-closed))]';
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${bad ? 'bg-[hsl(var(--badge-not-interested))]' : 'bg-[hsl(var(--badge-closed))]'}`} />
      {children}
    </span>
  );
}

function AssetPill({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex shrink-0 items-center rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** SEO grade: recessive frame, grade-coloured value. A/B fine, C/D/F worth noticing. */
function GradePill({ grade }: { grade: string }) {
  const letter = grade.trim().charAt(0).toUpperCase();
  const cls = letter === 'A' || letter === 'B'
    ? 'text-[hsl(var(--badge-closed))]'
    : letter === 'C'
    ? 'text-[hsl(var(--badge-waiting))]'
    : 'text-[hsl(var(--badge-not-interested))]';
  return (
    <span title="Website SEO grade from the latest run" className="inline-flex shrink-0 items-baseline gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      SEO <span className={`text-[11px] font-bold ${cls}`}>{grade}</span>
    </span>
  );
}

function AuditPills({ audit, run }: { audit: AuditLite; run: RunLite | null }) {
  const target = Number(audit.baseline_target_runs ?? 0);
  const counted = audit.baseline_runs_counted;
  return (
    <>
      {/* ENGAGEMENT first: it is the signal most likely to change what the operator does next. */}
      {audit.first_opened_at && (
        <EngagementPill
          count={audit.open_count ?? 1}
          title={`Report opened ${new Date(audit.first_opened_at).toLocaleString('en-GB')}${audit.open_count ? ` - ${audit.open_count} view${audit.open_count === 1 ? '' : 's'}` : ''}`}
        />
      )}
      {/* PAID CLIENT. Errors win: a stalled baseline is what needs attention. */}
      {target > 1 && (
        audit.baseline_error
          ? <ClientPill bad title={audit.baseline_error}>baseline failed</ClientPill>
          /* A FINISHED baseline links to the operator view, because until now it was measured and
             then invisible. Still-measuring stays a plain pill — there is nothing to read yet. */
          : audit.baseline_completed_at
            ? <Link
                to={`/baseline/${audit.id}`}
                state={{ from: '/ai-audit', fromLabel: 'AI Audit' }}
                onClick={(e) => e.stopPropagation()}
                title={`Baseline finalised ${new Date(audit.baseline_completed_at).toLocaleString('en-GB')} — open the operator view`}
                className="underline decoration-dotted underline-offset-2 hover:no-underline"
              >
                <ClientPill>client &middot; baseline {counted ?? target}/{target}</ClientPill>
              </Link>
            : <ClientPill title="Baseline still being measured">
                client &middot; baseline {counted ?? 0}/{target}
              </ClientPill>
      )}
      {/* DELIVERY CHECKLIST — /playbook/:id, resolved from this AUDIT id. Sits beside the baseline
          pill because they are the two halves of the same job: the baseline says what is wrong, the
          checklist says what to do about it.

          NOT the same thing as the `playbook` asset pill below, which means the generate-playbook
          LLM document stored at results.playbook. This one is the evidence-derived checklist and
          reads no model output, hence the different word. */}
      <Link
        to={`/playbook/${audit.id}`}
        state={{ from: '/ai-audit', fromLabel: 'AI Audit' }}
        onClick={(e) => e.stopPropagation()}
        title="Open the delivery checklist — directories evidenced from citations for this trade"
        className="underline decoration-dotted underline-offset-2 hover:no-underline"
      >
        <AssetPill>checklist</AssetPill>
      </Link>
      {audit.lead_paid === true && target <= 1 && <ClientPill title="This lead has paid">client</ClientPill>}
      {/* ASSETS: facts, not signals. */}
      {audit.report_slug && <AssetPill title={`Published at /r/${audit.report_slug}`}>report</AssetPill>}
      {/* REMOVED 2026-07-30: the `playbook` asset pill. It was never a link — just a marker saying an
          LLM playbook existed for the run — and sitting one pill away from `checklist` it read as a
          duplicate of it when the two are different documents entirely. `checklist` above is the one
          that opens /playbook/:id and is KEPT: for a business with an audit but no outreach_leads row
          (ABLM, the only delivery client) it is the ONLY route to that document, because the other
          entry point — the lead detail dialog's Playbook pill — is keyed on a LEAD id.
          ⚠️ THERE WERE THREE ROUTES UNTIL 2026-08-12; the Paid Clients page carried the third and was
          deleted with it. That makes this pill MORE load-bearing, not less. Do not remove it. */}
      {/* DATA */}
      {run?.seo_grade && <GradePill grade={run.seo_grade} />}
    </>
  );
}

function MentionPill({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) {
    return <span className="shrink-0 text-right text-[13px] tabular-nums text-muted-foreground/50">&mdash;</span>;
  }
  const pct = Math.round(rate * 100);
  // THE headline number: biggest type on the row, so the eye lands on the result first. Tone
  // carries the meaning; no pill chrome competing with the pill vocabulary to its left.
  const cls = pct >= 50 ? 'text-[hsl(var(--badge-closed))]'
    : pct > 0 ? 'text-[hsl(var(--badge-waiting))]'
    : 'text-[hsl(var(--badge-not-interested))]';
  return (
    <span className="shrink-0 text-right leading-none" title={`${pct}% of AI answers named this business`}>
      <span className={`font-sans text-[1.05rem] font-bold tabular-nums ${cls}`}>{pct}%</span>
      <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">named</span>
    </span>
  );
}
// Small stat tile for the landing metrics strip. `tone` tints the value only.
function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'good' | 'mid' | 'bad' }) {
  const valCls = tone === 'good' ? 'text-[hsl(var(--badge-closed))]'
    : tone === 'mid' ? 'text-[hsl(var(--badge-waiting))]'
    : tone === 'bad' ? 'text-[hsl(var(--badge-not-interested))]'
    : 'text-foreground';
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>{label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${valCls}`}>{value}</div>
    </div>
  );
}
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
  const shownCompetitors = er.competitors.filter((c) => isRealCompetitor(c, locationText));
  return (
    <div className="rounded-lg border border-border/50 p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold w-24 shrink-0">{ENGINE_LABELS[engine] ?? engine}</span>
        {er.named
          ? <Badge className="border-transparent bg-[hsl(var(--badge-interested))] text-[hsl(var(--badge-interested-fg))]">Named{er.position ? ` · #${er.position}` : ''}</Badge>
          : <Badge className="border-transparent bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))]">Not named</Badge>}
        {engine !== 'google_organic' && shownCompetitors.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            instead: {shownCompetitors.slice(0, 5).join(', ')}
          </span>
        )}
      </div>
      {/* The gut-punch: show what the AI actually said when the business is absent. */}
      {!er.named && er.answer_text && (
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
