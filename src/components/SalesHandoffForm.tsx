import { Fragment, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  HANDOFF_QUESTIONS, NOTHING_PROMISED, PREFERRED_CONTACT_OPTIONS, SITE_SITUATION_OPTIONS, WORK_TYPE_OPTIONS, cleanHandoff, handoffKnownLines, handoffMissing,
  type HandoffFieldKey, type SalesHandoffFields,
} from '@/lib/salesHandoff';
import { cn } from '@/lib/utils';

/* ══ THE SALES HANDOFF FORM (2026-10-02, src/lib/salesHandoff.ts has the rules) ══════════════════════════
   Six short answers and an optional note. What the system already knew arrives filled and marked
   "suggested" until the salesperson saves it. One component: the salesperson's Quick Close and Paul's
   client page draw the same form. The server (fn quick-close `save_handoff`) cleans and decides.
   2026-10-06 SEND TO PAUL: given `onSend` (the salesperson's Close tab), the form ENDS with Send to Paul once
   every required answer is in — the salesperson's part is then done. Before that it saves a draft. After the
   send it shows "Sent to Paul" and later edits save as changes. Paul's own page passes no onSend.
   🔴 2026-10-07 LIGHTWEIGHT: only the questions the rep uniquely answers are ASKED (contact, role, any special
   promise, how to reach them, a note); everything the system already knows is shown as "Already known" (from the
   plan and the call). Nothing is required — Send to Paul is always available. */

export interface HandoffSentState { at: string; by: string | null; changed_since?: boolean }

export function SalesHandoffForm({ fields, prefilled, route, onSave, onSend, sent, busy, compact }: {
  fields: SalesHandoffFields;
  prefilled: HandoffFieldKey[];
  /** The sold route, when known: the work-type choices are narrowed to it. */
  route?: 'build' | 'optimise' | null;
  onSave: (f: SalesHandoffFields) => Promise<boolean>;
  /** Saves AND sends (fn quick-close send_to_paul). Absent on Paul's own page. */
  onSend?: (f: SalesHandoffFields) => Promise<boolean>;
  sent?: HandoffSentState | null;
  busy?: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState<SalesHandoffFields>(fields);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(fields); }, [JSON.stringify(fields)]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = useMemo(() => handoffMissing(draft), [draft]);
  const set = (k: HandoffFieldKey, v: string) => { setSaved(false); setDraft((d) => ({ ...d, [k]: v })); };
  const workOptions = WORK_TYPE_OPTIONS.filter((o) => !route || o.route === route);
  const suggested = (k: HandoffFieldKey) => prefilled.includes(k) && draft[k] === fields[k];
  const save = async () => {
    const ok = await onSave(cleanHandoff(draft));
    if (ok) setSaved(true);
  };
  const send = async () => { if (onSend) await onSend(cleanHandoff(draft)); };
  const ready = missing.length === 0;
  const savedLabel = (idle: string) => (busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{idle}</> : saved ? <><Check className="mr-1 h-4 w-4" />Saved</> : idle);
  const knownLines = handoffKnownLines(draft);
  return (
    <div className="space-y-3" data-testid="sales-handoff-form">
      {knownLines.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2" data-testid="handoff-known">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Already known — no need to type it</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
            {knownLines.map((l) => <Fragment key={l.key}><dt className="text-muted-foreground">{l.label}</dt><dd className="min-w-0 break-words font-medium">{l.value}</dd></Fragment>)}
          </dl>
        </div>
      )}
      {HANDOFF_QUESTIONS.filter((q) => q.asked).map((q) => {
        const tag = suggested(q.key) && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-sky-500/10 px-1 text-[10px] font-medium text-sky-700 dark:text-sky-300"><Sparkles className="h-2.5 w-2.5" />suggested</span>;
        if (q.kind === 'choice') {
          const options = q.key === 'work_type' ? workOptions : q.key === 'preferred_contact' ? PREFERRED_CONTACT_OPTIONS : SITE_SITUATION_OPTIONS;
          return (
            <fieldset key={q.key}>
              <legend className="text-sm font-medium">{q.label}{q.required ? <span className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (if you know)</span>}{tag}</legend>
              <div className={cn('mt-1.5 grid gap-1.5', q.key === 'preferred_contact' ? 'grid-cols-3' : compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}>
                {options.map((o) => (
                  <button key={o.value} type="button" onClick={() => set(q.key, o.value)} aria-pressed={draft[q.key] === o.value}
                    className={cn('min-h-[44px] rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', q.key === 'preferred_contact' && 'px-2 text-center',
                      draft[q.key] === o.value ? 'border-blue-500 bg-blue-500/10 font-semibold' : 'border-border hover:bg-muted')}>
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        }
        return (
          <label key={q.key} className="block text-sm font-medium">
            {q.label}{q.required ? <span className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}{tag}
            {q.kind === 'short'
              ? <Input value={draft[q.key] ?? ''} maxLength={q.max} onChange={(e) => set(q.key, e.target.value)} className="mt-1 h-10 text-sm font-normal" />
              : <Textarea value={draft[q.key] ?? ''} maxLength={q.max} rows={2} onChange={(e) => set(q.key, e.target.value)} className="mt-1 text-sm font-normal" />}
            {q.key === 'promised' && !draft.promised && (
              <button type="button" onClick={() => set('promised', NOTHING_PROMISED)} className="mt-1 text-xs font-normal text-primary hover:underline">Nothing beyond the standard package</button>
            )}
          </label>
        );
      })}

      {/* ── THE FINAL STATE ── */}
      {onSend && sent ? (
        <div className="space-y-2 border-t border-border/60 pt-3" data-testid="handoff-sent">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4 shrink-0" />Sent to Paul{sent.by ? ` by ${sent.by}` : ''} · {new Date(sent.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void save()} disabled={busy} className="h-10">{savedLabel('Save changes')}</Button>
            <span className="text-xs text-muted-foreground">{sent.changed_since ? 'Changed since you sent it — Paul sees the latest answers.' : 'Paul has it. Any change you save here, he sees.'}</span>
          </div>
        </div>
      ) : onSend ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          {ready ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300" data-testid="handoff-complete">Ready to send</p>
              <Button type="button" onClick={() => void send()} disabled={busy} className="h-12 w-full gap-2 rounded-xl bg-blue-600 text-base font-bold text-white hover:bg-blue-700" data-testid="send-to-paul">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Send to Paul
              </Button>
              <button type="button" onClick={() => void save()} disabled={busy} className="block w-full py-1 text-center text-xs text-muted-foreground hover:text-foreground hover:underline">{saved ? 'Saved — not sent yet' : 'Save without sending'}</button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void save()} disabled={busy} className="h-10">{savedLabel('Save handoff')}</Button>
              <span className="text-xs text-muted-foreground">{missing.length} required answer{missing.length === 1 ? '' : 's'} to go — then Send to Paul.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void save()} disabled={busy} className="h-10">{savedLabel('Save handoff')}</Button>
          <span className="text-xs text-muted-foreground">
            {missing.length ? `${missing.length} required answer${missing.length === 1 ? '' : 's'} still missing — you can save and finish later.` : 'Everything required is filled in.'}
          </span>
        </div>
      )}
    </div>
  );
}
