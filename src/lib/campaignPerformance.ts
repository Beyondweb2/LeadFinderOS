/* ============================================================
   CAMPAIGN PERFORMANCE — one row per template sent in a campaign (Paul, 2026-11-22; docs/campaign-performance.md).

   Per template, counted PER LEAD (a lead sent the same template twice is one send):
   - Sent         leads with a real send of it (isRealSend: sent / delivered / read).
   - Read         of those, leads where a send of it reached "read" (Meta's receipt; people who switched read receipts
                  off never show — Read is a floor, not the truth).
   - Replied raw  last-touch credit (templateAttribution.ts creditRepliesToSends) with EVERY inbound counted.
   - Replied real the same walk with realReply.ts: no auto-reply text, not within a minute of our send.
   - Opened       a person (engagementBots.ts) opened the report, or clicked a tracked link, after it.
                  A report view is credited to the newest report-link template before it (REPORT_LINK_TEMPLATES, the
                  rule the Inbox pill uses); a click to the template its link was made for.
   - Interested   leads with the gold star whose REAL reply was credited to it.
   ⛔ A template is JUDGED only with MIN_SENDS_TO_JUDGE sends or more; the rest are shown greyed and never "best".
   ⛔ Best = the judged template with the highest real-reply rate (ties: opened rate, then more sends), and only when
      that rate is above zero. No best when nothing is judged.
   ⚠️ Pure; explicit .ts imports (reached by the campaign-performance edge function).
   ============================================================ */
import { isRealSend } from './realSend.ts';
import { creditRepliesToSends, creditEventToTemplate, REPORT_LINK_TEMPLATES, type AttributableMsg } from './templateAttribution.ts';
import { isRealReplyAt } from './realReply.ts';
import { isHumanHit, type LoggedHit } from './engagementBots.ts';

export const MIN_SENDS_TO_JUDGE = 20;

export interface PerfLeadInput {
  id: string;
  interested: boolean;
  /** Oldest first, both directions. */
  messages: AttributableMsg[];
  /** Report page loads (bots included, marked). */
  views: LoggedHit[];
  /** Tracked-link clicks (bots included, marked), each with the template its link was made for. */
  clicks: Array<LoggedHit & { template_name: string | null }>;
}

export interface TemplatePerfRow {
  template: string;
  sent: number;
  read: number;
  repliedRaw: number;
  repliedReal: number;
  opened: number;
  interested: number;
  judged: boolean;
}

export interface CampaignPerformance {
  rows: TemplatePerfRow[];
  best: string | null;
  /** Person opens / clicks that could not be tied to any template (opened before any link was sent). */
  unattributedOpens: number;
  /** Bot / preview hits left out, for the footnote. */
  botHits: number;
}

export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function campaignPerformance(leads: ReadonlyArray<PerfLeadInput>): CampaignPerformance {
  const by = new Map<string, TemplatePerfRow>();
  const row = (t: string): TemplatePerfRow => {
    let r = by.get(t);
    if (!r) { r = { template: t, sent: 0, read: 0, repliedRaw: 0, repliedReal: 0, opened: 0, interested: 0, judged: false }; by.set(t, r); }
    return r;
  };
  let unattributedOpens = 0;
  let botHits = 0;

  for (const lead of leads) {
    const msgs = [...lead.messages].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const sentTemplates = new Set<string>();
    const readTemplates = new Set<string>();
    const sendTimes: number[] = [];
    for (const m of msgs) {
      if (m.direction !== 'outbound' || !isRealSend(m.status)) continue;
      const t = Date.parse(m.created_at);
      if (!Number.isNaN(t)) sendTimes.push(t);
      if (!m.template_name) continue;
      sentTemplates.add(m.template_name);
      if (m.status === 'read') readTemplates.add(m.template_name);
    }
    for (const t of sentTemplates) row(t).sent += 1;
    for (const t of readTemplates) row(t).read += 1;

    for (const c of creditRepliesToSends(msgs, (i) => msgs[i].direction === 'inbound')) row(c.template).repliedRaw += 1;
    const real = creditRepliesToSends(msgs, (i) => isRealReplyAt(msgs, i));
    for (const c of real) {
      row(c.template).repliedReal += 1;
      if (lead.interested) row(c.template).interested += 1;
    }

    const openedTemplates = new Set<string>();
    for (const v of lead.views) {
      if (!isHumanHit(v, sendTimes)) { botHits += 1; continue; }
      const t = creditEventToTemplate(msgs, Date.parse(v.at), REPORT_LINK_TEMPLATES);
      if (t) openedTemplates.add(t); else unattributedOpens += 1;
    }
    for (const c of lead.clicks) {
      if (!isHumanHit(c, sendTimes)) { botHits += 1; continue; }
      if (c.template_name && sentTemplates.has(c.template_name)) openedTemplates.add(c.template_name); else unattributedOpens += 1;
    }
    for (const t of openedTemplates) if (sentTemplates.has(t)) row(t).opened += 1;
  }

  const rows = [...by.values()].filter((r) => r.sent > 0);
  for (const r of rows) r.judged = r.sent >= MIN_SENDS_TO_JUDGE;
  rows.sort((a, b) => b.sent - a.sent || a.template.localeCompare(b.template));

  let best: TemplatePerfRow | null = null;
  for (const r of rows) {
    if (!r.judged || r.repliedReal <= 0) continue;
    if (!best) { best = r; continue; }
    const d = r.repliedReal / r.sent - best.repliedReal / best.sent;
    if (d > 0 || (d === 0 && (r.opened / r.sent > best.opened / best.sent || (r.opened / r.sent === best.opened / best.sent && r.sent > best.sent)))) best = r;
  }
  return { rows, best: best?.template ?? null, unattributedOpens, botHits };
}
