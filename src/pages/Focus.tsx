import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, ChevronDown, ExternalLink, Globe, Linkedin, Loader2, Mail, MapPin, MessageCircle, Phone, Sparkles,
  Target, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { FOCUS_VIEWS, focusQueue, linkedInSearchUrl, type FocusView } from '@/lib/focusQueue';
import { whatsAppLinkForLead, leadLaunchState } from '@/lib/salesLinks';
import { isTypingTarget } from '@/lib/shortcuts';
import { LEAD_CHANGED_EVENT } from '@/lib/leadSync';
import type { SalesWorkspace } from '@/lib/salesWorkspace';
import { LeadHookPanel, LeadWorkPanel, useLeadCrmRow } from '@/components/LeadCrmPanel';
import { useLeadSalesState } from '@/hooks/useLeadSalesState';
import { LastContactLine, SalesStatePill } from '@/components/SalesStatePill';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { ColdCallPlaybookInline } from '@/components/ColdCallPlaybook';
import { FindEmailButton } from '@/components/FindEmailButton';
import { NextActionPill } from '@/components/NextActionPill';
import { QuickCloseButton } from '@/components/QuickCloseDialog';
import { Empty, Panel } from '@/components/salesDash/ui';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FOCUS MODE (Sales Experience release 4, 2026-09-28): one lead at a time, in the order the dashboard
   ranks them (or a saved view — src/lib/focusQueue.ts). Everything a salesperson needs to work the lead
   without leaving: who, where, the audit, the latest messages, optional talking points, WhatsApp / call /
   LinkedIn / email, log the contact, set the Next Action, notes, next lead.
   ⛔ AT A GLANCE (lead state audit, 2026-09-30): the sales state (SalesStatePill — the one reading,
   src/lib/leadState.ts), the Last contact (logged or WhatsApp), the Next Action, then the actions. A
   logged outcome changes them on this card at once. The separate Interested / Not interested buttons
   are gone: they were the same writes as the Log Contact outcomes, which also record the contact (and,
   for a WhatsApp conversation, "What came of it?").
   ⛔ It reuses the lead workspace's own panels (LeadWorkPanel, LeadHookPanel) and the one quick-action
   path (leadQuickActions) — no second CRM. ⛔ Nothing is forced: the script is folded away, and any
   channel works. Shortcuts: → / n next, ← / p previous — none of them sends or changes anything.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

// The lead fields Focus shows that the CRM panel does not read (both the table and the sales view have them).
const FOCUS_COLUMNS = 'id, business_name, contact_name, phone, email, website, address, search_location, derived_town, category, search_keyword, status, is_potential_work, google_maps_url';
interface FocusLead {
  id: string; business_name: string | null; contact_name: string | null; phone: string | null; email: string | null; website: string | null;
  address: string | null; search_location: string | null; derived_town: string | null; category: string | null; search_keyword: string | null;
  status: string | null; is_potential_work: boolean | null; google_maps_url: string | null;
}
interface Msg { id: string; direction: string; body: string | null; message_type: string; created_at: string; status: string; template_name: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const telHref = (p: string | null) => (p ? `tel:${p.replace(/[^\d+]/g, '')}` : null);
const siteHref = (w: string | null) => (w ? (/^https?:\/\//i.test(w) ? w : `https://${w}`) : null);

export default function Focus() {
  const { role } = useSubscription();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') ?? 'next') as FocusView;
  const startLead = params.get('lead');
  const ws = useQuery({
    queryKey: ['focus-workspace', role],
    enabled: !!role,
    staleTime: 60_000,
    queryFn: () => invokeEdge<{ workspace: SalesWorkspace }>('sales-performance', { period: 'all', person: 'me' }),
  });
  const queue = useMemo(() => {
    const q = ws.data ? focusQueue(ws.data.workspace, view) : [];
    // A lead opened directly (?lead=) goes first, even if the view does not hold it.
    if (startLead && !q.some((i) => i.leadId === startLead)) return [{ leadId: startLead, name: '', why: 'Opened directly' }, ...q];
    return q;
  }, [ws.data, view, startLead]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(startLead ? Math.max(0, queue.findIndex((i) => i.leadId === startLead)) : 0); }, [view, startLead, queue.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = queue[idx];
  const go = (d: number) => setIdx((i) => Math.min(Math.max(0, i + d), Math.max(0, queue.length - 1)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' || e.key === 'n') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft' || e.key === 'p') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const leadQ = useQuery({
    queryKey: ['focus-lead', item?.leadId],
    enabled: !!item?.leadId && !!role,
    queryFn: async (): Promise<FocusLead | null> => {
      const { data, error } = await sb.from(leadSourceFor(role).table).select(FOCUS_COLUMNS).eq('id', item!.leadId).maybeSingle();
      if (error) throw error;
      return data as FocusLead | null;
    },
  });
  const msgQ = useQuery({
    queryKey: ['focus-msgs', item?.leadId],
    enabled: !!item?.leadId,
    queryFn: async (): Promise<Msg[]> => {
      const { data, error } = await sb.from('whatsapp_messages').select('id, direction, body, message_type, created_at, status, template_name').eq('lead_id', item!.leadId).order('created_at', { ascending: false }).limit(6);
      if (error) throw error;
      return ((data ?? []) as Msg[]).reverse();
    },
  });
  // Any save anywhere (this panel, another tab) re-reads the lead.
  useEffect(() => {
    const re = () => { void leadQ.refetch(); void msgQ.refetch(); };
    window.addEventListener(LEAD_CHANGED_EVENT, re);
    return () => window.removeEventListener(LEAD_CHANGED_EVENT, re);
  }, [leadQ, msgQ]);

  const lead = leadQ.data;
  const crm = useLeadCrmRow(item?.leadId ?? '');
  const town = lead?.derived_town || lead?.search_location || null;
  /* The newest WhatsApp message either way (the thread below) — Last contact reads it beside the
     logged contacts, so "WhatsApp · Replied · 20m ago" shows when that is the newest touch. */
  const newestWa = (msgQ.data ?? []).filter((m) => m.status !== 'failed').slice(-1)[0];
  const st = useLeadSalesState(item?.leadId ?? '', newestWa ? { direction: newestWa.direction === 'inbound' ? 'inbound' : 'outbound', at: newestWa.created_at } : null);
  const team = useTeamDirectory();

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Leave Focus Mode"><X className="h-5 w-5" /></Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl"><Target className="h-6 w-6 text-blue-500" />Focus Mode</h1>
            <p className="text-xs text-muted-foreground">One lead at a time. Work it any way you like.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={view} onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set('view', v); n.delete('lead'); return n; })}>
            <SelectTrigger className="h-9 w-48 text-xs" aria-label="Which leads"><SelectValue /></SelectTrigger>
            <SelectContent>{FOCUS_VIEWS.map((v) => <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">{queue.length ? `${idx + 1} of ${queue.length}` : '0'}</span>
          <Button variant="outline" size="sm" className="h-9" onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous lead"><ArrowLeft className="h-4 w-4" /></Button>
          <Button size="sm" className="h-9 gap-1" onClick={() => go(1)} disabled={idx >= queue.length - 1}>Next lead<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </header>

      {ws.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lining up your leads…</p>}
      {ws.isError && <p className="text-sm text-destructive">Could not load your leads: {edgeErrorMessage(ws.error)}</p>}
      {ws.data && queue.length === 0 && (
        <Empty icon={Target}>Nothing in “{FOCUS_VIEWS.find((v) => v.key === view)?.label}”. Pick another view, or open a lead from Outreach.</Empty>
      )}

      {item && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="min-w-0 space-y-4 lg:col-span-3">
            <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
              {leadQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : !lead ? (
                <p className="text-sm text-muted-foreground">This lead is not available to you any more.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">{item.why}</p>
                    {/* The ONE next action — the same row the Work panel on the right saves, so it updates at once. */}
                    <NextActionPill lead={crm.data} />
                  </div>
                  <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
                    <span className="min-w-0 truncate" title={lead.business_name ?? ''}>{lead.business_name ?? 'Unnamed business'}</span>
                  </h2>
                  {/* WHERE IT STANDS: the state, the last contact — updated the moment an outcome is logged. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="focus-state">
                    {st.view && <SalesStatePill view={st.view} />}
                    <LastContactLine v={st.lastContact} actorName={st.lastContact?.actorId ? team.byId.get(st.lastContact.actorId)?.display_name ?? null : null} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    {(lead.category || lead.search_keyword) && <span>{lead.category || lead.search_keyword}</span>}
                    {town && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{town}</span>}
                    {lead.contact_name && <span>Contact: <span className="font-medium text-foreground">{lead.contact_name}</span></span>}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <ContactButton href={whatsAppLinkForLead(lead.id)} internal onNav={navigate} icon={MessageCircle} label="WhatsApp" tone="bg-blue-500 text-white hover:bg-blue-600" disabled={!lead.phone} />
                    <ContactButton href={telHref(lead.phone)} icon={Phone} label="Call" tone="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!lead.phone} />
                    <ContactButton href={linkedInSearchUrl(lead.business_name, town)} icon={Linkedin} label="LinkedIn" tone="border border-border bg-background hover:bg-muted" external />
                    <ContactButton href={lead.email ? `mailto:${lead.email}` : null} icon={Mail} label="Email" tone="border border-border bg-background hover:bg-muted" disabled={!lead.email} />
                  </div>
                  {/* No email on file → look for one (our records first, then their website). */}
                  {!lead.email && <div className="mt-2 flex justify-end"><FindEmailButton leadId={lead.id} website={lead.website} /></div>}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {lead.phone && <span className="tabular-nums text-muted-foreground">{lead.phone}</span>}
                    {siteHref(lead.website) && <a href={siteHref(lead.website)!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><Globe className="h-3.5 w-3.5" />Website</a>}
                    {lead.google_maps_url && <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline"><MapPin className="h-3.5 w-3.5" />Maps</a>}
                    <button type="button" onClick={() => navigate('/outreach', { state: leadLaunchState(lead.id) })} className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Full workspace</button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-4">
                    <QuickCloseButton leadId={lead.id} size="lg" />
                  </div>
                </>
              )}
            </section>

            <Panel title="Latest conversation" icon={MessageCircle} tone="blue" action={<Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => navigate(whatsAppLinkForLead(item.leadId))}>Open thread<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}>
              {msgQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (msgQ.data ?? []).length === 0 ? <Empty>No WhatsApp messages yet.</Empty> : (
                <ul className="space-y-1.5">
                  {(msgQ.data ?? []).map((m) => (
                    <li key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                      <span className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm', m.direction === 'outbound' ? 'bg-blue-500/15' : 'bg-muted')}>
                        {m.body ? (m.body.length > 280 ? `${m.body.slice(0, 280)}…` : m.body) : `[${m.message_type}]`}
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{m.status === 'failed' ? ' · failed' : ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="What AI says about them" icon={Sparkles} tone="purple">
              <LeadHookPanel key={item.leadId} leadId={item.leadId} />
            </Panel>

            <details className="group rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <summary className="flex cursor-pointer select-none items-center justify-between text-[15px] font-semibold">Talking points (optional)<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
              <div className="mt-3"><ColdCallPlaybookInline key={item.leadId} leadId={item.leadId} /></div>
            </details>
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-2">
            <LeadWorkPanel key={item.leadId} leadId={item.leadId} />
            <Button className="w-full gap-1" onClick={() => go(1)} disabled={idx >= queue.length - 1}>Next lead<ArrowRight className="h-4 w-4" /></Button>
            <p className="text-center text-[11px] text-muted-foreground">Shortcuts: → or N next · ← or P previous</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactButton({ href, icon: I, label, tone, disabled, external, internal, onNav }: {
  href: string | null; icon: typeof Phone; label: string; tone: string; disabled?: boolean; external?: boolean; internal?: boolean; onNav?: (p: string) => void;
}) {
  const cls = cn('inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', tone, (disabled || !href) && 'pointer-events-none opacity-40');
  if (internal && href) return <button type="button" className={cls} onClick={() => onNav?.(href)} disabled={disabled}><I className="h-4 w-4" />{label}</button>;
  return <a href={href ?? undefined} className={cls} aria-disabled={disabled || !href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><I className="h-4 w-4" />{label}</a>;
}
