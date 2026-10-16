/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IMPORT → ONE CAMPAIGN PER TRADE (2026-10-16).
   A file that mixes trades can go into one WhatsApp campaign per trade, each named exactly its trade. Pure: no React,
   no I/O. The campaign is made by the EXISTING campaign_new (useCampaignActions().create) and the leads join through
   the EXISTING import_leads_v3 campaign argument, one call per campaign — no new database function.
   ⛔ Nothing here queues or messages anyone; joining a campaign sends nothing (docs/campaigns.md).
   ⛔ A campaign name is unique (campaignNameKey), so "Dental clinics " and "dental  clinics" are ONE campaign.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { campaignNameKey, CAMPAIGN_FIELD_MAX, CAMPAIGN_NAME_MAX } from './campaignRules.ts';
import { runImport, ZERO_COUNTS, type ImportReport, type ImportRow, type ImportRpc, type ImportTags } from './csvLeadImport.ts';

/** Trim and collapse inner whitespace — the same tidy the server applies to a campaign name. */
export function normaliseTrade(t: string | null | undefined): string {
  return String(t ?? '').trim().replace(/\s+/g, ' ');
}

export interface ExistingCampaign { id: string; name: string; created_by?: string | null; archived_at?: string | null }

export interface TradeCampaignGroup {
  /** campaignNameKey of the trade — the identity of the group. */
  key: string;
  /** The campaign's name: the trade as first written in the file, tidied. */
  name: string;
  /** Spreadsheet row numbers going in. */
  rowNumbers: number[];
  count: number;
  /** The live campaign with this exact name, or null = it will be created. */
  existingId: string | null;
}

export interface TradeCampaignPlan {
  groups: TradeCampaignGroup[];
  /** Rows that use the campaign chosen in the dialog: no trade, or a trade too long to be a campaign name. */
  fallbackRows: number[];
  /** Trades too long for a campaign name (their rows are in fallbackRows). */
  tooLong: string[];
}

/** Largest trade that campaign_new accepts (trade column and name both bound). */
export const TRADE_CAMPAIGN_MAX = Math.min(CAMPAIGN_FIELD_MAX, CAMPAIGN_NAME_MAX);

export function planTradeCampaigns(
  rows: Pick<ImportRow, 'row' | 'trade'>[], existing: ExistingCampaign[], userId?: string | null,
): TradeCampaignPlan {
  /* Live only; an exact-name match is reused, preferring one this person owns (admin sees every campaign). */
  const byKey = new Map<string, ExistingCampaign>();
  for (const c of existing) {
    if (c.archived_at) continue;
    const k = campaignNameKey(c.name);
    const had = byKey.get(k);
    if (!had || (userId && c.created_by === userId && had.created_by !== userId)) byKey.set(k, c);
  }
  const groups = new Map<string, TradeCampaignGroup>();
  const fallbackRows: number[] = [];
  const tooLong = new Set<string>();
  for (const r of rows) {
    const t = normaliseTrade(r.trade);
    if (!t) { fallbackRows.push(r.row); continue; }
    if (t.length > TRADE_CAMPAIGN_MAX) { tooLong.add(t); fallbackRows.push(r.row); continue; }
    const key = campaignNameKey(t);
    let g = groups.get(key);
    if (!g) { g = { key, name: t, rowNumbers: [], count: 0, existingId: byKey.get(key)?.id ?? null }; groups.set(key, g); }
    g.rowNumbers.push(r.row); g.count++;
  }
  return { groups: [...groups.values()], fallbackRows, tooLong: [...tooLong] };
}

/** "Will use 4 campaigns: Dental clinics (242, new), Plumbers (12, existing). 3 rows with no trade go into X." */
export function tradePlanSummary(plan: TradeCampaignPlan, fallbackName: string | null): string {
  const n = plan.groups.length + (plan.fallbackRows.length && fallbackName ? 1 : 0);
  if (!plan.groups.length && !plan.fallbackRows.length) return 'No rows to import.';
  const parts = plan.groups.map((g) => `${g.name} (${g.count.toLocaleString('en-GB')}, ${g.existingId ? 'existing' : 'new'})`);
  if (plan.fallbackRows.length && fallbackName) parts.push(`${fallbackName} (${plan.fallbackRows.length.toLocaleString('en-GB')}, existing)`);
  const lead = `Will use ${n} campaign${n === 1 ? '' : 's'}: ${parts.join(', ')}.`;
  const head = plan.fallbackRows.length && !fallbackName ? `${lead} ${plan.fallbackRows.length.toLocaleString('en-GB')} row${plan.fallbackRows.length === 1 ? ' has' : 's have'} no trade: choose a campaign above.` : lead;
  return plan.tooLong.length ? `${head} Too long to be a campaign name (${TRADE_CAMPAIGN_MAX} characters at most): ${plan.tooLong.join(', ')}.` : head;
}

export function mergeImportReports(into: ImportReport, part: ImportReport): void {
  for (const k of Object.keys(into.counts) as (keyof typeof ZERO_COUNTS)[]) into.counts[k] += part.counts[k];
  into.rows.push(...part.rows);
  into.createdIds.push(...part.createdIds);
  into.updatedIds.push(...part.updatedIds);
  into.joinedCampaign += part.joinedCampaign;
  if (part.stopped && !into.stopped) into.stopped = part.stopped;
}

/** One import call chain per campaign. Stops at the first campaign whose call fails (the report says which rows were
 *  not reached); campaigns already done stand, and a re-run finds their leads as "already in your leads". */
export async function runImportPerTrade(args: {
  rpc: ImportRpc; rows: ImportRow[]; plan: TradeCampaignPlan; fileName: string | null;
  /** group key → campaign id, resolved (created or reused) by the caller BEFORE this runs. */
  campaignIds: Map<string, string>; fallbackCampaignId: string | null;
  importPossible: boolean; tags: Omit<ImportTags, 'campaignId'>;
  onProgress?: (done: number, total: number) => void;
}): Promise<ImportReport> {
  const { rpc, rows, plan, campaignIds, fallbackCampaignId, importPossible, tags, onProgress } = args;
  const total = rows.length;
  const out: ImportReport = { committed: true, counts: { ...ZERO_COUNTS }, rows: [], stopped: null, createdIds: [], updatedIds: [], joinedCampaign: 0 };
  const byRow = new Map(rows.map((r) => [r.row, r]));
  const jobs: { ids: number[]; campaignId: string | null }[] = plan.groups.map((g) => ({ ids: g.rowNumbers, campaignId: campaignIds.get(g.key) ?? null }));
  if (plan.fallbackRows.length) jobs.push({ ids: plan.fallbackRows, campaignId: fallbackCampaignId });
  let done = 0;
  for (const j of jobs) {
    const part = j.ids.map((n) => byRow.get(n)).filter((r): r is ImportRow => !!r);
    if (!part.length) continue;
    const base = done;
    const rep = await runImport(rpc, part, true, args.fileName, (d) => onProgress?.(base + d, total), importPossible, { ...tags, campaignId: j.campaignId });
    mergeImportReports(out, rep);
    done += part.length;
    if (rep.stopped) { out.stopped = { ...rep.stopped }; break; }
  }
  return out;
}
