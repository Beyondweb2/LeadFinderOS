/* QUESTIONNAIRES THIS WEEK (Concept A, 2026-10-26): every submission of the last 7 days, where it stopped and how it
   ended — Paid (derived from the lead's payment), Lost with a reason (onboarding_outcomes), or Open with its escalation.
   The same rule as the "What needs you" row (questionnaireStop.ts), so the two never disagree. */
import { UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, TONE, type Tone } from '@/components/salesDash/ui';
import { questionnaireStep, questionnaireStop, STOP_WORDS } from '@/lib/questionnaireStop';
import { LOST_REASONS, type QuestionnaireRowFact } from '@/lib/needsMe';

const WEEK = 7 * 86_400_000;

export function questionnaireOutcome(q: QuestionnaireRowFact, nowMs: number): { label: string; tone: Tone } {
  if (Number(q.lead_amount_paid ?? 0) > 0) return { label: 'Paid', tone: 'green' };
  if (q.outcome === 'lost') return { label: `Lost · ${LOST_REASONS.find((r) => r.value === q.lost_reason)?.label ?? 'other'}`, tone: 'grey' };
  const s = questionnaireStep(q, nowMs);
  if (s?.escalation === 3) return { label: 'Open · record the outcome', tone: 'red' };
  if (s && s.escalation >= 1) return { label: `Open · escalated ${s.escalation === 2 ? '48h' : '24h'}`, tone: 'amber' };
  return { label: 'Open', tone: 'blue' };
}

export function QuestionnaireLog({ facts, nowMs, menu, onOpen }: { facts: QuestionnaireRowFact[]; nowMs: number; menu?: React.ReactNode; onOpen: (leadId: string) => void }) {
  const week = facts.filter((q) => nowMs - Date.parse(q.created_at) <= WEEK);
  return (
    <Panel title="Questionnaires this week" icon={UserPlus} tone="amber" action={menu}
      hint="Every submission, where it stopped, and how it ended (paid, or lost with a reason).">
      {!week.length ? <p className="text-sm text-muted-foreground">No questionnaires in the last 7 days.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="questionnaire-log">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-3 font-medium">Business</th><th className="pr-3 font-medium">Submitted</th><th className="pr-3 font-medium">Stopped at</th><th className="font-medium">Outcome</th></tr></thead>
            <tbody className="divide-y divide-border/60">
              {week.map((q) => {
                const out = questionnaireOutcome(q, nowMs);
                const paid = out.label === 'Paid';
                return (
                  <tr key={q.id}>
                    <td className="py-2 pr-3 font-medium">{q.lead_id ? <button type="button" className="text-left hover:underline" onClick={() => onOpen(q.lead_id!)}>{q.business_name || 'Unnamed sign-up'}</button> : (q.business_name || 'Unnamed sign-up')}</td>
                    <td className="pr-3">{new Date(q.created_at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}</td>
                    <td className="pr-3">{paid ? '—' : STOP_WORDS[questionnaireStop(q)]}</td>
                    <td><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TONE[out.tone].soft, TONE[out.tone].text)}>{out.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
