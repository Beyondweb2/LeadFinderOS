import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMyReadiness } from '@/hooks/useMyReadiness';
import { missingItemWords } from '@/lib/readinessWords';

const PAPERWORK_KEYS: ReadonlySet<string> = new Set(['agreement', 'privacy_notice']);

/* "You are not Ready to Sell yet" — shown to a salesperson until their onboarding is complete
   (2026-10-05, docs/salesperson-onboarding.md). Says what is outstanding in plain words; the one step they
   can do themselves (acknowledging the current team guide) is a button. Nothing for the admin. */
export function NotReadyToSellBanner({ compact = false }: { compact?: boolean }) {
  const me = useMyReadiness();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!me.gated || me.loading || me.ready) return null;
  const canAckGuide = me.missing.includes('team_guide') && !!me.teamGuide;
  /* Salesperson paperwork (contractor agreement, privacy notice) is handled OUTSIDE LeadFinderOS (Paul,
     2026-10-05): never listed here and nothing to open or sign — even if an older server answer named it. */
  const others = me.missing.filter((k) => (k !== 'team_guide' || !canAckGuide) && !PAPERWORK_KEYS.has(k));
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm" role="status" data-testid="not-ready-to-sell">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">You are not Ready to Sell yet</p>
          {me.failed ? (
            <p className="text-xs">Your onboarding status could not be checked. Sales actions stay paused until it can — try again in a moment, or contact Paul.</p>
          ) : (
            <>
              <p className="text-xs">Calls, messages, claiming leads, checks, Find Leads and sign-up links are paused until your onboarding is complete.</p>
              {!compact && others.length > 0 && (
                <p className="text-xs text-muted-foreground">Waiting on: {missingItemWords(others, me.startsOn).join(' · ')}</p>
              )}
              {canAckGuide && (
                <Button size="sm" variant="outline" className="mt-1 h-auto min-h-7 max-w-full whitespace-normal py-1 text-left text-xs" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await me.acknowledgeTeamGuide();
                    toast(r.ok ? { title: 'Thanks — team guide acknowledged' } : { title: 'Not saved', description: r.error ?? 'Try again', variant: 'destructive' });
                  } finally { setBusy(false); }
                }}>I have read the team guide ({me.teamGuide!.label})</Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
