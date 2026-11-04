/* ══ THE QUESTIONS, ON THE PROSPECT PAGE (Paul, 2026-11-04, docs/prospect-one-page-close.md) ══════════════════════════
   Under the script. Plain wording, every answer saves itself, no submit. Nothing new is stored where a home already exists:
     jobs, areas           → quick_close.call (save_call, which also fills the lead's services / areas when blank)
     who decides           → answers.decision_maker, plus the name in quick_close.call.decision_who
     who looks after it    → answers.manager; agency → answers.agency_contract, plus quick_close.call.contract_until
     domain                → answers.domain
     trade (only if blank) → the lead, as before
   paidClientRecord.ts shows all of it on the dashboard's New paid clients when they pay.
   ⛔ "Tied in" stays a decline (clause 1.6): the Close section below says so and no link can be made. "Not sure" stays
      Paul's review. Neither is judged here: the server decides. */
import { useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CallBlock } from '@/components/CallBlock';
import { SavedText, useCallAnswers } from '@/components/ColdCallPlaybook';
import { KnownDetails, quickCloseKey } from '@/components/QuickCloseDialog';
import { AutosaveIndicator } from '@/hooks/useAutosaveFields';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { thirdPartyManaged, type QcAgencyContract, type QcDomain } from '@/lib/quickClose';
import { shownCallNotes } from '@/lib/prospectClose';
import { cn } from '@/lib/utils';

const PICKED = 'border-blue-500/70 bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/30 dark:text-blue-300';

function Question({ text, children, testId }: { text: string; children: ReactNode; testId: string }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-sm font-semibold leading-snug">{text}</p>
      {children}
    </div>
  );
}

function Choices<T extends string>({ options, value, disabled, onPick, testId }: { options: readonly { value: T; label: string }[]; value: T | null; disabled: boolean; onPick: (v: T) => void; testId: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} disabled={disabled} onClick={() => onPick(o.value)} data-testid={`${testId}-${o.value}`}
          className={cn('min-h-10 rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
            value === o.value ? PICKED : 'border-border/70 bg-card hover:border-blue-500/40 hover:bg-muted/60')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CONTRACT_CHOICES: readonly { value: QcAgencyContract; label: string }[] = [{ value: 'in_contract', label: 'Yes' }, { value: 'free', label: 'No' }, { value: 'not_sure', label: 'Not sure' }];
const DOMAIN_CHOICES: readonly { value: 'yes' | 'no' | 'not_sure'; label: string }[] = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' }];
/** Older answers stay readable: an agency holding it, or no domain yet, both read "No" to "do you own it?". */
const domainShown = (d: QcDomain | null | undefined): 'yes' | 'no' | 'not_sure' | null => d === 'yes' ? 'yes' : d === 'not_sure' ? 'not_sure' : d ? 'no' : null;

export function ProspectQuestions({ leadId, enabled, hasWebsite }: { leadId: string; enabled: boolean; hasWebsite: boolean }) {
  const ans = useCallAnswers(leadId, enabled);
  const qc = useQueryClient();
  const { v, answers: a, canSave } = ans;
  const tradePrev = useRef('');
  const [tradeTyped, setTradeTyped] = useState(false);

  if (ans.isError) {
    return (
      <CallBlock title="Questions" testId="prospect-questions">
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 text-sm text-muted-foreground" data-testid="questions-failed">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />Could not load the answers: {edgeErrorMessage(ans.error)}
          <Button size="sm" variant="outline" className="h-8" onClick={() => void ans.refetch()}>Try again</Button>
        </p>
      </CallBlock>
    );
  }
  if (!v) {
    return (
      <CallBlock title="Questions" testId="prospect-questions">
        <p className="flex min-h-24 items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the answers…</p>
      </CallBlock>
    );
  }

  const call = v.call ?? {};
  const notes = shownCallNotes(call, v.lead);
  const manager = a.manager === 'owner' || a.manager === 'employee' ? 'owner' : thirdPartyManaged(a) ? 'agency' : a.manager === 'no_website' ? 'no_website' : null;
  const managerChoices = [
    { value: 'owner', label: 'Myself' }, { value: 'agency', label: 'Agency or someone else' },
    ...(!hasWebsite || manager === 'no_website' ? [{ value: 'no_website', label: 'No website yet' }] : []),
  ] as const;
  const off = !canSave;
  /* An Australian lead is never closed: only the two notes can be saved (src/lib/prospectOnly.ts; the server refuses the rest). */
  const notesOnly = !!v.prospect_only;
  const saveTrade = async (t: string) => {
    if (!t) return;
    setTradeTyped(true);
    const r = await invokeEdge('quick-close', { lead_id: leadId, mode: 'save', answers: {}, expect_route: a.route ?? null, trade: t, ...(tradePrev.current ? { trade_prev: tradePrev.current } : {}) });
    tradePrev.current = t;
    qc.setQueryData(quickCloseKey(leadId), r);
  };

  return (
    <CallBlock title="Questions" testId="prospect-questions"
      action={<AutosaveIndicator status={ans.busy ? 'saving' : ans.savedOnce ? 'saved' : 'idle'} />}>
      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
        <Question text="What jobs do you want to get more of?" testId="q-jobs">
          <SavedText value={notes.jobs} leadId={leadId} disabled={off} onSave={(t) => ans.saveCall({ jobs: t })} placeholder="e.g. emergency lockouts, lock changes, car keys" label="What jobs do you want to get more of?" testId="call-jobs" />
        </Question>
        <Question text="What areas do you want people to find you in?" testId="q-areas">
          <SavedText value={notes.areas} leadId={leadId} disabled={off} onSave={(t) => ans.saveCall({ areas: t })} placeholder="e.g. Canterbury, Whitstable, Herne Bay" label="What areas do you want people to find you in?" testId="call-areas" />
        </Question>

        {!notesOnly && <>
          <Question text="Who makes the decision on this?" testId="q-decision">
            <Choices testId="q-decision" disabled={off} value={a.decision_maker ?? null} onPick={(d) => void ans.saveAnswer('decision_maker', d)}
              options={[{ value: 'yes', label: 'The person I’m speaking to' }, { value: 'no', label: 'Someone else' }]} />
            {a.decision_maker === 'no' && (
              <SavedText value={call.decision_who ?? ''} leadId={leadId} disabled={off} onSave={(t) => ans.saveCall({ decision_who: t })} placeholder="Who? (a name, or “their business partner”)" label="Who makes the decision?" testId="q-decision-who" />
            )}
          </Question>

          <Question text="Do you look after the website yourself, or does someone do it for you?" testId="q-manager">
            <Choices testId="q-manager" disabled={off} value={manager} onPick={(m) => void ans.saveAnswer('manager', m)} options={managerChoices} />
          </Question>

          {manager === 'agency' && (
            <Question text="Are you tied into a contract with them?" testId="q-contract">
              <Choices testId="q-contract" disabled={off} value={a.agency_contract ?? null} onPick={(c) => void ans.saveAnswer('agency_contract', c)} options={CONTRACT_CHOICES} />
              <label className="block text-xs text-muted-foreground">Until when? (optional)
                <span className="mt-1 block"><SavedText value={call.contract_until ?? ''} leadId={leadId} disabled={off} onSave={(t) => ans.saveCall({ contract_until: t })} placeholder="e.g. March next year" label="Until when?" testId="q-contract-until" /></span>
              </label>
            </Question>
          )}

          <Question text="Do you own your domain name?" testId="q-domain">
            <Choices testId="q-domain" disabled={off} value={domainShown(a.domain)} onPick={(d) => void ans.saveAnswer('domain', d)} options={DOMAIN_CHOICES} />
          </Question>

          {(!v.lead.trade || tradeTyped) && (
            <Question text="What is their trade?" testId="q-trade">
              <SavedText value={v.lead.trade ?? ''} leadId={leadId} disabled={off} onSave={saveTrade} placeholder="e.g. plumber" label="What is their trade?" testId="q-trade-input" />
            </Question>
          )}
        </>}

        {!canSave && !ans.loading && <p className="text-[11px] text-muted-foreground" data-testid="call-answers-not-saved">These answers can’t be changed here{v.closed ? ' (this lead has already paid)' : ''}.</p>}
        <KnownDetails leadId={leadId} v={v} />
      </div>
    </CallBlock>
  );
}
