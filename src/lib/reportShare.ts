/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PROSPECT REPORT: SHARED and OPENED  (2026-09-28, docs/self-sourced-handoff.md)

   ONE rule for what the prospect workspace says about a report link:
   - GENERATED = someone copied the link in the app (report_link_events kind 'generated').
   - SENT      = a real WhatsApp send whose body carried the link (the trg_report_link_sent trigger,
                 + backfill), or a person saying they sent it another way (email / LinkedIn / text /
                 in person / other — lead_report_link_event).
   - OPENED    = ai_audits.first_opened_at / open_count: a non-bot load of the public report page
                 WITHOUT preview=1. Every "Open report" inside LeadFinderOS adds preview=1
                 (staffPreviewUrl), so a salesperson checking the report is never the "first open".
     Before 2026-09-28 staff opens DID count, so an old report's first open may be ours.
   Nothing here is invasive: no per-visitor record, no IP, no cookie — one timestamp and one count.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { LINK_SEND_METHODS } from './contactMethods.ts';

export type ReportLinkEvent = {
  audit_id: string; kind: 'generated' | 'sent'; channel: string; actor_user_id: string | null;
  template_name: string | null; created_at: string;
};
export type ReportOpenFacts = { first_opened_at: string | null; open_count: number | null } | null;

export interface ReportShareStatus {
  generated: boolean;
  sent: boolean;
  firstSentAt: string | null;
  sentChannels: string[];
  opened: boolean;
  firstOpenedAt: string | null;
  openCount: number;
  /** The first open is BEFORE any recorded send (it may be ours, or a link shared off-app). */
  openedBeforeSend: boolean;
}

/** "Sent another way": the one contact-method set's link subset (src/lib/contactMethods.ts). */
export const REPORT_SEND_CHANNELS = LINK_SEND_METHODS;
export const REPORT_CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', copy: 'Copied', ...Object.fromEntries(REPORT_SEND_CHANNELS.map((c) => [c.value, c.label])),
};

/** The URL every in-app "Open report" uses: the public link plus preview=1, so the open is not counted. */
export function staffPreviewUrl(url: string): string {
  if (!url) return url;
  if (/[?&]preview=1(&|$)/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}preview=1`;
}

export function reportShareStatus(events: ReadonlyArray<ReportLinkEvent>, auditId: string | null, open: ReportOpenFacts): ReportShareStatus {
  const mine = auditId ? events.filter((e) => e.audit_id === auditId) : [];
  const sends = mine.filter((e) => e.kind === 'sent').sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const firstSentAt = sends[0]?.created_at ?? null;
  const firstOpenedAt = open?.first_opened_at ?? null;
  const openCount = Math.max(0, Number(open?.open_count ?? 0) || 0);
  return {
    generated: mine.some((e) => e.kind === 'generated'),
    sent: sends.length > 0,
    firstSentAt,
    sentChannels: Array.from(new Set(sends.map((e) => e.channel))),
    opened: !!firstOpenedAt,
    firstOpenedAt,
    openCount,
    openedBeforeSend: !!firstOpenedAt && (!firstSentAt || Date.parse(firstOpenedAt) < Date.parse(firstSentAt) - 60_000),
  };
}
