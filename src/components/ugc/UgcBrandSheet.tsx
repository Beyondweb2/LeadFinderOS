import { useEffect, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, Clipboard, ExternalLink, History, Instagram, Lightbulb, Loader2, Lock, Mail,
  MessageCircle, PenLine, Sparkles, Unlock, XCircle,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Callout, SubSection, ToneChip } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { useUgcActions, useUgcEvents, type UgcBrand, type UgcPitchSystem } from '@/hooks/useUgc';
import { CONTACT_KIND_LABEL, type BrandView } from '@/lib/ugc/brandView';
import { UGC_STATUSES, UGC_STATUS_LABEL } from '@/lib/ugc/config';
import { TEMPLATE_LABEL, WHATSAPP_ASK_DRAFT, copyEmailPayload, fillWhatsAppAsk, gmailComposeUrl, safeSignoffHtml, whatsappChatUrl, type PipelineAttempt, type TemplateKey } from '@/lib/ugc/pitch';
import { StatusChip } from './UgcBrandTable';
import { TIER_TONE, tierLabel } from './tierTone';
import { UgcResearchSection } from './UgcResearchSection';

async function copyRich(html: string, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

const CHANNEL_WORD: Record<string, string> = { email: 'Email', instagram: 'Instagram', whatsapp: 'WhatsApp' };
const CHECKS_MISSING = 'Tick both checks first: your sent mail (last 180 days) and the LinkedIn named-person search.';

export function UgcBrandSheet({ brand: b, view: v, system, senderEmail, canPitch, open, onOpenChange }: {
  brand: UgcBrand | null; view: BrandView | null; system: UgcPitchSystem | null; senderEmail: string | null; canPitch: boolean;
  open: boolean; onOpenChange: (v: boolean) => void;
}) {
  const actions = useUgcActions();
  const events = useUgcEvents(open && b ? b.id : null);
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextAt, setNextAt] = useState('');
  useEffect(() => { setNotes(b?.notes ?? ''); setNextAction(b?.todo ?? ''); setNextAt(b?.todo_on ?? ''); }, [b?.id, b?.notes, b?.todo, b?.todo_on]);
  if (!b || !v) return null;

  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast({ title: 'Not done', description: edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(null); } };
  const locked = (via: string) => !!b.active_channel && b.active_channel !== via;
  const lockedMsg = (via: string) => `${CHANNEL_WORD[b.active_channel ?? ''] ?? 'Another channel'} is already active for ${b.name}. Release it first (with a reason) to use ${CHANNEL_WORD[via]}.`;
  const logged = async (via: 'email' | 'instagram' | 'whatsapp', kind: 'pitch' | 'follow_up_1' | 'follow_up_2' | 'ask_who') => {
    const r = await actions.logContact(b.id, via, kind);
    if (!r.ok) toast({ title: 'Not logged', description: r.error === 'other_channel_active' ? lockedMsg(via) : r.error === 'jess_checks_missing' ? CHECKS_MISSING : String(r.error), variant: 'destructive' });
    else toast({ title: `Logged: contacted by ${CHANNEL_WORD[via]}` });
  };

  const working = (b.pitch_working ?? {}) as { attempts?: PipelineAttempt[]; why?: string; template?: TemplateKey; route?: { label?: string } };
  const last = working.attempts?.[working.attempts.length - 1];
  const w = last?.write ?? null;
  const emailTo = v.contact.channel === 'email' ? v.contact.email : (v.contacts.find((c) => c.channel === 'email')?.email ?? null);
  const fu = v.followUp;
  /* Her two manual checks gate a paid brand's FIRST contact (the database refuses it too: ugc_log_contact). */
  const checksNeeded = b.track === 'brand' && !b.first_contacted_at;
  const checksDone = !!b.checked_sent_mail_at && !!b.checked_linkedin_at;
  const blockedByChecks = checksNeeded && !checksDone;
  const tick = (field: 'checked_sent_mail_at' | 'checked_linkedin_at', on: boolean) =>
    void run(field, () => actions.updateBrand(b, { [field]: on ? new Date().toISOString() : null }, 'check'));
  const waTemplate = system?.whatsapp_template?.trim() || WHATSAPP_ASK_DRAFT;
  const waApproved = system?.whatsapp_template_approved === true;
  const product = b.research?.product ?? null;
  const named = v.contact.person;
  /* Two-step WhatsApp by default: ask who handles creator partnerships. A NAMED person's own number gets the direct pitch. */
  const waText = (n: { source: string }) => n.source === 'named_person' && b.pitch_body ? b.pitch_body : fillWhatsAppAsk(waTemplate, b.name, product);

  const doEmail = () => {
    if (!emailTo || !b.pitch_body) return;
    if (locked('email')) { toast({ title: 'Another channel is active', description: lockedMsg('email'), variant: 'destructive' }); return; }
    const { html, text } = copyEmailPayload(b.pitch_body, system?.signoff_html);
    void copyRich(html, text).then((ok) => toast({ title: ok ? 'Email copied — paste it into Gmail' : 'Could not copy — select the text below' }));
    window.open(gmailComposeUrl({ to: emailTo, subject: b.pitch_subject ?? '', from: senderEmail }), '_blank', 'noopener');
    void run('email', () => logged('email', 'pitch'));
  };
  const doInstagram = () => {
    if (!b.instagram_url || !b.pitch_body) return;
    if (locked('instagram')) { toast({ title: 'Another channel is active', description: lockedMsg('instagram'), variant: 'destructive' }); return; }
    void copyText(b.pitch_body).then((ok) => toast({ title: ok ? 'DM copied — paste it in Instagram' : 'Could not copy' }));
    window.open(b.instagram_url, '_blank', 'noopener');
    void run('instagram', () => logged('instagram', 'pitch'));
  };
  const doWhatsApp = (n: { number: string; source: string }) => {
    if (locked('whatsapp')) { toast({ title: 'Another channel is active', description: lockedMsg('whatsapp'), variant: 'destructive' }); return; }
    const url = whatsappChatUrl(n.number, waText(n));
    if (!url) return;
    window.open(url, '_blank', 'noopener');
    void run('whatsapp', () => logged('whatsapp', n.source === 'named_person' && b.pitch_body ? 'pitch' : 'ask_who'));
  };
  const release = () => {
    const reason = window.prompt(`Why release ${CHANNEL_WORD[b.active_channel ?? '']} for ${b.name}? (e.g. "no reply after FU2", "DM unseen")`);
    if (reason?.trim()) void run('release', async () => { const r = await actions.releaseChannel(b.id, reason); if (!r.ok) throw new Error(String(r.error)); });
  };
  const followUpTemplate = fu.next ? system?.templates?.[fu.next] ?? '' : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl" data-testid="ugc-brand-sheet">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
            {b.name}
            <ToneChip tone={TIER_TONE[v.tier.tier]}>{tierLabel(v.tier.tier)}</ToneChip>
            <StatusChip status={b.status} />
            {b.track === 'local' && <ToneChip tone="purple">Local · Chiang Mai</ToneChip>}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{[b.website, b.niche, b.country].filter(Boolean).join(' · ')}</p>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          {/* 1 TIER */}
          <SubSection title="1 · Tier" icon={Sparkles} tone={TIER_TONE[v.tier.tier]}>
            <p>{v.tier.why}</p>
            {v.tier.tier === 'skip' && <p className="mt-1 text-xs text-muted-foreground">Hidden by default. Nothing is deleted. {v.tier.reasons.join(' · ')}</p>}
            {b.track !== 'local' && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Set tier:</span>
              {(['A', 'B', 'C', 'D'] as const).map((t) => (
                <Button key={t} size="sm" variant={b.tier_override === t ? 'default' : 'outline'} className="h-7 px-2.5" disabled={!!busy}
                  onClick={() => void run('tier', () => actions.updateBrand(b, { tier_override: b.tier_override === t ? null : t }, 'status'))}>{t}</Button>
              ))}
              {b.ad_start_dates.length > 0 && <span className="ml-1 text-muted-foreground">Ads Library: {b.ad_start_dates.length} active video ads</span>}
            </div>}
            {b.track !== 'local' && (
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2" data-testid="ugc-tier-facts">
                <label className="flex items-center justify-between gap-2">Company based in
                  <Input className="h-7 w-24" placeholder="e.g. GB" defaultValue={b.company_country ?? ''} maxLength={2}
                    onBlur={(e) => { const v = e.target.value.trim().toUpperCase() || null; if (v !== (b.company_country ?? null)) void run('fact', () => actions.updateBrand(b, { company_country: v }, 'status')); }} /></label>
                <label className="flex items-center justify-between gap-2">Ships to
                  <select className="h-7 rounded-md border bg-background px-1" value={b.ships_to ?? ''}
                    onChange={(e) => void run('fact', () => actions.updateBrand(b, { ships_to: (e.target.value || null) as UgcBrand['ships_to'] }, 'status'))}>
                    <option value="">Not checked</option><option value="worldwide">Worldwide / many countries</option><option value="one_country">One country only</option><option value="uk_ie">UK and Ireland only</option>
                  </select></label>
                <label className="flex items-center justify-between gap-2">Ships to Thailand
                  <select className="h-7 rounded-md border bg-background px-1" value={b.ships_thailand == null ? '' : b.ships_thailand ? 'yes' : 'no'}
                    onChange={(e) => void run('fact', () => actions.updateBrand(b, { ships_thailand: e.target.value === '' ? null : e.target.value === 'yes' }, 'status'))}>
                    <option value="">Not checked</option><option value="yes">Yes</option><option value="no">No</option>
                  </select></label>
                <label className="flex items-center justify-between gap-2">Creator programme only for residents of
                  <Input className="h-7 w-24" placeholder="none" defaultValue={b.creator_programme_country ?? ''} maxLength={2}
                    onBlur={(e) => { const v = e.target.value.trim().toUpperCase() || null; if (v !== (b.creator_programme_country ?? null)) void run('fact', () => actions.updateBrand(b, { creator_programme_country: v }, 'status')); }} /></label>
              </div>
            )}
          </SubSection>

          {/* RESEARCH — her required fields with sources; a pitch drafts only when this is complete */}
          <UgcResearchSection brand={b} busy={busy === 'research'} onResearch={() => void run('research', async () => {
            const r = await actions.research(b.id);
            toast({ title: r.outcome === 'complete' ? 'Research complete' : r.outcome === 'partial' ? 'Research done: some fields unknown' : r.busy ? 'Already researching' : 'Research failed', description: r.gaps?.length ? `Missing: ${r.gaps.join(', ')}` : r.why });
          })} />

          {/* 2 CONTACT */}
          <SubSection title="2 · Contact (her order)" icon={Mail} tone="blue">
            {named && (
              <div className="mb-2 rounded-xl bg-teal-500/[0.08] p-3 ring-1 ring-inset ring-teal-500/25" data-testid="ugc-named-contact">
                <p className="flex items-center gap-1.5 font-semibold"><BadgeCheck className="h-4 w-4 text-teal-500" />{named.name}</p>
                <p className="text-xs text-muted-foreground">{named.title}</p>
                <p className="mt-1 text-xs">{named.email} <ToneChip tone="green" className="ml-1">Email verified</ToneChip></p>
              </div>
            )}
            <ol className="space-y-1">
              {v.contacts.filter((c) => c.kind !== 'named').map((c, i) => (
                <li key={`${c.kind}-${c.email ?? i}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{c.channel === 'instagram' ? b.instagram_url : c.channel === 'form' ? b.contact_form_url : c.email}</span>
                  <ToneChip tone={c.kind === 'generic' ? 'grey' : 'blue'}>{CONTACT_KIND_LABEL[c.kind]}{c.kind === 'generic' ? ' → generic template' : ''}</ToneChip>
                </li>
              ))}
              {v.contacts.length === 0 && <li className="text-xs text-muted-foreground">No contact yet — use Find contacts.</li>}
            </ol>
            {v.wa.length > 0 && (
              <div className="mt-3 space-y-1.5" data-testid="ugc-wa-numbers">
                <p className="text-xs font-semibold">WhatsApp</p>
                {v.wa.map((n) => (
                  <div key={n.number} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-mono">+{n.number}</span>
                    <ToneChip tone={n.lineType === 'mobile' ? 'green' : n.lineType === 'landline' ? 'grey' : 'amber'}>{n.lineType === 'mobile' ? 'Mobile' : n.lineType === 'landline' ? 'Landline' : 'Type unknown'}</ToneChip>
                    <ToneChip tone="blue">{n.sourceLabel}</ToneChip>
                  </div>
                ))}
              </div>
            )}
          </SubSection>

          {/* 3–4 CONCEPT, HOOK — the pipeline's working */}
          <SubSection title="3 · Concept & hook" icon={Lightbulb} tone="purple">
            {!w && !working.why && <p className="text-xs text-muted-foreground">No pitch written yet.</p>}
            {w && (
              <div className="space-y-2 text-xs" data-testid="ugc-pipeline">
                {w.research_used && <p><span className="font-semibold">Research:</span> {Object.entries(w.research_used).filter(([, x]) => x).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${String(x)}`).join(' · ')}</p>}
                {w.concept && <p><span className="font-semibold">Concept “{w.concept.name}”:</span> {(w.concept.visuals ?? []).join(' → ')}</p>}
                <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">Concept gate</span>
                  <ToneChip tone={w.concept_gate?.pass ? 'green' : 'red'} icon={w.concept_gate?.pass ? CheckCircle2 : XCircle}>{w.concept_gate?.pass ? 'Pass' : 'Fail'}</ToneChip>
                  <span className="text-muted-foreground">{(w.concept_gate?.reasons ?? []).join('; ')}</span></p>
                {(w.hooks ?? []).length > 0 && <ul className="list-disc pl-5">{w.hooks!.map((h) => <li key={h} className={h === w.hook_test?.chosen ? 'font-semibold' : ''}>{h}</li>)}</ul>}
                <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">Hook test</span>
                  <ToneChip tone={w.hook_test?.pass ? 'green' : 'red'} icon={w.hook_test?.pass ? CheckCircle2 : XCircle}>{w.hook_test?.pass ? 'Pass' : 'Fail'}</ToneChip>
                  <span className="text-muted-foreground">{w.hook_test?.why}</span></p>
                <p className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">Second pass</span>
                  {last?.review ? <ToneChip tone={last.problems.length ? 'red' : 'green'} icon={last.problems.length ? XCircle : CheckCircle2}>{last.problems.length ? 'Fail' : 'Pass'}</ToneChip> : <ToneChip tone="grey">Not reached</ToneChip>}
                  <span className="text-muted-foreground">Attempt {last?.n} of 3 · {working.template ? TEMPLATE_LABEL[working.template] : ''}{working.route?.label ? ` · to ${working.route.label}` : ''}</span></p>
              </div>
            )}
            {b.status === 'needs_jess' && <Callout tone="amber" icon={AlertTriangle} title="Needs Jess" className="mt-2">{working.why ?? 'The pitch did not pass her checks in 3 attempts. Nothing was drafted.'}</Callout>}
          </SubSection>

          {/* 5 DRAFT + SEND */}
          <SubSection title="4 · Draft" icon={PenLine} tone="green"
            action={canPitch && <Button size="sm" variant="outline" disabled={!!busy || v.tier.tier === 'skip'} onClick={() => void run('pitch', async () => {
              const r = await actions.pitch(b.id);
              toast({ title: r.outcome === 'drafted' ? 'Pitch drafted' : 'Needs Jess', description: r.outcome === 'drafted' ? undefined : r.why });
            })}>{busy === 'pitch' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}{b.pitch_body ? 'Rewrite' : 'Write pitch'}</Button>}>
            {b.pitch_body ? (
              <div className="space-y-2" data-testid="ugc-draft">
                {b.pitch_subject && <p className="text-xs"><span className="font-semibold">Subject:</span> {b.pitch_subject}</p>}
                <pre className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 font-sans text-[13px] leading-relaxed">{b.pitch_body}</pre>
                {system?.signoff_html && <div className="rounded-xl bg-muted/30 p-3 text-xs [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: safeSignoffHtml(system.signoff_html) }} />}
              </div>
            ) : <p className="text-xs text-muted-foreground">{canPitch ? 'Write pitch runs her system: research → concept → gate → hook test → second pass (max 3 tries).' : 'Her pitch system is private: only Jess writes pitches.'}</p>}

            {b.active_channel && (
              <Callout tone="blue" icon={Lock} className="mt-3" action={<Button size="sm" variant="ghost" onClick={release} disabled={!!busy}><Unlock className="mr-1 h-3.5 w-3.5" />Release</Button>}>
                Active channel: <b>{CHANNEL_WORD[b.active_channel]}</b>. One channel per brand — the others are locked.
              </Callout>
            )}

            {checksNeeded && (
              <div className="mt-3 space-y-1.5 rounded-xl bg-muted/40 p-2.5 text-xs" data-testid="ugc-jess-checks">
                <p className="font-semibold">Jess checked (before this can be marked sent)</p>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!b.checked_sent_mail_at} disabled={!!busy} onChange={(e) => tick('checked_sent_mail_at', e.target.checked)} />
                  Nothing sent to {b.domain ?? 'this brand'} from my sent mail in the last 180 days</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={!!b.checked_linkedin_at} disabled={!!busy} onChange={(e) => tick('checked_linkedin_at', e.target.checked)} />
                  LinkedIn named-person search done</label>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5" data-testid="ugc-send-actions">
              <Button size="sm" disabled={!emailTo || !b.pitch_body || locked('email') || blockedByChecks} onClick={doEmail}><Mail className="mr-1 h-3.5 w-3.5" />Copy email + open Gmail</Button>
              <Button size="sm" variant="outline" disabled={!b.instagram_url || !b.pitch_body || locked('instagram') || blockedByChecks} onClick={doInstagram}><Instagram className="mr-1 h-3.5 w-3.5" />Copy + open Instagram</Button>
              {v.wa.filter((n) => n.worthTrying).slice(0, 2).map((n) => (
                <Button key={n.number} size="sm" variant="outline" disabled={locked('whatsapp') || blockedByChecks} onClick={() => doWhatsApp(n)} title={n.sourceLabel}>
                  <MessageCircle className="mr-1 h-3.5 w-3.5" />Open WhatsApp chat{n.source === 'named_person' ? ` (${n.label})` : ''}
                </Button>
              ))}
            </div>
            {emailTo && <p className="mt-1 text-[11px] text-muted-foreground">Gmail opens to {named?.email === emailTo ? `${named.name} (${emailTo})` : emailTo} with the subject filled; paste the copied email (her sign-off and links stay formatted).</p>}
            {v.wa.some((n) => n.worthTrying) && (
              <div className="mt-2 rounded-xl bg-muted/40 p-2.5 text-xs">
                <p className="mb-1 flex items-center gap-1.5 font-semibold">WhatsApp opener (ask who handles it, then pitch them)
                  {!waApproved && <ToneChip tone="amber">Jess to approve</ToneChip>}</p>
                <p className="text-muted-foreground">{fillWhatsAppAsk(waTemplate, b.name, product)}</p>
              </div>
            )}
          </SubSection>

          {/* FOLLOW-UPS (paid brand track) */}
          {fu.fu1 && (
            <SubSection title="Follow-ups" icon={History} tone="amber">
              <p className="text-xs">Follow-up 1 due {fu.fu1} · Follow-up 2 due {fu.fu2} (+5 / +12 business days) · sent {b.follow_ups_sent} of 2</p>
              {fu.next && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant={fu.overdue ? 'default' : 'outline'} disabled={!followUpTemplate || !b.active_channel}
                    onClick={() => { void copyText(followUpTemplate).then(() => toast({ title: 'Follow-up template copied — fill in the brand line before sending' })); void run('fu', () => logged(b.active_channel as 'email', fu.next!)); }}>
                    <Clipboard className="mr-1 h-3.5 w-3.5" />Copy {fu.next === 'follow_up_1' ? 'follow-up 1' : 'follow-up 2'} + log sent
                  </Button>
                  {!followUpTemplate && <span className="text-xs text-muted-foreground">Her follow-up template is not loaded yet.</span>}
                </div>
              )}
            </SubSection>
          )}

          {/* CRM */}
          <SubSection title="Status, notes, next action" icon={CheckCircle2} tone="grey">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Status" className="h-8 rounded-md border bg-background px-2 text-sm" value={b.status}
                onChange={(e) => void run('status', () => actions.updateBrand(b, { status: e.target.value }, 'status'))}>
                {UGC_STATUSES.map((s) => <option key={s} value={s}>{UGC_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <Textarea className="mt-2 min-h-[70px]" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (b.notes ?? '')) void run('notes', () => actions.updateBrand(b, { notes }, 'note')); }} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Input className="h-8 flex-1" placeholder="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
              <Input className="h-8 w-40" type="date" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('next', () => actions.updateBrand(b, { todo: nextAction || null, todo_on: nextAt || null }, 'todo'))}>Save</Button>
            </div>
          </SubSection>

          <SubSection title="History" icon={History} tone="grey">
            {events.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : (
              <ul className="space-y-1 text-xs">
                {(events.data ?? []).map((e) => (
                  <li key={e.id} className="flex gap-2"><span className="w-32 shrink-0 text-muted-foreground">{new Date(e.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="min-w-0">{e.kind}{Object.keys(e.detail ?? {}).length ? ` · ${Object.entries(e.detail).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(', ')}` : ''}</span></li>
                ))}
                {(events.data ?? []).length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
              </ul>
            )}
            {b.website && <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline" href={b.website} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Website</a>}
          </SubSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
