import { useEffect, useState } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
import { invokeEdge } from '@/lib/edgeInvoke';
import { ALERTING_ENGINES, RATE_ALERT_BELOW, healthLine, type EngineStat } from '@/lib/providerHealth';

/* AI SEARCH HEALTH (Paul, 2026-11-19, v1-audits-self-healing): Apify's success rate by engine over the last 24 h, and
   what the self-heal did — one line beside the Apify spend line. Read through apify-usage-status { health: true }, which
   is ADMIN ONLY: anyone else gets a refusal and this renders nothing. Never throws, never blocks the page. */

interface HealthResponse {
  ok?: boolean;
  health?: {
    day: EngineStat[];
    lastHour: EngineStat[];
    heal: { reran: number; gaveUp: number; running: number };
    generatedAt: string;
  } | null;
}

export function AiSearchHealthLine() {
  const [h, setH] = useState<HealthResponse['health'] | null>(null);
  useEffect(() => {
    let live = true;
    invokeEdge<HealthResponse>('apify-usage-status', { health: true })
      .then((r) => { if (live) setH(r?.health ?? null); })
      .catch(() => { if (live) setH(null); });
    return () => { live = false; };
  }, []);
  if (!h) return null;
  const low = h.day.some((s) => ALERTING_ENGINES.includes(s.engine) && s.asked >= 8 && s.rate != null && s.rate < RATE_ALERT_BELOW);
  const heal = h.heal;
  const cls = low
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500'
    : 'border-border/60 bg-card/60 text-muted-foreground';
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[12px] ${cls}`} data-testid="ai-search-health">
      {low ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Activity className="h-3.5 w-3.5 shrink-0" />}
      <span className="font-semibold">AI search, last 24 h:</span>
      <span className="tabular-nums">{healthLine(h.day)}</span>
      {heal.reran > 0 && (
        <span>
          · {heal.reran} audit{heal.reran === 1 ? '' : 's'} re-ran {heal.reran === 1 ? 'itself' : 'themselves'}
          {heal.running ? `, ${heal.running} re-running now` : ''}{heal.gaveUp ? `, ${heal.gaveUp} gave up` : ''}
        </span>
      )}
    </div>
  );
}
