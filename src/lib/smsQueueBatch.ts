/* QUEUE FOR TEXT — THE HONEST COUNT (2026-10-13, Paul). One helper for every path that queues cold texts (Outreach's Queue for text
   popup, its Select all, the Inbox bulk text). Pure apart from the injected rpc, so it is tested without a database.

   ⛔ THE SERVER DECIDES, THE BROWSER ONLY ASKS. queue_sms_openers with _dry_run runs every check (WhatsApp queue, WhatsApp messages and
      conversations, already texted, spoken to, opted out, UK mobile, ownership, client) and writes nothing; the popup shows ITS answer.
      A salesperson's browser cannot read opt-outs, so no browser-side guess could be honest.
   ⛔ ONE LIMIT: SMS_QUEUE_MAX_PER_ACTION (= one day of sending). A big selection queues the FIRST that-many that pass and says the rest
      were over the limit — never "Nothing queued", never more than the limit (the server refuses a real call above it too).
   ⛔ The real call sends ONLY the ids the check passed; the server checks them all again, so anything that changed in between is
      skipped with its reason, not sent. */
import { SMS_QUEUE_CHECK_CHUNK, SMS_QUEUE_DAILY_CAP, SMS_QUEUE_MAX_PER_ACTION, SMS_QUEUE_SKIP_WORDS } from './smsMessages';

export type SmsQueueRpc = (args: { _lead_ids: string[]; _template: string; _dry_run?: boolean }) =>
  Promise<{ data: unknown; error: { message?: string } | null }>;

interface RpcAnswer { ok?: boolean; ids?: unknown; queued?: number; skipped?: Record<string, number>; error?: string; detail?: string }

export interface SkipLine { key: string; n: number; label: string }

export interface SmsQueuePlan {
  selected: number;
  /** The ids that will be sent to the real queue call, in selection order, at most SMS_QUEUE_MAX_PER_ACTION. */
  queueIds: string[];
  /** Every reason a selected lead will not be queued (over_cap included), largest first. */
  skipped: SkipLine[];
  skippedTotal: number;
}

/** The order the reasons are listed in when two are the same size: the WhatsApp ones first, because that is what matters most. */
const REASON_ORDER = Object.keys(SMS_QUEUE_SKIP_WORDS);

export function skipLines(skipped: Record<string, number> | null | undefined): SkipLine[] {
  return Object.entries(skipped ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([key, n]) => ({ key, n: Number(n), label: SMS_QUEUE_SKIP_WORDS[key] ?? key.replace(/_/g, ' ') }))
    .sort((a, b) => b.n - a.n || rank(a.key) - rank(b.key));
}
const rank = (k: string) => { const i = REASON_ORDER.indexOf(k); return i < 0 ? REASON_ORDER.length : i; };

/** Fold the check-only answers (one per chunk) into the plan: the first passing ids up to the limit, the rest over_cap. */
export function planFromChecks(selectedIds: readonly string[], checks: ReadonlyArray<{ ids: readonly string[]; skipped: Record<string, number> }>, limit = SMS_QUEUE_MAX_PER_ACTION): SmsQueuePlan {
  const passed = new Set(checks.flatMap((c) => c.ids));
  const skipped: Record<string, number> = {};
  for (const c of checks) for (const [k, n] of Object.entries(c.skipped ?? {})) skipped[k] = (skipped[k] ?? 0) + Number(n);
  const inOrder = selectedIds.filter((id) => passed.has(id));
  const queueIds = inOrder.slice(0, Math.max(0, limit));
  const over = inOrder.length - queueIds.length;
  if (over > 0) skipped.over_cap = (skipped.over_cap ?? 0) + over;
  const lines = skipLines(skipped);
  return { selected: selectedIds.length, queueIds, skipped: lines, skippedTotal: lines.reduce((s, l) => s + l.n, 0) };
}

export class SmsQueueError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

function refusal(a: RpcAnswer | null, error: { message?: string } | null): SmsQueueError {
  if (a?.detail) return new SmsQueueError(a.detail, a.error ?? 'refused');
  if (a?.error === 'too_many') return new SmsQueueError(`Up to ${SMS_QUEUE_MAX_PER_ACTION} can be queued in one go.`, 'too_many');
  return new SmsQueueError(error?.message ? `Could not check the texts: ${error.message}` : 'Could not check the texts. Try again.', a?.error ?? 'failed');
}

/** Ask the server, check-only, what would happen to every selected lead. Throws SmsQueueError on a refusal or a failed call. */
export async function checkSmsQueue(rpc: SmsQueueRpc, selectedIds: readonly string[], template: string, limit = SMS_QUEUE_MAX_PER_ACTION): Promise<SmsQueuePlan> {
  const ids = Array.from(new Set(selectedIds));
  const checks: Array<{ ids: string[]; skipped: Record<string, number> }> = [];
  for (let i = 0; i < ids.length; i += SMS_QUEUE_CHECK_CHUNK) {
    const chunk = ids.slice(i, i + SMS_QUEUE_CHECK_CHUNK);
    const { data, error } = await rpc({ _lead_ids: chunk, _template: template, _dry_run: true });
    const a = data as RpcAnswer | null;
    if (error || !a?.ok || !Array.isArray(a.ids)) throw refusal(a, error);
    checks.push({ ids: (a.ids as unknown[]).map(String), skipped: a.skipped ?? {} });
  }
  return planFromChecks(ids, checks, limit);
}

export interface SmsQueueResult { queued: number; skipped: SkipLine[]; skippedTotal: number }

/** Queue the plan's ids for real, and fold in what the plan already skipped (over_cap and every checked reason). */
export async function runSmsQueue(rpc: SmsQueueRpc, plan: SmsQueuePlan, template: string): Promise<SmsQueueResult> {
  const prior: Record<string, number> = Object.fromEntries(plan.skipped.map((l) => [l.key, l.n]));
  if (plan.queueIds.length === 0) return { queued: 0, skipped: plan.skipped, skippedTotal: plan.skippedTotal };
  const { data, error } = await rpc({ _lead_ids: plan.queueIds, _template: template });
  const a = data as RpcAnswer | null;
  if (error || !a?.ok) throw refusal(a, error);
  for (const [k, n] of Object.entries(a.skipped ?? {})) prior[k] = (prior[k] ?? 0) + Number(n);
  const lines = skipLines(prior);
  return { queued: Number(a.queued ?? 0), skipped: lines, skippedTotal: lines.reduce((s, l) => s + l.n, 0) };
}

/** The limit, in plain words, for the popup. */
export const SMS_QUEUE_LIMIT_WORDS =
  `Up to ${SMS_QUEUE_MAX_PER_ACTION} can be queued in one go, because at most ${SMS_QUEUE_DAILY_CAP} texts go out a day. Pick the rest again next time.`;

/** "3 already messaged on WhatsApp · 2 no mobile (…)" */
export function skipSummary(lines: readonly SkipLine[]): string {
  return lines.map((l) => `${l.n} ${l.label}`).join(' · ');
}
