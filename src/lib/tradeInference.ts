/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WORK OUT A MISSING TRADE FROM WHAT WE ALREADY HOLD (2026-10-01, docs/outreach-workspace.md).
   Paul: "I should not have to manually set 42 trades if the answer can be derived cheaply … Do NOT call
   paid AI or Google Places by default … Do not infer from a vague business name alone."
   Free evidence only, strongest first:
     1. a trade already stored for this lead elsewhere — its audit's business_type
     2. the campaign's own trade (campaigns.trade_slug)
     3. the campaign's name ("Barbers - no website …")
     4. an explicit trade word in the business name ("Grays PLUMBING and Heating")
   Confidence:
     high      a stored trade (1 or 2), or two independent sources agreeing → saved automatically
     medium    the business name alone, with an explicit trade word → suggested for review
     low       sources disagree, or nothing → left unresolved (never guessed)
   The words are an explicit list, never a fuzzy match (the same reason TRADES is fixed, trades.ts).
   The value written is the plural keyword the leads already store ("plumbers"). Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Explicit phrase → the trade keyword stored on leads. Ordered: specific phrases first. */
const TRADE_PHRASES: ReadonlyArray<[RegExp, string]> = [
  [/\bdriving (instructor|school|lessons?)\b/, 'driving instructors'],
  [/\bmobile mechanic/, 'mobile mechanics'],
  [/\bdog groom|\bpet groom/, 'dog groomers'],
  [/\blocksmith/, 'locksmiths'],
  [/\broof(er|ers|ing)?\b|\bguttering\b|\bflat roof/, 'roofers'],
  [/\bplumb(er|ers|ing)\b|\bboiler/, 'plumbers'],
  [/\belectric(ian|ians|al contractors?)\b/, 'electricians'],
  [/\baccountan(t|ts|cy)\b|\bbookkeep/, 'accountants'],
  [/\bbarber/, 'barbers'],
];
const SLUG_TRADE: Readonly<Record<string, string>> = {
  plumber: 'plumbers', locksmith: 'locksmiths', electrician: 'electricians', accountant: 'accountants',
  'driving-instructor': 'driving instructors', 'mobile-mechanic': 'mobile mechanics', roofer: 'roofers', barber: 'barbers',
};

const clean = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The trade an explicit phrase names, or null. Never a guess from a vague word. */
export function tradeFromText(text: string | null | undefined): string | null {
  const t = clean(text);
  if (!t) return null;
  for (const [re, trade] of TRADE_PHRASES) if (re.test(t)) return trade;
  return null;
}

export type TradeSource = 'audit' | 'campaign_trade' | 'campaign_name' | 'business_name';
export const TRADE_SOURCE_LABEL: Record<TradeSource, string> = {
  audit: "the lead's own audit", campaign_trade: "the campaign's trade", campaign_name: "the campaign's name", business_name: 'the business name',
};
export type TradeConfidence = 'high' | 'medium' | 'low';
export interface TradeEvidence { source: TradeSource; value: string; trade: string | null }
export interface TradeVerdict { trade: string | null; confidence: TradeConfidence; evidence: TradeEvidence[]; reason: string }

export interface TradeInferenceInput {
  businessName: string | null;
  campaignName?: string | null;
  campaignTradeSlug?: string | null;
  auditBusinessTypes?: readonly (string | null)[];
}

export function inferTrade(i: TradeInferenceInput): TradeVerdict {
  const ev: TradeEvidence[] = [];
  for (const bt of i.auditBusinessTypes ?? []) if ((bt ?? '').trim()) ev.push({ source: 'audit', value: bt!.trim(), trade: tradeFromText(bt) ?? clean(bt) });
  if (i.campaignTradeSlug) ev.push({ source: 'campaign_trade', value: i.campaignTradeSlug, trade: SLUG_TRADE[i.campaignTradeSlug] ?? null });
  if (i.campaignName) { const t = tradeFromText(i.campaignName); if (t) ev.push({ source: 'campaign_name', value: i.campaignName, trade: t }); }
  { const t = tradeFromText(i.businessName); if (t) ev.push({ source: 'business_name', value: i.businessName ?? '', trade: t }); }

  const named = ev.filter((e) => e.trade);
  const trades = new Set(named.map((e) => e.trade!));
  if (!named.length) return { trade: null, confidence: 'low', evidence: ev, reason: 'Nothing we hold names a trade.' };
  if (trades.size > 1) return { trade: null, confidence: 'low', evidence: ev, reason: `The evidence disagrees (${[...trades].join(' / ')}).` };
  const trade = [...trades][0];
  const stored = named.some((e) => e.source === 'audit' || e.source === 'campaign_trade');
  const sources = new Set(named.map((e) => e.source));
  if (stored || sources.size >= 2) return { trade, confidence: 'high', evidence: ev, reason: `Agreed by ${[...sources].map((s) => TRADE_SOURCE_LABEL[s]).join(' and ')}.` };
  return { trade, confidence: 'medium', evidence: ev, reason: `Only ${TRADE_SOURCE_LABEL[named[0].source]} says so — check before saving.` };
}
