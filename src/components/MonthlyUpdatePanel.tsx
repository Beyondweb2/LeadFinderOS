import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Clipboard, Loader2, Plus, RefreshCw, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { leadRpc } from '@/lib/leadRpc';
import {
  composeMonthlyUpdate, dayLabel, measurementParagraph, missingForSend, monthLabel, updateMonths, usableCheck,
  type MonthlyCheck, type MonthlyFields,
} from '@/lib/monthlyUpdate';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MONTHLY UPDATE (paid client page, closeout 2026-10-02). Prepared and sent BY HAND, as
   findable.live/terms says: pick the month, read the stored evidence, write what was done and what is
   next, copy the text into an email or WhatsApp, then mark it sent. The record is
   client_monthly_updates (admin-only functions monthly_update_facts / _save / _mark_sent).

   ⛔ Facts are suggestions, never claims: a page the generator holds as live, or an opportunity marked
   implemented, is offered with an "Add" button — the operator decides whether it is true for this
   month. Only the measurement paragraph is written for them, from stored check results.
   ⛔ This never sends. "Mark as sent" records that the operator sent it, how, and the exact words.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

interface FactPage { id: string; label: string; published_url: string | null; created_at: string; updated_at: string }
interface FactImplemented { question: string; what_changed: string | null; implemented_at: string }
interface FactOpen { question: string; status: string }
interface UpdateRow extends MonthlyFields { status: 'draft' | 'sent'; message: string | null; sent_at: string | null; sent_channel: string | null }
interface HistoryRow { period_month: string; status: 'draft' | 'sent'; sent_at: string | null; sent_channel: string | null }
interface Facts {
  ok: boolean; error?: string; month: string;
  checks: MonthlyCheck[]; pages: FactPage[]; implemented: FactImplemented[]; open_opportunities: FactOpen[];
  update: UpdateRow | null; history: HistoryRow[];
}

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Another way' },
] as const;

const ERRORS: Record<string, string> = {
  admin_only: 'Only the admin can prepare monthly updates.',
  lead_not_found: 'This client could not be found.',
  already_sent: 'This month’s update has already been marked as sent, so it can’t be changed.',
  future_month: 'An update can’t be written for a month that hasn’t started.',
  too_long: 'One of the sections is too long (4,000 characters at most).',
  no_draft: 'Save the draft first.',
  empty_message: 'The update is empty.',
  bad_channel: 'Choose how it was sent.',
  service_ended: 'This client’s engagement has ended, so no monthly update is prepared or sent.',
  refunded: 'This client was refunded, so no monthly update is prepared or sent.',
  upstream_timeout: 'The database did not answer in time. Try again in a moment.',
};
/* A bare code is never shown on its own (CLAUDE.md §4): known ones in words, anything else quoted in a sentence. */
const say = (code: string | undefined) => (code && ERRORS[code]) || (code ? `The update could not be loaded or saved (${code}).` : 'The update could not be loaded or saved.');

const appendLine = (text: string, line: string) => (text.trim() ? `${text.replace(/\s+$/, '')}\n${line}` : line);
/* "New page" only when the page was CREATED in this month; otherwise it was changed, not added. */
const pageLine = (p: FactPage, month: string) =>
  `${p.created_at.slice(0, 7) === month.slice(0, 7) ? 'New page' : 'Page updated'}: ${p.label}${p.published_url ? ` (${p.published_url})` : ''}`;

export function MonthlyUpdatePanel({ leadId, contactName, paymentDate }: { leadId: string; contactName: string | null; paymentDate: string | null }) {
  const { toast } = useToast();
  const months = useMemo(() => updateMonths(paymentDate, Date.now()), [paymentDate]);
  const [month, setMonth] = useState(months[0]);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<MonthlyFields>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'send'>(null);
  const [channel, setChannel] = useState<string>('email');

  /* ⛔ ONLY THE MONTH ON SCREEN (found driving the panel, 2026-10-02): switching month used to show the
     previous month's facts and words under the new month's name until the read landed — a Save in that
     moment filed one month's update under another. Facts are shown only when they are FOR the selected
     month, and a reply that arrives after a newer request is dropped. */
  const latest = useRef(0);
  const load = useCallback(async (m: string) => {
    const ticket = ++latest.current;
    setLoading(true); setLoadError(null); setFacts(null); setDirty(false);
    const r = await leadRpc('monthly_update_facts', { _lead_id: leadId, _month: m });
    if (ticket !== latest.current) return;
    if (!r.ok) { setLoadError(say(r.error)); setLoading(false); return; }
    const f = r as unknown as Facts;
    setFacts(f);
    setFields({ measured_note: f.update?.measured_note ?? '', work_done: f.update?.work_done ?? '', opportunities: f.update?.opportunities ?? '', next_steps: f.update?.next_steps ?? '' });
    setDirty(false);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { void load(month); }, [load, month]);

  const sent = facts?.update?.status === 'sent';
  const text = useMemo(() => facts ? composeMonthlyUpdate({ month, contactName, checks: facts.checks, fields }) : '', [facts, month, contactName, fields]);
  const missing = missingForSend(fields);
  const set = (k: keyof MonthlyFields) => (v: string) => { setFields((p) => ({ ...p, [k]: v })); setDirty(true); };
  /* Append through the updater, so two quick Adds both land (each used to read the text from before the other). */
  const add = (k: keyof MonthlyFields, line: string) => { setFields((p) => ({ ...p, [k]: appendLine(p[k] ?? '', line) })); setDirty(true); };

  const save = async (): Promise<boolean> => {
    setBusy('save');
    try {
      const r = await leadRpc('monthly_update_save', { _lead_id: leadId, _month: month, _measured_note: fields.measured_note ?? null, _work_done: fields.work_done ?? null, _opportunities: fields.opportunities ?? null, _next_steps: fields.next_steps ?? null });
      if (!r.ok) { toast({ title: 'Not saved', description: say(r.error), variant: 'destructive' }); return false; }
      setDirty(false);
      return true;
    } finally { setBusy(null); }
  };

  const markSent = async () => {
    if (missing.length) return;
    if (!window.confirm(`Mark the ${monthLabel(month)} update as sent by ${CHANNELS.find((c) => c.value === channel)?.label.toLowerCase()}? It is kept exactly as it reads now and can’t be changed afterwards.`)) return;
    if (!(await save())) return;
    setBusy('send');
    try {
      const r = await leadRpc('monthly_update_mark_sent', { _lead_id: leadId, _month: month, _channel: channel, _message: text });
      if (!r.ok) { toast({ title: 'Not marked as sent', description: say(r.error), variant: 'destructive' }); return; }
      toast({ title: 'Marked as sent', description: `${monthLabel(month)} update recorded.` });
      await load(month);
    } finally { setBusy(null); }
  };

  const copyText = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast({ title: 'Copied', description: 'Paste it into your email or WhatsApp.' }); }
    catch { toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', variant: 'destructive' }); }
  };

  const statusOf = (m: string) => facts?.history.find((h) => h.period_month === m)?.status;

  return <div className="space-y-3" data-testid="monthly-update">
    <p className="text-muted-foreground">Prepared and sent by you. Write what was done and what is next, copy it to the client, then mark it sent. Nothing is sent from here.</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs font-medium" htmlFor="monthly-update-month">Month</label>
      <select id="monthly-update-month" className="h-8 rounded-md border bg-background px-2 text-sm" value={month} onChange={(e) => { if (dirty && !window.confirm('You have unsaved changes to this month’s update. Switch month and lose them?')) return; setMonth(e.target.value); }} disabled={busy !== null}>
        {months.map((m) => { const st = statusOf(m); return <option key={m} value={m}>{monthLabel(m)}{st === 'sent' ? ' · sent' : st === 'draft' ? ' · draft' : ''}</option>; })}
      </select>
      {loading && <Loader2 className="h-4 w-4 animate-spin text-primary"/>}
    </div>

    {loadError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 p-3 text-destructive"><AlertCircle className="h-4 w-4"/><span>{loadError}</span><Button size="sm" variant="outline" onClick={() => void load(month)}><RefreshCw className="mr-1 h-4 w-4"/>Try again</Button></div>}

    {facts && !loadError && (sent && facts.update ? <div className="space-y-2">
      <p className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4"/>Sent {facts.update.sent_at ? new Date(facts.update.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : ''} by {CHANNELS.find((c) => c.value === facts.update?.sent_channel)?.label.toLowerCase() ?? facts.update.sent_channel}</p>
      <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{facts.update.message}</pre>
      <Button size="sm" variant="outline" onClick={() => void copyText(facts.update?.message ?? '')}><Clipboard className="mr-1 h-4 w-4"/>Copy what was sent</Button>
    </div> : <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <section className="rounded-md border p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What we measured (written from the checks)</h4>
          <p>{measurementParagraph(facts.checks, month)}</p>
          {facts.checks.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {facts.checks.map((c) => <li key={c.week_start}>Week of {dayLabel(c.week_start)}: {usableCheck(c) ? `ChatGPT ${c.named?.chatgpt} of ${c.answered?.chatgpt}, Gemini ${c.named?.gemini} of ${c.answered?.gemini}` : c.status}{c.reason ? ` — ${c.reason}` : ''}</li>)}
          </ul>}
        </section>
        <label className="block space-y-1"><span className="text-xs font-medium">Anything to add about the measurements <span className="text-muted-foreground">(optional)</span></span>
          <Textarea rows={2} value={fields.measured_note ?? ''} onChange={(e) => set('measured_note')(e.target.value)} disabled={busy !== null}/></label>

        <section className="rounded-md border p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded this month — add only what is true</h4>
          {facts.pages.length === 0 && facts.implemented.length === 0 && <p className="text-xs text-muted-foreground">No page marked live and no opportunity marked implemented this month.</p>}
          <ul className="space-y-1 text-xs">
            {facts.pages.map((p) => <li key={p.id} className="flex items-start justify-between gap-2"><span>Page marked live: {p.label}{p.published_url ? ` (${p.published_url})` : ''} · last changed {dayLabel(p.updated_at)}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => add('work_done', `- ${pageLine(p, month)}`)}><Plus className="mr-1 h-3 w-3"/>Add</Button></li>)}
            {facts.implemented.map((o) => <li key={`${o.question}-${o.implemented_at}`} className="flex items-start justify-between gap-2"><span>Implemented: {o.what_changed || o.question}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => add('work_done', `- ${o.what_changed || o.question}`)}><Plus className="mr-1 h-3 w-3"/>Add</Button></li>)}
          </ul>
          {facts.open_opportunities.length > 0 && <>
            <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open opportunities</h4>
            <ul className="space-y-1 text-xs">{facts.open_opportunities.map((o) => <li key={o.question} className="flex items-start justify-between gap-2"><span>{o.question}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => add('opportunities', `- ${o.question}`)}><Plus className="mr-1 h-3 w-3"/>Add</Button></li>)}</ul>
          </>}
        </section>

        <label className="block space-y-1"><span className="text-xs font-medium">What we did <span className="text-muted-foreground">(required)</span></span>
          <Textarea rows={4} value={fields.work_done ?? ''} onChange={(e) => set('work_done')(e.target.value)} disabled={busy !== null} placeholder="The work completed this month, in plain words."/></label>
        <label className="block space-y-1"><span className="text-xs font-medium">Opportunities we have found <span className="text-muted-foreground">(optional)</span></span>
          <Textarea rows={3} value={fields.opportunities ?? ''} onChange={(e) => set('opportunities')(e.target.value)} disabled={busy !== null}/></label>
        <label className="block space-y-1"><span className="text-xs font-medium">What happens next <span className="text-muted-foreground">(required)</span></span>
          <Textarea rows={3} value={fields.next_steps ?? ''} onChange={(e) => set('next_steps')(e.target.value)} disabled={busy !== null}/></label>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The update, as the client will read it</h4>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{text}</pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void save().then((ok) => ok && toast({ title: 'Draft saved' }))} disabled={busy !== null || !dirty}>{busy === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Save className="mr-1 h-4 w-4"/>}Save draft</Button>
          <Button size="sm" variant="outline" onClick={() => void copyText(text)} disabled={busy !== null}><Clipboard className="mr-1 h-4 w-4"/>Copy text</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <label className="text-xs font-medium" htmlFor="monthly-update-channel">Sent by</label>
          <select id="monthly-update-channel" className="h-8 rounded-md border bg-background px-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={busy !== null}>
            {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <Button size="sm" onClick={() => void markSent()} disabled={busy !== null || missing.length > 0} title={missing.length ? `Fill in: ${missing.join(', ')}` : undefined}>{busy === 'send' ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Send className="mr-1 h-4 w-4"/>}Mark as sent</Button>
        </div>
        {missing.length > 0 && <p className="text-xs text-muted-foreground">Before it can be marked sent, fill in: {missing.join(', ')}.</p>}
        {dirty && <p className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes.</p>}
      </div>
    </div>)}
  </div>;
}
