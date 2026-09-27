import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Globe, Loader2, MapPin, Phone, Send, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useLeadActivity, useSalesActions, useSalesLead, useTeamDirectory } from '@/hooks/useSalesCrm';
import { normalizeWaNumber, windowFor } from '@/hooks/useInbox';
import { hookVisibilityQueryKey, useHookVisibility } from '@/hooks/useHookVisibility';
import { HookVisibilityCard } from '@/components/HookVisibilityCard';
import { VoiceNoteRecorder } from '@/components/VoiceNoteRecorder';
import { VoiceNoteScriptButton } from '@/components/VoiceNoteScriptButton';
import { ColdCallPlaybookButton } from '@/components/ColdCallPlaybook';
import { WhatsAppTemplateMessage } from '@/components/WhatsAppTemplateMessage';
import { InboundMedia, isPlayableVoice } from '@/components/WhatsAppMedia';
import { OwnerLine, OwnerAvatar } from '@/components/OwnerBadge';
import { parseTemplateSnapshot } from '@/lib/whatsappTemplateSnapshot';
import { voiceSendErrorMessage } from '@/lib/voiceNote';
import type { VoiceClip } from '@/lib/voiceRecorderState';
import { isAggregatorUrl } from '@/lib/aggregators';
import { OUTREACH_HOOK_QUESTIONS } from '@/lib/auditQuestionCounts';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import {
  ACTIVITY_LABEL, CALL_OUTCOMES, NEXT_ACTION_OPTIONS, SALES_SETTABLE_LABEL, SALES_SETTABLE_STATUSES, SALES_STAGE_LABEL,
  WEBSITE_CONTROL_OPTIONS, refusalText, salesStageOf,
} from '@/lib/salesCrm';
import { cn } from '@/lib/utils';

/* ONE LEAD, FOR THE PERSON WORKING IT (multi-user, 2026-09-27).
 *
 * ⛔ Reads only what the server lets the caller read: the lead from sales_leads (no money columns,
 * never a client), messages and hook audits through their sales RLS policies, activity through
 * lead_activity's. Every send goes through send-whatsapp-message / send-whatsapp-voice, which check
 * the assignment again. Internal notes are activity rows: they are never sent to the lead. */

interface Msg {
  id: string; created_at: string; direction: 'inbound' | 'outbound'; body: string | null; message_type: string | null;
  template_name: string | null; status: string | null; template_snapshot: unknown; sent_by_user_id: string | null;
  media_path: string | null; media_filename: string | null; error: string | null;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export default function SalesLead() {
  const { leadId } = useParams();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role } = useSubscription();
  const { data: lead, isLoading } = useSalesLead(leadId);
  const activity = useLeadActivity(leadId);
  const team = useTeamDirectory();
  const actions = useSalesActions();
  const phone = lead?.phone ? normalizeWaNumber(lead.phone, lead.country) : null;

  const messages = useQuery({
    queryKey: ['sales', 'messages', leadId, phone],
    enabled: !!leadId,
    refetchInterval: 20_000,
    queryFn: async () => {
      const filter = phone ? `lead_id.eq.${leadId},phone.eq.${phone}` : `lead_id.eq.${leadId}`;
      const { data, error } = await supabase.from('whatsapp_messages')
        .select('id, created_at, direction, body, message_type, template_name, status, template_snapshot, sent_by_user_id, media_path, media_filename, error' as never)
        .or(filter).order('created_at', { ascending: true }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Msg[];
    },
  });
  const lastInbound = useMemo(() => [...(messages.data ?? [])].reverse().find((m) => m.direction === 'inbound')?.created_at ?? null, [messages.data]);
  const win = windowFor(lastInbound);

  const [text, setText] = useState('');
  const [template, setTemplate] = useState('');
  const [preview, setPreview] = useState<{ body?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  const [callNote, setCallNote] = useState('');
  const hook = useHookVisibility(leadId ?? null).data;
  const [hookBusy, setHookBusy] = useState(false);

  if (isLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!lead) {
    return (
      <div className="p-6 space-y-2">
        <p className="text-sm">This lead is not assigned to you, or it no longer exists.</p>
        <Link to="/sales" className="text-primary text-sm hover:underline">Back to My leads</Link>
      </div>
    );
  }

  const owner = lead.assigned_to_user_id ? team.byId.get(lead.assigned_to_user_id) : undefined;
  const stage = salesStageOf(lead.status);
  const refreshMessages = () => qc.invalidateQueries({ queryKey: ['sales', 'messages', leadId] });
  const done = (r: { ok: boolean; error?: string }, okText: string) => {
    if (r.ok) toast({ title: okText });
    else toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' });
  };

  const sendText = async () => {
    if (!phone || !text.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', { body: { phone, lead_id: lead.id, country: lead.country, body: text.trim() } });
      if (error || !data?.ok) { toast({ title: 'Not sent', description: data?.error ?? error?.message ?? 'Try again', variant: 'destructive' }); return; }
      setText('');
      toast({ title: data.simulated ? 'Simulated (test mode)' : 'Sent' });
      void refreshMessages();
    } finally { setBusy(false); }
  };

  const previewTemplate = async () => {
    if (!phone || !template) return;
    setPreview(null);
    const { data, error } = await supabase.functions.invoke('send-whatsapp-message', { body: { mode: 'dry_run', phone, lead_id: lead.id, country: lead.country, template_name: template } });
    if (error || !data?.ok) setPreview({ error: data?.error ?? error?.message ?? 'refused' });
    else setPreview({ body: data.body ?? '(template)' });
  };

  const sendTemplate = async () => {
    if (!phone || !template) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', { body: { phone, lead_id: lead.id, country: lead.country, template_name: template } });
      if (error || !data?.ok) { toast({ title: 'Not sent', description: data?.error ?? error?.message ?? 'Try again', variant: 'destructive' }); return; }
      setTemplate(''); setPreview(null);
      toast({ title: data.simulated ? 'Simulated (test mode)' : 'Template sent' });
      void refreshMessages();
    } finally { setBusy(false); }
  };

  const sendVoice = async (clip: VoiceClip): Promise<{ ok: boolean; error?: string; retryable?: boolean }> => {
    if (!phone) return { ok: false, error: 'no_phone', retryable: false };
    const form = new FormData();
    form.append('lead_id', lead.id);
    form.append('phone', phone);
    form.append('send_id', crypto.randomUUID());
    form.append('audio', clip.blob, clip.mime === 'audio/ogg' ? 'voice-note.ogg' : 'voice-note.webm');
    const { data, error } = await supabase.functions.invoke('send-whatsapp-voice', { body: form });
    if (error || !data?.ok) {
      let body: { error?: string; reason?: string; retryable?: boolean } | null = null;
      try { body = await (error as { context?: Response } | null)?.context?.json(); } catch { body = null; }
      const code = body?.error ?? data?.error ?? 'send_failed';
      toast({ title: 'Voice note not sent', description: voiceSendErrorMessage(code, body?.reason ?? data?.reason), variant: 'destructive' });
      return { ok: false, error: code, retryable: body?.retryable ?? data?.retryable ?? true };
    }
    toast({ title: data.simulated ? 'Simulated (test mode)' : 'Voice note sent' });
    void refreshMessages();
    return { ok: true };
  };

  const runHook = async () => {
    const bizType = (hook?.audit?.business_type || lead.search_keyword || lead.category || '').trim();
    const loc = (hook?.audit?.location_text || lead.derived_town || lead.search_location || '').trim();
    if (!bizType || !loc) { toast({ title: 'Need a trade and a town', description: 'This lead has no trade or town to check.', variant: 'destructive' }); return; }
    if (!window.confirm(`Run an AI visibility check for ${lead.business_name}? Nothing is sent to the lead.`)) return;
    setHookBusy(true);
    try {
      const website = lead.website && !isAggregatorUrl(lead.website) ? lead.website : undefined;
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          lead_id: lead.id, business_name: lead.business_name, business_type: bizType, location_text: loc,
          country: lead.country ?? null, website, has_website: !!website, question_count: OUTREACH_HOOK_QUESTIONS,
          hook_audit: true, fresh_audit: true,
        },
      });
      if (error || !data?.ok) { toast({ title: "Couldn't start the check", description: data?.error ?? error?.message ?? 'Try again', variant: 'destructive' }); return; }
      await qc.invalidateQueries({ queryKey: hookVisibilityQueryKey(lead.id) });
      toast({ title: 'AI visibility check started', description: 'The result appears here in a few minutes.' });
    } finally { setHookBusy(false); }
  };

  const actorName = (id: string | null) => (id ? team.byId.get(id)?.display_name ?? 'Someone' : 'System');

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <Link to={role === 'admin' ? '/inbox' : '/sales'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>

      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <div className="mr-auto min-w-0">
            <h1 className="text-lg font-semibold">{lead.business_name}</h1>
            <p className="text-sm text-muted-foreground">{[lead.search_keyword ?? lead.category, lead.derived_town ?? lead.search_location].filter(Boolean).join(' · ')}</p>
          </div>
          <Badge variant="secondary">{stage === 'other' ? (lead.status ?? '—') : SALES_STAGE_LABEL[stage]}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <OwnerLine ownerName={owner?.display_name} avatarUrl={owner?.avatar_url} />
          {lead.phone && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${lead.phone}`}><Phone className="h-3.5 w-3.5" />{lead.phone}</a>}
          {lead.website && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={lead.website} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" />Website</a>}
          {lead.google_maps_url && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={lead.google_maps_url} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" />Google profile</a>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <VoiceNoteScriptButton leadId={lead.id} compact />
          <ColdCallPlaybookButton leadId={lead.id} compact />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <HookVisibilityCard leadId={lead.id} onRunNew={() => void runHook()} runNewBusy={hookBusy} />

          <Card className="p-0 overflow-hidden">
            <div className="border-b px-3 py-2 text-sm font-medium flex items-center gap-2">
              Conversation
              <span className={cn('text-xs', win.open ? 'text-emerald-500' : 'text-muted-foreground')}>
                {win.open ? `reply window open · ${win.hoursLeft}h left` : 'reply window closed — templates only'}
              </span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
              {(messages.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
              {(messages.data ?? []).map((m) => {
                const snap = parseTemplateSnapshot(m.template_snapshot);
                return (
                  <div key={m.id} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.direction === 'outbound' ? 'ml-auto bg-primary/15' : 'bg-muted')}>
                    {snap ? <WhatsAppTemplateMessage snapshot={snap} />
                      : isPlayableVoice(m) ? null
                      : <div className="whitespace-pre-wrap">{m.body ?? (m.message_type === 'audio' ? '[voice note]' : `[${m.message_type ?? 'message'}]`)}</div>}
                    {(m.direction === 'inbound' || m.message_type === 'audio') && <InboundMedia message={m} />}
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {fmt(m.created_at)}{m.direction === 'outbound' ? ` · ${m.sent_by_user_id ? actorName(m.sent_by_user_id) : 'queue'} · ${m.status ?? ''}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
            {phone ? (
              <div className="border-t p-3 space-y-3">
                <div className="flex gap-2">
                  <Textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!win.open || busy} rows={2}
                    placeholder={win.open ? 'Reply…' : 'The 24-hour reply window is closed — send a template below.'} />
                  <Button disabled={!win.open || busy || !text.trim()} onClick={() => void sendText()}><Send className="h-4 w-4" /></Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={template} onValueChange={(v) => { setTemplate(v); setPreview(null); }}>
                    <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Approved template…" /></SelectTrigger>
                    <SelectContent>{WHATSAPP_TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!template} onClick={() => void previewTemplate()}>Preview</Button>
                  <Button size="sm" disabled={!template || !preview?.body || busy} onClick={() => void sendTemplate()}>Send template</Button>
                  <VoiceNoteRecorder disabled={!win.open || busy} onActiveChange={() => undefined} onSend={sendVoice} />
                </div>
                {preview && (preview.error
                  ? <p className="text-xs text-destructive">Would be refused: {preview.error}</p>
                  : <p className="text-xs whitespace-pre-wrap rounded border bg-muted/40 p-2">{preview.body}</p>)}
              </div>
            ) : <p className="border-t p-3 text-sm text-muted-foreground">No phone number on this lead.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Stage</div>
            <Select value={(SALES_SETTABLE_STATUSES as readonly string[]).includes(lead.status ?? '') ? lead.status ?? '' : ''}
              onValueChange={async (v) => done(await actions.stage.mutateAsync({ leadId: lead.id, status: v }), 'Stage saved')}>
              <SelectTrigger className="h-8"><SelectValue placeholder={stage === 'other' ? (lead.status ?? 'Set stage') : SALES_STAGE_LABEL[stage]} /></SelectTrigger>
              <SelectContent>{SALES_SETTABLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{SALES_SETTABLE_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">“Won” hands the lead to the admin to onboard. It does not take payment or start delivery.</p>
          </Card>

          <FollowUpCard lead={lead} onSave={async (a) => done(await actions.followUp.mutateAsync({ leadId: lead.id, ...a }), 'Follow-up saved')} />

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Call booked</div>
            <Input type="datetime-local" defaultValue={lead.call_booked_at ? toLocalInput(lead.call_booked_at) : ''}
              onBlur={async (e) => {
                const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                if (v === (lead.call_booked_at ? new Date(lead.call_booked_at).toISOString() : null)) return;
                done(await actions.callBooked.mutateAsync({ leadId: lead.id, at: v }), v ? 'Call booked' : 'Call cleared');
              }} />
          </Card>

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Record a call</div>
            <Select value={callOutcome} onValueChange={setCallOutcome}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Outcome…" /></SelectTrigger>
              <SelectContent>{CALL_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="Note (optional)" />
            <Button size="sm" disabled={!callOutcome} onClick={async () => {
              const r = await actions.call.mutateAsync({ leadId: lead.id, outcome: callOutcome, note: callNote.trim() || null });
              done(r, 'Call recorded'); if (r.ok) { setCallOutcome(''); setCallNote(''); }
            }}>Save call</Button>
          </Card>

          <Card className="p-3 space-y-2">
            <div className="text-sm font-medium">Who controls the website?</div>
            <Select value={lead.website_control ?? ''} onValueChange={async (v) => done(await actions.websiteControl.mutateAsync({ leadId: lead.id, value: v, note: lead.website_control_note }), 'Saved')}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Not asked yet" /></SelectTrigger>
              <SelectContent>{WEBSITE_CONTROL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input defaultValue={lead.website_control_note ?? ''} placeholder="Detail, e.g. agency contract ends November"
              onBlur={async (e) => {
                const v = e.target.value.trim() || null;
                if (v === (lead.website_control_note ?? null)) return;
                done(await actions.websiteControl.mutateAsync({ leadId: lead.id, value: lead.website_control, note: v }), 'Saved');
              }} />
          </Card>

          <Card className="p-3 space-y-2 border-amber-500/40">
            <div className="text-sm font-medium flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Internal note <span className="text-[10px] uppercase tracking-wide text-amber-500">never sent</span></div>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Spoke to owner, agency runs the site, call again next month…" />
            <Button size="sm" disabled={!note.trim()} onClick={async () => {
              const r = await actions.note.mutateAsync({ leadId: lead.id, body: note });
              done(r, 'Note added'); if (r.ok) setNote('');
            }}>Add note</Button>
          </Card>
        </div>
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Activity</h2>
        <ul className="space-y-2 text-sm">
          {(activity.data ?? []).map((a) => (
            <li key={a.id} className="flex gap-2">
              <OwnerAvatar name={actorName(a.actor_user_id)} avatarUrl={a.actor_user_id ? team.byId.get(a.actor_user_id)?.avatar_url : null} className="mt-0.5" />
              <div className="min-w-0">
                <div><span className="font-medium">{ACTIVITY_LABEL[a.kind] ?? a.kind}</span> <span className="text-muted-foreground">· {actorName(a.actor_user_id)} · {fmt(a.created_at)}</span></div>
                {a.kind === 'note' && <div className="whitespace-pre-wrap text-muted-foreground">{a.body}</div>}
                {a.kind === 'call_outcome' && <div className="text-muted-foreground">{CALL_OUTCOMES.find((o) => o.value === a.data?.outcome)?.label ?? String(a.data?.outcome ?? '')}{a.body ? ` — ${a.body}` : ''}</div>}
                {a.kind === 'stage_changed' && <div className="text-muted-foreground">{String(a.data?.from ?? '—')} → {String(a.data?.to ?? '—')}</div>}
                {a.kind === 'follow_up_set' && <div className="text-muted-foreground">{String(a.data?.next_action ?? '')}{a.data?.date ? ` on ${String(a.data.date)}` : ''}{a.data?.note ? ` — ${String(a.data.note)}` : ''}</div>}
                {(a.kind === 'lead_assigned' || a.kind === 'lead_unassigned') && <div className="text-muted-foreground">{actorName((a.data?.from as string) ?? null)} → {a.data?.to ? actorName(a.data.to as string) : 'Unassigned'}</div>}
              </div>
            </li>
          ))}
          {(activity.data ?? []).length === 0 && <li className="text-muted-foreground">Nothing recorded yet.</li>}
        </ul>
        {lead.google_maps_url && <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={lead.google_maps_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Open on Google</a>}
      </Card>
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FollowUpCard({ lead, onSave }: {
  lead: { next_action: string | null; next_action_date: string | null; next_action_note: string | null };
  onSave: (a: { nextAction: string; date: string | null; note: string | null }) => Promise<void>;
}) {
  const [nextAction, setNextAction] = useState(NEXT_ACTION_OPTIONS.some((o) => o.value === lead.next_action) ? lead.next_action ?? 'none' : 'none');
  const [date, setDate] = useState(lead.next_action_date ?? '');
  const [note, setNote] = useState(lead.next_action_note ?? '');
  return (
    <Card className="p-3 space-y-2">
      <div className="text-sm font-medium">Next action</div>
      <Select value={nextAction} onValueChange={setNextAction}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>{NEXT_ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. after their website contract ends" />
      <Button size="sm" onClick={() => void onSave({ nextAction, date: date || null, note: note.trim() || null })}>Save follow-up</Button>
    </Card>
  );
}
