import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDraft, setDraft, type DraftMap } from '@/lib/inboxDrafts';
import { planBulkSend, groupSkips, type BulkCandidate } from '@/lib/inboxBulkSend';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useInbox, windowFor, normalizeWaNumber, type WaConversation, type LeadLite, type WaMessage } from '@/hooks/useInbox';
import { getTemplateSendability, WA_TEMPLATE_REQS, canonicalTemplate } from '@/lib/whatsappTemplates';
import { useToast } from '@/hooks/use-toast';
import { useTemplates } from '@/hooks/useTemplates';
import { useSubscription } from '@/hooks/useSubscription';
import { usePersistedState } from '@/hooks/usePersistedState';
import { supabase } from '@/integrations/supabase/client';
import { REPORT_PUBLIC_ORIGIN } from '@/lib/findableOffer';
import { isAggregatorUrl } from '@/lib/aggregators';
import { shortReportUrl } from '@/lib/reportSlug';
import { assessOnboardingLink } from '@/components/OnboardingLinkCard';
import { LeadDetailFromInbox } from '@/components/LeadDetailFromInbox';
import { CrawlCheckButton } from '@/components/CrawlCheckButton';
import { onboardingUrl, onboardingUrlLabel } from '@/config/findableSite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fillTemplate } from '@/lib/leadUtils';
import { firstNameFrom, hookFollowupBody, contactFollowupBody } from '@/lib/questionnaireFollowup';
import { readableTemplateBody } from '@/lib/templateBodies';
import { parseTemplateSnapshot, type WhatsAppTemplateSnapshot } from '@/lib/whatsappTemplateSnapshot';
import { WhatsAppTemplateMessage } from '@/components/WhatsAppTemplateMessage';
import { Button } from '@/components/ui/button';
import { InboxComposer } from '@/components/InboxComposer';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { CampaignPicker } from '@/components/CampaignPicker';
import { PipelineStatusSelect } from '@/components/PipelineStatusSelect';
import { updateLeadStatus } from '@/lib/leadStatus';
import { PIPELINE_STATUS_OPTIONS, WHATSAPP_TEMPLATES, type PipelineStatus } from '@/types/outreach';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { WelcomePackButton } from '@/components/WelcomePackButton';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { auditListQueryKey } from '@/types/auditBook';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Send, MessageSquare, MessageSquarePlus, Clock, AlertTriangle, Plus, ShieldAlert, ExternalLink, MapPin, Globe, Mail, MessageCircle, Trash2, ListChecks, Sparkles, FileText, Copy, Check, Link2, Star } from 'lucide-react';
import { isPaidLead } from '@/lib/leadPayment';
import { REPORT_LINK_TEMPLATES } from '@/lib/templateAttribution';
import {
  DEFAULT_FIRST_REPLY_MODE,
  DEFAULT_FIRST_REPLY_TEMPLATE,
  FIRST_REPLY_MODES,
  FIRST_REPLY_MODE_HINTS,
  FIRST_REPLY_MODE_LABELS,
  FIRST_REPLY_MODE_QUESTION,
  parseFirstReplyMode,
  type FirstReplyMode,
} from '@/lib/firstReplyMode';

// Shared style for the compact thread-header quick-action icon buttons/links.
const HEADER_ICON_BTN = 'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';

/* hook_followup eligibility: a lead who got the audit_reply REPORT and went quiet for this long.
   Paul's rule 2026-08-22 — it follows the REPORT (audit_reply), never the "is this the right
   number" opener (initial_contact). The window is measured from the report's send time, and any
   inbound AFTER the report means they did not go quiet. Paul tunes the days here. */
const HOOK_FOLLOWUP_MIN_DAYS = 3;
const HOOK_FOLLOWUP_MIN_MS = HOOK_FOLLOWUP_MIN_DAYS * 24 * 60 * 60 * 1000;
const HOOK_DUE_FILTER = '__hook_due__';
/* contact_followup — the EARLIER-stage nudge: got initial_contact, NEVER replied, NO report yet.
   Distinct from hook (post-report) by the presence of a report — the two can never overlap. */
const CONTACT_FOLLOWUP_MIN_DAYS = 2;
const CONTACT_FOLLOWUP_MIN_MS = CONTACT_FOLLOWUP_MIN_DAYS * 24 * 60 * 60 * 1000;
const CONTACT_DUE_FILTER = '__contact_due__';
/* Rough effective daily throughput of the shared WhatsApp queue at the 120/day cap (measured ~84;
   rounded DOWN because the hook lane shares the budget with openers + replies). Used only to
   estimate "about N days to clear" at queue time — never a gate. */
const HOOK_SENDS_PER_DAY_EST = 80;
const estHookDays = (n: number): number => Math.max(1, Math.ceil(n / HOOK_SENDS_PER_DAY_EST));
// Same conversation key the hook uses everywhere: `${user_id ?? 'unassigned'}::${phone}`.
const convKeyFor = (userId: string | null, phone: string) => `${userId ?? 'unassigned'}::${phone}`;

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

// Fallback label for legacy template rows sent before the body was stored (body null).
/* ⚠️ READS TEMPLATE_DISPLAY (defined below), NOT the sendable list. It used to look the name up in
   the SENDABLE list (WHATSAPP_TEMPLATES; then a second copy of it, since deleted) — so when the
   five retired barber
   templates left that list on 2026-09-09, every historic barber message in a thread would have
   rendered its raw slug. Naming what a PAST message was and choosing what to send NEXT are
   different questions, and TEMPLATE_DISPLAY is already the answer to the first one for every
   template this product has ever had. */
function templateLabel(name: string | null): string {
  if (!name) return '';
  return `📄 ${friendlyTemplate(name)}`;
}

/* ⛔ TWO TEMPLATES PUT A REPORT IN FRONT OF A PROSPECT NOW. `audit_reply` was the only one for
   months, so three places compared against that single string; `free_check_result` (the free-check
   lane) carries the same report link and matched none of them, so the Inbox believed no report had
   ever been sent to a free-check prospect - it drives the "report sent" badge and the
   report-vs-reply ordering. A Set, because the next template carrying a report must join one list
   rather than three string comparisons. */
/* The report-link set is shared with useCampaignStats and the engagement pills — one source in
   templateAttribution.ts (imported as REPORT_TEMPLATES to keep this file's call sites unchanged). */
const REPORT_TEMPLATES = REPORT_LINK_TEMPLATES;

/* At-a-glance pills beside the status pill:
   · AUDIT (they opened their report link) and SITE (they clicked through to findable.live) — each
     shows ONLY when it happened; the hover gives the date. Same source the campaign card attributes
     by (ai_audits.first_opened_at gated to after the send; lead_page_hits).
   · GEMINI X/Y — the lead is already named on >= 2/3 of their GEMINI answers (the engine pages move,
     Paul 2026-09-16). A look-before-you-send flag, never an automatic skip: it puts "he may not need
     you" in front of the operator at the moment they would press send. Judged on Gemini ALONE, so a
     lead strong on ChatGPT but absent on Gemini does NOT flag — still worth contacting. Raw fraction,
     no verdict word (the number carries it); the operator decides. */
function geminiFlags(named: number | null, answers: number | null): boolean {
  return (answers ?? 0) > 0 && (named ?? 0) * 3 >= (answers as number) * 2;   // named/answers >= 2/3, integer-safe
}
function EngagementPills(
  { reportOpenedAt, siteVisitedAt, geminiNamed, geminiAnswers }:
  { reportOpenedAt: string | null; siteVisitedAt: string | null; geminiNamed?: number | null; geminiAnswers?: number | null },
) {
  const showGemini = geminiFlags(geminiNamed ?? null, geminiAnswers ?? null);
  if (!reportOpenedAt && !siteVisitedAt && !showGemini) return null;
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const pill = 'inline-flex items-center rounded px-1 py-0 text-[9px] font-semibold uppercase tracking-wide leading-tight';
  // red once named on EVERY Gemini answer (little room), amber while there is still a gap.
  const gemTone = (geminiNamed ?? 0) === (geminiAnswers ?? 0) ? ' bg-red-500/20 text-red-400' : ' bg-amber-500/20 text-amber-500';
  return (
    <>
      {reportOpenedAt && (
        <span className={pill + ' bg-sky-500/20 text-sky-400'} title={'Opened their report · ' + when(reportOpenedAt)}>Audit</span>
      )}
      {siteVisitedAt && (
        <span className={pill + ' bg-emerald-500/20 text-emerald-400'} title={'Visited findable.live · ' + when(siteVisitedAt)}>Site</span>
      )}
      {showGemini && (
        <span className={pill + gemTone} title={`Already named on Gemini in ${geminiNamed} of ${geminiAnswers} answers — the engine pages move`}>
          Gemini {geminiNamed}/{geminiAnswers}
        </span>
      )}
    </>
  );
}

// Clean display names for templates (incl. the legacy pre-rename name). Unknown → "Template".
const TEMPLATE_DISPLAY: Record<string, string> = {
  booking_page_intro: 'Booking page intro',
  no_website_barbers: 'Free website intro',
  free_website_intro: 'Free website intro', // legacy name (pre-rename)
  barber_poor_website: 'Updated website intro',
  booking_switch_barbers: 'Booking switch (no commission)',
  barber_fresha_booksy: 'Fresha/Booksy switch',
  audit_reply: 'Audit reply (report)', // was falling through to a bare "Template" in the thread
  free_check_result: 'Free check result (report)', // same reason: it showed as a bare "Template"
  video_template: 'Audit result hook (outreach)',
  competitor_hook: 'Competitor hook (names 3 rivals)',
  audit_reply_warm: 'Audit reply — warm (after the opener)',
  /* ⚠️ TWO SENDABLE TEMPLATES HAD NO ROW HERE AND RENDERED AS THE BARE WORD "Template" IN A THREAD
     — audit_followup and explain_offer, both sendable since 2026-09-15. Found 2026-09-16 while adding
     explain_offer_v2. Naming a PAST message is this map's job, so every sendable template needs a
     row; the picker's label (WHATSAPP_TEMPLATES) answers the other question and is not read here. */
  audit_followup: 'Audit follow-up ("I asked chatgpt" note)',
  /* ⚠️ DELIBERATELY ABSENT FROM REPORT_TEMPLATES ABOVE, unlike every other audit-class template:
     audit_followup_call carries NO report link, so counting it as a report sent would put the
     "report sent" badge on a thread that has never been sent one. */
  audit_followup_call: 'Audit follow-up + call ("I asked AI" note, no link)',
  /* audit_followup_fault — IS in REPORT_TEMPLATES (it carries the report link in {{7}}), unlike the
     call version above. Names a specific site fault plus the report. */
  audit_followup_fault: 'Audit follow-up + fault (names a site fault + report)',
  /* ai_site_findings_v2 — the same message with 2-3 plain-English findings in {{6}}. UNCONDITIONAL,
     like every entry here: this map names a message that has ALREADY been sent, so approval state is
     irrelevant to it and gating it would print a raw slug in a thread. */
  ai_site_findings_v2: 'Audit follow-up + site findings (2-3 findings + report)',
  explain_offer: 'Explain the offer (full pitch + sign-up link)',
  explain_offer_v2: 'Explain the offer v2 (adds the 941-audit proof)',
  /* ⚠️ UNCONDITIONAL, unlike its entry in the picker. This map names a message that has ALREADY been
     sent, so it must carry every template that could ever appear in a thread — gating it on the
     approval switch would make a real past message render as the bare word "Template" the moment
     the switch was turned back off. Picker = the future; this = the past. */
  initial_opener_v2: 'Initial contact v2 (opener A/B variant)',
  onboarding_followup: 'Onboarding follow-up',
  book_call: 'Arrange a call',
  re_engage_49: 'Re-engage (gone quiet)',
};
function friendlyTemplate(name: string | null | undefined): string {
  /* Canonicalised so a pre-rename row still gets its real label instead of the word 'Template'. */
  return (name && TEMPLATE_DISPLAY[canonicalTemplate(name)]) || 'Template';
}

/** Conversation-list preview only: never surface a raw template name. A row whose stored body is
 *  a bracketed slug ("[initial_contact]") or bare snake_case — the campaign/opener rows written by
 *  the whatsapp_sends DB trigger — is rendered as its approved readable copy, filled with the
 *  conversation's business name. Only if there is no readable copy do we fall back to a label. */
function listPreview(m: { body: string | null; template_name: string | null; created_at?: string | null }, businessName?: string | null): string {
  /* ⛔ created_at IS NOT OPTIONAL DECORATION. The greeting name is shortened at send time, so a row
     sent BEFORE that rule existed must still render with the full name the prospect actually read.
     Omitting it here would keep every preview long; passing the wrong one would falsify a
     transcript. See src/lib/displayName.ts. */
  const readable = readableTemplateBody(m.body, m.template_name, { businessName, sentAt: m.created_at });
  if (readable) return readable;
  return `📄 ${friendlyTemplate(m.template_name ?? ((m.body ?? '').trim() || null))}`;
}

/** The reply rule's THREE-WAY control (Off / Run audit only / Audit + auto-send).
 *
 *  Reads and writes whatsapp_outreach_state via process-whatsapp-queue (admin-gated modes
 *  'status' / 'set_first_reply_mode'), so it renders ONLY for admins — a 403 on status hides it.
 *  The AUTO_AUDIT_REPLY_ENABLED env kill-switch must ALSO be on before anything SENDS; it does
 *  not gate the audit, so "Run audit only" works whatever the secret says.
 *
 *  ⛔ WHY A SEGMENTED CONTROL AND NOT A SWITCH PLUS A MODIFIER. The dangerous state is "sending
 *  when I thought it was only measuring", and a switch beside a modifier lets the two be read
 *  separately — the eye takes in "on" and stops. Three buttons where exactly one is lit can only
 *  be read as one answer, and the lit one either says the word "send" or it does not. */
function AutoReplyToggle() {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<FirstReplyMode>(DEFAULT_FIRST_REPLY_MODE);
  const [envOn, setEnvOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readyCount, setReadyCount] = useState<number | null>(null);
  const [replyTemplate, setReplyTemplate] = useState<string>(DEFAULT_FIRST_REPLY_TEMPLATE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'status' } });
      if (cancelled || error || !data?.ok) return; // non-admin (403) or failure → stay hidden
      /* The rule is OFF unless the boolean says so; the stored mode only chooses between the two
         working behaviours. Reading it the other way round would paint "Run audit only" over a
         rule the trigger treats as paused. */
      setMode(data.autoReplyEnabled === true ? parseFirstReplyMode(data.firstReplyMode) : 'off');
      setEnvOn(data.autoReplyEnvOn === true);
      setReadyCount(typeof data.auditOnlyReadyCount === 'number' ? data.auditOnlyReadyCount : null);
      setReplyTemplate((data.firstReplyTemplate as string | null) ?? DEFAULT_FIRST_REPLY_TEMPLATE);
      setVisible(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  // The template an auto-send uses. Only reachable in send mode; server-validated allowlist.
  const pickTemplate = async (value: string) => {
    const prev = replyTemplate;
    setReplyTemplate(value); // optimistic
    const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', {
      body: { mode: 'set_first_reply_template', template: value },
    });
    if (error || !data?.ok) {
      setReplyTemplate(prev);
      toast({ title: "Couldn't set the reply template", description: error?.message ?? data?.detail ?? data?.error ?? 'Failed (has the SQL been run?)', variant: 'destructive' });
      return;
    }
    toast({ title: 'Reply template set', description: `Auto-sends now use "${value}" (guards + 3-min cancel window unchanged).` });
  };

  const pickMode = async (next: FirstReplyMode) => {
    if (next === mode) return;
    setSaving(true);
    const prev = mode;
    setMode(next); // optimistic
    const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', {
      body: { mode: 'set_first_reply_mode', value: next },
    });
    setSaving(false);
    if (error || !data?.ok) {
      setMode(prev);
      toast({ title: "Couldn't change the reply mode", description: error?.message ?? data?.detail ?? data?.error ?? 'Failed (has the SQL been run?)', variant: 'destructive' });
      return;
    }
    /* The confirmation states what WILL happen, and for send mode it leads with the risk. A toast
       that only says "saved" is how an operator ends up unsure which mode is live. */
    toast({
      title: next === 'off' ? 'On reply: do nothing' : next === 'audit_only' ? 'On reply: audit only' : 'On reply: audit and reply',
      description: next === 'send' && !envOn
        ? 'Saved — but the AUTO_AUDIT_REPLY_ENABLED secret is off, so nothing will actually send yet.'
        : FIRST_REPLY_MODE_HINTS[next],
      variant: next === 'send' ? 'destructive' : undefined,
    });
  };

  const sending = mode === 'send';
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 h-9">
      {/* 🔴 "On reply" WAS TOO SHORT TO CARRY THE SCOPE. With options reading "Run audit only" and
          "Audit + auto-send", the control looked like a global audit switch: Paul set it expecting
          it to govern the outreach QUEUE and then reasonably believed it was why outreach had
          stopped. It governs neither — the drip never reads this. The full question is rendered
          now, and the options are answers to it. */}
      <span className="text-xs font-medium whitespace-nowrap" title="What happens automatically when a business replies to your opener. This does NOT affect the outreach queue — queued leads are always audited and sent.">
        {FIRST_REPLY_MODE_QUESTION}{sending && !envOn ? ' ⚠' : ''}
      </span>
      {/* Exactly one lit segment, so the state cannot be half-read. */}
      <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
        {FIRST_REPLY_MODES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={saving}
            onClick={() => pickMode(m)}
            title={FIRST_REPLY_MODE_HINTS[m]}
            className={`px-2 h-7 text-[11px] font-medium transition disabled:opacity-60 ${
              mode === m
                ? (m === 'send' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground')
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {FIRST_REPLY_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {/* Audit-only mode's whole point: how many leads are measured and waiting for ME to send.
          Counts leads with a COMPLETED audit, never parked rows — see auditOnlyReadyCount. */}
      {mode === 'audit_only' && readyCount !== null && readyCount > 0 && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap" title="Leads whose audit auto-ran and has finished — send the warm template by hand">
          {readyCount} ready to send
        </span>
      )}
      {sending && (
        <Select value={replyTemplate} onValueChange={pickTemplate}>
          <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WHATSAPP_TEMPLATES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function InboundMedia({ message }: { message: WaMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!message.media_path) { setUrl(null); return; }
    const renew = async () => {
      const { data } = await supabase.storage.from('whatsapp-media').createSignedUrl(message.media_path!, 60 * 5);
      if (alive) setUrl(data?.signedUrl ?? null);
    };
    void renew();
    const timer = window.setInterval(() => { void renew(); }, 4 * 60 * 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [message.media_path]);
  if (!message.media_path) return message.error ? <p className="mt-1 text-xs text-muted-foreground">{message.error}</p> : null;
  if (!url) return <p className="mt-1 text-xs text-muted-foreground">Loading attachment…</p>;
  if (message.message_type === 'image' || message.message_type === 'sticker') return <img src={url} alt={message.media_filename ?? message.message_type} className="mt-1 max-h-72 rounded object-contain" />;
  if (message.message_type === 'video') return <video src={url} controls className="mt-1 max-h-72 rounded" />;
  if (message.message_type === 'audio') return <audio src={url} controls className="mt-1 max-w-full" />;
  return <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline"><ExternalLink className="h-3 w-3" />{message.media_filename ?? 'Open document'}</a>;
}

const Inbox = () => {
  const { user, conversations, messages, messagesForKey, leads, auditByLeadId, auditRunningLeadIds, hasSiteFaultLeadIds, hasSiteFindingsLeadIds, crawlByLeadId, isLoading, isError, send, preview, refetch, patchLeadStatus, patchLeadPotentialWork } = useInbox();
  const { toast } = useToast();
  // Only for invalidating the AiAudit page's audit-book cache when startAudit fires one from
  // here — Inbox itself is not on React Query (see useInbox.ts).
  const queryClient = useQueryClient();
  const { templates } = useTemplates(); // same source as the Templates page ("Texts" tab)
  const { isAdmin } = useSubscription(); // gates the admin-only "Send now" button
  const navigate = useNavigate();
  const [sendingNow, setSendingNow] = useState(false);
  // Which lead's full-detail overlay is open (null = none). The rich dialog is the SAME component
  // Outreach uses — see LeadDetailFromInbox. Inbox-only tools (auto-reply toggle, send-window,
  // template state) are untouched and sit alongside it.
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  // Admin "Send now": force the next queued WhatsApp message to send immediately,
  // SKIPPING ONLY the pacing wait (send_now). It still respects pause, the daily cap
  // and the sending window (the edge guards those). Admin-gated server-side too (403
  // for non-admins) — the button is also hidden below unless isAdmin.
  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'tick', send_now: true } });
      if (error) throw error;
      if (data?.sent) {
        toast({ title: 'Sent next message', description: `${data.business ?? ''}${data.simulated ? ' — TEST_MODE, nothing real sent' : ''}`.trim() || undefined });
      } else {
        const reason: Record<string, string> = {
          paused: 'Queue is paused',
          cap_reached: 'Daily cap reached',
          outside_window: 'Outside sending hours',
          empty_queue: 'Nothing queued to send',
        };
        toast({ title: reason[data?.skipped as string] ?? `No send (${data?.skipped ?? 'unknown'})` });
      }
    } catch (e) {
      toast({ title: "Couldn't send now", description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setSendingNow(false);
    }
  };

  /* ══ THE CONVERSATION LIVES IN THE URL ═════════════════════════════════════════════════
     ⛔ IT WAS useState, AND THAT IS WHY THE INBOX LOST YOUR PLACE. React Router unmounts a route
     component on navigation, so the thread you were reading died the moment you left — while the
     campaign and status filters right below survived, because they use usePersistedState. Two halves
     of "where I was" with two different lifetimes: the same fault as the search results restoring
     without the search that produced them.
     ⚠️ THE URL, NOT sessionStorage, and for the reason Index.tsx already gives for the market view:
     one mechanism covers the back button, a refresh, a pasted link and returning to the page. A
     conversation is WHAT I AM LOOKING AT, not how the page is configured — that is the line for
     deciding what goes in the URL and what stays in usePersistedState.
     ⚠️ PUSHED, not replaced, so Back steps out of a thread the way it does in any mail client. */
  const [searchParams, setSearchParams] = useSearchParams();
  const activeKey = searchParams.get('c');
  const setActiveKey = useCallback((key: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (key) next.set('c', key); else next.delete('c');
      return next;
    });
  }, [setSearchParams]);
  const [synthetic, setSynthetic] = useState<WaConversation | null>(null);
  // Campaign filter (null = all). Unassigned conversations are ALWAYS shown, even
  // when a specific campaign is selected — that's where mis-routed / unknown-sender
  // replies land and must never be hidden.
  // Persisted per-user (sessionStorage) so the filter survives navigating away and back.
  const [campaignFilter, setCampaignFilter] = usePersistedState<string | null>('inbox-campaign-filter', null, { tier: 'session', scope: user?.id });
  // Status filter (null = all statuses). Composes with the campaign filter (AND).
  // Unassigned stays visible regardless (never hidden by a filter).
  const [statusFilter, setStatusFilter] = usePersistedState<string | null>('inbox-status-filter', null, { tier: 'session', scope: user?.id });
  // Not-interested conversations are hidden by default (dead prospects); a toggle
  // reveals them. A new inbound reply flips the lead back to 'replied' server-side
  // (whatsapp-inbound), so re-engaging conversations reappear on their own.
  const [showHidden, setShowHidden] = useState(false);
  // Free-text search over the conversation list, purely client-side (every conversation is
  // already loaded — useInbox uses fetchAllRows, nothing paginated/virtualised). Narrows WITHIN
  // the campaign/status/hidden filters, never replaces them. Persisted per-user like those
  // filters sit right beside it, and the box shows the term, so it is not a hidden filter.
  const [search, setSearch] = usePersistedState<string>('inbox-search', '', { tier: 'session', scope: user?.id });
  const [savingStatusKey, setSavingStatusKey] = useState<string | null>(null);
  // Remove-from-inbox (status → 'closed'): in-flight spinner + optimistic hide keys.
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());
  /* ══ THE HALF-TYPED REPLY ════════════════════════════════════════════════════════════
     ⛔ KEYED BY CONVERSATION, NOT BY PAGE. One shared draft string would be worse than losing it:
     open another thread and your half-written message would follow you into it, ready to send to the
     wrong person. The draft belongs to the thread, so it is stored against the thread.
     ⚠️ 'local', NOT 'session' — the one place in this app where that is right. Paul: losing a
     message partway through writing is worse than losing your place, and worth a slightly ugly fix.
     A closed tab must not take it.
     ⚠️ AN EMPTY DRAFT IS DELETED, not stored as "". That is what makes a successful send clear it
     (the send path already calls setText('')), and it is what stops the map growing a key per
     thread ever opened. The cap below is a backstop for a map that somehow still grows. */
  const [drafts, setDrafts] = usePersistedState<DraftMap>(
    'inbox-drafts', {}, { tier: 'local', scope: user?.id },
  );
  /* The rules live in src/lib/inboxDrafts.ts so they can be tested — scripts/inbox-drafts.test.ts
     drives the cross-thread leak, the post-send clear, whitespace, the cap and a corrupt store.
     None of that is reachable from a component. */
  const text = getDraft(drafts, activeKey);
  const setText = useCallback((v: string) => {
    setDrafts((prev) => setDraft(prev, activeKey, v));
  }, [activeKey, setDrafts]);
  /* ⛔ TAKES THE KEY EXPLICITLY, unlike setText which closes over the CURRENT activeKey. The
     composer flushes its draft as it UNMOUNTS — by which point activeKey has already moved to the
     thread being opened — so a closure-based writer would file the outgoing thread's half-typed
     message under the incoming thread. Same class of bug as the setText('') that used to clear the
     wrong thread's draft on switch (removed 2026-08-09); the fix is the same: name the key.
     Stable identity (setDrafts is stable), so it never re-renders the memoised composer. */
  const persistDraft = useCallback((key: string, v: string) => {
    setDrafts((prev) => setDraft(prev, key, v));
  }, [setDrafts]);
  /* Starts UNSELECTED, deliberately. This used to default to the sendable list's [0], which was
     booking_page_intro — the barber booking pitch — so every thread opened with a barber template
     armed regardless of trade. On an accountant thread only the "no site link yet" guard stood
     between that default and a real send. Same defaulting was removed from WhatsAppLeadControls and
     AdminSiteManage earlier; this was the last one. '' means "not set" and the send button stays
     disabled until the operator picks. */
  const [template, setTemplate] = useState('');
  const [sendingKeys, setSendingKeys] = useState<Set<string>>(new Set());
  const sendingKeysRef = useRef(new Set<string>());
  const sending = !!activeKey && sendingKeys.has(activeKey);
  const [newOpen, setNewOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  /* ══ hook_followup ELIGIBILITY — ONE COMPUTATION, USED BY BOTH THE FILTER AND THE BUTTON ═══════
     A conversation is "report follow-up due" when: it received an audit_reply (the report, outbound,
     not failed); NO inbound arrived AFTER that report's send time (they went quiet — a reply after it
     means they did not); it has been ≥ HOOK_FOLLOWUP_MIN_DAYS since the report; and no hook_followup
     has already gone (the server also enforces one-per-lead via pitchEverSent — this just keeps the UI
     honest). Derived from the already-loaded message log, so the filter and the button can never
     disagree about who is eligible. */
  const hookState = useMemo(() => {
    /* ⛔ A PAYING CUSTOMER IS NEVER "hook follow-up due". They paid the report link without
       necessarily replying on WhatsApp, so they can have no inbound since the report — but this
       template says "the businesses AI is naming instead of you are picking up work", which is
       exactly the wrong thing to send someone who has already bought. isPaid is amount_paid > 0
       (CLAUDE.md §6), the same money-not-status rule the Inbox status filter uses. */
    const paidKeys = new Set(conversations.filter((c) => c.isPaid).map((c) => c.key));
    /* Leads already marked for the hook lane leave the "due" view — they have been actioned and are
       pacing out. Keyed via conversation → leadId → the lead's hook_followup_queued_at marker. */
    const queuedLeadIds = new Set(leads.filter((l) => l.hook_followup_queued_at).map((l) => l.id));
    const leadIdByKey = new Map(conversations.map((c) => [c.key, c.leadId]));
    const latestReportAt = new Map<string, number>();   // key → newest audit_reply send time (ms)
    const latestInboundAt = new Map<string, number>();  // key → newest inbound time (ms)
    const hookSent = new Set<string>();                  // key → a hook_followup already went out
    for (const m of messages) {
      const key = convKeyFor(m.user_id, m.phone);
      const t = new Date(m.created_at).getTime();
      if (m.direction === 'inbound') {
        latestInboundAt.set(key, Math.max(latestInboundAt.get(key) ?? 0, t));
      } else if (m.status !== 'failed') {
        if (m.template_name && REPORT_TEMPLATES.has(canonicalTemplate(m.template_name))) latestReportAt.set(key, Math.max(latestReportAt.get(key) ?? 0, t));
        else if (m.template_name === 'hook_followup') hookSent.add(key);
      }
    }
    const now = Date.now();
    const eligible = new Set<string>();
    for (const [key, reportAt] of latestReportAt) {
      if (paidKeys.has(key)) continue;                       // never re-pitch a paying customer
      if (hookSent.has(key)) continue;                       // already nudged — never twice
      const lid = leadIdByKey.get(key);
      if (lid && queuedLeadIds.has(lid)) continue;           // already queued for the lane — pacing out
      if ((latestInboundAt.get(key) ?? 0) > reportAt) continue; // replied after the report → not quiet
      if (now - reportAt < HOOK_FOLLOWUP_MIN_MS) continue;   // not long enough yet
      eligible.add(key);
    }
    return { eligible, hookSent };
  }, [messages, conversations, leads]);

  /* ══ contact_followup ELIGIBILITY — EARLIER STAGE, REPORT-READY GATE (Option A) ═══════════════
     "Contact follow-up due" when: got initial_contact (outbound, not failed); NEVER replied at all
     (no inbound ever); the report has NOT been SENT (no audit_reply message) — this is the
     discriminator that keeps it mutually exclusive with hook, which REQUIRES a sent report; a report
     IS READY for them (a completed audit exists — auditByLeadId), so if they reply the report can go
     out instantly and we only nudge leads we're ready to convert (Paul's Option A); ≥
     CONTACT_FOLLOWUP_MIN_DAYS since the opener; not paid; no contact_followup already sent (the server
     also enforces one per lead). */
  const contactState = useMemo(() => {
    const paidKeys = new Set(conversations.filter((c) => c.isPaid).map((c) => c.key));
    const reportReadyLeadIds = new Set(Object.keys(auditByLeadId)); // leads with a completed audit
    const leadIdByKey = new Map(conversations.map((c) => [c.key, c.leadId]));
    const latestOpenerAt = new Map<string, number>();  // key → newest initial_contact send time (ms)
    const everInbound = new Set<string>();             // key → any inbound ever (→ they replied)
    const reportSent = new Set<string>();              // key → an audit_reply went out (→ hook's domain, not this)
    const contactSent = new Set<string>();             // key → a contact_followup already went out
    for (const m of messages) {
      const key = convKeyFor(m.user_id, m.phone);
      const t = new Date(m.created_at).getTime();
      if (m.direction === 'inbound') {
        everInbound.add(key);
      } else if (m.status !== 'failed') {
        if (m.template_name === 'initial_contact') latestOpenerAt.set(key, Math.max(latestOpenerAt.get(key) ?? 0, t));
        else if (m.template_name && REPORT_TEMPLATES.has(m.template_name)) reportSent.add(key);
        else if (m.template_name === 'contact_followup') contactSent.add(key);
      }
    }
    const now = Date.now();
    const eligible = new Set<string>();
    for (const [key, openerAt] of latestOpenerAt) {
      if (paidKeys.has(key)) continue;                     // never nudge a paying customer
      if (reportSent.has(key)) continue;                   // ⛔ report already SENT → hook's domain, not this (no overlap)
      if (everInbound.has(key)) continue;                  // replied at all → not a cold no-reply opener
      if (contactSent.has(key)) continue;                  // already nudged — never twice
      const lid = leadIdByKey.get(key);
      if (!lid || !reportReadyLeadIds.has(lid)) continue;  // ⛔ Option A: only nudge when a report is READY to send
      if (now - openerAt < CONTACT_FOLLOWUP_MIN_MS) continue; // not long enough yet
      eligible.add(key);
    }
    return { eligible, contactSent };
  }, [messages, conversations, auditByLeadId]);

  // The list shows fetched conversations; a just-started (synthetic) one is merged in
  // until its first message lands (after which the real row shares its key).
  const list = useMemo(() => {
    const base = synthetic && !conversations.some((c) => c.key === synthetic.key)
      ? [synthetic, ...conversations]
      : conversations;
    // Campaign + status filters both keep Unassigned ALWAYS visible (never hide the
    // mis-routed/unknown-sender bucket), and compose as AND for assigned convos.
    const byCampaign = !campaignFilter
      ? base
      : base.filter((c) => c.campaignId === campaignFilter || c.unassigned);
    // Site-milestone sentinels filter on generated_sites data (already loaded in
    // sitesByLeadId), NOT lead status. Presence-based/cumulative: a claimed lead also
    // matches Opened, etc. Unassigned stays visible, matching the status-filter convention.
    const byStatus = !statusFilter
      ? byCampaign
      /* The report-follow-up work queue. Deliberately NO unassigned/paid exemption (unlike the
         status filters below): this is a targeted "who is due a hook follow-up" view, and an
         unassigned convo has no lead to send a template to anyway. */
      : statusFilter === HOOK_DUE_FILTER
        ? byCampaign.filter((c) => hookState.eligible.has(c.key))
      /* The earlier-stage nudge queue — same targeted shape as HOOK_DUE_FILTER, no unassigned/paid exemption. */
      : statusFilter === CONTACT_DUE_FILTER
        ? byCampaign.filter((c) => contactState.eligible.has(c.key))
      /* ⛔ AND A PAYING CUSTOMER IS NEVER FILTERED OUT. `isPaid` comes from `amount_paid > 0`
         (CLAUDE.md §6), not from the status — which is the whole point: the moment a customer
         moves to `in_delivery` their status stops matching every other filter, and the person
         paying is precisely the one who must not vanish while Paul is filtering the list.
         Same convention as `unassigned` directly beside it: a bucket that must always be
         visible is exempted, not relied on to happen to match. */
      : byCampaign.filter((c) => c.leadStatus === statusFilter || c.unassigned || c.isPaid);
    // Hide dead-state convos (not_interested / closed) unless "Show hidden" is on OR
    // the user has explicitly filtered TO that status. `removedKeys` gives an instant
    // optimistic drop right after "Remove from inbox" (before the refetch lands).
    const revealHidden = showHidden || statusFilter === 'not_interested' || statusFilter === 'closed';
    const visible = revealHidden
      ? byStatus
      : byStatus.filter((c) => c.leadStatus !== 'not_interested' && c.leadStatus !== 'closed');
    return visible.filter((c) => !removedKeys.has(c.key));
  }, [conversations, synthetic, campaignFilter, statusFilter, showHidden, removedKeys, hookState, contactState]);

  /* Search narrows the already-filtered list. Case-insensitive partial match on the business name
     (c.label — for a lead that IS the business name; for an unassigned convo it is "+<phone>"),
     plus the raw phone so typing digits finds a number too. Empty term → the full filtered list
     back, unchanged. Separate memo so the campaign/status/hidden logic above is untouched. */
  const searchTerm = search.trim().toLowerCase();
  const filteredList = useMemo(() => {
    if (!searchTerm) return list;
    return list.filter((c) => c.label.toLowerCase().includes(searchTerm) || c.phone.includes(searchTerm));
  }, [list, searchTerm]);

  // How many not_interested conversations the current view is hiding (for the toggle).
  const hiddenCount = useMemo(() => {
    const base = campaignFilter ? conversations.filter((c) => c.campaignId === campaignFilter || c.unassigned) : conversations;
    return base.filter((c) => c.leadStatus === 'not_interested' || c.leadStatus === 'closed').length;
  }, [conversations, campaignFilter]);

  // Set a conversation's lead status from the Inbox (two-way sync with Outreach).
  // Manual override — no forward-only guard — EXCEPT a confirm when moving a paying
  // customer AWAY from payment_received (mis-click protection).
  const handleSetStatus = async (c: WaConversation, status: PipelineStatus) => {
    if (!c.leadId || (status === c.leadStatus && (status !== 'interested' || c.isPotentialWork))) return;
    // “Interested” is an operator marker, not a pipeline stage. Preserve the current status and
    // persist the separate tracked/starred flag instead.
    if (status === 'interested') {
      const { error } = await (supabase as unknown as { from: (t: string) => any })
        .from('outreach_leads').update({ is_potential_work: true }).eq('id', c.leadId);
      if (error) { toast({ title: 'Could not mark interested', description: error.message, variant: 'destructive' }); return; }
      patchLeadPotentialWork(c.leadId, true);
      setSynthetic((s) => (s && s.leadId === c.leadId ? { ...s, isPotentialWork: true } : s));
      toast({ title: 'Marked interested', description: 'The pipeline status was left unchanged.' });
      return;
    }
    if (c.leadStatus === 'payment_received' && status !== 'payment_received') {
      if (!window.confirm(`${c.label} is marked Paid. Change it to "${status.replace(/_/g, ' ')}"? This removes it from the paid state.`)) return;
    }
    setSavingStatusKey(c.key);
    try {
      const { error } = await updateLeadStatus(c.leadId, status);
      if (error) { toast({ title: 'Could not update status', description: error, variant: 'destructive' }); return; }
      patchLeadStatus(c.leadId, status); // optimistic local update — no full re-query/spinner
      /* ⛔ AND THE SYNTHETIC COPY, or the header/list pill would show the OLD status until the next
         refetch. `conversations` is derived from `leads`, so patchLeadStatus covers every real
         conversation — but a synthetic one (startFromLead, a lead with no thread yet) is a useState
         SNAPSHOT outside that derivation. Patching it here keeps the one-source-of-truth promise for
         the only object that holds a second copy. Same handler, no second update path. */
      setSynthetic((s) => (s && s.leadId === c.leadId ? { ...s, leadStatus: status } : s));
      if (status === 'not_interested') toast({ title: 'Marked not interested', description: 'Hidden from the list — reappears if they reply.' });
    } finally {
      setSavingStatusKey(null);
    }
  };

  // Remove a conversation from the Inbox: set its lead to 'closed' (a real status
  // change, so confirm first), optimistically drop it now, then hand ownership to the
  // default hide filter once the refetch lands. It stays in Outreach and reappears
  // here if the prospect replies (whatsapp-inbound flips it back to 'replied').
  const handleRemoveFromInbox = async (c: WaConversation) => {
    if (!c.leadId) return;
    if (!window.confirm(`Remove ${c.label} from the inbox? This marks the lead Closed. It stays in Outreach and reappears here if they reply.`)) return;
    setRemovingKey(c.key);
    try {
      const { error } = await updateLeadStatus(c.leadId, 'closed');
      if (error) { toast({ title: 'Could not remove', description: error, variant: 'destructive' }); return; }
      setRemovedKeys((prev) => new Set(prev).add(c.key)); // optimistic hide
      if (activeKey === c.key) setActiveKey(null);
      toast({ title: 'Removed from inbox', description: 'Marked Closed — reappears if they reply.' });
      await refetch();
      // Refetch now reports leadStatus='closed', so the hide filter owns it (still
      // visible under "Show hidden"); release the manual key so it isn't double-hidden.
      setRemovedKeys((prev) => { const n = new Set(prev); n.delete(c.key); return n; });
    } finally {
      setRemovingKey(null);
    }
  };

  const active: WaConversation | null =
    (activeKey && conversations.find((c) => c.key === activeKey)) ||
    (activeKey && synthetic?.key === activeKey ? synthetic : null) || null;

  /* ⛔ MEMOISED. messagesForKey is a plain filter over every whatsapp_messages row (3,432 of
     them, measured 2026-09-09), and this used to re-run on EVERY render — including one per
     keystroke while the composer's text lived up here. The composer now holds its own text, and
     this makes the remaining renders cheap too. */
  const thread = useMemo(
    () => (active ? messagesForKey(active.key) : []),
    [active, messagesForKey],
  );
  const win = active ? windowFor(active.lastInboundAt) : { open: false, hoursLeft: 0 };

  // Quick-reply scripts = the saved TEXT templates (not voice). Placeholders are filled
  // from the conversation's lead where possible, then inserted (editable, not auto-sent).
  const textTemplates = useMemo(() => templates.filter((t) => t.template_type === 'text'), [templates]);
  const activeLead = active?.leadId ? leads.find((l) => l.id === active.leadId) : undefined;
  const activeBusinessName = activeLead?.business_name;
  /* ⛔ INSERTING A QUICK REPLY WRITES THE DRAFT AND REMOUNTS THE COMPOSER. The composer holds its
     own text (see InboxComposer — that is what fixed the typing lag), so the parent can no longer
     push a value into it by setting state. Bumping the seed changes the composer's React key, so it
     remounts and re-seeds from the draft we just wrote. Deliberately not an imperative ref handle:
     a remount cannot get out of step with the stored draft, and a handle can. */
  const [composerSeed, setComposerSeed] = useState(0);
  const insertTemplate = (content: string) => {
    setText(fillTemplate(content, { businessName: activeBusinessName }));
    setComposerSeed((n) => n + 1);
  };

  // Thread-header quick-action data — each button/link renders only when present.
  // Public audit report for THIS lead — the lead's own COMPLETED audit, served live at /a/<auditId>
  // (strictly the lead's own audit id, never another's). Drives the report-ready pill + Copy/Open,
  // and the audit_reply guard's report identifier.
  const activeReport = active?.leadId ? auditByLeadId[active.leadId] : undefined;
  /* ⛔ NOT PUBLIC_SITE_ORIGIN. That constant is the BARBER product's origin (yoursites.uk) and
     reusing it here coupled the AI-visibility report to a domain that has nothing to do with it. The
     report's prospect-facing home is findable.live; the operator's copy-link button must hand over
     exactly what a prospect would receive.
     ⛔ NEVER the pretty name-plus-8-hex business_reports slug: it only resolves when a PUBLISHED
     report row exists (14 of 74 audits have none), so it 404s for about a fifth of leads.
     THE SHORT CODE IS SAFE and is what a prospect now gets everywhere (templates, emails):
     findable.live/r/<code>, resolving on ai_audits.short_code — present on every audit (backfill +
     insert trigger), unguessable, resolves directly. Falls back to the UUID /report/ form only if a
     code is somehow absent, which also always resolves. */
  const reportUrl = activeReport?.auditId
    ? (activeReport.shortCode ? shortReportUrl(activeReport.shortCode) : `${REPORT_PUBLIC_ORIGIN}/report/${activeReport.auditId}`)
    : null;

  /* Readable body for a thread bubble. Campaign/opener rows are stored as a bare slug
   * ("[initial_contact]") by the whatsapp_sends DB trigger; this fills the approved copy from the
   * template name + what THIS thread knows (business name, and — where the template uses them — the
   * report/onboarding link, trade and owner first name). A row already holding real text is returned
   * unchanged. Competitors aren't available in the inbox, so audit_reply degrades to "other firms". */
  const bubbleReadable = (m: { body: string | null; template_name: string | null; created_at?: string | null }): string => {
    const businessName = activeBusinessName ?? active?.label ?? '';
    const url = m.template_name && REPORT_TEMPLATES.has(m.template_name)
      ? (reportUrl ?? '')
      : (activeLead ? onboardingUrl(activeLead.id, activeLead.business_name) : '');
    const trade = activeLead?.search_keyword ?? activeLead?.category ?? undefined;
    const firstName = firstNameFrom(activeLead?.contact_name);
    /* ⛔ sentAt: the transcript must show the name that WENT OUT, not the rule as it stands today. */
    return readableTemplateBody(m.body, m.template_name, { businessName, url, trade, firstName, sentAt: m.created_at });
  };

  const [reportCopied, setReportCopied] = useState(false);
  const copyReportUrl = () => {
    if (!reportUrl) return;
    navigator.clipboard?.writeText(reportUrl);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 1500);
    toast({ title: 'Report URL copied' });
  };

  /* ══ SEND THE hook_followup — manual, per-lead, mirrors the questionnaire nudge ═══════════════
     Fires the approved hook_followup template via send-whatsapp-message, which resolves {{1}} from
     the lead's contact_name server-side and enforces one-per-lead (pitchEverSent, no allow_resend).
     If the lead has no name, prompt for it and save it FIRST — the server reads the lead row, so the
     send and the record cannot disagree (same convention as the questionnaire nudge). */
  const [hookOpen, setHookOpen] = useState(false);
  const [hookName, setHookName] = useState('');
  const [hookSending, setHookSending] = useState(false);
  // ── Bulk hook-follow-up queueing (the "Hook follow-up due" view) ──
  const [hookSelected, setHookSelected] = useState<Set<string>>(new Set()); // lead ids

  /* ══ BULK TEMPLATE SEND ═══════════════════════════════════════════════════════════════════════
     Paul, 2026-09-09: send one approved template to many conversations instead of opening each
     thread. Keyed by CONVERSATION KEY (the hook queue above is keyed by lead id — deliberately not
     merged: that one QUEUES and this one SENDS, and one checkbox doing either depending on the
     filter is how you send fifty messages meaning to schedule them).
     ⛔ NEVER PERSISTED. Every other bit of page state here survives navigation on purpose, and this
     one must not: a remembered set of businesses to message, restored a day later against a list
     that has since changed, is the one piece of state whose staleness sends real messages. */
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkTemplate, setBulkTemplate] = useState('');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkReport, setBulkReport] = useState<null | { sent: number; failed: { label: string; reason: string }[] }>(null);
  const [hookQueueConfirm, setHookQueueConfirm] = useState(false);
  const [hookQueuing, setHookQueuing] = useState(false);
  const hookExistingFirst = firstNameFrom(activeLead?.contact_name);
  const hookEffectiveFirst = hookExistingFirst || firstNameFrom(hookName);
  const sendHookFollowup = async () => {
    /* First name is OPTIONAL for hook_followup — a blank sends "Hi there, …" (the server allows it
       via TEMPLATES_ALLOWING_NO_FIRST_NAME). Do NOT block the send on an empty name. */
    if (!active?.leadId || !activeLead || hookSending) return;
    setHookSending(true);
    try {
      if (!hookExistingFirst && hookName.trim()) {
        await (supabase as unknown as SupabaseClient)
          .from('outreach_leads').update({ contact_name: hookName.trim() }).eq('id', active.leadId);
      }
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { lead_id: active.leadId, phone: active.phone, country: activeLead.country ?? undefined, template_name: 'hook_followup' },
      });
      if (error || !data?.ok) {
        const code = error?.message ?? data?.error ?? 'send failed';
        toast({
          title: 'Not sent',
          description: code === 'pitch_already_sent' ? 'A hook follow-up has already gone to this lead — one per lead, no repeats.'
            : code === 'no_contact_name' ? 'The lead has no contact name saved — add their first name and try again.'
            : code === 'unknown_template' ? 'The send path is not deployed yet (waiting on the deploy).'
            : String(code),
          variant: 'destructive',
        });
        return;
      }
      setHookOpen(false);
      toast({ title: 'Hook follow-up sent', description: `hook_followup to ${activeLead.business_name}.` });
      await refetch(); // picks up the outbound row → the button flips to "sent"
    } finally {
      setHookSending(false);
    }
  };

  /* ══ contact_followup — the earlier-stage manual nudge (no first name; {{1}} = business name) ══ */
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSending, setContactSending] = useState(false);
  const sendContactFollowup = async () => {
    if (!active?.leadId || !activeLead || contactSending) return;
    setContactSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: { lead_id: active.leadId, phone: active.phone, country: activeLead.country ?? undefined, template_name: 'contact_followup' },
      });
      if (error || !data?.ok) {
        const code = error?.message ?? data?.error ?? 'send failed';
        toast({
          title: 'Not sent',
          description: code === 'pitch_already_sent' ? 'A contact follow-up has already gone to this lead — one per lead, no repeats.'
            : code === 'unknown_template' ? 'The send path is not deployed yet (waiting on the deploy).'
            : String(code),
          variant: 'destructive',
        });
        return;
      }
      setContactOpen(false);
      toast({ title: 'Contact follow-up sent', description: `contact_followup to ${activeLead.business_name}.` });
      await refetch(); // picks up the outbound row → the button flips to "sent"
    } finally {
      setContactSending(false);
    }
  };

  /* ══ BULK: QUEUE MANY hook_followup SENDS (never a blast) ═══════════════════════════════════
     Only in the "Hook follow-up due" view. Selection is by lead id. "Queue" writes the marker
     column hook_followup_queued_at — it does NOT send: process-whatsapp-queue's hook lane drains
     them ONE per tick, within the same 120/day cap and 07:00–21:30 UK window as every other send,
     and re-verifies each lead's eligibility at send time. A confirm step shows the count first. */
  const hookDueMode = statusFilter === HOOK_DUE_FILTER;
  const hookEligibleLeadIds = useMemo(
    () => (hookDueMode ? filteredList.filter((c) => c.leadId && hookState.eligible.has(c.key)).map((c) => c.leadId as string) : []),
    [hookDueMode, filteredList, hookState],
  );
  const toggleHookSelect = (leadId: string) => setHookSelected((s) => {
    const n = new Set(s);
    if (n.has(leadId)) n.delete(leadId); else n.add(leadId);
    return n;
  });
  const selectAllHookEligible = () => setHookSelected(new Set(hookEligibleLeadIds));
  const clearHookSelection = () => setHookSelected(new Set());

  /* ══ BULK SEND — the plan, then the sending ═══════════════════════════════════════════════════ */
  const toggleBulkSelect = (key: string) => setBulkSelected((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const exitBulkMode = () => { setBulkMode(false); setBulkSelected(new Set()); setBulkReport(null); };

  /* The plan is recomputed from the CURRENT list every render, so a conversation that leaves the
     filter (a status change, a reply landing) leaves the batch with it. Selecting by key and
     resolving late is what keeps the confirm honest about who is actually about to be messaged. */
  const bulkCandidates: BulkCandidate[] = useMemo(
    () => filteredList
      .filter((c) => bulkSelected.has(c.key))
      .map((c) => ({ key: c.key, leadId: c.leadId, label: c.label, phone: c.phone })),
    [filteredList, bulkSelected],
  );
  const bulkPlan = useMemo(
    () => planBulkSend(bulkCandidates, bulkTemplate, { auditByLeadId }),
    [bulkCandidates, bulkTemplate, auditByLeadId],
  );

  /**
   * Send the planned template to each conversation, one at a time.
   *
   * ⛔ SEQUENTIAL, NOT Promise.all. Fifty parallel sends would hit Meta's Graph API in one burst
   * from one number, which is the shape rate limiting exists to punish — and a partial failure in
   * a parallel batch is far harder to report honestly. Sequential also means the progress count is
   * true rather than decorative.
   * ⛔ NO allowResend. The server refuses a template this lead has already had; in a batch that
   * refusal is exactly right, and overriding it wholesale is how somebody gets the same message
   * twice. A deliberate repeat is a single send, from the thread, where it is confirmed by name.
   * ⚠️ Failures are COLLECTED, never thrown — one refusal must not abandon the rest of the batch,
   * and the operator needs the list at the end more than they need a toast per lead.
   */
  const runBulkSend = async () => {
    if (bulkBusy || !bulkPlan.send.length) return;
    setBulkBusy(true);
    setBulkReport(null);
    setBulkProgress({ done: 0, total: bulkPlan.send.length });
    const failed: { label: string; reason: string }[] = [];
    let sent = 0;
    for (const target of bulkPlan.send) {
      try {
        const res = await send({
          phone: target.phone,
          leadId: target.leadId,
          templateName: bulkTemplate,
        });
        if (res.ok) sent++;
        else failed.push({ label: target.label, reason: res.reason ?? res.error ?? 'send failed' });
      } catch (e) {
        failed.push({ label: target.label, reason: e instanceof Error ? e.message : 'send failed' });
      }
      setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBulkBusy(false);
    setBulkConfirm(false);
    setBulkReport({ sent, failed });
    setBulkSelected(new Set());
    toast({
      title: failed.length ? `Sent ${sent}, ${failed.length} failed` : `Sent ${sent}`,
      description: failed.length ? 'The ones that did not go are listed above the conversation list.' : undefined,
      variant: failed.length ? 'destructive' : undefined,
    });
    await refetch();
  };

  const queueHookFollowups = async () => {
    const ids = [...hookSelected];
    if (!ids.length) return;
    setHookQueuing(true);
    try {
      /* Untyped client for the write: the generated Supabase types won't carry hook_followup_queued_at
         until they're regenerated post-migration. Same cast the audit-prompt write uses. */
      const { error } = await (supabase as unknown as SupabaseClient)
        .from('outreach_leads')
        .update({ hook_followup_queued_at: new Date().toISOString() })
        .in('id', ids);
      if (error) {
        toast({ title: "Couldn't queue", description: error.message, variant: 'destructive' });
        return;
      }
      const days = estHookDays(ids.length);
      toast({
        title: `Queued ${ids.length} for hook follow-up`,
        description: `They’ll pace out through the WhatsApp queue within the daily cap and the 07:00–21:30 UK window — about ${days} day${days === 1 ? '' : 's'} to clear. Nothing was sent now.`,
      });
      setHookSelected(new Set());
      setHookQueueConfirm(false);
      await refetch(); // queued leads now carry the marker → they leave the "due" view
    } finally {
      setHookQueuing(false);
    }
  };

  // Per-lead template validity (SHARED source of truth with SingleWhatsAppDialog). Resolved
  // strictly from THIS lead's own record: claim templates need its share_token; audit_reply needs
  // the lead's own completed audit (reportSlug = its auditId → /a/<auditId>). Nothing is auto-hidden
  // — invalid templates render disabled with a clear reason.
  /* ⛔ THE PREVIEW PANEL'S STATE. Held here rather than in the picker because it must be CLEARED
     when the chosen template or the open thread changes — a preview of a different message left on
     screen is worse than no preview, and it is the shape a person acts on. */
  const [previewing, setPreviewing] = useState(false);
  const [previewOf, setPreviewOf] = useState<{ template: string; key: string } | null>(null);
  const [previewResult, setPreviewResult] = useState<
    { ok: boolean; body?: string; snapshot?: WhatsAppTemplateSnapshot; template?: string; fellBack?: string; error?: string; reason?: string } | null
  >(null);

  /* hasSiteFault gates audit_followup_fault: it names a specific site fault in {{6}} and Meta rejects
     an empty parameter, so it is only offered when this lead's crawl check found one. */
  const templateSendability = (name: string) => getTemplateSendability(name, { shareToken: null }, { reportSlug: activeReport?.auditId ?? null, hasSiteFault: active?.leadId ? hasSiteFaultLeadIds.has(active.leadId) : false, hasSiteFindings: active?.leadId ? hasSiteFindingsLeadIds.has(active.leadId) : false });
  /* getTemplateSendability('') returns ok:true, because an unknown name is not its business to
     block — so "nothing selected" has to be refused here or the button would be live with no
     template chosen. */
  const selectedSendability = template ? templateSendability(template) : { ok: false as const, reason: 'Choose a template first.' };

  // Approved WhatsApp-template picker — SEPARATE from the free-text "Quick reply" snippets. Shown in
  // both window states (below). Each option is enabled/disabled by the SHARED getTemplateSendability
  // guard (audit_reply needs a completed audit; claim templates need a share_token). Send goes via
  // doSend(true) → send-whatsapp-message, which resolves vars per-lead server-side (safe).
  const templatePicker = (
    <>
      <div className="flex items-center gap-2">
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Not set — choose a template" /></SelectTrigger>
          <SelectContent>
            {WHATSAPP_TEMPLATES.map((t) => {
              const s = templateSendability(t.value);
              const group = WA_TEMPLATE_REQS[t.value]?.group;
              const groupLabel = group === 'site' ? 'Site / claim' : group === 'audit' ? 'Audit' : 'Opener';
              return (
                <SelectItem key={t.value} value={t.value} disabled={!s.ok}>
                  <span className="flex flex-col">
                    <span>{t.label} <span className="text-[10px] text-muted-foreground">· {groupLabel}</span></span>
                    {!s.ok && <span className="text-[10px] text-amber-600">{s.reason}</span>}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {/* ⛔ PREVIEW BEFORE SEND — the dry run (useInbox.preview → send-whatsapp-message
            mode:"dry_run"). It runs every server-side guard and builds the real Meta payload, then
            stops. Two live prospects were spent finding out that `audit_followup` would 500, because
            the only way to ask was to send. Deliberately NOT disabled by `selectedSendability` — a
            template the client-side guard already blocks is exactly the one worth asking the SERVER
            about, and its answer names the real reason. */}
        <Button
          variant="outline"
          className="shrink-0"
          disabled={previewing || sending || !active?.leadId || !template}
          onClick={async () => {
            if (!active || !template) return;
            setPreviewing(true);
            setPreviewOf({ template, key: active.key });
            const r = await preview({ phone: active.phone, leadId: active.leadId, country: activeLead?.country ?? null, templateName: template, allowResend: thread.some((m) => m.direction === 'outbound' && m.template_name === template) });
            setPreviewResult(r.ok
              ? { ok: true, body: r.body ?? '', snapshot: r.snapshot, template: r.template ?? template, fellBack: r.fellBack }
              : { ok: false, error: r.error ?? 'preview_failed', reason: r.reason });
            setPreviewing(false);
          }}
        >
          {previewing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
          Preview
        </Button>
        <Button onClick={() => doSend(true)} disabled={sending || !active?.leadId || !template || !selectedSendability.ok} className="shrink-0">
          {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          Send template
        </Button>
      </div>
      {/* ⛔ SHOWN ONLY FOR THE TEMPLATE AND THREAD IT WAS RUN FOR. A stale preview under a different
          template reads as a guarantee about a message nobody previewed. */}
      {previewResult && previewOf && previewOf.template === template && previewOf.key === active?.key && (
        previewResult.ok ? (
          <div className="mt-2 rounded-md border border-emerald-600/30 bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              This would send — nothing has been sent.
              {previewResult.template !== template && ` It would fall back to "${previewResult.template}".`}
            </p>
            {previewResult.fellBack && <p className="text-[10px] text-muted-foreground">{previewResult.fellBack}</p>}
            <div className="mt-2 rounded-xl bg-primary/90 p-3 text-[11px] text-primary-foreground">{previewResult.snapshot ? <WhatsAppTemplateMessage snapshot={previewResult.snapshot} /> : <pre className="whitespace-pre-wrap break-words leading-snug">{previewResult.body}</pre>}</div>
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-amber-600/30 bg-amber-50/60 p-2 dark:bg-amber-950/20">
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              This would NOT send — {previewResult.error}
            </p>
            {previewResult.reason && <p className="text-[10px] text-muted-foreground">{previewResult.reason}</p>}
          </div>
        )
      )}
      {active?.leadId && !!template && !selectedSendability.ok && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {selectedSendability.reason}
        </p>
      )}
    </>
  );
  // ── Inbox audit button: fire the chain's auto-audit path directly (no navigation) ──
  // Inputs sourced like the wizard's pickLead / the reply chain: type = category||search_keyword,
  // location = search_location||address. Missing → the button becomes a wizard fallback link.
  const auditInputs = activeLead
    ? { type: (activeLead.category || activeLead.search_keyword || '').trim(), loc: (activeLead.search_location || activeLead.address || '').trim() }
    : null;
  const auditInputsMissing = !!activeLead && (!auditInputs?.type || !auditInputs?.loc);
  const [firedAudits, setFiredAudits] = useState<Set<string>>(new Set());
  /* SIGN-UP LINK, compact. The full card lives on in the lead-detail dialog, which has room; here it
     is one toolbar icon, because the Inbox is for reading conversations. Same assessment function as
     the card, so the no-trade warning cannot differ between them. */
  const signupLink = activeLead ? assessOnboardingLink(activeLead) : null;
  const [signupCopied, setSignupCopied] = useState(false);
  const copySignupLink = async () => {
    if (!activeLead) return;
    try {
      await navigator.clipboard.writeText(onboardingUrl(activeLead.id, activeLead.business_name));
      setSignupCopied(true);
      setTimeout(() => setSignupCopied(false), 1500);
    } catch {
      /* Clipboard refused (insecure context / denied). Show the link so there is still a way to get
         it, rather than the click appearing to do nothing. */
      window.prompt('Copy the sign-up link:', onboardingUrl(activeLead.id, activeLead.business_name));
    }
  };

  const auditInFlight = !!active?.leadId && (auditRunningLeadIds.has(active.leadId) || firedAudits.has(active.leadId));
  // Inline missing-inputs prompt — the inbox is NEVER left to run an audit. Prefilled from
  // whatever partial lead data exists; values are written back to the lead before running.
  const [auditPromptOpen, setAuditPromptOpen] = useState(false);
  const [promptType, setPromptType] = useState('');
  const [promptLoc, setPromptLoc] = useState('');
  const hasCompletedAudit = !!activeReport; // auditByLeadId — completed/capped run exists

  // Shared runner: fire create-ai-audit (server defaults: 3 auto-generated questions, no approval
  // step) with queue_pitch_on_complete, keep the spinner state, and toast the outcome. 23505 on
  // the pitch row (once-ever slot already used, e.g. a re-run after the pitch went out) is
  // surfaced honestly, never treated as a failure.
  const startAudit = async (bizType: string, loc: string) => {
    if (!active?.leadId || !activeLead) return;
    setFiredAudits((prev) => new Set(prev).add(active.leadId!));
    const { data, error } = await supabase.functions.invoke('create-ai-audit', {
      body: {
        lead_id: active.leadId,
        business_name: activeLead.business_name,
        business_type: bizType,
        location_text: loc,
        country: activeLead.country ?? null,
        /* A DIRECTORY OR SOCIAL URL IS NOT A WEBSITE (2026-09-21) — this call used to send the raw
           lead.website straight through, so a lead whose only "website" is a Facebook/Fresha page
           had that page crawled as if it were their own site, producing a meaningless or misleading
           "what's stopping AI reading your site" finding on the hook report this button feeds.
           Same isAggregatorUrl rule create-ai-audit's own first-reply path already applies. */
        website: (activeLead.website && !isAggregatorUrl(activeLead.website)) ? activeLead.website : undefined,
        has_website: !!(activeLead.website && !isAggregatorUrl(activeLead.website)),
        queue_pitch_on_complete: true,
        // Stated, not inherited. This used to send nothing and rely on create-ai-audit's shared
        // default happening to be 3; one edit to that default would have silently multiplied the
        // cost of the highest-volume path in the system.
        question_count: OUTREACH_HOOK_QUESTIONS,
        // The EXPLICIT hook marker (2026-09-20): adaptive 1→3 execution and the Quick AI Visibility
        // Check report. fresh_audit is a separate fact — a re-run is a NEW hook that starts at Q1,
        // never run 2 on the old audit. Neither is inferred from the question count.
        hook_audit: true,
        fresh_audit: true,
      },
    });
    if (error || !data?.ok) {
      setFiredAudits((prev) => { const n = new Set(prev); n.delete(active.leadId!); return n; });
      toast({ title: "Couldn't start the audit", description: error?.message ?? data?.error ?? 'Try again', variant: 'destructive' });
      return;
    }
    // The AiAudit page's list is its own React Query cache (staleTime 5 min, nothing else
    // invalidates it) — without this, an audit fired from here sits invisible on that page
    // until an unrelated refetch happens to land. Same key AiAudit.tsx's own creation paths use.
    void queryClient.invalidateQueries({ queryKey: auditListQueryKey(user?.id) });
    toast({
      title: hasCompletedAudit ? 'Audit re-running' : 'Audit started',
      description: data.pitch_queued
        ? 'The report pitch will auto-send when it completes (~10–15 min; declines cancel it).'
        : data.pitch_note === 'lead_archived'
          // Its own line: the generic note ends with "send manually when it completes", which is
          // exactly the wrong advice for a lead the operator has withdrawn.
          ? 'Audit is running. No pitch was queued because this lead is archived — un-archive them if you want the pitch to send.'
          : data.pitch_note === 'slot_already_owned'
            ? 'Audit re-running — pitch already sent, so no new pitch will be queued.'
            : `Audit is running, but the auto-pitch wasn’t queued (${data.pitch_note ?? 'unknown'}) — send manually when it completes.`,
    });
    refetch(); // pick up the pending run → spinner state survives reloads
  };

  const fireAuditFromInbox = async () => {
    if (!active?.leadId || !activeLead || auditInFlight) return;
    if (auditInputsMissing) {
      // NO navigation — open the inline prompt, prefilled from any partial lead data.
      setPromptType(auditInputs?.type ?? '');
      setPromptLoc(auditInputs?.loc ?? '');
      setAuditPromptOpen(true);
      return;
    }
    const confirmText = hasCompletedAudit
      ? `Re-run audit for ${activeLead.business_name}?`
      : `Run audit for ${activeLead.business_name}? The report pitch auto-sends when it completes.`;
    if (!window.confirm(confirmText)) return;
    await startAudit(auditInputs!.type, auditInputs!.loc);
  };

  // Inline-prompt submit: persist the typed inputs to the lead (same write-back convention as
  // the wizard — search_keyword/search_location), then run. The dialog's Run button IS the
  // explicit confirmation, so no extra window.confirm here.
  const runAuditFromPrompt = async () => {
    const bizType = promptType.trim();
    const loc = promptLoc.trim();
    if (!active?.leadId || !bizType || !loc) {
      toast({ title: 'Both fields needed', description: 'Enter the business type and the town/location.', variant: 'destructive' });
      return;
    }
    setAuditPromptOpen(false);
    try {
      await (supabase as unknown as SupabaseClient)
        .from('outreach_leads')
        .update({ search_keyword: bizType, search_location: loc })
        .eq('id', active.leadId);
    } catch { /* non-fatal — the audit still runs with the typed values */ }
    await startAudit(bizType, loc);
  };

  const mapsUrl = activeLead?.google_maps_url
    || (activeLead?.place_id ? `https://www.google.com/maps/place/?q=place_id:${activeLead.place_id}` : null);
  const websiteUrl = activeLead?.website
    ? (/^https?:\/\//i.test(activeLead.website) ? activeLead.website : `https://${activeLead.website}`)
    : null;

  const startFromLead = (lead: LeadLite) => {
    const norm = normalizeWaNumber(lead.phone, lead.country);
    if (!norm || !user) { toast({ title: 'No usable number', variant: 'destructive' }); return; }
    const key = `${user.id}::${norm}`;
    const existing = conversations.find((c) => c.key === key);
    if (existing) { setActiveKey(existing.key); setSynthetic(null); }
    else {
      const synth: WaConversation = {
        key, phone: norm, userId: user.id, leadId: lead.id,
        campaignId: lead.campaign_id ?? null,
        leadStatus: lead.status ?? null,
        /* ⛔ THE SAME PREDICATE the fetched conversations use (useInbox's paidLeadIds), not a
           second copy of the rule. A hand-rolled `amount_paid > 0` here would have kept calling a
           REFUNDED lead paid, so opening their thread from a lead row would have contradicted the
           very same thread in the list beside it. LeadLite carries amount_paid AND status. */
        isPaid: isPaidLead(lead),
        label: lead.business_name || `+${norm}`, unassigned: false,
        lastMessage: undefined as never, lastMessageAt: new Date(0).toISOString(), lastInboundAt: null,
        /* A freshly-opened thread has no messages, so no report link was sent and no engagement is
           attributable yet; a lead with real engagement has real messages and a real conversation. */
        reportOpenedAt: null, siteVisitedAt: null,
        geminiNamed: null, geminiAnswers: null, isPotentialWork: !!lead.is_potential_work,
      };
      setSynthetic(synth);
      setActiveKey(key);
    }
    setNewOpen(false);
    /* ⛔ NO setText('') HERE ANY MORE, AND REMOVING IT IS THE POINT. It used to clear the single
       shared composer so a new thread opened empty. Drafts are now keyed by conversation, so this
       would clear the draft of the thread we just LEFT — setText closes over the current activeKey,
       which at this moment is still the old one. The new thread already opens empty by construction,
       or with its own saved draft if one was left there, which is what you would want. */
  };

  // Launch from the Outreach WhatsApp button / dashboard jump: open that lead's thread.
  const location = useLocation();
  const launchConsumed = useRef(false);
  useEffect(() => {
    const launch = (location.state as { launch?: { leadId?: string } } | null)?.launch;
    if (!launch?.leadId || launchConsumed.current || isLoading) return;
    launchConsumed.current = true;
    window.history.replaceState({}, document.title); // consume once (refresh/back won't relaunch)
    const lead = leads.find((l) => l.id === launch.leadId);
    if (lead) startFromLead(lead);
    else toast({ title: 'No WhatsApp number', description: 'That lead has no phone to message.', variant: 'destructive' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, leads, isLoading]);

  /* `freeText` is the COMPOSER'S OWN current value. It must be passed in rather than read from
     the draft map: the composer persists on a debounce now, so the stored draft can be up to
     DRAFT_DEBOUNCE_MS behind what is on screen, and sending the stale copy would send the message
     minus its last few characters. Template sends ignore it entirely.
     Returns whether the message actually went, so the composer only clears itself on success. */
  const doSend = async (asTemplate?: boolean, freeText?: string): Promise<boolean> => {
    if (!active) return false;
    // IN-FLIGHT GUARD. The buttons are disabled while `sending`, but that only covers the buttons:
    // the composer's Enter key and the template picker can both reach here, and two taps inside the
    // same tick would both pass a disabled check that has not re-rendered yet. A template send is
    // not repeatable-for-free, so the guard lives at the top of the action itself.
    const sendKey = active.key;
    if (sendingKeysRef.current.has(sendKey)) return false;
    // Explicit template send (asTemplate=true, from the WhatsApp-template picker) works in ANY
    // window state; otherwise fall back to the window default (out-of-window → template, in → text).
    const useTemplate = asTemplate ?? !win.open;
    if (useTemplate && !active.leadId) {
      toast({ title: 'Template needs a lead', description: 'This conversation has no linked lead, so a claim template can’t be sent.', variant: 'destructive' });
      return false;
    }
    // Per-lead validity guard — never send a template whose required data this lead lacks.
    if (useTemplate) {
      /* Nothing chosen. The button is already disabled for this, but the out-of-window path can reach
         doSend with asTemplate undefined, and templateSendability('') reports ok — so refuse here
         too rather than relying on the UI being the only way in. */
      if (!template) { toast({ title: 'No template chosen', description: 'Pick a template before sending.', variant: 'destructive' }); return false; }
      const s = templateSendability(template);
      if (!s.ok) { toast({ title: 'Template not available for this lead', description: s.reason, variant: 'destructive' }); return false; }
    }
    const body = (freeText ?? text).trim();
    if (!useTemplate && !body) return false;
    // Template sends are deliberate button actions; do not add a second confirmation step.
    // Repeats still pass the explicit server override automatically so removing the browser prompt
    // does not turn a valid repeat into a confusing duplicate refusal.
    const alreadySent = useTemplate && thread.some((m) => m.direction === 'outbound' && m.template_name === template);
    sendingKeysRef.current.add(sendKey);
    setSendingKeys((prev) => new Set(prev).add(sendKey));
    const res = await send({
      phone: active.phone,
      leadId: active.leadId,
      body: useTemplate ? undefined : body,
      templateName: useTemplate ? template : undefined,
      allowResend: alreadySent,
    });
    sendingKeysRef.current.delete(sendKey);
    setSendingKeys((prev) => { const next = new Set(prev); next.delete(sendKey); return next; });
    if (!res.ok) {
      const map: Record<string, string> = {
        window_closed: 'The 24h reply window is closed — send an approved template instead.',
        no_claim_link: 'That lead has no generated site yet, so there’s no claim link to send.',
        forbidden: 'You can only message your own conversations.',
        template_needs_lead: 'A template needs a linked lead.',
        audit_reply_unavailable: 'Audit report not ready for this lead — run an audit first.',
        // Reachable only if the override did not accompany a confirmed repeat — i.e. not the
        // operator's normal path, which now asks and then sends. So it reads as the unexpected
        // state it is, rather than as a policy the operator has already been asked about.
        pitch_already_sent: 'Already sent to this lead, and the repeat was not confirmed. Try again — you will be asked to confirm.',
      };
      toast({ title: 'Not sent', description: res.reason ?? map[res.error ?? ''] ?? res.error ?? 'Send failed.', variant: 'destructive' });
      return false;
    }
    /* The composer clears ITSELF on a true return (and clears its own draft). This still runs for
       the template path, which has no composer text to clear but may hold a draft. */
    setDrafts((prev) => setDraft(prev, sendKey, ''));
    if (activeKey === sendKey) setSynthetic(null); // the real conversation now exists under the same key
    toast({ title: res.simulated ? 'Sent (simulated — test mode)' : 'Sent ✓' });
    if (activeKey === sendKey) setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }), 50);
    return true;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">Manage WhatsApp conversations without leaving LeadFinder.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* The one auto-reply rule's switch (admin-only — hides itself otherwise). */}
          <AutoReplyToggle />
          {/* Filter conversations by campaign + status. Both keep Unassigned visible. */}
          <CampaignPicker mode="filter" hideCreate value={campaignFilter} onChange={setCampaignFilter} className="h-9 w-[180px]" />
          <Select value={statusFilter ?? '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? null : v)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              {PIPELINE_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
              {/* Opener sent (initial_contact), NEVER replied, no report yet, 3+ days — contact_followup. */}
              <SelectItem value={CONTACT_DUE_FILTER}>Contact follow-up due</SelectItem>
              {/* Report sent (audit_reply), no reply since, 3+ days — the hook_followup work queue. */}
              <SelectItem value={HOOK_DUE_FILTER}>Hook follow-up due</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendNow}
              disabled={sendingNow}
              title="Send the next queued WhatsApp message now — skips only the pacing wait; still respects pause, the daily cap and the 7am–9:30pm window"
            >
              {sendingNow ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send now
            </Button>
          )}
          <Button size="sm" onClick={() => setNewOpen((v) => !v)}><Plus className="mr-1.5 h-4 w-4" /> New</Button>
        </div>
      </div>

      {/* New-conversation lead picker */}
      {newOpen && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Start a conversation with one of your leads (must have a phone):</p>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">No leads with a phone number.</p>
            ) : leads.map((l) => (
              <button key={l.id} onClick={() => startFromLead(l)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/50">
                <span className="truncate">{l.business_name || '(no name)'}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{l.phone}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <Card className="max-h-[60vh] overflow-y-auto p-1.5">
          {/* Show-hidden toggle — only when there are hidden (not_interested) convos. */}
          {(hiddenCount > 0 || showHidden) && (
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="mb-1 w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50"
            >
              {showHidden ? '← Hide closed / not-interested' : `Show hidden (${hiddenCount})`}
            </button>
          )}
          {/* Search the conversation list — narrows within the campaign/status/hidden filters.
              Part of the list column, not the top toolbar. Clearing it restores the full list. */}
          <div className="relative mb-1.5 px-0.5">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by business name…"
              className="h-8 pr-7 text-xs"
              aria-label="Search conversations by business name"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
          {/* ══ BULK TEMPLATE SEND ═══════════════════════════════════════════════════════════════
              Hidden behind a "Select" toggle rather than always-on: checkboxes on every row change
              what a click on a conversation MEANS, and the common action here is opening a thread,
              not choosing one. Not shown in hook-due mode — that view has its own selection, and two
              sets of checkboxes on one row is how you queue when you meant to send. */}
          {!hookDueMode && filteredList.length > 0 && (
            bulkMode ? (
              <div className="mb-1.5 space-y-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground">{bulkSelected.size} selected</span>
                  <button type="button" className="font-medium text-primary hover:underline"
                    onClick={() => setBulkSelected(new Set(filteredList.map((c) => c.key)))}>
                    Select all shown ({filteredList.length})
                  </button>
                  {bulkSelected.size > 0 && (
                    <button type="button" className="text-muted-foreground hover:underline"
                      onClick={() => setBulkSelected(new Set())}>Clear</button>
                  )}
                  <span className="flex-1" />
                  <button type="button" className="text-muted-foreground hover:underline" onClick={exitBulkMode}>Done</button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={bulkTemplate} onValueChange={setBulkTemplate}>
                    <SelectTrigger className="h-7 flex-1 min-w-[190px] text-[11px]">
                      <SelectValue placeholder="Choose a template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {WHATSAPP_TEMPLATES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7 px-2 text-[11px]"
                    disabled={bulkBusy || !bulkTemplate || bulkPlan.send.length === 0}
                    onClick={() => setBulkConfirm(true)}>
                    {bulkBusy
                      ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending {bulkProgress.done}/{bulkProgress.total}</>
                      : `Send to ${bulkPlan.send.length}`}
                  </Button>
                </div>
                {/* The refusal and the skips are stated BEFORE the confirm, not inside it — a
                    disabled button with no explanation is the thing that makes an operator press
                    it repeatedly. */}
                {bulkTemplate && bulkPlan.refusal && (
                  <p className="text-[11px] text-destructive">{bulkPlan.refusal}</p>
                )}
                {bulkTemplate && !bulkPlan.refusal && bulkPlan.skipped.length > 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500">
                    {bulkPlan.skipped.length} of {bulkSelected.size} will be skipped —{' '}
                    {groupSkips(bulkPlan.skipped).map((g) => `${g.count} ${g.reason}`).join(', ')}.
                  </p>
                )}
              </div>
            ) : (
              <div className="mb-1.5 flex justify-end">
                <button type="button" onClick={() => setBulkMode(true)}
                  className="text-[11px] font-medium text-primary hover:underline">
                  Select several…
                </button>
              </div>
            )
          )}
          {/* What the last batch did. Sticks around until dismissed: a toast disappears, and the
              list of who did NOT get the message is the part worth acting on. */}
          {bulkReport && (
            <div className="mb-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">Sent {bulkReport.sent}{bulkReport.failed.length ? `, ${bulkReport.failed.length} failed` : ''}</span>
                <span className="flex-1" />
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setBulkReport(null)}>Dismiss</button>
              </div>
              {bulkReport.failed.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {bulkReport.failed.slice(0, 8).map((x, i) => (<li key={i} className="truncate">· {x.label} — {x.reason}</li>))}
                  {bulkReport.failed.length > 8 && <li>· and {bulkReport.failed.length - 8} more</li>}
                </ul>
              )}
            </div>
          )}
          {/* Bulk hook-follow-up control bar — only in the "Hook follow-up due" view. Queue, don't send. */}
          {hookDueMode && filteredList.length > 0 && (
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px]">
              <span className="text-muted-foreground">{hookSelected.size} selected</span>
              <button type="button" onClick={selectAllHookEligible} className="font-medium text-primary hover:underline">
                Select all eligible ({hookEligibleLeadIds.length})
              </button>
              {hookSelected.size > 0 && (
                <button type="button" onClick={clearHookSelection} className="text-muted-foreground hover:underline">Clear</button>
              )}
              <span className="flex-1" />
              <Button
                size="sm" className="h-6 px-2 text-[11px]"
                disabled={hookSelected.size === 0}
                onClick={() => setHookQueueConfirm(true)}
              >
                Queue {hookSelected.size} for follow-up
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : isError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <p className="text-sm">Couldn’t load conversations.</p>
              <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center text-muted-foreground">
              <MessageSquare className="mb-2 h-6 w-6 opacity-40" />
              {searchTerm ? (
                <>
                  <p className="text-sm">No conversations match “{search.trim()}”.</p>
                  <p className="mt-1 text-xs opacity-70">Clear the search to see the full list.</p>
                </>
              ) : (
                <>
                  <p className="text-sm">No conversations yet.</p>
                  <p className="mt-1 text-xs opacity-70">Start one with “New”, or inbound replies will appear here as they arrive.</p>
                </>
              )}
            </div>
          ) : filteredList.map((c) => (
            <div
              key={c.key}
              role="button"
              tabIndex={0}
              onClick={() => setActiveKey(c.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveKey(c.key); } }}
              className={cn('flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors',
                activeKey === c.key ? 'bg-muted' : 'hover:bg-muted/50')}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {hookDueMode && c.leadId && (
                    <Checkbox
                      checked={hookSelected.has(c.leadId)}
                      onCheckedChange={() => toggleHookSelect(c.leadId!)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${c.label} for hook follow-up`}
                      className="mr-0.5 shrink-0"
                    />
                  )}
                  {bulkMode && !hookDueMode && (
                    <Checkbox
                      checked={bulkSelected.has(c.key)}
                      onCheckedChange={() => toggleBulkSelect(c.key)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${c.label} for a bulk send`}
                      className="mr-0.5 shrink-0"
                    />
                  )}
                  {c.unassigned && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  <span className="truncate">{c.unassigned ? `Unassigned · +${c.phone}` : c.label}</span>
                  {!c.unassigned && c.isPotentialWork && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" title="Interested" />}
                </span>
                {c.lastMessage && <span className="shrink-0 text-[10px] text-muted-foreground">{relTime(c.lastMessageAt)}</span>}
              </div>
              {c.lastMessage && (
                <span className="truncate text-xs text-muted-foreground">
                  {c.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                  {listPreview(c.lastMessage, c.label)}
                </span>
              )}
              {/* Editable status pill — only for conversations linked to a lead
                  (Unassigned has none). Two-way synced with Outreach. Beside it, ONE
                  engagement pill for the furthest milestone the lead reached
                  (Upsell > Claimed > Opened; nothing if none) — from generated_sites. */}
              {c.leadId && (
                <div className="mt-0.5 flex items-center gap-1">
                  {savingStatusKey === c.key
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    : <PipelineStatusSelect value={c.leadStatus} onValueChange={(status) => handleSetStatus(c, status)} />}
                  <EngagementPills reportOpenedAt={c.reportOpenedAt} siteVisitedAt={c.siteVisitedAt} geminiNamed={c.geminiNamed} geminiAnswers={c.geminiAnswers} />
                </div>
              )}
            </div>
          ))}
        </Card>

        {/* Thread + reply */}
        <Card className="flex h-[60vh] flex-col">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="mb-2 h-7 w-7 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                    <span className="truncate">{active.unassigned ? `Unassigned · +${active.phone}` : active.label}</span>
                    {!active.unassigned && active.isPotentialWork && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" title="Interested" />}
                  </p>
                  {/* ⛔ SAME PILL, SAME STATE, SAME HANDLER as the list pill below — deliberately NOT a
                      second copy. `active` IS the list's own conversation object (conversations.find
                      by activeKey), and handleSetStatus → patchLeadStatus patches `leads` by leadId in
                      useInbox, which `conversations` is derived from. So a change in either place
                      re-renders BOTH from one source of truth; two different statuses for one business
                      is structurally impossible. The spinner keys off the same savingStatusKey. */}
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {active.leadId && (
                      savingStatusKey === active.key
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        : <PipelineStatusSelect value={active.leadStatus} onValueChange={(status) => handleSetStatus(active, status)} />
                    )}
                    <EngagementPills reportOpenedAt={active.reportOpenedAt} siteVisitedAt={active.siteVisitedAt} geminiNamed={active.geminiNamed} geminiAnswers={active.geminiAnswers} />
                    <span className="text-[11px] text-muted-foreground">+{active.phone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* FULL LEAD DETAILS — opens the SAME rich dialog Outreach uses, as an overlay
                      over Inbox (audit, questionnaire, business info, mark-paid). No navigation:
                      the whole point is to see everything without leaving the thread. */}
                  {active.leadId && (
                    <button type="button" onClick={() => setDetailLeadId(active.leadId)} title="Open full lead details" aria-label="Open full lead details" className={HEADER_ICON_BTN}>
                      <ListChecks className="h-4 w-4" />
                    </button>
                  )}
                  {/* Run the AI audit WITHOUT leaving the Inbox: confirm → fire the chain's auto-audit
                      path (create-ai-audit + awaiting_audit pitch row → auto-send on completion).
                      Missing type/location → dimmed; click falls back to the wizard. In-flight → spinner. */}
                  {active.leadId && (
                    <button
                      type="button"
                      onClick={fireAuditFromInbox}
                      disabled={auditInFlight}
                      title={auditInFlight
                        ? 'Audit running — the pitch auto-sends on completion'
                        : auditInputsMissing
                          ? 'Needs business type/location — click to fill them in here (stays in the Inbox)'
                          : hasCompletedAudit
                            ? 'Re-run AI audit for this lead'
                            : 'Run AI audit for this lead (pitch auto-sends on completion)'}
                      aria-label="Run AI audit"
                      className={cn(HEADER_ICON_BTN, auditInputsMissing && !auditInFlight && 'opacity-50')}
                    >
                      {auditInFlight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </button>
                  )}
                  {/* Crawl site — free crawlability check + site info, stored on lead_crawl_checks.
                      Not run → runs it; already run → opens the popup; the dot flags an AI-visibility
                      fault (the same signal that gates audit_followup_fault). Same button as the
                      Outreach row. */}
                  {active.leadId && activeLead && (
                    <CrawlCheckButton
                      lead={{ id: activeLead.id, website: activeLead.website }}
                      crawl={crawlByLeadId.get(active.leadId) ?? null}
                      onDone={refetch}
                      className="self-center"
                      iconOnly
                    />
                  )}
                  {/* Google Maps — stored URL preferred, else built from place_id. */}
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" title="Open in Google Maps" aria-label="Open in Google Maps" className={HEADER_ICON_BTN}>
                      <MapPin className="h-4 w-4" />
                    </a>
                  )}
                  {websiteUrl && (
                    <a href={websiteUrl} target="_blank" rel="noreferrer" title="Open the business website" aria-label="Open website" className={HEADER_ICON_BTN}>
                      <Globe className="h-4 w-4" />
                    </a>
                  )}
                  {activeLead?.email && (
                    <a href={`mailto:${activeLead.email}`} title={`Email ${activeLead.email}`} aria-label="Email the business" className={HEADER_ICON_BTN}>
                      <Mail className="h-4 w-4" />
                    </a>
                  )}
                  {/* Sign-up link. Hidden entirely for a lead who has actually paid - same rule as the
                      card: sending an existing client back to checkout wastes their time, and
                      findable-checkout refuses it as already_client anyway.
                      The dot is NOT decoration. It is the only always-visible sign that this lead has
                      no trade stored, which means no baseline can run after they pay and the four-week
                      guarantee cannot be measured. Orange for that; amber for the cosmetic warnings. */}
                  {activeLead && signupLink && !signupLink.paid && (
                    <button
                      type="button"
                      onClick={copySignupLink}
                      aria-label={signupLink.blocking
                        ? `Copy sign-up link. Warning: ${signupLink.warnings.join('; ')}`
                        : 'Copy sign-up link'}
                      title={[
                        signupCopied ? 'Copied' : 'Copy sign-up link',
                        onboardingUrlLabel(activeLead.id, activeLead.business_name),
                        ...(signupLink.warnings.length ? signupLink.warnings.map((w) => `! ${w}`) : []),
                      ].join('\n')}
                      className={cn(HEADER_ICON_BTN, 'relative', signupLink.blocking && 'text-orange-400 hover:text-orange-300')}
                    >
                      {signupCopied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
                      {signupLink.warnings.length > 0 && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-1 ring-background',
                            signupLink.blocking ? 'bg-orange-500' : 'bg-amber-400',
                          )}
                        />
                      )}
                    </button>
                  )}
                  {/* Secondary fallback: open the chat in the WhatsApp app (wa.me). */}
                  <a href={`https://wa.me/${active.phone}`} target="_blank" rel="noreferrer" title="Open this chat in the WhatsApp app" aria-label="Open in WhatsApp app" className={HEADER_ICON_BTN}>
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  {/* CLIENT WELCOME PACK — the SAME component the Outreach lead modal renders, so
                      there is exactly one pack code path: it resolves this lead's own audit and calls
                      downloadWelcomePack itself. Only the styling differs (this row is 7x7 icon
                      squares sharing HEADER_ICON_BTN), which is why the class is passed in rather
                      than a second button being written. Label carried by title/aria-label, as every
                      sibling in this row does. */}
                  {active.leadId && (
                    <WelcomePackButton
                      leadId={active.leadId}
                      businessName={activeLead?.business_name ?? active.label ?? 'this client'}
                      className={HEADER_ICON_BTN}
                      iconOnly
                    />
                  )}
                  {/* Remove from inbox → sets the lead to Closed (hidden here; stays in Outreach). */}
                  {active.leadId && (
                    <button type="button" onClick={() => handleRemoveFromInbox(active)} disabled={removingKey === active.key} title="Remove from inbox (mark Closed)" aria-label="Remove from inbox" className={cn(HEADER_ICON_BTN, 'hover:text-destructive')}>
                      {removingKey === active.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  )}
                  {win.open ? (
                    <span className="ml-1 flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
                      <Clock className="h-3 w-3" /> Window open · ~{win.hoursLeft}h left
                    </span>
                  ) : (
                    <span className="ml-1 flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> Window closed · template only
                    </span>
                  )}
                </div>
              </div>

              {/* Public audit-report state for this lead — the /a/<slug> is resolved strictly by
                  this lead's own record (auditReportByLeadId), so it can never show another
                  business's URL. Ready → Copy/Open; not yet → nudge to run an audit. */}
              {active.leadId && (
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px]">
                  {reportUrl ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-semibold text-green-600 dark:text-green-400">
                        <FileText className="h-3 w-3" /> Report ready
                      </span>
                      <button type="button" onClick={copyReportUrl} className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
                        {reportCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {reportCopied ? 'Copied' : 'Copy URL'}
                      </button>
                      <a href={reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
                        <ExternalLink className="h-3 w-3" /> Open
                      </a>
                    </>
                  ) : (
                    <span className="text-muted-foreground">No public report yet — run an audit for this lead.</span>
                  )}
                  {/* hook_followup — report sent, went quiet 3+ days. Right-aligned so it reads as a
                      follow-up action on the report, not part of the copy/open controls. */}
                  {hookState.hookSent.has(active.key) ? (
                    <span className="ml-auto italic text-muted-foreground">Hook follow-up sent</span>
                  ) : hookState.eligible.has(active.key) ? (
                    <button
                      type="button"
                      onClick={() => { setHookName(''); setHookOpen(true); }}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <MessageCircle className="h-3 w-3" /> Send hook follow-up
                    </button>
                  ) : null}
                  {/* contact_followup — opener got no reply, no report yet. Mutually exclusive with the
                      hook button above (hook needs a report; this needs none), so only one shows. */}
                  {contactState.contactSent.has(active.key) ? (
                    <span className="ml-auto italic text-muted-foreground">Contact follow-up sent</span>
                  ) : contactState.eligible.has(active.key) ? (
                    <button
                      type="button"
                      onClick={() => setContactOpen(true)}
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <MessageCircle className="h-3 w-3" /> Send contact follow-up
                    </button>
                  ) : null}
                </div>
              )}

              {/* Messages */}
              <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {thread.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground/60">No messages yet — send the first below.</p>
                ) : thread.map((m) => {
                  const templateSnapshot = m.message_type === 'template' ? parseTemplateSnapshot(m.template_snapshot) : null;
                  return (
                  <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-sm',
                      m.direction === 'outbound' ? 'bg-primary/90 text-primary-foreground' : 'bg-muted')}>
                      {m.direction === 'outbound' && templateSnapshot
                        ? <WhatsAppTemplateMessage snapshot={templateSnapshot} />
                        : <p className="whitespace-pre-wrap break-words">{bubbleReadable(m) || templateLabel(m.template_name)}</p>}
                      {m.direction === 'inbound' && <InboundMedia message={m} />}
                      <div className={cn('mt-0.5 flex items-center gap-1 text-[10px]',
                        m.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        <span>{relTime(m.created_at)}</span>
                        {m.message_type === 'template' && <span>· template</span>}
                        {m.direction === 'outbound' && (
                          <span>· {m.status === 'simulated' ? 'simulated' : m.status === 'failed' ? '⚠ failed' : m.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ); })}
              </div>

              {/* Reply box */}
              <div className="border-t border-border p-2.5">
                {win.open ? (
                  <div className="space-y-2">
                    {/* Quick-reply: insert a saved TEXT script (editable before send). */}
                    {textTemplates.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={sending}>
                            <MessageSquarePlus className="h-3.5 w-3.5" /> Quick reply
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 w-80 overflow-y-auto thin-scrollbar">
                          {textTemplates.map((t, i) => (
                            <DropdownMenuItem key={`${t.title}-${i}`} onClick={() => insertTemplate(t.content)} className="flex flex-col items-start gap-0.5">
                              <span className="text-xs font-medium">{t.title}</span>
                              <span className="line-clamp-2 whitespace-normal text-[11px] text-muted-foreground">
                                {fillTemplate(t.content, { businessName: activeBusinessName })}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {/* ⛔ KEYED BY CONVERSATION (+ the insert seed), so switching thread REMOUNTS it:
                        the outgoing instance flushes its draft under its own key on unmount and the
                        incoming one seeds from the new thread's draft. That is what stops a
                        half-typed message following you into someone else's conversation. */}
                    <InboxComposer
                      key={`${active.key}:${composerSeed}`}
                      convKey={active.key}
                      initialText={text}
                      sending={sending}
                      onPersist={persistDraft}
                      onSend={(bodyText) => doSend(false, bodyText)}
                    />
                    {/* Approved WhatsApp templates — SEPARATE from the free-text "Quick reply" above. */}
                    <div className="border-t border-border/60 pt-2">
                      <p className="mb-1 text-[11px] text-muted-foreground">Or send an approved WhatsApp template:</p>
                      {templatePicker}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      Outside the 24h window — free text isn’t allowed. Send an approved template{active.leadId ? '' : ' (needs a linked lead)'}:
                    </p>
                    {templatePicker}
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Inline missing-inputs prompt for the header audit button — the inbox is NEVER left.
          Prefilled from partial lead data; Run writes the values back to the lead
          (search_keyword/search_location, the wizard's write-back convention) then fires the
          audit with the auto-pitch queued. The wizard link stays as a small secondary option. */}
      <Dialog open={auditPromptOpen} onOpenChange={setAuditPromptOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Run audit for {activeLead?.business_name}</DialogTitle>
            <DialogDescription className="text-xs">
              This lead is missing its audit inputs. Fill them in — they're saved to the lead — and
              the audit runs right here (3 auto-generated questions; the report pitch auto-sends on
              completion).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Business type</label>
              <Input value={promptType} onChange={(e) => setPromptType(e.target.value)} placeholder="e.g. plumber, accountant" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Town / location</label>
              <Input value={promptLoc} onChange={(e) => setPromptLoc(e.target.value)} placeholder="e.g. Wisbech" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setAuditPromptOpen(false); navigate(`/ai-audit?leadId=${active?.leadId}`); }}>
              Open full audit page instead
            </Button>
            <Button size="sm" onClick={runAuditFromPrompt} disabled={!promptType.trim() || !promptLoc.trim()}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Run audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hook follow-up confirm — preview the exact message, prompt for a first name if the lead
          has none (saved to the lead before sending), then fire hook_followup. One per lead, both
          here (the button hides once sent) and on the server (pitchEverSent). */}
      <Dialog open={hookOpen} onOpenChange={setHookOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Send hook follow-up to {activeLead?.business_name}</DialogTitle>
            <DialogDescription className="text-xs">
              For a lead who got the report and went quiet ({HOOK_FOLLOWUP_MIN_DAYS}+ days, no reply). One per lead — it can’t be sent twice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {!hookExistingFirst && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Their first name — optional (leave blank to send “Hi there”; if you enter one it’s saved to the lead)</label>
                <Input value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="e.g. Ronnie" />
              </div>
            )}
            <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px]">
              {hookFollowupBody(hookEffectiveFirst, activeLead?.business_name ?? '')}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setHookOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={hookSending} onClick={() => void sendHookFollowup()}>
              {hookSending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact follow-up confirm — the earlier-stage nudge (opener got no reply, no report yet).
          One variable ({{1}} = business name), no first-name prompt. One per lead (server + button). */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Send contact follow-up to {activeLead?.business_name}</DialogTitle>
            <DialogDescription className="text-xs">
              For a lead who got the opener and never replied ({CONTACT_FOLLOWUP_MIN_DAYS}+ days), with a report already generated and ready to send the moment they reply. One per lead — it can’t be sent twice.
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 text-[11px]">
            {contactFollowupBody(activeLead?.business_name ?? '')}
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setContactOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={contactSending} onClick={() => void sendContactFollowup()}>
              {contactSending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Send it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk hook-follow-up QUEUE confirm — shows the count BEFORE anything is written, so a wave of
          hundreds is never one accidental click. Queues (marker column); the queue paces the sends. */}
      {/* ══ BULK SEND CONFIRM ═══════════════════════════════════════════════════════════════════════
          These messages go to real businesses the instant this is pressed and cannot be recalled,
          so the dialog states the three facts that decide it: WHICH template, HOW MANY, and WHO IS
          BEING SKIPPED and why. The skipped list is spelled out rather than counted — "12 skipped"
          is how you send to the wrong twelve and never find out. */}
      <Dialog open={bulkConfirm} onOpenChange={(o) => { if (!bulkBusy) setBulkConfirm(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Send “{WHATSAPP_TEMPLATES.find((t) => t.value === bulkTemplate)?.label ?? bulkTemplate}” to {bulkPlan.send.length} business{bulkPlan.send.length === 1 ? '' : 'es'}?
            </DialogTitle>
            <DialogDescription className="text-xs">
              They go out <strong>now</strong>, one after another — not through the daily queue.
              Everyone here has already replied to you, so this is a continuation, not cold outreach.
              A business that has already had this template will be refused by the server and listed
              afterwards, not sent it twice.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-56 space-y-2 overflow-y-auto text-xs">
            <div>
              <p className="mb-1 font-medium">Will be sent ({bulkPlan.send.length})</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {bulkPlan.send.slice(0, 12).map((t) => <li key={t.key} className="truncate">· {t.label}</li>)}
                {bulkPlan.send.length > 12 && <li>· and {bulkPlan.send.length - 12} more</li>}
              </ul>
            </div>
            {bulkPlan.skipped.length > 0 && (
              <div>
                <p className="mb-1 font-medium text-amber-600 dark:text-amber-500">Skipped ({bulkPlan.skipped.length})</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {groupSkips(bulkPlan.skipped).map((g) => (
                    <li key={g.reason} className="truncate">· {g.count} — {g.reason} ({g.labels.slice(0, 3).join(', ')}{g.labels.length > 3 ? '…' : ''})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => setBulkConfirm(false)}>Cancel</Button>
            <Button size="sm" disabled={bulkBusy || bulkPlan.send.length === 0} onClick={() => void runBulkSend()}>
              {bulkBusy
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Sending {bulkProgress.done}/{bulkProgress.total}</>
                : `Send ${bulkPlan.send.length} now`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hookQueueConfirm} onOpenChange={(o) => { if (!hookQueuing) setHookQueueConfirm(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Queue {hookSelected.size} lead{hookSelected.size === 1 ? '' : 's'} for hook follow-up?</DialogTitle>
            <DialogDescription className="text-xs">
              These are added to the WhatsApp send queue — <strong>nothing sends now</strong>. They pace out one at a
              time within the 120/day cap and the 07:00–21:30 UK window — about {estHookDays(hookSelected.size)} day
              {estHookDays(hookSelected.size) === 1 ? '' : 's'} to clear (shared with your other sends). Each lead is
              re-checked at send time: one per lead, paid customers skipped, only genuine no-reply report leads;
              a blank name sends “Hi there”.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setHookQueueConfirm(false)} disabled={hookQueuing}>Cancel</Button>
            <Button size="sm" onClick={() => void queueHookFollowups()} disabled={hookQueuing || hookSelected.size === 0}>
              {hookQueuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Queue {hookSelected.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* THE RICH LEAD DIALOG, over Inbox. Same LeadDetailDialog as Outreach (one component, no
          fork); the wrapper mounts useOutreach only while open and reflects a status change back
          onto Inbox's own pill via patchLeadStatus, so the two pages never disagree. */}
      <LeadDetailFromInbox
        leadId={detailLeadId}
        open={!!detailLeadId}
        onOpenChange={(o) => { if (!o) setDetailLeadId(null); }}
        onStatusPatched={patchLeadStatus}
      />
    </div>
  );
};

export default Inbox;
