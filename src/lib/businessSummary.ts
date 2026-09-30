/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AI BUSINESS SUMMARY (Admin control centre, release 6, 2026-09-30).
   Paul: "a concise ADMIN-ONLY AI summary from structured metrics … analysis, not an invented score …
   do not let AI invent missing numbers."
   ⛔ HOW IT CANNOT INVENT A NUMBER:
   1. The model sees ONLY `facts` — the dashboard's own folded numbers (the one loader), with every
      change already worked out here (changePct). It is never asked to calculate.
   2. Every number in its draft is checked against the numbers in `facts` (validateNumbers). One
      unknown number → the draft is rejected (one retry, told which numbers were wrong) → still wrong →
      it is NOT shown; the page shows the deterministic checks instead.
   3. It is advisory only: it changes nothing, sends nothing, and no code reads its words.
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const SUMMARY_MODEL = 'gpt-4o';
export const SUMMARY_PROMPT_VERSION = 'business-summary-v1';
/** An on-demand refresh is refused if the last summary is younger than this. */
export const SUMMARY_MIN_INTERVAL_MINUTES = 60;
export const SUMMARY_MAX_LOOK_AT = 6;
export const SUMMARY_MAX_WORDS = 140;

/** The subset of the dashboard's response the summary reads (structural — no import of the fold). */
export interface OverviewLike {
  period: { label: string; fromDay: string | null; toDay: string };
  totals: { whatsappSent: number; leadsMessaged: number; calls: number; emails: number; social: number; replies: number; interested: number; meetings: number; paid: number; revenue: number; notInterested: number; optOuts: number; cohort: { contacted: number; replied: number; interested: number; meeting: number; paid: number } };
  team: { name: string; whatsappSent: number; calls: number; replies: number; interested: number; meetings: number; paid: number; followUpsOverdue: number }[];
  money: { period: { net: number; gross: number; refunds: number }; cost: { period: { usd: number; byFeature: { key: string; usd: number }[] } }; commission: { periodAdded: number }; payingClients: number };
  templates: { meta: { template: string; leadsSent: number; replies: number; positive: number; notInterested: number; flags: string[] }[] };
  niches: { label: string; messaged: number; replied: number; interested: number; paid: number; verdict: string }[];
  bottlenecks: { title: string; status: string; evidence: string }[];
  attention: { group: string; kind: string }[];
  clients: { business: string; refunded: boolean; health?: { weekly: { trendLabel: string | null; thisWeek: { named: { chatgpt: number; gemini: number }; answered: { chatgpt: number; gemini: number } } | null }; blockers: string[] } }[];
  features: { label: string; uses: number; previous: number | null; flags: string[] }[] | null;
  site: { sessions?: number; free_check_submitted?: number; checkout_sessions?: number; paid?: number; tracking_since?: string | null } | null;
  triage: { byBucket: Record<string, number>; suppressed: number } | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n * 100) / 100;
/** The change from `before` to `now` as a whole percentage; null when there is no base. */
export function changePct(now: number, before: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}
const pair = (now: number, before: number) => ({ now, before, change_pct: changePct(now, before) });

/** The one sheet of numbers the model may use. Everything rounded as it will be quoted. */
export function buildSummaryFacts(now: OverviewLike, before: OverviewLike | null) {
  const b = before;
  const t = now.totals; const bt = b?.totals;
  const topCost = [...now.money.cost.period.byFeature].sort((x, y) => y.usd - x.usd).slice(0, 4).map((c) => ({ feature: c.key, usd: money(c.usd) }));
  return {
    period: now.period.label, from: now.period.fromDay, to: now.period.toDay,
    compared_with: b ? { from: b.period.fromDay, to: b.period.toDay } : null,
    outreach: {
      whatsapps_sent: pair(t.whatsappSent, bt?.whatsappSent ?? 0),
      leads_messaged: pair(t.leadsMessaged, bt?.leadsMessaged ?? 0),
      calls_logged: pair(t.calls, bt?.calls ?? 0),
      emails_and_social_logged: t.emails + t.social,
    },
    outcomes: {
      replies: pair(t.replies, bt?.replies ?? 0),
      interested: pair(t.interested, bt?.interested ?? 0),
      meetings: pair(t.meetings, bt?.meetings ?? 0),
      paid_clients: pair(t.paid, bt?.paid ?? 0),
      not_interested: t.notInterested, opt_outs: t.optOuts,
      first_contacted: t.cohort.contacted, of_them_replied: t.cohort.replied, of_them_interested: t.cohort.interested,
    },
    by_person: now.team.map((p) => ({ name: p.name, whatsapps: p.whatsappSent, calls: p.calls, replies: p.replies, interested: p.interested, meetings: p.meetings, paid: p.paid, overdue_follow_ups: p.followUpsOverdue })),
    money: {
      revenue_net_gbp: money(now.money.period.net), revenue_net_gbp_before: b ? money(b.money.period.net) : null,
      refunds_gbp: money(now.money.period.refunds), commission_added_gbp: money(now.money.commission.periodAdded),
      api_spend_usd: pair(money(now.money.cost.period.usd), money(b?.money.cost.period.usd ?? 0)), top_api_costs: topCost,
      paying_clients: now.money.payingClients,
    },
    templates: now.templates.meta.filter((x) => x.leadsSent > 0).slice(0, 6).map((x) => ({ template: x.template, leads_sent: x.leadsSent, replies: x.replies, real_interest: x.positive, said_no: x.notInterested, flags: x.flags })),
    niches: now.niches.filter((x) => x.messaged > 0).slice(0, 6).map((x) => ({ niche: x.label, messaged: x.messaged, replied: x.replied, interested: x.interested, paid: x.paid, label: x.verdict })),
    flagged_bottlenecks: now.bottlenecks.filter((x) => x.status === 'flag').map((x) => ({ check: x.title, evidence: x.evidence })),
    needs_attention: { total: now.attention.length, urgent: now.attention.filter((a) => a.group === 'urgent').length, review: now.attention.filter((a) => a.group === 'review').length },
    replies_sorted: now.triage ? { needed_nobody: now.triage.byBucket.no_action ?? 0, for_a_salesperson: now.triage.byBucket.rep_action ?? 0, for_paul: (now.triage.byBucket.admin_action ?? 0) + (now.triage.byBucket.urgent_admin ?? 0), opt_outs_suppressed: now.triage.suppressed } : null,
    clients: now.clients.filter((c) => !c.refunded).map((c) => ({
      client: c.business,
      weekly_ai_check: c.health?.weekly.thisWeek ? { chatgpt_named: c.health.weekly.thisWeek.named.chatgpt, chatgpt_asked: c.health.weekly.thisWeek.answered.chatgpt, gemini_named: c.health.weekly.thisWeek.named.gemini, gemini_asked: c.health.weekly.thisWeek.answered.gemini, trend: c.health.weekly.trendLabel } : 'not started',
      blockers: c.health?.blockers ?? [],
    })),
    features: now.features ? {
      unused: now.features.filter((f) => f.flags.includes('unused')).map((f) => f.label),
      dropped_sharply: now.features.filter((f) => f.flags.includes('dropped')).map((f) => ({ feature: f.label, now: f.uses, before: f.previous })),
      costly_for_use: now.features.filter((f) => f.flags.includes('costly_low_use')).map((f) => f.label),
      most_used: [...now.features].sort((a, x) => x.uses - a.uses).slice(0, 5).map((f) => ({ feature: f.label, uses: f.uses })),
    } : null,
    website: now.site?.tracking_since ? { visitors: now.site.sessions ?? 0, free_checks: now.site.free_check_submitted ?? 0, reached_checkout: now.site.checkout_sessions ?? 0, paid: now.site.paid ?? 0 } : 'visitor tracking only started on 30 Sep',
  };
}
export type SummaryFacts = ReturnType<typeof buildSummaryFacts>;

/** Every number the facts contain, in the forms a sentence might quote it ("1,234", "12.5", "£99.00"). */
export function allowedNumbers(facts: unknown): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    if (!Number.isFinite(n)) return;
    for (const v of [n, Math.abs(n), Math.round(n), Math.round(Math.abs(n)), r1(n), r1(Math.abs(n)), money(Math.abs(n))]) {
      out.add(String(v)); out.add(v.toFixed(2)); out.add(v.toFixed(1));
    }
  };
  const walk = (x: unknown) => {
    if (typeof x === 'number') add(x);
    else if (typeof x === 'string') { for (const m of x.matchAll(/\d+(?:\.\d+)?/g)) add(Number(m[0])); }
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(facts);
  return out;
}

/** The numbers in a draft that are NOT in the facts. Empty = every number is grounded. */
export function validateNumbers(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,/g, '');
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const forms = [raw, String(n), n.toFixed(2), n.toFixed(1), String(Math.round(n))];
    if (!forms.some((f) => allowed.has(f))) bad.push(m[0]);
  }
  return [...new Set(bad)];
}

export function summaryPrompt(facts: SummaryFacts, retryNote: string | null): { system: string; user: string } {
  return {
    system: [
      'You write a short weekly business briefing for Paul, who runs a small UK agency selling AI-visibility services to local trades via WhatsApp outreach.',
      'Use ONLY the numbers in FACTS, exactly as written. Never calculate, estimate, round differently or add a number that is not in FACTS. Percent changes are given as change_pct — use those or none.',
      'Plain English, no jargon, no hype, no scores. Say when a sample is small. Say "followed" or "after", never "caused", unless FACTS says so.',
      `Return "summary" (at most ${SUMMARY_MAX_WORDS} words: what changed, what is working, what is not, and costs vs money in) and "look_at" (at most ${SUMMARY_MAX_LOOK_AT} short, specific things Paul should look at next, each grounded in FACTS).`,
      ...(retryNote ? [retryNote] : []),
    ].join(' '),
    user: `FACTS:\n${JSON.stringify(facts)}`,
  };
}

export const SUMMARY_TOOL = {
  type: 'function',
  function: {
    name: 'write_briefing',
    description: 'The briefing: a short summary and the things to look at.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        summary: { type: 'string', maxLength: 1400 },
        look_at: { type: 'array', maxItems: SUMMARY_MAX_LOOK_AT, items: { type: 'string', maxLength: 240 } },
      },
      required: ['summary', 'look_at'],
    },
  },
} as const;

/** What the page shows when there is no grounded AI draft: the flagged checks, in their own words. */
export function fallbackLookAt(facts: SummaryFacts): string[] {
  const out = facts.flagged_bottlenecks.map((b) => `${b.check}: ${b.evidence}`);
  if (facts.needs_attention.urgent) out.unshift(`${facts.needs_attention.urgent} urgent item${facts.needs_attention.urgent === 1 ? '' : 's'} in Needs your attention`);
  return out.slice(0, SUMMARY_MAX_LOOK_AT);
}
