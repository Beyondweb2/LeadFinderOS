import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, X, ArrowLeft, Sparkles, RefreshCw, ExternalLink, Search, Check,
} from 'lucide-react';
import type { Country } from '@/types/outreach';

// AI Visibility Audit — a stacked/conversational wizard: answered steps stay visible
// and answering one reveals the next below it (no per-step Next). Generates search
// questions, runs them across AI engines via create-ai-audit + the process-ai-audit-queue
// drain, and polls the run for results.

type Step = 'source' | 'name' | 'type' | 'location' | 'website' | 'review' | 'results';
// The stacked wizard steps, in order. `revealed` is the furthest index shown; every
// step 0..revealed is rendered at once. 'results' is a separate phase (step === 'results').
const WIZARD_STEPS = ['source', 'name', 'type', 'location', 'website', 'specialisms', 'review'] as const;
const REVIEW_INDEX = WIZARD_STEPS.indexOf('review');
const SPECIALISMS_INDEX = WIZARD_STEPS.indexOf('specialisms');

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

// Engines shown in results (queue targets chatgpt+gemini; the actor also returns
// AI Overview + Google organic, shown for context). mention_rate is over chatgpt+gemini.
const DISPLAY_ENGINES = ['chatgpt', 'gemini', 'ai_overview', 'google_organic'] as const;
const SCORED_ENGINES = ['chatgpt', 'gemini'] as const;
const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'AI Overview', google_organic: 'Google',
};

interface EngineResult {
  named: boolean;
  position: number | null;
  competitors: string[];
  citations: { title: string; url: string }[];
  answer_text: string;
}
type EngineMap = Record<string, EngineResult>;
interface QueueRow { id: string; question: string; status: string; result: EngineMap | null; }
interface RunRow { id: string; audit_id: string; run_number: number; status: string; mention_rate: number | null; results: unknown }
interface AuditRow { id: string; business_name: string; business_type: string | null; location_text: string | null; country: string | null; has_website: boolean; created_at: string }
interface LeadOption { id: string; business_name: string; category: string | null; country: string | null; website: string | null; address: string | null }

const TERMINAL = new Set(['complete', 'capped', 'failed']);

// Wizard state is persisted to sessionStorage so it survives leaving the page and
// coming back (unmount/remount) and a tab refresh, but clears when the tab closes.
// Only the WIZARD fields are persisted — never results/polling state. `revealed` is
// stored so a return shows ALL previously-answered steps stacked, not just a jump.
const WIZARD_KEY = 'leadfinder:ai-audit-wizard';
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
  specialisms: string;
  questions: string[];
  unitCost: number;
  engineCount: number;
}
/** Read persisted wizard state (best-effort; null if absent/unavailable/invalid). */
function loadWizard(): PersistedWizard | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedWizard>;
    return p && typeof p === 'object' ? (p as PersistedWizard) : null;
  } catch {
    return null;
  }
}
function clearWizard() {
  try { sessionStorage.removeItem(WIZARD_KEY); } catch { /* storage unavailable */ }
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

const AiAudit = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Rehydrate the wizard once from sessionStorage. Nothing is pre-filled on a fresh
  // start. `step` is only the wizard/results discriminator; results is never persisted.
  const [persisted] = useState<PersistedWizard | null>(() => loadWizard());
  const [step, setStep] = useState<Step>('source');
  const [revealed, setRevealed] = useState<number>(() => initialRevealed(persisted));

  // Wizard form state — no defaults on a fresh start (mode/country unselected, website unknown).
  const [mode, setMode] = useState<'new' | 'existing' | null>(persisted?.mode ?? null);
  const [leadId, setLeadId] = useState<string | null>(persisted?.leadId ?? null);
  const [businessName, setBusinessName] = useState(persisted?.businessName ?? '');
  const [businessType, setBusinessType] = useState(persisted?.businessType ?? '');
  const [locationText, setLocationText] = useState(persisted?.locationText ?? '');
  const [country, setCountry] = useState<Country | ''>(persisted?.country ?? '');
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(persisted?.hasWebsite ?? null);
  const [website, setWebsite] = useState(persisted?.website ?? '');
  const [specialisms, setSpecialisms] = useState(persisted?.specialisms ?? ''); // optional — grounds question generation

  // Existing-lead picker + saved audits
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [savedAudits, setSavedAudits] = useState<(AuditRow & { latest_mention_rate: number | null })[]>([]);

  // Review (questions) state
  const [previewing, setPreviewing] = useState(false);
  const [questions, setQuestions] = useState<string[]>(persisted?.questions ?? []);
  const [unitCost, setUnitCost] = useState(persisted?.unitCost ?? 0);
  const [engineCount, setEngineCount] = useState(persisted?.engineCount ?? SCORED_ENGINES.length);
  const [running, setRunning] = useState(false);

  // Results state
  const [auditId, setAuditId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [resultsBusinessName, setResultsBusinessName] = useState('');

  // Refs to move focus to a newly-revealed step (accessibility).
  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLInputElement>(null);
  const townRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const specialismsRef = useRef<HTMLInputElement>(null);

  const estimatedCost = Number((questions.length * engineCount * unitCost).toFixed(2));

  // Reveal the next step (monotonic — earlier answers stay revealed/editable).
  const reveal = (i: number) => setRevealed((r) => Math.max(r, i));

  // Persist wizard state on change so it survives unmount/remount + refresh. Once the
  // audit is running (step 'results'), drop the key so the next visit starts clean.
  useEffect(() => {
    if (step === 'results') { clearWizard(); return; }
    try {
      sessionStorage.setItem(WIZARD_KEY, JSON.stringify({
        revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, specialisms, questions, unitCost, engineCount,
      }));
    } catch { /* storage unavailable — persistence is best-effort */ }
  }, [step, revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, specialisms, questions, unitCost, engineCount]);

  // ── Initial load: the user's leads (for the picker) + saved audits ──────────
  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data: audits } = await supabase
      .from('ai_audits')
      .select('id, business_name, business_type, location_text, country, has_website, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    const auditRows = (audits ?? []) as AuditRow[];
    // Latest run mention_rate per audit (one query, newest first, reduce client-side).
    const ids = auditRows.map((a) => a.id);
    let rateByAudit: Record<string, number | null> = {};
    if (ids.length) {
      const { data: runs } = await supabase
        .from('ai_audit_runs')
        .select('audit_id, mention_rate, run_number')
        .in('audit_id', ids)
        .order('run_number', { ascending: false });
      for (const r of (runs ?? []) as { audit_id: string; mention_rate: number | null }[]) {
        if (!(r.audit_id in rateByAudit)) rateByAudit[r.audit_id] = r.mention_rate;
      }
    }
    setSavedAudits(auditRows.map((a) => ({ ...a, latest_mention_rate: rateByAudit[a.id] ?? null })));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('outreach_leads')
        .select('id, business_name, category, country, website, address')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(500);
      setLeads((data ?? []) as LeadOption[]);
    })();
    loadSaved();
  }, [user, loadSaved]);

  // ── Poll the active run while it drains ─────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRun = useCallback(async (rid: string) => {
    const { data: runRow } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results')
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
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { stop = true; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, runId, pollRun, loadSaved]);

  const resetWizard = () => {
    setMode(null); setLeadId(null); setBusinessName(''); setBusinessType('');
    setLocationText(''); setCountry(''); setHasWebsite(null); setWebsite(''); setSpecialisms('');
    setQuestions([]); setUnitCost(0); setEngineCount(SCORED_ENGINES.length);
    setAuditId(null); setRunId(null); setRun(null); setQueueRows([]);
    setRevealed(0); setStep('source');
  };

  const pickLead = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    setLeadId(id);
    if (lead) {
      setBusinessName(lead.business_name ?? '');
      setBusinessType(lead.category ?? '');
      setLocationText(lead.address ?? '');
      if (lead.country) setCountry(lead.country as Country);
      setHasWebsite(!!lead.website);
      setWebsite(lead.website ?? '');
    }
    reveal(WIZARD_STEPS.indexOf('name'));
  };

  // ── Preview questions (generate for the review step) ─────────────────────────
  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          preview: true,
          business_name: businessName, business_type: businessType,
          location_text: locationText, country, has_website: hasWebsite,
          website: website || undefined, specialisms: specialisms || undefined,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'preview failed');
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setUnitCost(typeof data.unit_cost_usd === 'number' ? data.unit_cost_usd : 0);
      setEngineCount(Array.isArray(data.engines) ? data.engines.length : SCORED_ENGINES.length);
    } catch (e) {
      toast({ title: "Couldn't generate questions", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  }, [businessName, businessType, locationText, country, hasWebsite, website, specialisms, toast]);

  // When the review step is first revealed with no questions yet, generate them.
  // Editing type/location later does NOT auto-wipe/regenerate (only reveal-fresh or the
  // explicit Regenerate button do). Focus moves to the newly-revealed step.
  useEffect(() => {
    const cur = WIZARD_STEPS[revealed];
    if (cur === 'name') nameRef.current?.focus();
    else if (cur === 'type') typeRef.current?.focus();
    else if (cur === 'location') townRef.current?.focus();
    else if (cur === 'specialisms') specialismsRef.current?.focus();
    else if (cur === 'review' && questions.length === 0 && !previewing) runPreview();
    // Fire only on reveal changes — not on every keystroke/question edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  // ── Confirm & run ───────────────────────────────────────────────────────────
  const confirmAndRun = async () => {
    const clean = questions.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) { toast({ title: 'Add at least one question', variant: 'destructive' }); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          business_name: businessName, business_type: businessType,
          location_text: locationText, country, has_website: hasWebsite,
          website: website || undefined, lead_id: leadId || undefined,
          specialisms: specialisms || undefined,
          questions: clean,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'run failed');
      clearWizard(); // audit created successfully → next visit starts clean
      setAuditId(data.audit_id);
      setRunId(data.run_id);
      setResultsBusinessName(data.business_name ?? businessName);
      setRun(null); setQueueRows([]);
      setStep('results');
    } catch (e) {
      toast({ title: "Couldn't start the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  // ── Re-run (new run on the same audit, same questions) ──────────────────────
  const reRun = async () => {
    if (!auditId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', { body: { audit_id: auditId } });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 're-run failed');
      setRunId(data.run_id);
      setRun(null); setQueueRows([]);
    } catch (e) {
      toast({ title: "Couldn't re-run", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const reopenAudit = async (audit: AuditRow) => {
    const { data: latest } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results')
      .eq('audit_id', audit.id)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) { toast({ title: 'No runs yet for this audit', variant: 'destructive' }); return; }
    setAuditId(audit.id);
    setResultsBusinessName(audit.business_name);
    setRun(latest as RunRow);
    setRunId((latest as RunRow).id);
    setStep('results');
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

  // Advance from a text field on Enter (if valid). Editing an earlier field re-fires
  // reveal(), but reveal is monotonic so nothing below collapses.
  const enterAdvance = (valid: boolean, nextIndex: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); if (valid) reveal(nextIndex); }
  };

  const shown = (name: typeof WIZARD_STEPS[number]) => revealed >= WIZARD_STEPS.indexOf(name);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-7">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 justify-center sm:justify-start">
          <Sparkles className="h-5 w-5 text-primary" /> AI Visibility Audit
        </h1>
        <p className="text-sm text-muted-foreground">
          See whether AI assistants (ChatGPT, Gemini, Google AI Overview) name a business when customers ask.
        </p>
      </div>

      {/* Stacked wizard — answered steps stay visible; each answer reveals the next. */}
      {step !== 'results' && (
        <div className="space-y-4">
          {/* Step 1 — source */}
          <StepCard>
            <StepHeader title="Audit a new business, or an existing lead?" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ChoiceButton active={mode === 'new'} onClick={() => { setMode('new'); setLeadId(null); reveal(WIZARD_STEPS.indexOf('name')); }} label="New business" hint="Enter the details yourself" />
              <ChoiceButton active={mode === 'existing'} onClick={() => setMode('existing')} label="Existing lead" hint="Pick from your CRM" />
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

            {savedAudits.length > 0 && (
              <div className="pt-4 mt-2 border-t border-border/60 space-y-2">
                <Label className="text-xs text-muted-foreground">Past audits</Label>
                <div className="space-y-1.5">
                  {savedAudits.map((a) => (
                    <button key={a.id} onClick={() => reopenAudit(a)}
                      className="w-full flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-left hover:bg-card transition-colors">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{a.business_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{a.business_type || '—'}{a.location_text ? ` · ${a.location_text}` : ''}</div>
                      </div>
                      <MentionPill rate={a.latest_mention_rate} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </StepCard>

          {/* Step 2 — name */}
          {shown('name') && (
            <StepCard>
              <StepHeader title="What's the business name?" />
              <Input ref={nameRef} value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                onKeyDown={enterAdvance(!!businessName.trim(), WIZARD_STEPS.indexOf('type'))}
                placeholder="e.g. Joe's Barbers" />
              <p className="text-[11px] text-muted-foreground">Press Enter to continue</p>
            </StepCard>
          )}

          {/* Step 3 — type */}
          {shown('type') && (
            <StepCard>
              <StepHeader title="What type of business is it?" />
              <Input ref={typeRef} value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                onKeyDown={enterAdvance(!!businessType.trim(), WIZARD_STEPS.indexOf('location'))}
                placeholder="e.g. barber, plumber, dentist" />
              <p className="text-[11px] text-muted-foreground">Press Enter to continue</p>
            </StepCard>
          )}

          {/* Step 4 — location + country */}
          {shown('location') && (
            <StepCard>
              <StepHeader title="Where is it based?" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Town / city</Label>
                  <Input ref={townRef} value={locationText} onChange={(e) => setLocationText(e.target.value)}
                    onKeyDown={enterAdvance(!!locationText.trim() && !!country, WIZARD_STEPS.indexOf('website'))}
                    placeholder="e.g. Leeds" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Country</Label>
                  <Select value={country || undefined} onValueChange={(v) => { setCountry(v as Country); if (locationText.trim()) reveal(WIZARD_STEPS.indexOf('website')); }}>
                    <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                    <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Pick a country (or press Enter) to continue</p>
            </StepCard>
          )}

          {/* Step 5 — website */}
          {shown('website') && (
            <StepCard>
              <StepHeader title="Does it have a website?" />
              <div className="grid grid-cols-2 gap-3">
                <ChoiceButton active={hasWebsite === true} onClick={() => { setHasWebsite(true); setTimeout(() => urlRef.current?.focus(), 0); }} label="Yes" hint="Enter the URL" />
                <ChoiceButton active={hasWebsite === false} onClick={() => { setHasWebsite(false); setWebsite(''); reveal(SPECIALISMS_INDEX); }} label="No" hint="Presence-led audit" />
              </div>
              {hasWebsite === true && (
                <>
                  <Input ref={urlRef} value={website} onChange={(e) => setWebsite(e.target.value)}
                    onKeyDown={enterAdvance(!!website.trim(), SPECIALISMS_INDEX)}
                    placeholder="https://…" />
                  <p className="text-[11px] text-muted-foreground">Press Enter to continue</p>
                </>
              )}
            </StepCard>
          )}

          {/* Step 6 — specialisms (OPTIONAL) */}
          {shown('specialisms') && (
            <StepCard>
              <StepHeader title="What are they known for? (optional)" />
              <Input ref={specialismsRef} value={specialisms} onChange={(e) => setSpecialisms(e.target.value)}
                onKeyDown={enterAdvance(true, REVIEW_INDEX)}
                placeholder="e.g. kava, pool tables, vinyl" />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Optional — helps ground the questions. Press Enter to continue{specialisms.trim() ? '' : ' (or skip)'}.</p>
                <Button variant="ghost" size="sm" onClick={() => reveal(REVIEW_INDEX)}>
                  {specialisms.trim() ? 'Continue' : 'Skip'}
                </Button>
              </div>
            </StepCard>
          )}

          {/* Step 7 — review questions + cost */}
          {shown('review') && (
            <StepCard>
              <div className="flex items-center justify-between gap-2">
                <StepHeader title="Review the questions" />
                <Button variant="ghost" size="sm" onClick={runPreview} disabled={previewing} title="Regenerate questions">
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${previewing ? 'animate-spin' : ''}`} /> Regenerate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                These are the searches we'll run across {SCORED_ENGINES.map((e) => ENGINE_LABELS[e]).join(' + ')} (plus AI Overview & Google). Edit, add or remove any.
              </p>
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
                    <Button onClick={confirmAndRun} disabled={running || questions.length === 0}>
                      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Confirm & run
                    </Button>
                  </div>
                </>
              )}
            </StepCard>
          )}
        </div>
      )}

      {step === 'results' && (
        <div className="space-y-4">
          {/* Headline */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm text-muted-foreground">{resultsBusinessName}</div>
                  <ResultsHeadline run={run} live={liveTally} draining={isDraining} />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={resetWizard}>New audit</Button>
                  <Button size="sm" onClick={reRun} disabled={running || isDraining}>
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Re-run
                  </Button>
                </div>
              </div>
              {isDraining && (
                <div className="mt-3 space-y-1.5">
                  <Progress value={queueRows.length ? (doneCount / queueRows.length) * 100 : 0} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running searches… {doneCount}/{queueRows.length || '…'}
                    {run?.status === 'capped' && <span className="text-amber-500">· cost cap reached</span>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-question results */}
          {queueRows.length === 0 && !isDraining && (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          )}
          {queueRows.map((row) => (
            <QuestionCard key={row.id} row={row} businessName={resultsBusinessName} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Small presentational helpers ─────────────────────────────────────────── */

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
function ChoiceButton({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-colors ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/60 bg-card/60 hover:bg-card'}`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {active && <Check className="h-4 w-4 text-primary" />}{label}
      </div>
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    </button>
  );
}
function MentionPill({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) return <Badge variant="secondary" className="shrink-0">—</Badge>;
  const pct = Math.round(rate * 100);
  const cls = pct >= 50 ? 'bg-[hsl(var(--badge-interested))] text-[hsl(var(--badge-interested-fg))]'
    : pct > 0 ? 'bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))]'
    : 'bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))]';
  return <Badge className={`shrink-0 border-transparent ${cls}`}>{pct}% named</Badge>;
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

function QuestionCard({ row, businessName }: { row: QueueRow; businessName: string }) {
  const pending = row.status === 'pending' || row.status === 'running';
  // Failed rows store { error } (not an engine map); surface it instead of engines.
  const failure = row.status === 'failed' ? (row.result as unknown as { error?: string } | null)?.error ?? null : null;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium">{row.question}</div>
          {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            : row.status === 'failed' ? <Badge variant="secondary" className="shrink-0">failed</Badge>
            : null}
        </div>
        {row.status === 'failed' && (
          <p className="text-[11px] text-amber-500">Search failed{failure ? ` — ${failure}` : ''}. It'll retry, or you can re-run the audit.</p>
        )}
        {row.status === 'done' && row.result && (
          <div className="space-y-2.5">
            {DISPLAY_ENGINES.map((e) => {
              const er = row.result?.[e];
              if (!er) return null;
              return <EngineRow key={e} engine={e} er={er} businessName={businessName} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EngineRow({ engine, er, businessName }: { engine: string; er: EngineResult; businessName: string }) {
  return (
    <div className="rounded-lg border border-border/50 p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold w-24 shrink-0">{ENGINE_LABELS[engine] ?? engine}</span>
        {er.named
          ? <Badge className="border-transparent bg-[hsl(var(--badge-interested))] text-[hsl(var(--badge-interested-fg))]">Named{er.position ? ` · #${er.position}` : ''}</Badge>
          : <Badge className="border-transparent bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))]">Not named</Badge>}
        {er.competitors.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            instead: {er.competitors.slice(0, 5).join(', ')}
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
