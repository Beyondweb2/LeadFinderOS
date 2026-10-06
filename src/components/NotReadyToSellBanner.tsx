import { ShieldAlert } from 'lucide-react';
import { useMyReadiness } from '@/hooks/useMyReadiness';
import { missingItemWords } from '@/lib/readinessWords';

/* Shown to a salesperson ONLY when their sales access is genuinely restricted — no sales role, login not active,
   suspended, engagement ended (sales-team-today, Paul, 2026-10-06). ⛔ An incomplete onboarding checklist
   (18+, right to work, bank details, VAT, company, start date, team guide) never shows this and never blocks
   selling: that checklist is Paul's admin record on the Team page. Not mounted in the lead popup. Nothing for
   the admin. */
export function NotReadyToSellBanner() {
  const me = useMyReadiness();
  if (!me.gated || me.loading || me.ready) return null;
  return (
    <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm" role="status" data-testid="not-ready-to-sell">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">Your sales access is not active</p>
          <p className="text-xs">{me.failed
            ? 'Your access could not be checked. Try again in a moment, or contact Paul.'
            : `${missingItemWords(me.missing, me.startsOn).join(' · ') || 'Restricted'}. Speak to Paul.`}</p>
        </div>
      </div>
    </div>
  );
}
