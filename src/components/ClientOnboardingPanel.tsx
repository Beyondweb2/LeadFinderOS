import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, MessageCircle, MessageSquareText, RefreshCw, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { LINK_READY_FALLBACK, type LinkRoute } from '@/lib/paymentLinkRoute';
import { SERVICE_ROUTE_NAME } from '@/lib/findableOffer';
import { ToneChip } from '@/components/operator/ui';
import { cn } from '@/lib/utils';

/* ══ GET MISSING INFO — the paid client's onboarding form (2026-10-07, src/lib/clientOnboardingForm.ts) ══════
   ONE workflow with the intake above it: what is still needed → Send onboarding (a secure link to a short form
   that asks ONLY that, for their plan; no payment step) → their answers land on the client record and "Still
   needed" updates. Also: Read WhatsApp replies (facts the client typed, read by AI, shown as "Client on
   WhatsApp" — never over a value Paul confirmed).
   ⛔ Nothing is ever shown as "sent" unless a sender said so: Copy is recorded as copied; WhatsApp goes only in a
      conversation they replied to inside 24 hours (paymentLinkRoute.ts); the template waits for Meta approval. */

interface OnbView {
  ok: boolean;
  refusal: string | null; refusal_text: string | null;
  route: 'build' | 'optimise' | null;
  questions: { key: string; label: string; confirm: boolean }[];
  nothing_missing: boolean;
  link: { url: string; created_at: string; first_opened_at: string | null; last_opened_at: string | null; open_count: number; shared: { channel: string; at: string; status?: string; template?: string | null }[]; questions: number } | null;
  last_submitted: { at: string; answers: Record<string, unknown>; conflicts: { column: string; label: string; on_file: unknown; answered: unknown }[] } | null;
  send_route: { route: LinkRoute; reason: string; say: string; template: { name: string; status: string; category: string | null; checked_at: string | null; label: string; sendable: boolean; say: string } };
  message: string | null;
}

const call = <T,>(body: Record<string, unknown>) => invokeEdge<T>('paid-client-hub', body);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '');
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? ''));

export function ClientOnboardingPanel({ leadId, onIntake }: { leadId: string; onIntake?: (intake: unknown) => void }) {
  const { toast } = useToast();
  const [v, setV] = useState<OnbView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setV(await call<OnbView>({ action: 'onboarding_view', lead_id: leadId })); } catch (e) { toast({ title: 'Onboarding not loaded', description: edgeErrorMessage(e), variant: 'destructive' }); }
  }, [leadId, toast]);
  useEffect(() => { void load(); }, [load]);
  const act = async (label: string, body: Record<string, unknown>, done?: string) => {
    setBusy(label);
    try {
      const r = await call<OnbView & { intake?: unknown; read?: number; withFacts?: number }>({ lead_id: leadId, ...body });
      if (body.action === 'whatsapp_facts_read') {
        if (r.intake && onIntake) onIntake(r.intake);
        toast({ title: r.read ? `Read ${r.read} repl${r.read === 1 ? 'y' : 'ies'}` : 'No new replies to read', description: r.read ? `${r.withFacts ?? 0} had details — shown above as "Client on WhatsApp".` : undefined });
      } else { setV(r); if (done) toast({ title: done }); }
      return true;
    } catch (e) { toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' }); return false; }
    finally { setBusy(null); }
  };
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); window.setTimeout(() => setCopied(null), 2000); } catch { toast({ title: 'Copy blocked', description: 'Select the text and copy it by hand.', variant: 'destructive' }); return; }
    void act('copy-record', { action: 'onboarding_share', channel: 'copy' });
  };

  if (!v) return <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the onboarding form…</p>;
  const lr = v.send_route;
  const canWa = lr.route === 'whatsapp_reply' || lr.route === 'whatsapp_template';
  const sentWa = (v.link?.shared ?? []).filter((s) => s.channel === 'whatsapp' && s.status !== 'failed').slice(-1)[0] ?? null;
  const sendWa = (resend: boolean) => {
    if (resend && !window.confirm('Send the onboarding link to them on WhatsApp again?')) return;
    void act('wa', { action: 'onboarding_share', channel: 'whatsapp', ...(resend ? { resend: true } : {}) }, 'Sent on WhatsApp');
  };
  return (
    <div className="mt-3 rounded-xl border border-border/60 border-l-[3px] border-l-blue-500 bg-card p-3 text-sm" data-testid="client-onboarding-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><MessageSquareText className="h-4 w-4 text-blue-500" />Get missing info from the client</p>
        {v.link ? <ToneChip tone={v.link.first_opened_at ? 'blue' : 'amber'} dot>{v.link.first_opened_at ? `Opened ${when(v.link.last_opened_at)}` : 'Link made — not opened yet'}</ToneChip>
          : v.last_submitted ? <ToneChip tone="green" dot className="bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300">Answers in {when(v.last_submitted.at)}</ToneChip> : null}
      </div>

      {v.refusal ? (
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="onboarding-refusal">{v.refusal_text}</p>
      ) : v.nothing_missing && !v.link ? (
        <p className="mt-1.5 text-xs text-muted-foreground" data-testid="onboarding-nothing">Nothing is missing — there is nothing to ask {v.route ? `this ${SERVICE_ROUTE_NAME[v.route]} client` : 'this client'}.</p>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-muted-foreground">A short form that asks <span className="font-medium text-foreground">only</span> what we don't have{v.route ? ` for ${SERVICE_ROUTE_NAME[v.route]}` : ''}. No payment step. Their answers land on this client automatically.</p>
          {v.questions.length > 0 && (
            <details className="mt-1.5 text-xs" open={!v.link}>
              <summary className="cursor-pointer text-muted-foreground">It will ask {v.questions.length} question{v.questions.length === 1 ? '' : 's'}</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="onboarding-questions">{v.questions.map((q) => <li key={q.key}>{q.label}{q.confirm && <span className="text-muted-foreground"> — confirm what we have</span>}</li>)}</ul>
            </details>
          )}
          {!v.link ? (
            <Button className="mt-2.5 h-11 w-full gap-2 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 sm:w-auto" onClick={() => void act('make', { action: 'onboarding_link' }, 'Onboarding link ready')} disabled={!!busy} data-testid="onboarding-make">
              {busy === 'make' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send onboarding
            </Button>
          ) : (
            <div className="mt-2.5 space-y-2">
              <p className="line-clamp-2 break-all rounded-lg bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={v.link.url}>{v.link.url}</p>
              {sentWa ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs" data-testid="onboarding-whatsapp-sent">
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" />{sentWa.status === 'simulated' ? 'Sent on WhatsApp (test mode — not delivered)' : 'Sent on WhatsApp'} · {when(sentWa.at)}</span>
                  {canWa && <Button size="sm" variant="outline" className="h-8" onClick={() => sendWa(true)} disabled={!!busy} data-testid="onboarding-resend-whatsapp">{busy === 'wa' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}Resend</Button>}
                </div>
              ) : canWa ? (
                <Button className="h-11 w-full gap-2 rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700" onClick={() => sendWa(false)} disabled={!!busy} data-testid="onboarding-send-whatsapp">
                  {busy === 'wa' ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><MessageCircle className="h-4 w-4" />Send onboarding on WhatsApp</>}
                </Button>
              ) : (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs ring-1 ring-inset ring-amber-500/30" data-testid="onboarding-fallback">
                  <p className="font-semibold text-amber-800 dark:text-amber-200">{!lr.template.sendable && lr.template.status !== 'UNKNOWN' ? `WhatsApp onboarding template ${lr.template.label.toLowerCase()}` : LINK_READY_FALLBACK}</p>
                  <p className="mt-0.5 text-muted-foreground">{lr.say} Copy the onboarding link and tell the client where you're sending it.</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button variant="outline" className="h-10 gap-1.5" onClick={() => void copy('link', v.link!.url)} disabled={!!busy}>{copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === 'link' ? 'Copied' : 'Copy onboarding link'}</Button>
                {v.message && <Button variant="outline" className="h-10 gap-1.5" onClick={() => void copy('message', v.message!)} disabled={!!busy}>{copied === 'message' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === 'message' ? 'Copied' : 'Copy message'}</Button>}
                <Button variant="outline" className="h-10 gap-1.5" asChild><a href={v.link.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Open</a></Button>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>Made {when(v.link.created_at)}{v.link.open_count ? ` · opened ${v.link.open_count}×` : ''}</span>
                {v.link.shared.length > 0 && <span>{v.link.shared.slice(-1).map((s) => `${s.channel === 'copy' ? 'Copied (to send by hand)' : s.status === 'simulated' ? 'Sent on WhatsApp (test mode)' : 'Sent on WhatsApp'} ${when(s.at)}`)}</span>}
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground hover:underline" onClick={() => void act('fresh', { action: 'onboarding_link', fresh: true }, 'New link made — the old one no longer works')} disabled={!!busy}><RefreshCw className="h-3 w-3" />Make a fresh link</button>
                <button type="button" className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400" onClick={() => { if (window.confirm('Turn this link off? The client will see "This link isn\'t available".')) void act('revoke', { action: 'onboarding_revoke' }, 'Link turned off'); }} disabled={!!busy}><Trash2 className="h-3 w-3" />Turn off link</button>
              </div>
            </div>
          )}
        </>
      )}

      {v.last_submitted && v.last_submitted.conflicts.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs ring-1 ring-inset ring-amber-500/30" data-testid="onboarding-conflicts">
          <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200"><AlertTriangle className="h-3.5 w-3.5" />The client answered differently from what's on file — nothing was overwritten</p>
          <ul className="mt-1 space-y-0.5">{v.last_submitted.conflicts.map((c) => <li key={c.column}><span className="font-medium">{c.label}:</span> on file “{show(c.on_file)}” · they said “{show(c.answered)}”</li>)}</ul>
        </div>
      )}

      <div className={cn('mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5')}>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void act('facts', { action: 'whatsapp_facts_read' })} disabled={!!busy} title="Reads their newest WhatsApp replies for details like services or areas (a fraction of a penny each). Never overwrites what you confirmed." data-testid="whatsapp-facts-read">
          {busy === 'facts' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}Read WhatsApp replies
        </Button>
        <span className="text-[11px] text-muted-foreground">New replies from paying clients are also read automatically.</span>
      </div>
    </div>
  );
}
