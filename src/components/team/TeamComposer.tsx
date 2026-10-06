import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, Loader2, Search, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Callout, DialogHero, SubSection, TONE } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import {
  newClientKey, useAssignLeadWithBrief, useLeadBrief, useLeadSearch, useRecipientsPreview, useTeamBoardAdmin, type AdminPost,
} from '@/hooks/useTeamBoard';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import { nextActionText, nextActionViewOf } from '@/lib/nextActionView';
import {
  CHANNEL_LINK, COMPOSER_KINDS, KIND_HINT, KIND_LABEL, TEMPLATE_CHANNELS, boardRefusalText, isTaskKind,
  type TeamPostKind, type TeamPriority, type TemplateChannel,
} from '@/lib/teamBoard';
import { cn } from '@/lib/utils';

/* ══ "SEND TO SALES TEAM" — the admin's one composer (2026-10-01, docs/sales-team-board.md) ═════════
   One form whose fields follow the chosen type. The preview says who receives it, whether it is a task,
   whether a lead changes owner, and that each person is notified — before anything is sent.
   ⛔ "Sent" is said only after the server answered ok (with its own recipient / notified counts).
   ⛔ A template update never sends, approves or registers anything at Meta: WhatsApp choices come from
      the approved registry (WHATSAPP_TEMPLATES); any other script says Approved or Draft on its face.
   ⛔ Lead assignment runs assign_lead_with_brief — the same move as the Inbox's owner picker. */

export interface ComposerSeed {
  kind?: TeamPostKind; draft?: AdminPost | null;
  /** A clarification to a sent post: same recipients, linked back to it. */
  followUpOf?: AdminPost | null;
  lead?: { id: string; name: string | null } | null;
  /** Why it needs doing (the attention item's words) — shown in the dialog and kept on the task. */
  reason?: string | null;
}

const PRIORITIES: { value: TeamPriority; label: string }[] = [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'low', label: 'Low' }];

export function TeamComposer({ open, onOpenChange, seed }: { open: boolean; onOpenChange: (v: boolean) => void; seed?: ComposerSeed | null }) {
  const { toast } = useToast();
  const admin = useTeamBoardAdmin(false);
  const assign = useAssignLeadWithBrief();
  const team = useTeamDirectory();
  const people = useRecipientsPreview(open);
  const [kind, setKind] = useState<TeamPostKind>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'selected' | 'everyone'>('selected');
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TeamPriority>('normal');
  const [link, setLink] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [channel, setChannel] = useState<TemplateChannel>('whatsapp');
  const [templateName, setTemplateName] = useState('');
  const [approval, setApproval] = useState<'approved' | 'draft'>('approved');
  const [leadPick, setLead] = useState<{ id: string; name: string | null; owner: string | null; action: string | null; actionDate: string | null; actionTime?: string | null } | null>(null);
  const [leadTerm, setLeadTerm] = useState('');
  const [key, setKey] = useState(newClientKey);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const draftId = seed?.draft?.id ?? null;
  /* The lead's owner and Next Action are always read LIVE (a seeded or searched copy can be stale). */
  const brief = useLeadBrief(leadPick?.id ?? null);
  const lead = leadPick && brief.data ? { ...leadPick, name: brief.data.business_name ?? leadPick.name, owner: brief.data.assigned_to_user_id, action: brief.data.next_action ?? null, actionDate: brief.data.next_action_date ?? null, actionTime: brief.data.next_action_time ?? null } : leadPick;

  // Every open starts clean (or from the draft / clarification it was opened for), with a new key.
  useEffect(() => {
    if (!open) return;
    const d = seed?.draft ?? null; const f = seed?.followUpOf ?? null; const det = (d?.details ?? {}) as Record<string, unknown>;
    setKind(d?.kind ?? (f ? 'custom' : seed?.kind ?? 'announcement'));
    setTitle(d?.title ?? (f ? `Clarification: ${f.title}` : '')); setBody(d?.body ?? '');
    setAudience(d?.audience ?? 'selected'); setPicked(d?.recipient_ids ?? f?.recipient_ids ?? []);
    setDue(d?.due_date ?? ''); setPriority(d?.priority ?? 'normal'); setLink(d?.link ?? '');
    setCategory(String(det.category ?? '')); setLocation(String(det.location ?? ''));
    setChannel((det.channel as TemplateChannel) ?? 'whatsapp'); setTemplateName(String(det.template_name ?? ''));
    setApproval(det.approval === 'draft' ? 'draft' : 'approved');
    setLead(d?.lead ? { id: d.lead.id, name: d.lead.name, owner: d.lead.owner, action: d.lead.next_action ?? null, actionDate: d.lead.next_action_date ?? null, actionTime: d.lead.next_action_time ?? null }
      : seed?.lead ? { id: seed.lead.id, name: seed.lead.name, owner: null, action: null, actionDate: null } : null);
    setLeadTerm(''); setKey(newClientKey()); setConfirming(false);
  }, [open, seed]);

  const sales = people.data ?? [];
  const everyone = sales.filter((p) => !p.test);
  const isAssign = kind === 'lead_assignment';
  const recipients = isAssign ? picked.slice(0, 1) : audience === 'everyone' ? everyone.map((p) => p.user_id) : picked;
  const names = recipients.map((id) => sales.find((p) => p.user_id === id)?.name ?? team.byId.get(id)?.display_name ?? 'someone');
  const search = useLeadSearch(leadTerm, open && (isAssign || kind === 'task') && !leadPick);
  const ownerName = (id: string | null) => (id ? team.byId.get(id)?.display_name ?? 'someone' : 'Nobody');

  const waTemplate = WHATSAPP_TEMPLATES.find((t) => t.value === templateName);
  const autoTitle = kind === 'targeting' ? `Focus: ${[category, location].filter(Boolean).join(' · ') || '…'}`
    : kind === 'template_update' ? `${approval === 'draft' ? 'Draft' : 'New'} ${TEMPLATE_CHANNELS.find((c) => c.value === channel)?.label ?? ''} template: ${waTemplate?.label ?? (templateName || '…')}`
    : isAssign ? (lead?.name ?? 'A lead') : '';
  const effectiveTitle = (title.trim() || autoTitle).trim();

  const problems: string[] = [];
  if (!effectiveTitle || effectiveTitle.endsWith('…')) problems.push(isAssign ? 'Pick the lead' : 'Give it a title');
  if (recipients.length === 0) problems.push(audience === 'everyone' && !isAssign ? 'Nobody real is on the sales team yet — test accounts are left out of Everyone. Pick them by name to test.' : 'Pick who receives it');
  if (isAssign && !lead) problems.push('Pick the lead to assign');
  if (leadPick && brief.isLoading) problems.push('Checking who holds the lead…');
  if (isAssign && lead && recipients[0] && lead.owner === recipients[0]) problems.push(`${ownerName(lead.owner)} already holds this lead — nothing would change. Send a Task with the lead linked instead.`);
  if (kind === 'template_update' && channel === 'whatsapp' && approval === 'approved' && !waTemplate) problems.push('Pick the approved WhatsApp template');
  if (kind === 'task' && lead && (recipients.length !== 1 || lead.owner !== recipients[0])) problems.push(`A task linked to ${lead.name ?? 'a lead'} can go only to ${ownerName(lead.owner)}, who holds it`);
  if (link && (!link.startsWith('/') || link.startsWith('//'))) problems.push('A link must be a page inside LeadFinderOS, starting with /');

  const details = useMemo(() => {
    if (kind === 'targeting') return { category: category.trim() || undefined, location: location.trim() || undefined, priority };
    if (kind === 'template_update') return { channel, approval: channel === 'whatsapp' && waTemplate ? 'approved' : approval, template_name: templateName.trim() || undefined, template_label: waTemplate?.label };
    return {};
  }, [kind, category, location, priority, channel, approval, templateName, waTemplate]);

  const submit = async (publish: boolean) => {
    if (publish && (isAssign || recipients.length > 1 || isTaskKind(kind)) && !confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      if (isAssign) {
        const r = await assign.mutateAsync({ leadId: lead!.id, to: recipients[0], note: body.trim() || null, due: due || null, reason: seed?.reason ?? null, clientKey: key });
        if (!r.ok) { toast({ title: 'Not assigned', description: boardRefusalText(r.error), variant: 'destructive' }); return; }
        if (r.unchanged) { toast({ title: `Already with ${names[0]}`, description: 'Nothing changed — no task, no notice.' }); return; }
        toast({ title: `Assigned to ${names[0]}`, description: r.notified ? 'They were notified, and it is on their Team board with your instructions.' : 'Moved and on their board. No notice was recorded — tell them yourself.' });
        onOpenChange(false); return;
      }
      const r = await admin.save.mutateAsync({
        id: draftId, kind: kind as Exclude<TeamPostKind, 'lead_assignment'>, title: effectiveTitle, body: body.trim() || null, details,
        link: link.trim() || (kind === 'template_update' ? CHANNEL_LINK[channel] : null), leadId: lead?.id ?? null,
        due: kind === 'task' ? due || null : null, priority: kind === 'task' || kind === 'targeting' ? priority : null,
        audience: isAssign ? 'selected' : audience, recipients: audience === 'everyone' ? [] : picked, publish, clientKey: key, followUpOf: seed?.followUpOf?.id ?? null,
      });
      if (!r.ok) { toast({ title: publish ? 'Not sent' : 'Not saved', description: boardRefusalText(r.error), variant: 'destructive' }); return; }
      if (!publish) { toast({ title: 'Draft saved', description: 'Nobody sees it until you send it.' }); onOpenChange(false); return; }
      const nr = Number(r.recipients ?? 0); const nn = Number(r.notified ?? 0);
      toast({ title: r.duplicate ? 'Already sent' : `Sent to ${nr} ${nr === 1 ? 'person' : 'people'}`, description: r.duplicate ? 'That send had already gone — nothing was sent twice.' : nn === nr ? 'Each was notified.' : `${nn} of ${nr} notified.` });
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto">
        <DialogHero icon={Send} tone="blue" title={draftId ? 'Edit draft' : seed?.followUpOf ? 'Send a clarification' : 'Send to sales team'} subtitle={KIND_HINT[kind]} />

        <div className="space-y-3 text-sm">
          {!seed?.followUpOf && (
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type">
              {COMPOSER_KINDS.filter((k) => !draftId || k !== 'lead_assignment').map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setConfirming(false); }}
                  className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition', kind === k ? cn(TONE.blue.soft, TONE.blue.text, TONE.blue.ring) : 'ring-border/70 text-muted-foreground hover:text-foreground')}>{KIND_LABEL[k]}</button>
              ))}
            </div>
          )}

          {/* Who */}
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-muted-foreground">{isAssign ? 'Assign to' : 'Send to'}</legend>
            {!isAssign && !seed?.followUpOf && (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={audience === 'everyone'} onCheckedChange={(v) => setAudience(v ? 'everyone' : 'selected')} />
                Everyone in the sales team {people.isSuccess && <span className="text-muted-foreground">({everyone.length}{sales.length > everyone.length ? `; test accounts left out` : ''})</span>}
              </label>
            )}
            {people.isLoading ? <p className="text-xs text-muted-foreground">Loading the team…</p>
              : sales.length === 0 ? <p className="text-xs text-muted-foreground">There are no active salespeople. Invite one from Team.</p>
              : (audience === 'selected' || isAssign) && (
                <div className="flex flex-wrap gap-1.5">
                  {sales.map((p) => {
                    const on = recipients.includes(p.user_id);
                    return (
                      <button key={p.user_id} type="button" aria-pressed={on}
                        onClick={() => setPicked(isAssign ? [p.user_id] : on ? picked.filter((x) => x !== p.user_id) : [...picked, p.user_id])}
                        className={cn('rounded-full px-2.5 py-1 text-xs ring-1 ring-inset', on ? cn(TONE.blue.soft, TONE.blue.text, TONE.blue.ring, 'font-medium') : 'ring-border/70 hover:bg-muted')}>
                        {p.name}{p.test ? <span className="ml-1 text-[10px] text-muted-foreground">test</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
          </fieldset>

          {/* The lead (assignment: required; task: optional) */}
          {(isAssign || kind === 'task') && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">{isAssign ? 'Lead' : 'Linked lead (optional)'}</p>
              {lead ? (
                <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2 text-xs ring-1 ring-inset ring-border/50">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{lead.name ?? 'Lead'}</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => setLead(null)}>Change</button></div>
                  {seed?.reason && <p className="text-muted-foreground">Why: {seed.reason}</p>}
                  <p className="text-muted-foreground">Now with: {ownerName(lead.owner)}{(() => { const na = nextActionViewOf(lead.action, lead.actionDate, null, undefined, lead.actionTime); return na ? ` · Next action: ${nextActionText(na)}` : ' · No next action'; })()}</p>
                </div>
              ) : (
                <div>
                  <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-9 pl-8 text-sm" placeholder="Search by business name" value={leadTerm} onChange={(e) => setLeadTerm(e.target.value)} /></div>
                  {search.isFetching && <p className="mt-1 text-xs text-muted-foreground">Searching…</p>}
                  {(search.data ?? []).length > 0 && (
                    <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-border/60">
                      {(search.data ?? []).map((l) => (
                        <li key={l.id}><button type="button" className="flex w-full justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => setLead({ id: l.id, name: l.business_name, owner: l.assigned_to_user_id, action: l.next_action ?? null, actionDate: l.next_action_date ?? null, actionTime: l.next_action_time ?? null })}>
                          <span className="truncate font-medium">{l.business_name ?? 'Unnamed'}{l.is_archived ? ' (archived)' : ''}</span><span className="shrink-0 text-muted-foreground">{ownerName(l.assigned_to_user_id)}</span>
                        </button></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {kind === 'targeting' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input className="h-9 text-sm" placeholder="Business type, e.g. roofers" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Business category" />
              <Input className="h-9 text-sm" placeholder="Area, e.g. Manchester" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
              <PrioritySelect value={priority} onChange={setPriority} />
            </div>
          )}

          {kind === 'template_update' && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={channel} onValueChange={(v) => { setChannel(v as TemplateChannel); setTemplateName(''); }}>
                  <SelectTrigger className="h-9 text-sm" aria-label="Channel"><SelectValue /></SelectTrigger>
                  <SelectContent>{TEMPLATE_CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                {channel === 'whatsapp' ? (
                  <Select value={templateName} onValueChange={setTemplateName}>
                    <SelectTrigger className="h-9 text-sm" aria-label="Approved WhatsApp template"><SelectValue placeholder="Approved template" /></SelectTrigger>
                    <SelectContent>{WHATSAPP_TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <Input className="h-9 text-sm" placeholder="Script name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} aria-label="Script name" />
                )}
              </div>
              {channel !== 'whatsapp' && (
                <div className="flex gap-3 text-xs">
                  {(['approved', 'draft'] as const).map((a) => (
                    <label key={a} className="flex items-center gap-1.5"><input type="radio" name="approval" checked={approval === a} onChange={() => setApproval(a)} />{a === 'approved' ? 'Approved — use it' : 'Draft — for comment, not to use'}</label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Nothing is sent to any business and nothing is registered with Meta. WhatsApp lists only templates already approved.</p>
            </div>
          )}

          <Input className="h-9 text-sm" placeholder={autoTitle ? `Title (default: ${autoTitle})` : kind === 'task' ? 'Task, e.g. Research roofing businesses in Manchester' : 'Title'}
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} aria-label="Title" />
          <Textarea rows={4} className="text-sm" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={isAssign ? 'Instructions, e.g. They already have a quote. Check they are still interested. Do not run another audit unless needed.' : kind === 'template_update' ? 'When and how to use it (or paste the script)' : kind === 'task' ? 'Instructions' : 'Message'} aria-label="Message" />

          {(kind === 'task' || isAssign) && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground sm:col-span-1">{isAssign ? 'Next Action date (optional)' : 'Due (optional)'}
                <Input type="date" className="mt-0.5 h-9 text-sm" value={due} onChange={(e) => setDue(e.target.value)} /></label>
              {kind === 'task' && <label className="text-xs text-muted-foreground">Priority<PrioritySelect value={priority} onChange={setPriority} /></label>}
              {kind === 'task' && <label className="text-xs text-muted-foreground">Link in the app (optional)<Input className="mt-0.5 h-9 text-sm" placeholder="/find-leads" value={link} onChange={(e) => setLink(e.target.value)} /></label>}
            </div>
          )}
          {isAssign && <p className="text-[11px] text-muted-foreground">A date here becomes the lead's own Next Action date (the task shows that date — there is only one). Leave it blank to keep the lead's current Next Action.</p>}

          {/* The preview: exactly what will happen */}
          <div className={cn('rounded-2xl px-3.5 py-3 text-xs', TONE.blue.tint)} aria-live="polite">
            <SubSection title="What happens" icon={Eye} tone="blue" className="[&>header]:mb-1" />
            <ul className="space-y-0.5 text-muted-foreground">
              <li>To: {recipients.length ? names.join(', ') : 'nobody yet'}</li>
              <li>They see: <span className="text-foreground">{KIND_LABEL[kind]} — {effectiveTitle || '…'}</span></li>
              <li>{isTaskKind(kind) ? 'Creates a to-do on their Team board (they mark it in progress / done)' : 'Information only — no task'}</li>
              <li>{isAssign && lead ? `Lead ownership changes: ${ownerName(lead.owner)} → ${names[0] ?? '…'}. Conversation, notes, History, star, Next Action and audits stay with the lead. No message goes to the business.` : 'No lead changes owner. Nothing is sent to any business.'}</li>
              <li>Each person gets an in-app notification.</li>
            </ul>
          </div>
          {problems.length > 0 && <ul className={cn('space-y-0.5 text-xs', TONE.amber.text)}>{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          {confirming && problems.length === 0 && (
            <Callout tone="amber" icon={AlertTriangle} className="text-xs">
              {isAssign ? `Move ${lead?.name ?? 'this lead'} to ${names[0]}?` : `Send this ${isTaskKind(kind) ? 'task' : 'update'} to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}?`} Press the button again to confirm.
            </Callout>
          )}
        </div>

        <DialogFooter>
          {!isAssign && !seed?.followUpOf && <Button variant="outline" disabled={busy || !effectiveTitle} onClick={() => void submit(false)}>Save draft</Button>}
          <Button disabled={busy || problems.length > 0} onClick={() => void submit(true)}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{confirming ? (isAssign ? 'Confirm assignment' : 'Confirm send') : isAssign ? 'Assign' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrioritySelect({ value, onChange }: { value: TeamPriority; onChange: (v: TeamPriority) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TeamPriority)}>
      <SelectTrigger className="mt-0.5 h-9 text-sm" aria-label="Priority"><SelectValue /></SelectTrigger>
      <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label} priority</SelectItem>)}</SelectContent>
    </Select>
  );
}
