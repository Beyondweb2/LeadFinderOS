import { useEffect, useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Loader2, FileCode2, Copy, Sparkles, PiggyBank, AlertTriangle, Trash2, Clock } from 'lucide-react';

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
    baselineRuns: number; questionCount: number;
  };
  plan: { pages: PlanPage[]; excluded: { question: string; reason: string }[]; unmeasuredAreas: string[] };
}
interface GeneratedPage {
  key: string; service: string; town: string; queries: string[]; slug: string;
  title: string; meta_description: string; h1: string; body_html: string;
}
interface Naturalness { townCount: number; phraseCount: number; topWord: string; topWordPct: number; verdict: 'ok' | 'stuffed'; detail: string; regenerated: boolean }

/* A page's render state. `done` carries generatedAt so the view can flag pages generated over a day
   ago. busy / error / no_credits are TRANSIENT (in-memory only) — never persisted, so navigating
   away mid-generation or after a hiccup can never restore a stuck spinner or a stale error. */
type PageView =
  | { kind: 'busy' }
  | { kind: 'no_credits' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; page: GeneratedPage; naturalness: Naturalness; generatedAt: number };
type Transient = Exclude<PageView, { kind: 'done' }>;

/* Per-CLIENT cache, persisted to localStorage (tier 'both') so generated pages survive both in-app
   navigation AND a full refresh / browser reopen. Keyed by client, so switching clients shows that
   client's pages, never another's. Only successfully-generated pages are held — restoring is a pure
   read that NEVER calls the generator, so returning to the page costs nothing. */
interface CachedPage { page: GeneratedPage; naturalness: Naturalness; generatedAt: number }
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
  const [transient, setTransient] = useState<Record<string, Transient>>({});
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // The current client's cache. plan + pages are read straight from here — no fetch, no generate.
  const current: ClientCache | undefined = clientId ? cache[clientId] : undefined;
  const plan = current?.plan ?? null;
  const cachedCount = current ? Object.keys(current.pages).length : 0;

  // A page's render state: an in-flight/transient state wins; otherwise the cached generated page
  // (a pure read — never a generator call); otherwise nothing yet.
  const viewFor = (key: string): PageView | undefined => {
    const t = transient[key];
    if (t) return t;
    const cp = current?.pages[key];
    return cp ? { kind: 'done', page: cp.page, naturalness: cp.naturalness, generatedAt: cp.generatedAt } : undefined;
  };

  useEffect(() => {
    void (async () => {
      const { data: res } = await supabase.functions.invoke('page-generator', { body: { action: 'clients' } });
      if (res?.ok) setClients(res.clients ?? []);
    })();
  }, []);

  // On mount, if a client was persisted, only fetch the plan when it is NOT already cached — a
  // normal return shows the cached plan + pages instantly and fires no call at all.
  useEffect(() => {
    if (clientId && !cache[clientId]?.plan) void loadPlan(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setCache((c) => ({ ...c, [leadId]: { plan: p, pages: c[leadId]?.pages ?? {} } }));
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
        body: { action: 'generate', lead_id: clientId, page_key: page.key },
      });
      if (error) throw new Error(error.message);
      if (!res?.ok) {
        if (res?.error === 'no_credits') { setTransient((t) => ({ ...t, [page.key]: { kind: 'no_credits' } })); return; }
        throw new Error(res?.error ?? 'generation failed');
      }
      const done: CachedPage = { page: res.page, naturalness: res.naturalness, generatedAt: Date.now() };
      setCache((c) => ({
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
    if (!clientId) return;
    setCache((c) => ({ ...c, [clientId]: { plan: c[clientId]?.plan ?? plan, pages: {} } }));
    setTransient({});
    toast({ title: 'Cleared cached pages', description: 'Generate again for fresh copy.' });
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
                  <div key={p.key} className="rounded-md border border-border/60 p-3 space-y-2">
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
                    {g?.kind === 'done' && (
                      <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {g.naturalness.verdict === 'ok' ? (
                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-500 text-[10px]">
                              natural · {g.naturalness.detail}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-500 text-[10px]">
                              <AlertTriangle className="mr-1 h-3 w-3" /> still reads stuffed after a retry — {g.naturalness.detail}. Edit before pasting.
                            </Badge>
                          )}
                          {g.naturalness.regenerated && <span className="text-muted-foreground">(auto-rewritten once for naturalness)</span>}
                          {Date.now() - g.generatedAt > STALE_MS && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" /> generated earlier — regenerate if you've changed anything
                            </span>
                          )}
                          <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => copy('Full page', fullOutput(g.page))}>
                            <Copy className="mr-1.5 h-3 w-3" /> Copy full {hosting === 'other' ? 'text' : 'HTML'}
                          </Button>
                        </div>
                        <div className="grid gap-1 text-xs">
                          {([['Slug', g.page.slug], ['Title tag', g.page.title], ['Meta description', g.page.meta_description], ['H1', g.page.h1]] as const).map(([label, value]) => (
                            <div key={label} className="flex items-baseline gap-2">
                              <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
                              <span className="min-w-0 break-words">{value}</span>
                              <Button variant="ghost" size="sm" className="h-6 px-1.5 shrink-0" onClick={() => copy(label, value)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        {/* The body, rendered so Paul reads it as a page — the copy button carries the HTML. */}
                        <div className="rounded border border-border/50 bg-background p-3 text-sm [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                          dangerouslySetInnerHTML={{ __html: g.page.body_html }} />
                      </div>
                    )}
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
    </div>
  );
};

export default PageGenerator;
