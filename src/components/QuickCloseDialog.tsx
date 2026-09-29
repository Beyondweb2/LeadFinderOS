import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardCopy, Copy, Loader2, MessageCircle, Pencil, PoundSterling, ShieldAlert, Zap,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import {
  QUICK_CLOSE_AFTER_PAYMENT, QUICK_CLOSE_QUESTIONS, QUICK_CLOSE_STATE_LABEL, missingQuestions, quickCloseMessage, quickCloseScript,
  routeAvailable, routeTermsLines,
  type QcKey, type QuickCloseAnswers, type QuickCloseGate, type QuickCloseState,
} from '@/lib/quickClose';
import { FINDABLE_SETUP_PRICE_GBP, SERVICE_ROUTE_NAME, type ServiceRoute } from '@/lib/findableOffer';
import { cn } from '@/lib/utils';

/* ══ QUICK CLOSE (Sales Experience, 2026-09-29) — src/lib/quickClose.ts has the rules ═══════════════════
   Built for a phone call on a phone: one question at a time, big buttons, every tap SAVED (so a dropped
   call resumes where it stopped), what we already know shown instead of asked, then one button for the
   £99 link and one-tap copy. The server (fn quick-close) decides everything that matters. */

interface View {
  ok: true; canEdit: boolean;
  lead: { id: string; business_name: string | null; phone: string | null; email: string | null; website: string | null; address: string | null; town: string | null; trade: string | null; contact_name: string | null; rating: number | null; review_count: number | null; campaign: string | null; lead_source: string | null; salesperson: string | null };
  onboarding: { id: string; status: string; contact_name: string | null; contact_email: string | null; confirmed_phone: string | null; business_website: string | null } | null;
  answers: QuickCloseAnswers; state: QuickCloseState; gate: QuickCloseGate;
  review: { approved_at: string | null; reasons: string[] };
  link: { url: string; generated_at: string | null } | null;
  windowOpen: boolean;
  events: { kind: string; at: string; by_me: boolean }[];
}
export const quickCloseKey = (leadId: string | null | undefined) => ['quick-close', leadId ?? null] as const;
const STATE_TONE: Record<QuickCloseState, string> = {
  not_started: 'bg-muted text-muted-foreground', in_progress: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  blocked: 'bg-red-500/15 text-red-700 dark:text-red-300', consents_needed: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', needs_review: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ready: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', link_generated: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  paid: 'bg-emerald-600 text-white',
};

export function useQuickClose(leadId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: quickCloseKey(leadId),
    enabled: !!leadId && enabled,
    staleTime: 15_000,
    queryFn: () => invokeEdge<View>('quick-close', { mode: 'load', lead_id: leadId }),
  });
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function QuickCloseDialog({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { role } = useSubscription();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuickClose(leadId, open);
  const v = q.data;
  const [step, setStep] = useState<QcKey | 'review' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fix, setFix] = useState<Record<string, string>>({});
  const [trade, setTrade] = useState('');
  const [script, setScript] = useState(quickCloseScript(null));
  const [copied, setCopied] = useState<string | null>(null);

  const answers = v?.answers ?? {};
  const route = answers.route ?? null;
  // The words follow the route: a new route resets them (the rep can still edit freely after).
  useEffect(() => { setScript(quickCloseScript(route)); }, [route]);
  const missing = useMemo(() => missingQuestions(answers), [answers]);
  // A decision-maker "No" ends the questions (nothing after it can lead to payment).
  const current: QcKey | null = step && step !== 'review' ? step : answers.decision_maker === 'no' ? null : (missing[0] ?? null);
  const shownQs = QUICK_CLOSE_QUESTIONS.filter((x) => !(x.key === 'access' && answers.manager === 'no_website') && !(x.key === 'authority' && (answers.manager === 'owner' || answers.manager === 'employee' || answers.manager === 'no_website')) && !(x.key === 'build_consents' && answers.route !== 'build'));
  useEffect(() => { if (!open) { setStep(null); setEditing(false); setCopied(null); } }, [open]);
  useEffect(() => { if (v?.onboarding) setFix({ contact_name: v.onboarding.contact_name ?? v.lead.contact_name ?? '', contact_email: v.onboarding.contact_email ?? v.lead.email ?? '', confirmed_phone: v.onboarding.confirmed_phone ?? v.lead.phone ?? '', business_website: v.onboarding.business_website ?? v.lead.website ?? '' }); }, [v?.onboarding?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    try {
      const r = await invokeEdge<View>('quick-close', { lead_id: leadId, ...body });
      qc.setQueryData(quickCloseKey(leadId), r);
      notifyLeadChanged(leadId);
      return r;
    } catch (e) {
      toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' });
      return null;
    } finally { setBusy(null); }
  };
  const answer = async (key: QcKey, value: string) => {
    const before = qc.getQueryData<View>(quickCloseKey(leadId));
    if (before) qc.setQueryData<View>(quickCloseKey(leadId), { ...before, answers: { ...before.answers, [key]: value } });
    setStep(null);
    const r = await run(`a:${key}`, { mode: 'save', answers: { [key]: value } });
    if (!r && before) qc.setQueryData(quickCloseKey(leadId), before);
  };
  const saveFixes = async () => { const r = await run('fix', { mode: 'save', answers: {}, corrections: fix, ...(trade.trim() ? { trade: trade.trim() } : {}) }); if (r) setEditing(false); };
  const generate = async () => {
    if (!v?.lead.trade && !trade.trim()) { toast({ title: 'Add the trade first', description: 'It decides what the baseline measures.', variant: 'destructive' }); return; }
    if (!v?.lead.trade && trade.trim()) await run('fix', { mode: 'save', answers: {}, trade: trade.trim() });
    await run('link', { mode: 'generate_link' });
  };
  const doCopy = async (what: 'link' | 'message' | 'script', text: string) => {
    if (await copy(text)) { setCopied(what); window.setTimeout(() => setCopied(null), 2000); toast({ title: what === 'link' ? 'Payment link copied' : 'Copied' }); }
    else toast({ title: 'Copy blocked by the browser', description: 'Select the text and copy it by hand.', variant: 'destructive' });
  };
  const sendWhatsApp = async () => {
    if (!v?.link || !v.lead.phone) return;
    setBusy('wa');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!route) return;
    const { data, error } = await (supabase as any).functions.invoke('send-whatsapp-message', { body: { phone: v.lead.phone, lead_id: leadId, body: quickCloseMessage(v.lead.business_name, v.link.url, route) } });
    setBusy(null);
    if (error || !data?.ok) { toast({ title: 'Not sent on WhatsApp', description: data?.error === 'outside_window' || /window/i.test(String(data?.error ?? error?.message ?? '')) ? 'The WhatsApp window is closed. Copy the link and send it another way.' : String(data?.detail ?? data?.error ?? error?.message ?? 'Send failed'), variant: 'destructive' }); return; }
    toast({ title: data.simulated ? 'Sent (test mode)' : 'Sent on WhatsApp' });
  };

  const answeredCount = shownQs.filter((x) => answers[x.key] && !(x.key === 'authority' && answers.authority === 'not_applicable' && (answers.manager === 'agency' || answers.manager === 'third_party'))).length;
  const known: [string, string | null | undefined][] = v ? [
    ['Business', v.lead.business_name], ['Trade', v.lead.trade], ['Town', v.lead.town], ['Phone', v.onboarding?.confirmed_phone || v.lead.phone],
    ['Email', v.onboarding?.contact_email || v.lead.email], ['Website', v.onboarding?.business_website || v.lead.website], ['Contact', v.onboarding?.contact_name || v.lead.contact_name],
    ['Google', v.lead.rating ? `${v.lead.rating}★ (${v.lead.review_count ?? 0} reviews)` : null], ['Campaign', v.lead.campaign], ['Source', v.lead.lead_source ?? 'App search'], ['Salesperson', v.lead.salesperson],
  ] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3 text-left">
          <DialogTitle className="flex min-w-0 items-center gap-2 pr-8 text-base"><Zap className="h-5 w-5 shrink-0 text-emerald-500" /><span className="shrink-0 whitespace-nowrap">Quick Close</span><span className="min-w-0 truncate font-normal text-muted-foreground">· {v?.lead.business_name ?? '…'}</span></DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            {v && <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATE_TONE[v.state])}>{QUICK_CLOSE_STATE_LABEL[v.state]}</span>}
            {v && v.state !== 'paid' && <span>{answeredCount} of {shownQs.length} answered · saved as you go</span>}
          </DialogDescription>
          {v && v.state !== 'paid' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round((answeredCount / Math.max(1, shownQs.length)) * 100)}%` }} /></div>}
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading what we already know…</p>}
          {q.isError && <p className="text-sm text-destructive">{edgeErrorMessage(q.error)}</p>}

          {v && v.state === 'paid' && (
            <section className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white">
              <CheckCircle2 className="h-8 w-8" />
              <p className="mt-2 text-xl font-bold">Paid — your part is done.</p>
              <p className="mt-1 text-sm text-emerald-50/90">Paul takes it from here. He has the handoff: your answers, the contact details, the latest messages and anything still to collect.</p>
            </section>
          )}

          {v && (
            <details className="rounded-xl border border-border/60 bg-muted/30 p-3" open={v.state === 'not_started'}>
              <summary className="flex cursor-pointer select-none items-center justify-between text-sm font-semibold">What we already know<span className="text-xs font-normal text-muted-foreground">no need to ask</span></summary>
              {!editing ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  {known.map(([k, val]) => <FragmentRow key={k} k={k} v={val} />)}
                </dl>
              ) : (
                <div className="mt-2 space-y-2">
                  {([['contact_name', 'Contact name'], ['contact_email', 'Email'], ['confirmed_phone', 'Phone'], ['business_website', 'Website']] as const).map(([k, label]) => (
                    <label key={k} className="block text-xs text-muted-foreground">{label}<Input value={fix[k] ?? ''} onChange={(e) => setFix((f) => ({ ...f, [k]: e.target.value }))} className="mt-0.5 h-10 text-sm" inputMode={k === 'confirmed_phone' ? 'tel' : k === 'contact_email' ? 'email' : 'text'} /></label>
                  ))}
                  <div className="flex gap-2"><Button size="sm" className="h-10 flex-1" onClick={() => void saveFixes()} disabled={busy === 'fix'}>Save</Button><Button size="sm" variant="ghost" className="h-10" onClick={() => setEditing(false)}>Cancel</Button></div>
                </div>
              )}
              {v.canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="h-3 w-3" />Correct a detail</button>}
            </details>
          )}

          {v && !v.lead.trade && v.canEdit && (
            <label className="block rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium">What is their trade? <span className="font-normal text-muted-foreground">(decides what the baseline measures)</span>
              <Input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="e.g. plumber" className="mt-1.5 h-11 text-base" />
            </label>
          )}

          {v && v.canEdit && current && (
            <section aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Question {Math.min(answeredCount + 1, shownQs.length)} of {shownQs.length}</p>
              <p className="mt-1 text-lg font-semibold leading-snug">{QUICK_CLOSE_QUESTIONS.find((x) => x.key === current)!.text}</p>
              {QUICK_CLOSE_QUESTIONS.find((x) => x.key === current)!.detail && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="qc-build-consents">
                  {QUICK_CLOSE_QUESTIONS.find((x) => x.key === current)!.detail!.map((d) => <li key={d}>{d}</li>)}
                </ul>
              )}
              <div className={cn('mt-3 grid gap-2', current === 'route' || current === 'build_consents' ? 'grid-cols-1' : 'grid-cols-2')}>
                {QUICK_CLOSE_QUESTIONS.find((x) => x.key === current)!.options
                  .filter((o) => !(current === 'authority' && o.value === 'not_applicable' && (answers.manager === 'agency' || answers.manager === 'third_party')))
                  .map((o) => {
                    const off = current === 'route' && !routeAvailable(answers, o.value as ServiceRoute);
                    return (
                      <button key={o.value} type="button" disabled={busy === 'link' || busy === 'fix' || off} onClick={() => void answer(current, o.value)}
                        className={cn('flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-3 py-3 text-center text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50',
                          answers[current] === o.value ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'border-border bg-background hover:bg-muted')}>
                        {o.label}
                        {current === 'route' && <span className="mt-0.5 text-xs font-normal text-muted-foreground">{off ? 'Not possible — they have no website' : `${SERVICE_ROUTE_NAME[o.value as ServiceRoute]} · ${routeTermsLines(o.value as ServiceRoute)[2]}`}</span>}
                      </button>
                    );
                  })}
              </div>
              {step && <button type="button" onClick={() => setStep(null)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" />Back</button>}
            </section>
          )}

          {v && Object.keys(answers).length > 0 && (
            <ul className="space-y-1">
              {shownQs.filter((x) => answers[x.key]).map((x) => (
                <li key={x.key}>
                  <button type="button" disabled={!v.canEdit} onClick={() => setStep(x.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:hover:bg-transparent">
                    <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{x.text}</span>
                    <span className="shrink-0 font-semibold">{x.options.find((o) => o.value === answers[x.key])?.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {v && route && (
            <section aria-live="polite" className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3" data-testid="qc-route-terms">
              <p className="text-sm font-bold">{SERVICE_ROUTE_NAME[route]}</p>
              <ul className="mt-1 space-y-0.5 text-sm">{routeTermsLines(route).map((l) => <li key={l}>{l}</li>)}</ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Set by the offer — the price, the number of payments and the timing cannot be changed here.</p>
            </section>
          )}

          {v && v.state === 'blocked' && (
            <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300"><AlertTriangle className="h-4 w-4" />The decision maker needs to approve this</p>
              <p className="mt-1 text-muted-foreground">No payment link can be created. Ask who makes the decision, and send them the sign-up link or arrange a call with them.</p>
            </section>
          )}
          {v && v.state === 'consents_needed' && (
            <section className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm" data-testid="qc-consents-needed">
              <p className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200"><ShieldAlert className="h-4 w-4" />Build consents needed before the payment link</p>
              <p className="mt-1 text-muted-foreground">A new website can only go ahead once they confirm all three. When they can, change the answer to Yes. If they would rather keep their current site, choose Optimise instead.</p>
            </section>
          )}
          {v && v.state === 'needs_review' && (
            <section className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200"><ShieldAlert className="h-4 w-4" />DOMAIN / AGENCY ISSUE — Paul review required</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">{v.review.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-2 text-muted-foreground">You do not need to sort this out or interpret any agreement. Paul has been told and will look at it; the lead stays yours.</p>
              {role === 'admin' && <Button size="sm" className="mt-2 h-10" onClick={() => void run('approve', { mode: 'approve_review' })} disabled={busy === 'approve'}>Release for payment</Button>}
            </section>
          )}
          {v && v.gate.notes.length > 0 && v.state !== 'paid' && (
            <ul className="space-y-1 text-xs text-muted-foreground">{v.gate.notes.map((n) => <li key={n}>• {n} (Paul will pick this up)</li>)}</ul>
          )}

          {v && (v.state === 'ready' || v.state === 'link_generated') && v.canEdit && (
            <section className="space-y-3">
              {!v.link ? (
                <>
                  <Button className="h-14 w-full gap-2 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700" onClick={() => void generate()} disabled={busy === 'link' || busy === 'fix'}>
                    {busy === 'link' ? <Loader2 className="h-5 w-5 animate-spin" /> : <PoundSterling className="h-5 w-5" />}Generate £{FINDABLE_SETUP_PRICE_GBP} payment link
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{route ? `${SERVICE_ROUTE_NAME[route]}: ${routeTermsLines(route).join(' · ')}` : ''} — the same Stripe page as the sign-up link.</p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Payment link ready</p>
                  <Button className="h-14 w-full gap-2 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700" onClick={() => void doCopy('link', v.link!.url)}>
                    {copied === 'link' ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}{copied === 'link' ? 'Copied' : 'Copy payment link'}
                  </Button>
                  <p className="line-clamp-2 break-all rounded-lg bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={v.link.url}>{v.link.url}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-12 gap-1.5" onClick={() => void sendWhatsApp()} disabled={!v.windowOpen || !v.lead.phone || busy === 'wa'} title={v.windowOpen ? 'Sends the link in their open WhatsApp conversation' : 'The WhatsApp window is closed — copy the link instead'}>
                      {busy === 'wa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}Send on WhatsApp
                    </Button>
                    <Button variant="outline" className="h-12 gap-1.5" disabled={!route} onClick={() => { if (route) void doCopy('message', quickCloseMessage(v.lead.business_name, v.link!.url, route)); }}><ClipboardCopy className="h-4 w-4" />{copied === 'message' ? 'Copied' : 'Copy message'}</Button>
                  </div>
                  {!v.windowOpen && <p className="text-xs text-muted-foreground">WhatsApp window closed (no reply in 24 hours): copy the link and text or email it.</p>}
                </>
              )}
            </section>
          )}

          {v && v.state !== 'paid' && v.state !== 'blocked' && (
            <section className="rounded-xl border border-border/60 p-3">
              <div className="mb-1.5 flex items-center justify-between"><p className="text-sm font-semibold">What to tell them</p><button type="button" onClick={() => void doCopy('script', script)} className="text-xs font-medium text-primary hover:underline">{copied === 'script' ? 'Copied' : 'Copy'}</button></div>
              <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={4} className="text-sm" aria-label="What to tell them (edit freely)" />
              <p className="mt-1 text-[11px] text-muted-foreground">Your words — change it however you like. Do not promise a result from the audit.</p>
            </section>
          )}
          {v && (v.state === 'link_generated' || v.state === 'paid') && (
            <section className="rounded-xl bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{v.state === 'paid' ? 'What they can expect' : 'After they pay, let them know'}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{QUICK_CLOSE_AFTER_PAYMENT.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          )}
          {v && v.state !== 'paid' && <p className="text-center text-[11px] text-muted-foreground">Prefer they fill it in themselves? The self-service sign-up link is still in the lead's Scripts tab.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FragmentRow({ k, v }: { k: string; v: string | null | undefined }) {
  return (<><dt className="text-muted-foreground">{k}</dt><dd className={cn('min-w-0 truncate font-medium', !v && 'font-normal text-muted-foreground/70')} title={v ?? undefined}>{v || 'not known'}</dd></>);
}

/** The button that opens it (the lead workspace header, Focus Mode). */
export function QuickCloseButton({ leadId, className, size = 'sm' }: { leadId: string; className?: string; size?: 'sm' | 'lg' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', size === 'lg' ? 'h-11 px-4 text-sm rounded-xl' : 'h-8 px-2.5 text-xs', className)} aria-label="Quick Close: take payment now">
        <Zap className="h-3.5 w-3.5" />Quick Close
      </button>
      {open && <QuickCloseDialog leadId={leadId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
