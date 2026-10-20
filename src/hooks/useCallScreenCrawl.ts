/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCREEN'S ONE-TIME WEBSITE CHECK (2026-10-19; the rule is src/lib/callScreenCrawl.ts).

   When the call screen opens on a lead that has an AI result and a website but NO website check, it asks
   crawl-check — once — for the quick check, in the background (requested_from "call_screen"). crawl-check
   refuses quietly unless the check is genuinely missing, and queues the deep check behind a quick one.

   ⛔ ONCE PER LEAD PER BROWSER SESSION (STARTED below), and the server keeps it to one at a time per lead and a
      per-person limit. ⛔ Never while the audit's own crawl is still landing (the playbook says 'checking').
   ⛔ Fetches the lead's own public site only — no paid service. Nothing is sent to anyone.
   The playbook hook reads `callScreenCrawlInFlight` so the script says "Checking the website…" meanwhile.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invokeEdge } from '@/lib/edgeInvoke';
import { CALL_SCREEN_CRAWL_SOURCE } from '@/lib/callScreenCrawl';
import type { ColdCallPlaybook } from '@/lib/coldCallPlaybook';

const STARTED = new Set<string>();
const IN_FLIGHT = new Set<string>();

/** A call-screen start for this lead is waiting on crawl-check right now. */
export function callScreenCrawlInFlight(leadId: string): boolean {
  return IN_FLIGHT.has(leadId);
}

/** Should this opened call screen ask for the missing check? Pure, so the rule is testable. */
export function shouldStartCallScreenCrawl(p: Pick<ColdCallPlaybook, 'audit' | 'site' | 'findingsStatus'> | null | undefined, alreadyStarted: boolean): boolean {
  if (!p || alreadyStarted) return false;
  /* A failed check is asked for again too: the server allows that once per lead, ever (callScreenCrawl.ts). */
  return p.audit.state === 'ready' && p.site.source === 'own_site' && (p.findingsStatus === 'not_crawled' || p.findingsStatus === 'unreadable');
}

export type CallScreenCrawlState = 'idle' | 'checking' | 'skipped' | 'failed';

export function useCallScreenCrawl(leadId: string, p: ColdCallPlaybook | null | undefined): CallScreenCrawlState {
  const qc = useQueryClient();
  const [state, setState] = useState<CallScreenCrawlState>(IN_FLIGHT.has(leadId) ? 'checking' : 'idle');
  const want = shouldStartCallScreenCrawl(p, STARTED.has(leadId));
  useEffect(() => {
    if (!want) return;
    STARTED.add(leadId);
    IN_FLIGHT.add(leadId);
    setState('checking');
    void qc.invalidateQueries({ queryKey: ['cold-call-playbook', leadId] });   // the script says "Checking the website…"
    invokeEdge<{ ok: boolean; skipped?: string }>('crawl-check', { lead_id: leadId, requested_from: CALL_SCREEN_CRAWL_SOURCE })
      .then((r) => setState(r?.skipped ? 'skipped' : 'idle'))
      .catch(() => setState('failed'))
      .finally(() => {
        IN_FLIGHT.delete(leadId);
        void qc.invalidateQueries({ queryKey: ['cold-call-playbook', leadId] });
        void qc.invalidateQueries({ queryKey: ['lead-crawls'] });
      });
  }, [want, leadId, qc]);
  return state;
}
