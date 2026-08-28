import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState, updatePersistedValue } from '@/hooks/usePersistedState';
import { Loader2, FileCode2, Copy, Sparkles, PiggyBank, AlertTriangle, Trash2, Clock } from 'lucide-react';
import { suggestCredentials } from '@/lib/tradeCredentials';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE GENERATOR — the delivery pages a client needs, aimed at the exact queries we measure.

   The plan is the OVERLAP: (services + areas from the questionnaire) ∩ (the baseline audit's
   verbatim questions). Every page targets queries the week-8 re-measure will actually test.
   Exclusions and never-measured areas are itemised, never silent. Output is PASTE-READY per page
   (Paul pastes into the client's site by hand — nothing publishes from here), formatted for the
   hosting picked in the dropdown (the questionnaire's website_platform seeds it when present; it
   is NULL for both current clients).

   ⚠️ Generation uses OpenAI (out of credits at build time): the typed "no_credits" renders the
   friendly banner and the tool works the moment credits land, no redeploy. The PLAN half needs no
   OpenAI and works today.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

interface ClientRow { lead_id: string; business_name: string; baseline_at: string }
interface PlanPage { key: string; service: string; town: string; queries: string[]; slug: string }
interface PlanData {
  client: { lead_id: string; business_name: string; trade: string | null };
  inputs: {
    services: string[]; areas: string[]; homeTown: string;
    accreditations: string | null; mustNotSay: string | null; hostingDefault: string | null;
    website: string | null; contactDefault: string | null; hasPhone: boolean; hasAddress: boolean;
    baselineRuns: number; questionCount: number;
  };
  plan: { pages: PlanPage[]; excluded: { question: string; reason: string }[]; unmeasuredAreas: string[] };
}
interface GeneratedPage {
  key: string; service?: string; town?: string; question?: string; queries: string[]; slug: string;
  title: string; meta_description: string; h1: string; body_html: string; draft?: boolean;
}
interface QaClient { audit_id: string; business_name: string; business_type: string | null; baseline_at: string }
interface Naturalness { townCount: number; phraseCount: number; topWord: string; topWordPct: number; verdict: 'ok' | 'stuffed'; detail: string; regenerated: boolean }
/* What the server's mechanical block actually put on the page (real client data). */
interface Applied { phone: boolean; address: boolean; links: number; areas: string[]; credentials?: string | null }
/* Per-client generator settings the operator controls — persisted per client. contactUrl seeds the
   internal contact link; localAreas are REAL nearby areas the operator supplies (no verified source
   exists to derive them), woven in verbatim.
   ⛔ credentials are TRUST AND SAFETY CLAIMS: entered once per client in the operator's own wording
   and rendered VERBATIM by the server, never written by the model (which is now forbidden from
   emitting any credential at all). Blank means the line is omitted — never softened, never guessed. */
interface ClientSettings { contactUrl: string; localAreas: string; credentials: string }

/* A page's render state. `done` carries generatedAt so the view can flag pages generated over a day
   ago. busy / error / no_credits are TRANSIENT (in-memory only) — never persisted, so navigating
   away mid-generation or after a hiccup can never restore a stuck spinner or a stale error. */
type PageView =
  | { kind: 'busy' }
  | { kind: 'no_credits' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; page: GeneratedPage; naturalness?: Naturalness; applied?: Applied; draft?: boolean; generatedAt: number };
type Transient = Exclude<PageView, { kind: 'done' }>;

/* Per-CLIENT cache, persisted to localStorage (tier 'both') so generated pages survive both in-app
   navigation AND a full refresh / browser reopen. Keyed by client, so switching clients shows that
   client's pages, never another's. Only successfully-generated pages are held — restoring is a pure
   read that NEVER calls the generator, so returning to the page costs nothing. */
interface CachedPage { page: GeneratedPage; naturalness?: Naturalness; applied?: Applied; draft?: boolean; generatedAt: number }
interface ClientCache { plan: PlanData | null; pages: Record<string, CachedPage> }
type CacheShape = Record<string, ClientCache>;

const STALE_MS = 24 * 60 * 60 * 1000; // a cached page older than this shows a "generated earlier" note

type Hosting = 'wordpress' | 'ours' | 'other';

const htmlToPlainText = (html: string): string =>
  html
    .replace(/<\/(h2|h3|p|ul|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<h2[^>]*>/gi, '\n== ')
    .replace(/<h3[^>]*>/gi, '\n= ')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const PageGenerator = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = usePersistedState<string>('pagegen-client', '', { tier: 'both', scope: user?.id });
  const [cache, setCache] = usePersistedState<CacheShape>('pagegen-cache', {}, {
    tier: 'both', scope: user?.id, version: 1,
    validate: (d) => (d && typeof d === 'object' ? (d as CacheShape) : null),
  });
  const [hosting, setHosting] = usePersistedState<Hosting>('pagegen-hosting', 'wordpress', { tier: 'both', scope: user?.id });
  const [settings, setSettings] = usePersistedState<Record<string, ClientSettings>>('pagegen-settings', {}, {
    tier: 'both', scope: user?.id, version: 1,
    validate: (d) => (d && typeof d === 'object' ? (d as Record<string, ClientSettings>) : null),
  });
  // Mode toggle + Q&A state (audit-based; national/regulated clients have no lead).
  /* ⛔ PAID RESULTS MUST SURVIVE THE COMPONENT. generate()/qaGenerate() await a PAID OpenAI call and
     then setCache — but setState on an unmounted component is a no-op, so navigating away mid-call
     silently binned the finished page and the spend. This writes the SAME update into the
     pagegen-cache STORAGE entry first (updatePersistedValue mirrors the hook's key/tier/version
     exactly), then setCache for the mounted case. Mounted: both agree (the hook re-persists the
     same value). Unmounted: the storage write is what the next mount rehydrates from. */
  const cacheOpts = { tier: 'both' as const, scope: user?.id, version: 1 };
  const commitToCache = (updater: (c: CacheShape) => CacheShape) => {
    updatePersistedValue<CacheShape>('pagegen-cache', cacheOpts, (cur) => updater(cur ?? {}));
    setCache(updater);
  };
  const [mode, setMode] = usePersistedState<'service' | 'qa'>('pagegen-mode', 'service', { tier: 'both', scope: user?.id });
  const [qaClients, setQaClients] = useState<QaClient[]>([]);
  const [qaClientId, setQaClientId] = usePersistedState<string>('pagegen-qa-client', '', { tier: 'both', scope: user?.id });
  const [qaQuestions, setQaQuestions] = useState<string[]>([]);
  const [qaClientInfo, setQaClientInfo] = useState<{ business_name: string; business_type: string | null } | null>(null);
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaBusy, setQaBusy] = useState(false);
  const [transient, setTransient] = useState<Record<string, Transient>>({});
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  /* ── URL SEED (the page-plan "Build this page" handoff) — the §6c Coverage lesson applied:
     mode/client here are PERSISTED state that races URL seeds, so the seed is captured ONCE on
     first render, the one-shot params are STRIPPED immediately (a refresh/back must not re-seed),
     the seed deliberately OVERWRITES the persisted mode/client, and the target page is only
     highlighted once the loaded plan proves the seed LANDED (the key exists). Nothing here ever
     generates — the seed only selects and points. */
  const [searchParams, setSearchParams] = useSearchParams();
  const seedRef = useRef<{ mode: 'service' | 'qa'; client: string; pageKey: string | null; question: string | null } | null | 'none'>(null);
  if (seedRef.current === null) {
    const m = searchParams.get('mode');
    const client = (searchParams.get('client') ?? '').trim();
    seedRef.current = (m === 'service' || m === 'qa') && client
      ? { mode: m, client, pageKey: searchParams.get('page_key'), question: searchParams.get('question') }
      : 'none';
  }
  const hasSeed = seedRef.current !== 'none';
  /** The seeded page key awaiting its landed-check; set when the seed applies, cleared once checked. */
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  // The active client id depends on the mode (service = lead id, Q&A = audit id — different id spaces,
  // so one cache keyed by this id serves both without collision).
  const activeClientId = mode === 'qa' ? qaClientId : clientId;
  const current: ClientCache | undefined = activeClientId ? cache[activeClientId] : undefined;
  const plan = current?.plan ?? null;
  const cachedCount = current ? Object.keys(current.pages).length : 0;

  // Operator settings for this client. contactUrl falls back to the server's default ({site}/contact/).
  const cs: ClientSettings = (activeClientId && settings[activeClientId]) || { contactUrl: '', localAreas: '', credentials: '' };
  const contactUrlValue = cs.contactUrl || (plan?.inputs.contactDefault ?? '');
  const setSetting = (patch: Partial<ClientSettings>) => {
    if (!activeClientId) return;
    setSettings((s) => ({ ...s, [activeClientId]: { contactUrl: '', localAreas: '', credentials: '', ...s[activeClientId], ...patch } }));
  };

  /* ══ SCAN THEIR SITE ══════════════════════════════════════════════════════════════════════
     Reuses the EXISTING scan-site-details function (raw fetch, no Apify, ~$0.005, cached 30d) —
     the same one the AI Audit page uses — now also returning areas + credentials.

     🔴 THE SPLIT IS THE WHOLE FEATURE. FACTUAL findings (areas) PRE-FILL a field the operator then
     reviews. CREDENTIALS are TRUST AND SAFETY CLAIMS and arrive UNTICKED: a website says a claim
     was made at some point, never that a registration is CURRENT — a badge outlives a lapsed
     membership and numbers go stale. So a scraped credential can only ever become a SUGGESTION the
     operator actively ticks. `credPicked` starts empty on every scan and is never seeded from the
     scan result; there is no code path that ticks one automatically.
     ⚠️ Transient, in-memory only — never persisted, so returning to the page cannot restore a
     stale suggestion list or a half-confirmed tick (the §6c never-persist-an-interruption rule). */
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<null | {
    phone?: string; address?: string; email?: string; hours?: string;
    areas: string[];
    cached: boolean; found: boolean;
  }>(null);
  const [credPicked, setCredPicked] = useState<Set<string>>(new Set());
  /* ⛔ TRADE-BASED, NOT SCRAPED (Paul, 2026-08-28). A scraped credential arrives wearing evidence
     ("it is on their site") and invites a rubber-stamp tick, while a site only proves a claim was
     made ONCE — never that a registration is CURRENT. A generic trade suggestion cannot be mistaken
     for evidence, so it forces the operator to supply the knowledge. Derived, never stored. */
  const credSuggestions = useMemo(() => suggestCredentials(plan?.client.trade ?? null), [plan?.client.trade]);

  const scanSite = async () => {
    const site = plan?.inputs.website;
    if (!site || scanning || !clientId) return;
    setScanning(true);
    setScan(null);
    setCredPicked(new Set());   // never carry ticks across scans
    try {
      const { data, error } = await supabase.functions.invoke('scan-site-details', {
        body: { website: site, business_name: plan?.client.business_name || undefined },
      });
      if (error || !data?.success) throw new Error(error?.message ?? data?.error ?? 'scan failed');
      const d = (data.details ?? {}) as Record<string, unknown>;
      const areas = Array.isArray(d.areas) ? (d.areas as string[]) : [];
      setScan({
        phone: typeof d.phone === 'string' ? d.phone : undefined,
        address: typeof d.address === 'string' ? d.address : undefined,
        email: typeof d.email === 'string' ? d.email : undefined,
        hours: typeof d.hours === 'string' ? d.hours : undefined,
        areas, cached: !!data.cached, found: !!data.found,
      });
      /* ⛔ PRE-FILL IS FACTUAL-ONLY, AND ONLY WHERE THE FIELD IS EMPTY — a scan must not overwrite
         something the operator typed. Blank findings leave the field blank; nothing is guessed. */
      if (areas.length && !cs.localAreas.trim()) setSetting({ localAreas: areas.join(', ') });
      toast({
        title: areas.length ? 'Scanned their site' : 'Scanned — nothing to fill',
        description: `${areas.length} area${areas.length === 1 ? '' : 's'} pre-filled${data.cached ? ' (cached)' : ''}. Credentials are never scraped — tick the real ones below.`,
      });
    } catch (e) {
      toast({ title: "Couldn't scan the site", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  /* Ticking a suggestion writes it into the SAME credentials field the operator types into, so the
     server still receives one plain string and the "verbatim, never generated" contract is unchanged. */
  const toggleCred = (label: string) => {
    const next = new Set(credPicked);
    if (next.has(label)) next.delete(label); else next.add(label);
    setCredPicked(next);
    /* Rebuilt from the SUGGESTION LIST order, not from tick order, so the field reads the same way
       whichever sequence they were clicked in. Still one plain string to the server, so the
       "verbatim, never generated" contract is untouched — and the operator can edit it afterwards. */
    const picked = credSuggestions.filter((c) => next.has(c.label)).map((c) => c.label);
    setSetting({ credentials: picked.join(', ') });
  };

  // A page's render state: an in-flight/transient state wins; otherwise the cached generated page
  // (a pure read — never a generator call); otherwise nothing yet.
  const viewFor = (key: string): PageView | undefined => {
    const t = transient[key];
    if (t) return t;
    const cp = current?.pages[key];
    return cp ? { kind: 'done', page: cp.page, naturalness: cp.naturalness, applied: cp.applied, draft: cp.draft, generatedAt: cp.generatedAt } : undefined;
  };

  useEffect(() => {
    void (async () => {
      const { data: res } = await supabase.functions.invoke('page-generator', { body: { action: 'clients' } });
      if (res?.ok) setClients(res.clients ?? []);
    })();
  }, []);

  // Q&A clients load when the mode is (or becomes) Q&A; questions reload for the persisted client
  // (they're free — no AI — and not worth persisting; generated pages are cached separately).
  // ⚠️ The seed effect below owns selection when a seed exists — this effect must not race it by
  //    re-selecting the PERSISTED qa client over the seeded one (it still loads the client list).
  useEffect(() => {
    if (mode !== 'qa') return;
    void loadQaClients();
    if (!hasSeed && qaClientId && qaQuestions.length === 0) void selectQaClient(qaClientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // On mount, if a client was persisted, only fetch the plan when it is NOT already cached — a
  // normal return shows the cached plan + pages instantly and fires no call at all.
  // ⚠️ Skipped entirely when a URL seed exists: the seed decides what loads.
  useEffect(() => {
    if (!hasSeed && clientId && !cache[clientId]?.plan) void loadPlan(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── APPLY THE SEED, once: strip the one-shot params, overwrite persisted mode/client, load. ──
  useEffect(() => {
    const s = seedRef.current;
    if (!s || s === 'none') return;
    setSearchParams({}, { replace: true });     // one-shot: refresh/back never re-seeds
    setMode(s.mode);
    if (s.mode === 'service') {
      setSeedKey(s.pageKey);                    // landed-check runs when the plan arrives
      void loadPlan(s.client);
    } else {
      void selectQaClient(s.client);
      if (s.question) setQaQuestion(s.question);
      toast({ title: 'Loaded from the page plan', description: 'Q&A mode — review the question below, then press Generate.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SEED LANDED-CHECK: only claim the target once the freshly loaded plan PROVES the key
  //    exists; a missing key is said out loud, never silently the wrong page. ──
  useEffect(() => {
    if (!seedKey || !plan || mode !== 'service') return;
    if (plan.plan.pages.some((p) => p.key === seedKey)) {
      setHighlightKey(seedKey);
      setTimeout(() => document.getElementById(`pgpage-${seedKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      toast({ title: 'Loaded from the page plan', description: 'The target page is highlighted — press Generate when ready.' });
    } else {
      toast({ title: "That page isn't in this client's current plan", description: 'The plan may have changed since the queue was built — pick the page manually.', variant: 'destructive' });
    }
    setSeedKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, seedKey]);

  const loadPlan = async (leadId: string) => {
    setClientId(leadId);
    setTransient({});          // ephemeral busy/error belong to the client we're leaving
    setPlanError(null);
    if (!leadId) return;
    setPlanBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('page-generator', { body: { action: 'plan', lead_id: leadId } });
      if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? 'plan failed');
      const p = res as PlanData;
      // Refresh the plan; KEEP any pages already generated for this client.
      commitToCache((c) => ({ ...c, [leadId]: { plan: p, pages: c[leadId]?.pages ?? {} } }));
      const def = String(p.inputs.hostingDefault ?? '').toLowerCase();
      if (def.includes('wordpress')) setHosting('wordpress');
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'plan failed');
    } finally {
      setPlanBusy(false);
    }
  };

  const generate = async (page: PlanPage) => {
    setTransient((t) => ({ ...t, [page.key]: { kind: 'busy' } }));
    try {
      const { data: res, error } = await supabase.functions.invoke('page-generator', {
        body: {
          action: 'generate', lead_id: clientId, page_key: page.key,
          contact_url: contactUrlValue || undefined,
          local_areas: cs.localAreas.trim() || undefined,
          /* Omitted when blank so the server falls back to the questionnaire's own accreditations
             rather than being handed an empty string that would look like "deliberately none". */
          credentials: cs.credentials.trim() || undefined,
        },
      });
      if (error) throw new Error(error.message);
      if (!res?.ok) {
        if (res?.error === 'no_credits') { setTransient((t) => ({ ...t, [page.key]: { kind: 'no_credits' } })); return; }
        throw new Error(res?.error ?? 'generation failed');
      }
      const done: CachedPage = { page: res.page, naturalness: res.naturalness, applied: res.applied, generatedAt: Date.now() };
      commitToCache((c) => ({
        ...c,
        [clientId]: { plan: c[clientId]?.plan ?? plan, pages: { ...(c[clientId]?.pages ?? {}), [page.key]: done } },
      }));
      setTransient((t) => { const n = { ...t }; delete n[page.key]; return n; }); // clear busy → render falls to cache
    } catch (e) {
      setTransient((t) => ({ ...t, [page.key]: { kind: 'error', message: e instanceof Error ? e.message : 'generation failed' } }));
    }
  };

  // Wipe this client's generated pages (keep the plan visible so it can be regenerated).
  const clearCached = () => {
    if (!activeClientId) return;
    setCache((c) => ({ ...c, [activeClientId]: { plan: c[activeClientId]?.plan ?? plan, pages: {} } }));
    setTransient({});
    toast({ title: 'Cleared cached pages', description: 'Generate again for fresh copy.' });
  };

  // ── Q&A MODE handlers (audit-based). ──────────────────────────────────────────────────────
  const loadQaClients = async () => {
    const { data: res } = await supabase.functions.invoke('page-generator', { body: { action: 'qa_clients' } });
    if (res?.ok) setQaClients(res.clients ?? []);
  };

  const selectQaClient = async (auditId: string) => {
    setQaClientId(auditId);
    setTransient({});
    setQaQuestions([]);
    setQaClientInfo(null);
    if (!auditId) return;
    setPlanBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('page-generator', { body: { action: 'qa_plan', audit_id: auditId } });
      if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? 'plan failed');
      setQaQuestions(res.questions ?? []);
      setQaClientInfo({ business_name: res.client?.business_name ?? '', business_type: res.client?.business_type ?? null });
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'plan failed');
    } finally {
      setPlanBusy(false);
    }
  };

  const generateQA = async (question: string) => {
    const key = question.trim();
    if (!key || !qaClientId) return;
    setTransient((t) => ({ ...t, [key]: { kind: 'busy' } }));
    try {
      const { data: res, error } = await supabase.functions.invoke('page-generator', {
        body: { action: 'qa_generate', audit_id: qaClientId, question: key, contact_url: (cs.contactUrl || '').trim() || undefined },
      });
      if (error) throw new Error(error.message);
      if (!res?.ok) {
        if (res?.error === 'no_credits') { setTransient((t) => ({ ...t, [key]: { kind: 'no_credits' } })); return; }
        throw new Error(res?.error ?? 'generation failed');
      }
      const done: CachedPage = { page: res.page, draft: true, generatedAt: Date.now() };
      commitToCache((c) => ({ ...c, [qaClientId]: { plan: c[qaClientId]?.plan ?? null, pages: { ...(c[qaClientId]?.pages ?? {}), [key]: done } } }));
      setTransient((t) => { const n = { ...t }; delete n[key]; return n; });
    } catch (e) {
      setTransient((t) => ({ ...t, [key]: { kind: 'error', message: e instanceof Error ? e.message : 'generation failed' } }));
    }
  };

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: 'Could not copy', description: 'Select and copy by hand.', variant: 'destructive' });
    }
  };

  const fullOutput = (p: GeneratedPage): string => {
    const html = `<h1>${p.h1}</h1>\n${p.body_html}`;
    return hosting === 'other' ? `${p.h1}\n\n${htmlToPlainText(p.body_html)}` : html;
  };

  // The generated-page result block, shared by both modes. A Q&A draft shows the review banner and
  // has no naturalness/applied badges; a service page shows those and no banner.
  const renderDone = (g: Extract<PageView, { kind: 'done' }>) => (
    <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
      {g.draft && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span><strong>Draft for client review.</strong> Fill every <code>[CLIENT INPUT]</code> blank with verified information before publishing. Do not publish unverified medical or factual claims.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {g.naturalness && (g.naturalness.verdict === 'ok' ? (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-500 text-[10px]">natural · {g.naturalness.detail}</Badge>
        ) : (
          <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-500 text-[10px]"><AlertTriangle className="mr-1 h-3 w-3" /> still reads stuffed after a retry — {g.naturalness.detail}. Edit before pasting.</Badge>
        ))}
        {g.naturalness?.regenerated && <span className="text-muted-foreground">(auto-rewritten once for naturalness)</span>}
        {Date.now() - g.generatedAt > STALE_MS && (
          <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> generated earlier — regenerate if you've changed anything</span>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => copy('Full page', fullOutput(g.page))}>
          <Copy className="mr-1.5 h-3 w-3" /> Copy full {hosting === 'other' ? 'text' : 'HTML'}
        </Button>
      </div>
      {g.applied && (
        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          {g.applied.phone && <Badge variant="outline" className="text-[10px] font-normal">✓ phone CTA</Badge>}
          {g.applied.address && <Badge variant="outline" className="text-[10px] font-normal">✓ address (NAP)</Badge>}
          {g.applied.links > 0 && <Badge variant="outline" className="text-[10px] font-normal">✓ {g.applied.links} internal link{g.applied.links === 1 ? '' : 's'}</Badge>}
          {g.applied.areas.length > 0 && <Badge variant="outline" className="text-[10px] font-normal">✓ areas: {g.applied.areas.join(', ')}</Badge>}
          {/* Shows the credentials line VERBATIM, so the operator can read back exactly what went on
              the page rather than trusting a tick. Absent badge = no credential on the page at all. */}
          {g.applied.credentials && (
            <Badge variant="outline" className="max-w-full truncate text-[10px] font-normal" title={g.applied.credentials}>
              ✓ credentials: {g.applied.credentials}
            </Badge>
          )}
        </div>
      )}
      <div className="rounded border border-border/40 bg-muted/30 p-2 space-y-1 text-xs">
        <p className="font-medium text-muted-foreground">Apply in WordPress — paste each into its place:</p>
        {([
          ['SEO title tag', g.page.title, 'Yoast → “SEO title”'],
          ['Meta description', g.page.meta_description, 'Yoast → “Meta description”'],
          ['Permalink slug', g.page.slug, 'WordPress → “Slug”'],
          ['H1 heading', g.page.h1, 'Elementor → top Heading (H1)'],
        ] as const).map(([label, value, dest]) => (
          <div key={label} className="flex items-baseline gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
            <span className="min-w-0 break-words">{value}</span>
            <span className="shrink-0 text-[10px] text-primary/70">{dest}</span>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 shrink-0" onClick={() => copy(label, value)}><Copy className="h-3 w-3" /></Button>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground pt-0.5">Body → “Copy full {hosting === 'other' ? 'text' : 'HTML'}” above, into an Elementor HTML/Text widget.</p>
      </div>
      <div className="rounded border border-border/50 bg-background p-3 text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: g.page.body_html }} />
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <SEOHead title="Page generator | LeadFinder Pro" description="Service and area pages matched to the measured baseline queries." canonical="/page-generator" noindex />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Page generator</h1>
        <p className="text-sm text-muted-foreground">
          The service-plus-area pages a client needs, aimed at the exact queries their baseline
          measured. Paste-ready per page — nothing publishes from here.
        </p>
      </div>

      <div className="flex gap-1 rounded-md border border-border/60 p-1 w-fit">
        <Button size="sm" variant={mode === 'service' ? 'default' : 'ghost'} className="h-7" onClick={() => setMode('service')}>Service + Area</Button>
        <Button size="sm" variant={mode === 'qa' ? 'default' : 'ghost'} className="h-7" onClick={() => setMode('qa')}>Article / Q&amp;A</Button>
      </div>

      {mode === 'service' && (
      <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" /> Client
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={clientId} onValueChange={loadPlan}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Pick a client with a paid baseline…" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.lead_id} value={c.lead_id}>{c.business_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Paste format:</span>
            <Select value={hosting} onValueChange={(v) => setHosting(v as Hosting)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wordpress">WordPress (HTML)</SelectItem>
                <SelectItem value="ours">Our hosting (HTML)</SelectItem>
                <SelectItem value="other">Other (plain text)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {planBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      {planError && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">Couldn't read this client's plan: {planError}</CardContent>
        </Card>
      )}

      {plan && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                What this plan is built from
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p><span className="text-muted-foreground">Services (questionnaire):</span> {plan.inputs.services.join(' · ')}</p>
              <p><span className="text-muted-foreground">Areas (questionnaire):</span> {plan.inputs.homeTown} (home) · {plan.inputs.areas.join(' · ')}</p>
              <p><span className="text-muted-foreground">Baseline:</span> {plan.inputs.questionCount} measured queries across {plan.inputs.baselineRuns} runs</p>
              {plan.inputs.accreditations && <p><span className="text-muted-foreground">May state:</span> {plan.inputs.accreditations}</p>}
              {plan.inputs.mustNotSay && (
                <p className="text-amber-600 dark:text-amber-500"><span className="font-medium">Must never say:</span> {plan.inputs.mustNotSay}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contact &amp; local areas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Every page ends with the client's real phone and links — pulled automatically
                ({plan.inputs.hasPhone ? 'phone found' : 'no phone on file — CTA will point to the contact page only'}
                {plan.inputs.hasAddress ? ', address on the home-town page' : ''}). Set the two below per client.
              </p>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Contact page URL (used for the internal link)</label>
                <Input
                  value={contactUrlValue}
                  placeholder={plan.inputs.contactDefault ?? 'https://theirsite.co.uk/contact/'}
                  onChange={(e) => setSetting({ contactUrl: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">
                  Local areas covered (optional, comma-separated) — REAL areas the client actually serves.
                  These get woven in verbatim; leave blank and pages just say "the surrounding area".
                  Nothing is invented — there's no verified source of neighbourhoods, so this only uses what you enter.
                </label>
                <Input
                  value={cs.localAreas}
                  placeholder="e.g. Oxmoor, Hartford, Stukeley Meadows"
                  onChange={(e) => setSetting({ localAreas: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              {/* ══ SCAN THEIR SITE — factual pre-fill, credentials as suggestions ══════════════
                  Raw fetch of their own site (no Apify, ~$0.005, cached 30 days). */}
              <div className="grid gap-1 rounded-md border border-border bg-muted/30 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                    onClick={scanSite} disabled={scanning || !plan.inputs.website}
                    title={plan.inputs.website
                      ? `Read ${plan.inputs.website} and fill in what it says (no Apify, about half a penny)`
                      : 'No website stored for this client'}>
                    {scanning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    {scanning ? 'Scanning their site…' : 'Scan their site'}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {plan.inputs.website ?? 'no website on record'}
                  </span>
                </div>
                {scan && (
                  <div className="grid gap-1 text-[11px]">
                    {/* FACTUAL — areas pre-filled above; phone/address shown for comparison only,
                        because the generator reads those from the client record, not from here. */}
                    <p className="text-muted-foreground">
                      Found on their site:{' '}
                      {scan.areas.length ? `${scan.areas.length} area(s) — pre-filled above` : 'no areas named'}
                      {scan.phone ? ` · phone ${scan.phone}` : ''}
                      {scan.address ? ` · address ${scan.address}` : ''}
                      {scan.cached ? ' · (cached)' : ''}
                    </p>
                    {(scan.phone && plan.inputs.hasPhone) || (scan.address && plan.inputs.hasAddress) ? (
                      <p className="text-muted-foreground">
                        Phone/address are taken from the client record, not from this scan — if the site
                        disagrees with what is stored, fix it on the lead.
                      </p>
                    ) : null}

                    {/* ⛔ CREDENTIALS — TRADE-BASED SUGGESTIONS, NEVER SCRAPED AND NEVER PRE-TICKED.
                        Shown in the SAME step as the scanned facts so one place covers both, but they
                        are a menu of what this trade commonly holds — NOT a finding about this client.
                        Nothing selects them; `credPicked` is only ever written by a click. */}
                    {credSuggestions.length > 0 ? (
                      <div className="grid gap-1">
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                          Credentials for {plan.client.trade || 'this trade'} — tick only the ones you know this client
                          genuinely holds and are current. Not scraped, not suggested by evidence:
                        </p>
                        {credSuggestions.map((c) => (
                          <label key={c.label} className="flex cursor-pointer items-start gap-2">
                            <input type="checkbox" className="mt-0.5" checked={credPicked.has(c.label)}
                              onChange={() => toggleCred(c.label)} />
                            <span>
                              <span className="font-medium">{c.label}</span>
                              {c.note ? <span className="text-muted-foreground"> — {c.note}</span> : null}
                            </span>
                          </label>
                        ))}
                        <p className="text-muted-foreground">
                          These are the schemes that exist in this trade, not claims about this client.
                          Nothing is ticked for you, and an unticked credential never reaches a page. Add a
                          registration number by editing the field below after ticking.
                        </p>
                      </div>
                    ) : null /* unreachable: suggestCredentials always returns the every-trade set */}
                  </div>
                )}
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">
                  Credentials / accreditations (optional) — the client's REAL ones, in your wording.
                  Written onto every page as plain text, exactly as typed. Leave this blank and the
                  client's OWN questionnaire answer is used instead; if they gave none either, no
                  credential appears at all. The model is forbidden from writing any credential, so
                  nothing here is ever invented — it is your words, their words, or silence.
                </label>
                <Input
                  value={cs.credentials}
                  placeholder="e.g. Gas Safe registered no. 12345, DBS checked, fully insured"
                  onChange={(e) => setSetting({ credentials: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  The page set — {plan.plan.pages.length} page{plan.plan.pages.length === 1 ? '' : 's'}, each aimed at measured queries
                </CardTitle>
                {cachedCount > 0 && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{cachedCount} generated & saved on this device</span>
                    <Button variant="ghost" size="sm" className="h-7" onClick={clearCached}>
                      <Trash2 className="mr-1.5 h-3 w-3" /> Clear
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.plan.pages.map((p) => {
                const g = viewFor(p.key);
                return (
                  <div key={p.key} id={`pgpage-${p.key}`} className={`rounded-md border p-3 space-y-2 ${highlightKey === p.key ? 'border-primary ring-2 ring-primary/40' : 'border-border/60'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{p.service} — {p.town}</span>
                      {p.queries.map((q) => (
                        <Badge key={q} variant="outline" className="text-[10px] font-normal">{q}</Badge>
                      ))}
                      <Button
                        size="sm" className="ml-auto"
                        disabled={g?.kind === 'busy'}
                        onClick={() => generate(p)}
                      >
                        {g?.kind === 'busy' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                        {g?.kind === 'done' ? 'Regenerate' : 'Generate'}
                      </Button>
                    </div>

                    {g?.kind === 'no_credits' && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                        <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <span>AI credits need topping up — the plan above still works; generation resumes the moment credits land. Nothing to redeploy.</span>
                      </div>
                    )}
                    {g?.kind === 'error' && (
                      <p className="text-sm text-destructive">Couldn't generate: {g.message}</p>
                    )}
                    {g?.kind === 'done' && renderDone(g)}
                  </div>
                );
              })}
              {plan.plan.pages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No overlap: nothing this client wants was measured in their baseline. That needs a
                  human look, not a generated guess.
                </p>
              )}
            </CardContent>
          </Card>

          {(plan.plan.excluded.length > 0 || plan.plan.unmeasuredAreas.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Not getting a page — and why</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                {plan.plan.excluded.map((e) => (
                  <p key={e.question}><span className="text-foreground/80">"{e.question}"</span> — {e.reason}</p>
                ))}
                {plan.plan.unmeasuredAreas.length > 0 && (
                  <p>
                    <span className="text-foreground/80">Wanted but never measured:</span>{' '}
                    {plan.plan.unmeasuredAreas.join(', ')} — no baseline query targets these, so a page
                    here would not be tested by the re-measure. Worth adding to the next measurement
                    instead.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
      </>
      )}

      {mode === 'qa' && (
      <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" /> Client (any with a baseline — national clients included)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={qaClientId} onValueChange={selectQaClient}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Pick a client…" /></SelectTrigger>
              <SelectContent>
                {qaClients.map((c) => (
                  <SelectItem key={c.audit_id} value={c.audit_id}>{c.business_name}{c.business_type ? ` — ${c.business_type}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {planBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {qaClientId && (
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground">Booking / contact URL (optional — used for the closing call-to-action link)</label>
              <Input value={cs.contactUrl} placeholder="https://theirsite.co.uk/book/" onChange={(e) => setSetting({ contactUrl: e.target.value })} className="h-8 text-xs" />
            </div>
          )}
        </CardContent>
      </Card>

      {qaClientId && (
        <>
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-3 text-xs text-amber-700 dark:text-amber-400">
              <strong>Draft mode — safety.</strong> Q&amp;A drafts contain the structure only. Every specific
              fact, price, dose, eligibility rule or medical claim is left as a <code>[CLIENT INPUT: …]</code>
              blank for a qualified expert to fill and verify. Nothing factual is generated. Do not publish
              until every blank is filled and a clinician/expert has reviewed it.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Write a Q&amp;A page</CardTitle>
                {cachedCount > 0 && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{cachedCount} generated & saved on this device</span>
                    <Button variant="ghost" size="sm" className="h-7" onClick={clearCached}><Trash2 className="mr-1.5 h-3 w-3" /> Clear</Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1 flex-1 min-w-[16rem]">
                  <label className="text-xs text-muted-foreground">A customer question (type your own, or pick a measured one below)</label>
                  <Input value={qaQuestion} placeholder="e.g. How much does AndroFeme cost in the UK?" onChange={(e) => setQaQuestion(e.target.value)} className="h-8 text-sm" />
                </div>
                <Button size="sm" disabled={!qaQuestion.trim() || viewFor(qaQuestion.trim())?.kind === 'busy'} onClick={() => generateQA(qaQuestion)}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Generate
                </Button>
              </div>

              {qaQuestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Measured baseline questions ({qaQuestions.length}):</p>
                  {qaQuestions.map((q) => {
                    const g = viewFor(q);
                    return (
                      <div key={q} className="rounded-md border border-border/60 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{q}</span>
                          <Button size="sm" className="ml-auto" disabled={g?.kind === 'busy'} onClick={() => generateQA(q)}>
                            {g?.kind === 'busy' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                            {g?.kind === 'done' ? 'Regenerate' : 'Generate'}
                          </Button>
                        </div>
                        {g?.kind === 'no_credits' && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                            <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <span>AI credits need topping up — resumes the moment credits land.</span>
                          </div>
                        )}
                        {g?.kind === 'error' && <p className="text-sm text-destructive">Couldn't generate: {g.message}</p>}
                        {g?.kind === 'done' && renderDone(g)}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* A free-typed question that isn't in the baseline list still shows its result here. */}
              {qaQuestion.trim() && !qaQuestions.includes(qaQuestion.trim()) && (() => {
                const g = viewFor(qaQuestion.trim());
                return g?.kind === 'done' ? <div className="rounded-md border border-border/60 p-3">{renderDone(g)}</div>
                  : g?.kind === 'error' ? <p className="text-sm text-destructive">Couldn't generate: {g.message}</p>
                  : g?.kind === 'no_credits' ? <p className="text-sm text-amber-600">AI credits need topping up.</p>
                  : null;
              })()}
            </CardContent>
          </Card>
        </>
      )}
      </>
      )}
    </div>
  );
};

export default PageGenerator;
